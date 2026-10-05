import levenshtein from "fast-levenshtein";

/*
 * Tugma matching engine.
 *
 * Both versions use the same five criteria and weights (Section 1.4.2):
 *   category 30, color 20, description 30, location 10, date 10
 * and the same confidence tiers: High >= 85, Medium >= 70, Low < 70.
 *
 *   v1  original method: exact-match rules and whole-string Levenshtein
 *   v2  improved method: same weights, but each criterion is matched more
 *       fairly (see rules R1 to R7 below). Kept side by side so both can be
 *       evaluated on the same data (baseline vs improved).
 *
 * Choose the live version with the MATCH_ALGORITHM environment variable
 * ("v1" or "v2", default "v2").
 */

export const WEIGHTS = {
  category: 30,
  color: 20,
  description: 30,
  location: 10,
  date: 10,
};

const tierOf = (score) =>
  score >= 85 ? "High" : score >= 70 ? "Medium" : "Low";

function pack(parts) {
  const scoreBreakdown = {
    category: Math.round(parts.category * WEIGHTS.category),
    color: Math.round(parts.color * WEIGHTS.color),
    description: Math.round(parts.description * WEIGHTS.description),
    location: Math.round(parts.location * WEIGHTS.location),
    date: Math.round(parts.date * WEIGHTS.date),
  };
  const raw =
    parts.category * WEIGHTS.category +
    parts.color * WEIGHTS.color +
    parts.description * WEIGHTS.description +
    parts.location * WEIGHTS.location +
    parts.date * WEIGHTS.date;
  return { raw, scoreBreakdown };
}

/* =====================================================================
 * v1: original method
 * ===================================================================== */
const V1_SYNONYMS = {
  phone: "cellphone",
  mobile: "cellphone",
  cp: "cellphone",
  wallet: "purse",
  billfold: "purse",
  id: "card",
  backpack: "bag",
};
const V1_STOP = new Set([
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

function v1Tokens(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t && !V1_STOP.has(t))
    .map((t) => V1_SYNONYMS[t] || t);
}

function v1StringSimilarity(a, b) {
  const c1 = v1Tokens(a).join(" ");
  const c2 = v1Tokens(b).join(" ");
  if (!c1 && !c2) return 1;
  if (!c1 || !c2) return 0;
  return 1 - levenshtein.get(c1, c2) / Math.max(c1.length, c2.length);
}

function v1DateSimilarity(d1, d2) {
  if (!d1 || !d2) return 0;
  const diff = Math.abs((new Date(d1) - new Date(d2)) / 86400000);
  if (diff <= 1) return 1;
  if (diff <= 3) return 0.8;
  if (diff <= 7) return 0.5;
  if (diff <= 14) return 0.2;
  return 0;
}

export function scoreV1(lost, found) {
  const category =
    String(lost.category).toLowerCase() === String(found.category).toLowerCase()
      ? 1
      : 0;
  const c1 = v1Tokens(lost.color);
  const c2 = v1Tokens(found.color);
  const color = c1.some((c) => c2.includes(c)) ? 1 : 0;
  const description = v1StringSimilarity(lost.description, found.description);
  const l1 = v1Tokens(lost.location).join(" ");
  const l2 = v1Tokens(found.location).join(" ");
  const location =
    l1 && l2 && (l1 === l2 || l1.includes(l2) || l2.includes(l1)) ? 1 : 0;
  const date = v1DateSimilarity(lost.report_date, found.report_date);

  const { raw, scoreBreakdown } = pack({
    category,
    color,
    description,
    location,
    date,
  });
  const finalScore = Math.round(raw);
  return { finalScore, confidenceTier: tierOf(finalScore), scoreBreakdown };
}

/* =====================================================================
 * v2: improved method
 *
 *  R1  Words are compared one by one (order and length no longer matter),
 *      and a close spelling counts as a match (typo tolerance).
 *  R2  Plurals are reduced and a bigger synonym list, including common
 *      Filipino words, maps different words for the same thing together.
 *  R3  Colors are compared by color family ("dark blue" = "navy").
 *  R4  Locations get partial credit for shared words.
 *  R5  Dates are direction-aware: an item cannot be found before it was lost
 *      (1 day tolerance), then credit falls off with the gap.
 *  R6  Category gate: different categories can never reach the public
 *      threshold (score capped at 55, still visible to staff at 50+).
 *  R7  Evidence gate: with almost no description similarity, a pair cannot
 *      reach Medium (score capped at 65).
 *  R8  Color words are ignored in the description, because color already has
 *      its own 20 points (otherwise "black" would be counted twice).
 * ===================================================================== */
const SYN = {
  phone: "phone",
  cellphone: "phone",
  mobile: "phone",
  cp: "phone",
  telepono: "phone",
  selpon: "phone",
  smartphone: "phone",
  wallet: "wallet",
  purse: "wallet",
  billfold: "wallet",
  pitaka: "wallet",
  key: "key",
  keys: "key",
  susi: "key",
  keychain: "key",
  id: "card",
  card: "card",
  license: "card",
  atm: "card",
  bag: "bag",
  backpack: "bag",
  bagpack: "bag",
  handbag: "bag",
  umbrella: "umbrella",
  payong: "umbrella",
  eyeglasses: "eyeglasses",
  glasses: "eyeglasses",
  specs: "eyeglasses",
  salamin: "eyeglasses",
  watch: "watch",
  relo: "watch",
  earphone: "earphone",
  earphones: "earphone",
  earbud: "earphone",
  earbuds: "earphone",
  headphone: "earphone",
  headphones: "earphone",
  bottle: "bottle",
  tumbler: "bottle",
  shoe: "shoe",
  shoes: "shoe",
  sapatos: "shoe",
  // Filipino colors
  itim: "black",
  puti: "white",
  pula: "red",
  asul: "blue",
  berde: "green",
  dilaw: "yellow",
  kayumanggi: "brown",
  abo: "gray",
  lila: "purple",
  kahel: "orange",
};
const STOP = new Set([
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
  "of",
  "some",
  "inside",
  "na",
  "ang",
  "ng",
  "sa",
  "ko",
  "ay",
  "mga",
  "may",
  "yung",
  "yong",
  "si",
  "ni",
  "kay",
  "po",
  "nito",
  "ito",
]);
const COLOR_MODIFIERS = new Set([
  "dark",
  "light",
  "deep",
  "bright",
  "pale",
  "royal",
  "sky",
  "baby",
]);
const COLOR_FAMILY = {
  navy: "blue",
  teal: "green",
  maroon: "red",
  crimson: "red",
  grey: "gray",
  silver: "gray",
  gold: "yellow",
  beige: "brown",
  tan: "brown",
  violet: "purple",
  magenta: "pink",
};
const LOCATION_SYN = {
  chapel: "church",
  simbahan: "church",
  kapilya: "church",
  palengke: "market",
};
const LOCATION_STOP = new Set([
  "barangay",
  "brgy",
  "sta",
  "rita",
  "front",
  "beside",
  "infront",
  "behind",
  "area",
]);

const stem = (t) =>
  t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
const norm = (t) => SYN[t] ?? SYN[stem(t)] ?? stem(t);

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)))
    .map(norm);
}

const wordSim = (a, b) =>
  a === b ? 1 : 1 - levenshtein.get(a, b) / Math.max(a.length, b.length);

// Short words (4 letters or fewer) and numbers must match exactly, longer words
// may differ by about one letter in five.
function softMatch(A, B) {
  if (!A.length || !B.length) return { overlap: 0, dice: 0 };
  const used = new Set();
  let matched = 0;
  for (const a of A) {
    let best = 0;
    let bestIdx = -1;
    B.forEach((b, i) => {
      if (used.has(i)) return;
      const need = Math.min(a.length, b.length) <= 4 || /\d/.test(a) ? 1 : 0.8;
      const s = wordSim(a, b);
      if (s >= need && s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      matched += best;
    }
  }
  return {
    overlap: matched / Math.min(A.length, B.length),
    dice: (2 * matched) / (A.length + B.length),
  };
}

const COLOR_WORDS = new Set([
  "black",
  "white",
  "red",
  "blue",
  "green",
  "yellow",
  "brown",
  "gray",
  "grey",
  "purple",
  "orange",
  "pink",
  "silver",
  "gold",
  "navy",
  "teal",
  "maroon",
  "crimson",
  "beige",
  "tan",
  "violet",
  "magenta",
  "multicolor",
  "colorful",
]);

function descriptionSim(a, b) {
  let A = tokens(a);
  let B = tokens(b);
  // R8: drop color words (scored separately). If that empties a side, keep them.
  const A2 = A.filter((t) => !COLOR_WORDS.has(t));
  const B2 = B.filter((t) => !COLOR_WORDS.has(t));
  if (A2.length && B2.length) {
    A = A2;
    B = B2;
  }
  if (!A.length && !B.length) return 1;
  const r = softMatch(A, B);
  return 0.6 * r.overlap + 0.4 * r.dice; // overlap handles short vs long, dice punishes unrelated extras
}

function colorSim(a, b) {
  const fam = (s) =>
    tokens(s)
      .filter((t) => !COLOR_MODIFIERS.has(t))
      .map((t) => COLOR_FAMILY[t] ?? t);
  const A = fam(a);
  const B = fam(b);
  return A.some((x) => B.includes(x)) ? 1 : 0;
}

function locationSim(a, b) {
  const loc = (s) =>
    tokens(s)
      .filter((t) => !LOCATION_STOP.has(t))
      .map((t) => LOCATION_SYN[t] ?? t);
  return softMatch(loc(a), loc(b)).overlap;
}

function dateSim(lostDate, foundDate) {
  const diff = (new Date(foundDate) - new Date(lostDate)) / 86400000; // positive = found after lost
  if (Number.isNaN(diff) || diff < -1) return 0;
  const d = Math.max(diff, 0);
  if (d <= 1) return 1;
  if (d <= 3) return 0.8;
  if (d <= 7) return 0.5;
  if (d <= 14) return 0.2;
  return 0;
}

export function scoreV2(lost, found) {
  const category =
    String(lost.category).toLowerCase() === String(found.category).toLowerCase()
      ? 1
      : 0;
  const color = colorSim(lost.color, found.color);
  const description = descriptionSim(lost.description, found.description);
  const location = locationSim(lost.location, found.location);
  const date = dateSim(lost.report_date, found.report_date);

  const { raw, scoreBreakdown } = pack({
    category,
    color,
    description,
    location,
    date,
  });
  let score = raw;
  if (!category) score = Math.min(score, 55); // R6
  if (description < 0.25) score = Math.min(score, 65); // R7
  const finalScore = Math.round(score);
  return { finalScore, confidenceTier: tierOf(finalScore), scoreBreakdown };
}

/* ===================================================================== */
export const ALGORITHMS = { v1: scoreV1, v2: scoreV2 };

// lost and found must be passed in that order (the date rule depends on it)
export function computeMatchScore(lost, found, version) {
  const v =
    version ||
    (typeof process !== "undefined" &&
      process.env &&
      process.env.MATCH_ALGORITHM) ||
    "v2";
  return (ALGORITHMS[v] || scoreV2)(lost, found);
}
