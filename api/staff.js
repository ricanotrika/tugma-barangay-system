import {
  getSupabase,
  getAuthClient,
  requireStaff,
  isAllowedStaff,
  audit,
  HttpError,
} from "../lib/server.js";
import { computeMatchScore } from "../lib/scoring.js";

const STATUSES = ["unmatched", "matched", "claimed"];
const STAFF_THRESHOLD = 50; // staff see weaker candidates than the old public threshold (70)

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
      if (error || !data || !data.session) throw new HttpError(401, "Incorrect email or password.");
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
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      await audit(supabase, user, "list", null, { rows: data.length });
      return res.status(200).json({ reports: data });
    }

    // Candidate matches for one report (lost -> found, found -> lost).
    // Test data and real data are never compared with each other.
    if (action === "matches") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid report id.");

      const { data: base, error: baseErr } = await supabase
        .from("reports").select("*").eq("id", id).maybeSingle();
      if (baseErr) throw baseErr;
      if (!base) throw new HttpError(404, "Report not found. It may have been deleted.");

      const otherType = base.report_type === "lost" ? "found" : "lost";
      const { data: others, error } = await supabase
        .from("reports")
        .select("*")
        .eq("report_type", otherType)
        .eq("is_test", !!base.is_test)
        .or("status.is.null,status.neq.claimed");
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

    // Change status of one or more reports
    if (action === "update") {
      const ids = Array.isArray(p.ids) ? p.ids.map(Number) : [];
      if (!ids.length || ids.length > 10 || !ids.every(Number.isInteger) || !STATUSES.includes(p.status)) {
        throw new HttpError(400, "Invalid update request.");
      }
      const { error } = await supabase.from("reports").update({ status: p.status }).in("id", ids);
      if (error) throw error;
      await audit(supabase, user, "update", ids[0], { ids, status: p.status });
      return res.status(200).json({ ok: true });
    }

    // Remove one report
    if (action === "delete") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid report id.");
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;
      await audit(supabase, user, "delete", id);
      return res.status(200).json({ ok: true });
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
    return res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
