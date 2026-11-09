import levenshtein from "fast-levenshtein";
import {
  SYNONYMS, STOP_WORDS, BASE_COLORS, COLOR_FAMILIES, COLOR_MODIFIERS, LOCATION_ALIASES, LOCATION_STOP_WORDS,
} from "./vocabulary.js";

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

export const WEIGHTS = { category: 30, color: 20, description: 30, location: 10, date: 10 };

const tierOf = (score) => (score >= 85 ? "High" : score >= 70 ? "Medium" : "Low");

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
  phone: "cellphone", mobile: "cellphone", cp: "cellphone",
  wallet: "purse", billfold: "purse", id: "card", backpack: "bag",
};
const V1_STOP = new Set(["a", "an", "the", "in", "on", "at", "with", "near", "found", "lost", "my", "and", "or", "is"]);

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
  const category = String(lost.category).toLowerCase() === String(found.category).toLowerCase() ? 1 : 0;
  const c1 = v1Tokens(lost.color);
  const c2 = v1Tokens(found.color);
  const color = c1.some((c) => c2.includes(c)) ? 1 : 0;
  const description = v1StringSimilarity(lost.description, found.description);
  const l1 = v1Tokens(lost.location).join(" ");
  const l2 = v1Tokens(found.location).join(" ");
  const location = l1 && l2 && (l1 === l2 || l1.includes(l2) || l2.includes(l1)) ? 1 : 0;
  const date = v1DateSimilarity(lost.report_date, found.report_date);

  const { raw, scoreBreakdown } = pack({ category, color, description, location, date });
  const finalScore = Math.round(raw);
  return { finalScore, confidenceTier: tierOf(finalScore), scoreBreakdown };
}

/* =====================================================================
 * v2: improved method
 *
 *  R1  Words are compared one by one (order and length no longer matter).
 *  R2  Spelling mistakes are tolerated: a missing, extra or swapped letter
 *      still counts as the same word. Rules depend on word length so that
 *      different words are not confused (card/cart, shirt/skirt).
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
 *  R9  Alternative spellings count as the same word (c/k, ph/f, e/i, o/u,
 *      double letters), and endings such as analog/analogue, crack/cracked.
 *  R10 A dictionary (lib/vocabulary.js) maps English and Filipino words for
 *      the same thing together. Misspelled dictionary words are recognized too.
 * ===================================================================== */
const STOP = new Set(STOP_WORDS);
const COLOR_MOD = new Set(COLOR_MODIFIERS);
const LOC_STOP = new Set(LOCATION_STOP_WORDS);
const COLOR_WORDS = new Set([...BASE_COLORS, ...Object.keys(COLOR_FAMILIES)]);
const SYN_KEYS = Object.keys(SYNONYMS).filter((k) => k.length >= 5); // only longer words are matched loosely

const stem = (t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);

// Edit distance where swapping two neighbouring letters counts as one edit.
function osa(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Sound-alike key: c/k, ph/f, e/i, o/u and double letters are common spelling variants.
function phoneticKey(w) {
  return w
    .replace(/ph/g, "f").replace(/ck/g, "k").replace(/c(?=[ei])/g, "s").replace(/c/g, "k")
    .replace(/q/g, "k").replace(/z/g, "s").replace(/o/g, "u").replace(/e/g, "i")
    .replace(/(.)\1+/g, "$1");
}

// 0 = different words, otherwise 0.7 to 1 = the same word, spelled a little differently.
function wordSimilarity(a, b, allowPrefix = true) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  const min = Math.min(la, lb), max = Math.max(la, lb);
  if (min < 4 || /\d/.test(a) || /\d/.test(b)) return 0; // short words and numbers must match exactly
  if (phoneticKey(a) === phoneticKey(b)) return 0.9;
  if (allowPrefix && min >= 5 && max - min <= 2 && (a.startsWith(b) || b.startsWith(a))) return 0.9; // analog / analogue
  const d = osa(a, b);
  if (min <= 5) {
    // Short words: allow a missing or extra letter, or two swapped letters, but not a
    // different letter (card/cart, shirt/skirt).
    const swapped = la === lb && d === 1 && [...a].filter((c, i) => c !== b[i]).length === 2;
    return d === 1 && (la !== lb || swapped) ? 1 - d / max : 0;
  }
  const allowed = max >= 8 ? 2 : 1;
  if (d > allowed) return 0;
  // A different letter is only trusted when the first letters agree (racket is not jacket).
  if (la === lb && a[0] !== b[0]) return 0;
  return 1 - d / max;
}

const canonCache = new Map();
function canonical(t) {
  if (canonCache.has(t)) return canonCache.get(t);
  let out;
  if (SYNONYMS[t] !== undefined) out = SYNONYMS[t];
  else if (SYNONYMS[stem(t)] !== undefined) out = SYNONYMS[stem(t)];
  else {
    out = stem(t);
    if (out.length >= 5) {
      // a misspelled dictionary word ("pitka" for "pitaka") still reaches its standard word
      let best = 0, hit = null;
      for (const key of SYN_KEYS) {
        const s = wordSimilarity(out, key, false); // no "starts with" shortcut for dictionary lookups
        if (s > best) { best = s; hit = key; }
      }
      if (hit && best >= 0.8) out = SYNONYMS[hit];
    }
  }
  canonCache.set(t, out);
  return out;
}

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)))
    .map(canonical)
    .filter((t, i, all) => all.indexOf(t) === i); // each word counts once ("school ID card" is not two cards)
}

function softMatch(A, B) {
  if (!A.length || !B.length) return { overlap: 0, dice: 0 };
  const used = new Set();
  let matched = 0;
  for (const a of A) {
    let best = 0, bestIdx = -1;
    B.forEach((b, i) => {
      if (used.has(i)) return;
      const s = wordSimilarity(a, b);
      if (s > best) { best = s; bestIdx = i; }
    });
    if (bestIdx >= 0) { used.add(bestIdx); matched += best; }
  }
  return { overlap: matched / Math.min(A.length, B.length), dice: (2 * matched) / (A.length + B.length) };
}

// If two neighbouring words on one side form a word on the other side ("power" + "bank" = "powerbank"), treat them as one.
function joinSplitWords(side, other) {
  const out = [];
  for (let i = 0; i < side.length; i++) {
    const joined = i + 1 < side.length ? side[i] + side[i + 1] : null;
    if (joined && other.some((o) => o === joined || wordSimilarity(joined, o) >= 0.9)) {
      out.push(other.find((o) => o === joined || wordSimilarity(joined, o) >= 0.9));
      i++;
    } else out.push(side[i]);
  }
  return out;
}

function descriptionSim(a, b) {
  let A = tokens(a);
  let B = tokens(b);
  // R8: drop color words (scored separately). If that empties a side, keep them.
  const A2 = A.filter((t) => !COLOR_WORDS.has(t));
  const B2 = B.filter((t) => !COLOR_WORDS.has(t));
  if (A2.length && B2.length) { A = A2; B = B2; }
  if (!A.length && !B.length) return 1;
  [A, B] = [joinSplitWords(A, B), joinSplitWords(B, A)]; // "power bank" = "powerbank"
  const r = softMatch(A, B);
  return 0.6 * r.overlap + 0.4 * r.dice; // overlap handles short vs long, dice punishes unrelated extras
}

// ---- Color matching: tolerant of typos, missing vowels, extra spaces and joined words ----
// Dictionary of every color word we know (English, shades, Filipino) -> its base color.
const COLOR_DICT = (() => {
  const fam = (c) => COLOR_FAMILIES[c] ?? c;
  const d = {};
  for (const c of BASE_COLORS) d[c] = c;
  for (const [k, v] of Object.entries(COLOR_FAMILIES)) d[k] = fam(v);
  for (const [k, v] of Object.entries(SYNONYMS)) if (BASE_COLORS.includes(v) && !(k in d)) d[k] = fam(v);
  return d;
})();
const COLOR_KEYS = Object.keys(COLOR_DICT);
// "blu" and "blue", "rd" and "red", "gry" and "gray" share the same consonant skeleton.
const skeleton = (w) => w[0] + w.slice(1).replace(/[aeiou]/g, "");

function lookupColor(t) {
  if (COLOR_DICT[t]) return COLOR_DICT[t];
  const hits = new Map(); // base color -> best distance
  const note = (key, dist) => { const c = COLOR_DICT[key]; if (!hits.has(c) || dist < hits.get(c)) hits.set(c, dist); };
  for (const key of COLOR_KEYS) {
    if (t.length >= 3 && t[0] === key[0] && osa(t, key) <= 1 && Math.abs(t.length - key.length) <= 1) note(key, 1);
    const sk = skeleton(key), st = skeleton(t);
    if (st === sk) note(key, 0);
    else if (st.length >= 3 && st[1] === sk[1] && osa(st, sk) <= 1) note(key, 2);
  }
  if (!hits.size) return null;
  const best = Math.min(...hits.values());
  const top = [...hits].filter(([, d]) => d === best);
  return top.length === 1 ? top[0][0] : null; // ambiguous (e.g. "gr") = do not guess
}

function resolveColors(text) {
  const lower = String(text || "").toLowerCase();
  const found = new Set();
  const toks = lower.replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t && !COLOR_MOD.has(t) && !STOP.has(t));
  for (const t of toks) { const c = lookupColor(t); if (c) found.add(c); }
  // joined or split words: "darkblue", "bl ack"
  const stripped = lower.replace(/[^a-z]/g, "");
  for (const key of COLOR_KEYS) if (key.length >= 4 && stripped.includes(key)) found.add(COLOR_DICT[key]);
  return found;
}

function colorSim(a, b) {
  const A = resolveColors(a), B = resolveColors(b);
  if (A.size && B.size) return [...A].some((c) => B.has(c)) ? 1 : 0;
  // an unlisted color (e.g. "turquoise") is compared word by word as before
  const fam = (s) => tokens(s).filter((t) => !COLOR_MOD.has(t)).map((t) => COLOR_FAMILIES[t] ?? t);
  return softMatch(fam(a), fam(b)).overlap > 0 ? 1 : 0;
}

function locationSim(a, b) {
  const raw = (s) => tokens(s).map((t) => LOCATION_ALIASES[t] ?? t);
  const loc = (s) => raw(s).filter((t) => !LOC_STOP.has(t));
  let A = loc(a), B = loc(b);
  // "Barangay" or "Brgy" alone is a real answer (the whole barangay): do not throw it away.
  if (!A.length || !B.length) { A = raw(a); B = raw(b); }
  return softMatch(A, B).overlap;
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
  const category = String(lost.category).toLowerCase() === String(found.category).toLowerCase() ? 1 : 0;
  const color = colorSim(lost.color, found.color);
  const description = descriptionSim(lost.description, found.description);
  const location = locationSim(lost.location, found.location);
  const date = dateSim(lost.report_date, found.report_date);

  const { raw, scoreBreakdown } = pack({ category, color, description, location, date });
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
  const v = version || (typeof process !== "undefined" && process.env && process.env.MATCH_ALGORITHM) || "v2";
  return (ALGORITHMS[v] || scoreV2)(lost, found);
}
