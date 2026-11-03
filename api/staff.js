import {
  getSupabase,
  getAuthClient,
  requireStaff,
  isAllowedStaff,
  audit,
  HttpError,
} from "../lib/server.js";
import { computeMatchScore } from "../lib/scoring.js";
import { archiveCutoff, ARCHIVE_AFTER_MONTHS } from "../lib/archive.js";

const OPEN = "status.is.null,status.eq.unmatched";
const NEEDS_SQL = /matched_with|claimed_at|claimed_by|claim_note|archived_at|reports_status|invalid input value for enum|violates check constraint/;
const stOf = (r) => r.status || "unmatched";
const text = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const STAFF_THRESHOLD = 50; // staff see weaker candidates than the old public threshold (70)

// Unmatched reports older than ARCHIVE_AFTER_MONTHS become "archived". Matched and claimed
// reports are never touched. This runs whenever staff load the list or look for matches,
// so no separate scheduled job is needed. A failure here never blocks the dashboard.
async function archiveStale(supabase, user) {
  try {
    const { data, error } = await supabase
      .from("reports")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .or(OPEN)
      .lt("created_at", archiveCutoff().toISOString())
      .select("id");
    if (error) throw error;
    const ids = (data || []).map((r) => r.id);
    if (ids.length) await audit(supabase, user, "auto_archive", null, { ids, months: ARCHIVE_AFTER_MONTHS });
    return { count: ids.length, note: null };
  } catch (err) {
    console.error("archive error:", err);
    const note = NEEDS_SQL.test(String(err && err.message))
      ? "Automatic archiving is off until you run the new SQL from supabase-setup.sql in Supabase."
      : null;
    return { count: 0, note };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { action, ...p } = req.body || {};

    /* ---------- sign in / refresh (no token needed yet) ---------- */
    if (action === "login") {
      const email = String(p.email || "").trim();
      const password = String(p.password || "");
      if (!email || !password) throw new HttpError(400, "Enter your email and password.");

      const { data, error } = await getAuthClient().auth.signInWithPassword({ email, password });
      if (error || !data || !data.session) {
        const code = (error && error.code) || "";
        const msg = String((error && error.message) || "");
        if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) {
          throw new HttpError(
            401,
            "This account exists but its email is not confirmed. In Supabase, delete the user and create it again with Auto Confirm User ticked.",
          );
        }
        if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
          throw new HttpError(401, "Incorrect email or password.");
        }
        // Anything else is a setup problem (wrong key, provider off, rate limit). Show it so it can be fixed.
        console.error("login error:", error);
        throw new HttpError(
          500,
          "Sign-in is not set up correctly: " + (msg || "unknown error") +
            ". Check SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.",
        );
      }
      if (!isAllowedStaff(data.user.email)) {
        throw new HttpError(403, "This account is not allowed to use the staff area.");
      }

      await audit(getSupabase(), data.user, "login");
      return res.status(200).json({
        ok: true,
        email: data.user.email,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    if (action === "refresh") {
      const { data, error } = await getAuthClient().auth.refreshSession({
        refresh_token: String(p.refresh_token || ""),
      });
      if (error || !data || !data.session) throw new HttpError(401, "Your session ended. Sign in again.");
      return res.status(200).json({
        ok: true,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    /* ---------- everything below needs a signed-in staff member ---------- */
    const supabase = getSupabase();
    const user = await requireStaff(req, supabase);

    // All reports, including contact details
    if (action === "list") {
      const archived = await archiveStale(supabase, user);
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      await audit(supabase, user, "list", null, { rows: data.length });
      return res.status(200).json({ reports: data, archived: archived.count, archive_note: archived.note });
    }

    // Candidate matches for one report (lost -> found, found -> lost).
    // Test data and real data are never compared with each other.
    if (action === "matches") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid report id.");
      await archiveStale(supabase, user);

      const { data: base, error: baseErr } = await supabase
        .from("reports").select("*").eq("id", id).maybeSingle();
      if (baseErr) throw baseErr;
      if (!base) throw new HttpError(404, "Report not found. It may have been deleted.");

      if (stOf(base) === "archived") {
        throw new HttpError(409, "This report was archived after " + ARCHIVE_AFTER_MONTHS + " months without a match.");
      }
      if (stOf(base) !== "unmatched") throw new HttpError(409, "This report is already matched or claimed.");

      const otherType = base.report_type === "lost" ? "found" : "lost";
      const { data: others, error } = await supabase
        .from("reports")
        .select("*")
        .eq("report_type", otherType)
        .eq("is_test", !!base.is_test)
        .or(OPEN);
      if (error) throw error;

      const candidates = others
        .map((other) => {
          const lost = base.report_type === "lost" ? base : other;
          const found = base.report_type === "lost" ? other : base;
          const { finalScore, confidenceTier, scoreBreakdown } = computeMatchScore(lost, found);
          return { item: other, matchScore: finalScore, confidenceTier, scoreBreakdown };
        })
        .filter((c) => c.matchScore >= STAFF_THRESHOLD)
        .sort((a, b) => b.matchScore - a.matchScore);

      await audit(supabase, user, "matches", id, { candidates: candidates.length });
      return res.status(200).json({ report: base, candidates });
    }

    // Pair one lost report with one found report (status becomes "matched").
    if (action === "match") {
      const a = Number(p.id), b = Number(p.other);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) throw new HttpError(400, "Invalid report ids.");
      const { data: rows, error } = await supabase.from("reports").select("*").in("id", [a, b]);
      if (error) throw error;
      if (!rows || rows.length !== 2) throw new HttpError(404, "One of the reports no longer exists.");
      if (rows.map((r) => r.report_type).sort().join() !== "found,lost") {
        throw new HttpError(400, "A match needs one lost report and one found report.");
      }
      if (!!rows[0].is_test !== !!rows[1].is_test) {
        throw new HttpError(400, "Test and real reports cannot be matched together.");
      }
      if (rows.some((r) => stOf(r) === "archived")) {
        throw new HttpError(409, "An archived report cannot be matched. It had no match for " + ARCHIVE_AFTER_MONTHS + " months.");
      }
      if (rows.some((r) => stOf(r) !== "unmatched")) {
        throw new HttpError(409, "One of these reports is already matched or claimed.");
      }
      const done = [];
      for (const [id, other] of [[a, b], [b, a]]) {
        const { data, error: e } = await supabase
          .from("reports").update({ status: "matched", matched_with: other })
          .eq("id", id).or(OPEN).select("*");
        if (e || !data || !data.length) {
          // Undo the first half so no report is left matched to nothing.
          for (const d of done) await supabase.from("reports").update({ status: "unmatched", matched_with: null }).eq("id", d.id);
          if (e) throw e;
          throw new HttpError(409, "Someone else just changed one of these reports. Refresh and try again.");
        }
        done.push(data[0]);
      }
      await audit(supabase, user, "match", a, { other: b });
      return res.status(200).json({ ok: true, rows: done });
    }

    // Undo a match (only before it is claimed).
    if (action === "unmatch") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid report id.");
      const { data: row, error } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!row) throw new HttpError(404, "Report not found.");
      if (stOf(row) === "claimed") throw new HttpError(409, "Claimed reports are locked.");
      if (stOf(row) !== "matched") throw new HttpError(409, "This report is not matched.");
      const ids = [id, row.matched_with].filter(Boolean);
      const { data, error: e } = await supabase
        .from("reports").update({ status: "unmatched", matched_with: null })
        .in("id", ids).eq("status", "matched").select("*");
      if (e) throw e;
      await audit(supabase, user, "unmatch", id, { ids });
      return res.status(200).json({ ok: true, rows: data });
    }

    // The owner picked the item up. Locks both reports and records who and when.
    if (action === "claim") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid report id.");
      const claimant = text(p.claimant_name, 100);
      const note = text(p.note, 300);
      if (!claimant) throw new HttpError(400, "Enter the name of the person who claimed the item.");
      const { data: row, error } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!row) throw new HttpError(404, "Report not found.");
      if (stOf(row) === "claimed") throw new HttpError(409, "This item was already claimed.");
      if (stOf(row) !== "matched") throw new HttpError(409, "Only matched reports can be marked as claimed.");
      let ids = [id, row.matched_with].filter(Boolean);

      // Older matches were made before reports were linked. Staff can pick the partner now.
      const partnerId = p.partner_id === undefined || p.partner_id === null || p.partner_id === "" ? null : Number(p.partner_id);
      if (partnerId !== null && !row.matched_with) {
        if (!Number.isInteger(partnerId) || partnerId === id) throw new HttpError(400, "Invalid partner report.");
        const { data: partner, error: pe } = await supabase.from("reports").select("*").eq("id", partnerId).maybeSingle();
        if (pe) throw pe;
        if (!partner) throw new HttpError(404, "The partner report no longer exists.");
        if (partner.report_type === row.report_type) throw new HttpError(400, "The partner must be the other kind of report (lost with found).");
        if (!!partner.is_test !== !!row.is_test) throw new HttpError(400, "Test and real reports cannot be claimed together.");
        if (stOf(partner) !== "matched" || partner.matched_with) throw new HttpError(409, "The partner report is not an unlinked matched report.");
        await supabase.from("reports").update({ matched_with: partnerId }).eq("id", id);
        await supabase.from("reports").update({ matched_with: id }).eq("id", partnerId);
        ids = [id, partnerId];
      }

      const { data, error: e } = await supabase
        .from("reports")
        .update({
          status: "claimed",
          claimed_at: new Date().toISOString(),
          claimed_by_name: claimant,
          claimed_by_staff: user.email,
          claim_note: note || null,
        })
        .in("id", ids).eq("status", "matched").select("*");
      if (e) throw e;
      if (!data || !data.length) throw new HttpError(409, "Someone else just changed this report. Refresh and try again.");
      await audit(supabase, user, "claim", id, { ids, claimant });
      return res.status(200).json({ ok: true, rows: data });
    }

    // Remove one report. Claimed reports are locked.
    if (action === "delete") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid report id.");
      const { data: row, error: re } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
      if (re) throw re;
      if (row && stOf(row) === "claimed") throw new HttpError(409, "Claimed reports are locked and cannot be deleted.");
      if (row && stOf(row) === "matched" && row.matched_with) {
        // Free the partner so it can be matched again.
        await supabase.from("reports").update({ status: "unmatched", matched_with: null }).eq("id", row.matched_with).eq("status", "matched");
      }
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;
      await audit(supabase, user, "delete", id);
      return res.status(200).json({ ok: true, freed: row && row.matched_with ? row.matched_with : null });
    }

    // Remove every test entry at once (real reports are never touched)
    if (action === "purge_test") {
      const { data, error } = await supabase.from("reports").delete().eq("is_test", true).select("id");
      if (error) throw error;
      await audit(supabase, user, "purge_test", null, { deleted: data.length });
      return res.status(200).json({ ok: true, deleted: data.length });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (err) {
    if (!(err instanceof HttpError)) console.error("staff error:", err);
    if (!(err instanceof HttpError) && NEEDS_SQL.test(String(err && err.message))) {
      return res.status(500).json({
        message: "The database needs a one-time update. Run the new SQL from supabase-setup.sql in the Supabase SQL Editor, then try again.",
      });
    }
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
