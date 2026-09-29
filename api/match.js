import levenshtein from "fast-levenshtein";
import { createClient } from "@supabase/supabase-js";

// Created inside the handler so config problems return a readable error
function getSupabase() {
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

// Synonym normalization map (Section 1.4.2)
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
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "with",
  "near",
  "found",
  "lost",
  "my",
  "and",
  "or",
  "is",
]);

// Preprocessing helper
function preprocessText(text) {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/);
  return tokens
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
  const maxLength = Math.max(clean1.length, clean2.length);
  return 1 - distance / maxLength;
}

// Date proximity calculation (10% weight)
function calculateDateSimilarity(date1, date2) {
  if (!date1 || !date2) return 0.0;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffDays = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 1.0;
  if (diffDays <= 3) return 0.8;
  if (diffDays <= 7) return 0.5;
  if (diffDays <= 14) return 0.2;
  return 0.0;
}

// Weighted Match Evaluator
function computeMatchScore(lostItem, foundItem) {
  // 1. Category Match (30%)
  const categoryScore =
    lostItem.category.toLowerCase() === foundItem.category.toLowerCase()
      ? 1.0
      : 0.0;

  // 2. Color Match (20%)
  const color1 = preprocessText(lostItem.color);
  const color2 = preprocessText(foundItem.color);
  const colorScore = color1.some((c) => color2.includes(c)) ? 1.0 : 0.0;

  // 3. Description Similarity via Levenshtein (30%)
  const descScore = calculateStringSimilarity(
    lostItem.description,
    foundItem.description,
  );

  // 4. Location Proximity (10%)
  const loc1 = preprocessText(lostItem.location).join(" ");
  const loc2 = preprocessText(foundItem.location).join(" ");
  const locationScore =
    loc1 && loc2 &&
    (loc1 === loc2 || loc1.includes(loc2) || loc2.includes(loc1))
      ? 1.0
      : 0.0;

  // 5. Date Proximity (10%)
  const dateScore = calculateDateSimilarity(lostItem.report_date, foundItem.report_date);

  // Weighted points per criterion (each rounded for display)
  const scoreBreakdown = {
    category: Math.round(categoryScore * 30),
    color: Math.round(colorScore * 20),
    description: Math.round(descScore * 30),
    location: Math.round(locationScore * 10),
    date: Math.round(dateScore * 10),
  };

  const finalScore = Math.round(
    categoryScore * 30 +
      colorScore * 20 +
      descScore * 30 +
      locationScore * 10 +
      dateScore * 10,
  );

  // Confidence Tiers (Section 1.4.2)
  let confidenceTier = "Low";
  if (finalScore >= 85) confidenceTier = "High";
  else if (finalScore >= 70) confidenceTier = "Medium";

  return { finalScore, confidenceTier, scoreBreakdown };
}

// Vercel Serverless Entry Point
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { lostReport } = req.body || {};
  // Your reports table requires these fields (NOT NULL)
  const required = ["category", "color", "description", "location", "report_date", "reporter_name", "reporter_contact"];
  const missing = lostReport ? required.filter((k) => !lostReport[k]) : required;
  if (missing.length) {
    return res.status(400).json({ message: "Missing fields: " + missing.join(", ") });
  }

  try {
    const supabase = getSupabase();

    // 1. Save the new lost report
    const { error: insertError } = await supabase.from("reports").insert({
      report_type: "lost",
      category: lostReport.category,
      color: lostReport.color,
      description: lostReport.description,
      location: lostReport.location,
      report_date: lostReport.report_date,
      reporter_name: lostReport.reporter_name,
      reporter_contact: lostReport.reporter_contact,
    });
    if (insertError) throw insertError;

    // 2. Fetch found reports from the database (the server does this, not the browser)
    const { data: foundReports, error } = await supabase
      .from("reports")
      .select("*")
      .eq("report_type", "found");
    if (error) throw error;

    // 3. Score, strip private data, filter, sort
    const matches = foundReports
      .map((foundItem) => {
        const { finalScore, confidenceTier, scoreBreakdown } = computeMatchScore(lostReport, foundItem);
        // RA 10173: never send contact details to the client
        const { reporter_name, reporter_contact, ...safeFoundItem } = foundItem;
        return { foundItem: safeFoundItem, matchScore: finalScore, confidenceTier, scoreBreakdown };
      })
      .filter((m) => m.matchScore >= 70)
      .sort((a, b) => b.matchScore - a.matchScore);

    return res.status(200).json({ success: true, totalMatches: matches.length, matches });
  } catch (err) {
    console.error("match error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
}
