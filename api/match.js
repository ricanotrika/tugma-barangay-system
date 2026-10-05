import { getSupabase, cleanReport } from "../lib/server.js";

// Public endpoint: residents submit a lost or found report.
// It only saves the report and returns a report number. Matching and any
// contact details stay behind the staff login (/api/staff).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { report } = req.body || {};
  if (!report || typeof report !== "object") {
    return res.status(400).json({ message: "Invalid payload structure." });
  }

  const { r, problems } = cleanReport(report);
  if (problems.length) {
    return res.status(400).json({ message: "Please fix: " + problems.join("; ") + "." });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("reports").insert(r).select("id");
    if (error) throw error;

    const saved = data && data[0];
    if (!saved) {
      throw new Error(
        "The database accepted the report but would not return it. " +
          "SUPABASE_SERVICE_KEY is probably the publishable/anon key. " +
          "Use the secret (service_role) key from Supabase > Project Settings > API Keys.",
      );
    }

    return res.status(200).json({
      success: true,
      reportId: saved.id,
      reportType: r.report_type,
      isTest: r.is_test,
    });
  } catch (err) {
    console.error("match error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
}
