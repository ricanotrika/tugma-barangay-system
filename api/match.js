import levenshtein from "fast-levenshtein";

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
    loc1 === loc2 || loc1.includes(loc2) || loc2.includes(loc1) ? 1.0 : 0.0;

  // 5. Date Proximity (10%)
  const dateScore = calculateDateSimilarity(lostItem.date, foundItem.date);

  // Aggregate weighted score
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

  return { finalScore, confidenceTier };
}

// Vercel Serverless Entry Point
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { lostReport, foundReports } = req.body;

  if (!lostReport || !foundReports || !Array.isArray(foundReports)) {
    return res.status(400).json({ message: "Invalid payload structure." });
  }

  const matches = foundReports
    .map((foundItem) => {
      const { finalScore, confidenceTier } = computeMatchScore(
        lostReport,
        foundItem,
      );

      // Privacy safeguard (RA 10173): Exclude private contact info from response payload
      const { reporterName, reporterPhone, ...safeFoundItem } = foundItem;

      return {
        foundItem: safeFoundItem,
        matchScore: finalScore,
        confidenceTier,
      };
    })
    .filter((item) => item.matchScore >= 70) // Threshold cutoff
    .sort((a, b) => b.matchScore - a.matchScore);

  return res.status(200).json({
    success: true,
    totalMatches: matches.length,
    matches,
  });
}
