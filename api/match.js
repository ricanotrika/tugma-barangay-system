import levenshtein from "fast-levenshtein";
import { createClient } from "@supabase/supabase-js";

// ---------- Supabase (created lazily so config problems give a readable error) ----------
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing environment variable: " +
        [!url && "SUPABASE_URL", !key && "SUPABASE_SERVICE_KEY"].filter(Boolean).join(", "),
    );
  }
  return createClient(url, key); // service key stays server-side only
}

// ---------- Matching engine (Section 1.4.2) ----------
const SYNONYM_MAP = {
  phone: "cellphone",
  mobile: "cellphone",
  cp: "cellphone",
  wallet: "purse",
  billfold: "purse",
  id: "card",
  backpack: "bag",
};

const STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "with", "near",
  "found", "lost", "my", "and", "or", "is",
]);

function preprocessText(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t))
    .map((t) => SYNONYM_MAP[t] || t);
}

// Levenshtein string comparison (30% weight)
function calculateStringSimilarity(str1, str2) {
  const clean1 = preprocessText(str1).join(" ");
  const clean2 = preprocessText(str2).join(" ");
  if (!clean1 && !clean2) return 1.0;
  if (!clean1 || !clean2) return 0.0;
  const distance = levenshtein.get(clean1, clean2);
  return 1 - distance / Math.max(clean1.length, clean2.length);
}

// Date proximity (10% weight)
function calculateDateSimilarity(date1, date2) {
  if (!date1 || !date2) return 0.0;
  const diffDays = Math.abs((new Date(date1) - new Date(date2)) / 86400000);
  if (diffDays <= 1) return 1.0;
  if (diffDays <= 3) return 0.8;
  if (diffDays <= 7) return 0.5;
  if (diffDays <= 14) return 0.2;
  return 0.0;
}

// Weighted match evaluator. Order matters only for readability: (lost, found).
export function computeMatchScore(lostItem, foundItem) {
  const categoryScore =
    String(lostItem.category).toLowerCase() === String(foundItem.category).toLowerCase() ? 1 : 0;

  const color1 = preprocessText(lostItem.color);
  const color2 = preprocessText(foundItem.color);
  const colorScore = color1.some((c) => color2.includes(c)) ? 1 : 0;

  const descScore = calculateStringSimilarity(lostItem.description, foundItem.description);

  const loc1 = preprocessText(lostItem.location).join(" ");
  const loc2 = preprocessText(foundItem.location).join(" ");
  const locationScore =
    loc1 && loc2 && (loc1 === loc2 || loc1.includes(loc2) || loc2.includes(loc1)) ? 1 : 0;

  const dateScore = calculateDateSimilarity(lostItem.report_date, foundItem.report_date);

  const scoreBreakdown = {
    category: Math.round(categoryScore * 30),
    color: Math.round(colorScore * 20),
    description: Math.round(descScore * 30),
    location: Math.round(locationScore * 10),
    date: Math.round(dateScore * 10),
  };

  const finalScore = Math.round(
    categoryScore * 30 + colorScore * 20 + descScore * 30 + locationScore * 10 + dateScore * 10,
  );

  let confidenceTier = "Low";
  if (finalScore >= 85) confidenceTier = "High";
  else if (finalScore >= 70) confidenceTier = "Medium";

  return { finalScore, confidenceTier, scoreBreakdown };
}

// ---------- Validation ----------
export const CATEGORIES = ["Electronics", "Personal Items", "Documents", "Clothing", "Others"];

function clean(report) {
  const r = {
    report_type: String(report.report_type || "").trim(),
    category: String(report.category || "").trim(),
    color: String(report.color || "").trim(),
    description: String(report.description || "").trim(),
    location: String(report.location || "").trim(),
    report_date: String(report.report_date || "").trim(),
    reporter_name: String(report.reporter_name || "").trim(),
    reporter_contact: String(report.reporter_contact || "").trim(),
  };

  const problems = [];
  if (!["lost", "found"].includes(r.report_type)) problems.push("report_type must be lost or found");
  if (!CATEGORIES.includes(r.category)) problems.push("category is not valid");
  if (!r.color || r.color.length > 50) problems.push("color is required (max 50 characters)");
  if (!r.description || r.description.length > 2000) problems.push("description is required (max 2000 characters)");
  if (!r.location || r.location.length > 100) problems.push("location is required (max 100 characters)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.report_date) || isNaN(new Date(r.report_date)))
    problems.push("date is not valid");
  if (!r.reporter_name || r.reporter_name.length > 100) problems.push("name is required (max 100 characters)");
  if (!/^[0-9+\-\s()]{7,20}$/.test(r.reporter_contact)) problems.push("contact number is not valid");

  return { r, problems };
}

// ---------- Public endpoint: submit a lost or found report ----------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { report } = req.body || {};
  if (!report || typeof report !== "object") {
    return res.status(400).json({ message: "Invalid payload structure." });
  }

  const { r, problems } = clean(report);
  if (problems.length) {
    return res.status(400).json({ message: "Please fix: " + problems.join("; ") + "." });
  }

  try {
    const supabase = getSupabase();

    // 1. Save the report
    const { data: saved, error: insertError } = await supabase
      .from("reports")
      .insert(r)
      .select("id")
      .single();
    if (insertError) throw insertError;

    // Found reports are only saved. Staff review possible owners privately.
    if (r.report_type === "found") {
      return res.status(200).json({ success: true, reportId: saved.id, reportType: "found" });
    }

    // 2. Lost reports are compared against unclaimed found items
    const { data: foundReports, error } = await supabase
      .from("reports")
      .select("*")
      .eq("report_type", "found")
      .or("status.is.null,status.neq.claimed");
    if (error) throw error;

    // 3. Score, strip private data (RA 10173), filter, sort
    const matches = foundReports
      .map((foundItem) => {
        const { finalScore, confidenceTier, scoreBreakdown } = computeMatchScore(r, foundItem);
        const { reporter_name, reporter_contact, ...safeFoundItem } = foundItem;
        return { foundItem: safeFoundItem, matchScore: finalScore, confidenceTier, scoreBreakdown };
      })
      .filter((m) => m.matchScore >= 70)
      .sort((a, b) => b.matchScore - a.matchScore);

    return res.status(200).json({
      success: true,
      reportId: saved.id,
      reportType: "lost",
      totalMatches: matches.length,
      matches,
    });
  } catch (err) {
    console.error("match error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
}
