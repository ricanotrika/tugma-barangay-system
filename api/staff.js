import crypto from "node:crypto";
import { getSupabase, computeMatchScore } from "./match.js";

const STATUSES = ["unmatched", "matched", "claimed"];
const STAFF_THRESHOLD = 50; // staff see weaker candidates than the public (70)

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

function isAuthorized(req) {
  const expected = process.env.STAFF_PASSCODE;
  if (!expected) throw new Error("Missing environment variable: STAFF_PASSCODE");
  const given = req.headers["x-staff-passcode"] || "";
  return crypto.timingSafeEqual(sha(given), sha(expected));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ message: "Incorrect passcode." });
    }

    const { action, ...p } = req.body || {};

    if (action === "login") {
      return res.status(200).json({ ok: true });
    }

    const supabase = getSupabase();

    // All reports, including contact details (staff only)
    if (action === "list") {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json({ reports: data });
    }

    // Candidate matches for one report (lost -> found, found -> lost)
    if (action === "matches") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid report id." });

      const { data: base, error: baseErr } = await supabase
        .from("reports").select("*").eq("id", id).single();
      if (baseErr) throw baseErr;

      const otherType = base.report_type === "lost" ? "found" : "lost";
      const { data: others, error } = await supabase
        .from("reports")
        .select("*")
        .eq("report_type", otherType)
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

      return res.status(200).json({ report: base, candidates });
    }

    // Change status of one or more reports
    if (action === "update") {
      const ids = Array.isArray(p.ids) ? p.ids.map(Number) : [];
      if (!ids.length || ids.length > 10 || !ids.every(Number.isInteger) || !STATUSES.includes(p.status)) {
        return res.status(400).json({ message: "Invalid update request." });
      }
      const { error } = await supabase.from("reports").update({ status: p.status }).in("id", ids);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // Remove a report (useful for clearing test data)
    if (action === "delete") {
      const id = Number(p.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid report id." });
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ message: "Unknown action." });
  } catch (err) {
    console.error("staff error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
}
