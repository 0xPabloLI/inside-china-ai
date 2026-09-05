/**
 * Claim Keywords — per-scene asset-claim extraction and deterministic
 * keyword generation for asset-sourcer.
 *
 * Scene-data declares visual intent via the structured `assetNeed` field
 * (the inline `[ASSET NEEDED: ...]` text annotation is deprecated — it
 * leaks into TTS if written into voiceover; scene-rules B13 guards that).
 *
 * Pure functions only — no I/O, no LLM. Same input always yields the same
 * keywords, so sourcing runs are reproducible and unit-testable.
 *
 * @module claim-keywords
 */

/**
 * Scene types that must never receive media — single source of truth.
 * asset-sourcer imports this; do not mirror the set elsewhere.
 */
export const NO_MEDIA_TYPES = new Set(["cta", "data", "stat-reveal"]);

/**
 * Layouts that never auto-source media (#191): hero-center is forced for all
 * non-narrative visualTypes whose templates are text-only; narrative +
 * stacked-cards is designed to work without media (GridBg fallback).
 */
export const CSS_ONLY_LAYOUTS = new Set(["hero-center", "stacked-cards"]);

/**
 * Whether a scene is excluded from media sourcing (#191).
 *
 * Precedence: NO_MEDIA_TYPES → explicit `media: null` ("permanently no
 * media", survives reruns) → deprecated `mediaOptOut` (legacy content,
 * still honored) → CSS-only layouts. The b-roll budget check
 * (shouldSourceStock) stays with the caller.
 */
export function skipsMediaSourcing(scene) {
  if (!scene) return true;
  if (NO_MEDIA_TYPES.has(scene.visualType)) return true;
  if (scene.media === null) return true;
  if (scene.mediaOptOut === true) return true; // deprecated (#191)
  if (CSS_ONLY_LAYOUTS.has(scene.layout)) return true;
  return false;
}

/** Small English stopword list for claim tokenization. */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "and",
  "or",
  "to",
  "from",
  "by",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "as",
  "into",
  "about",
  "over",
  "under",
  "showing",
  "show",
  "some",
  "any",
]);

/** Max keywords returned per claim. */
const MAX_KEYWORDS = 3;

/** Words in the primary search phrase. */
const PRIMARY_PHRASE_WORDS = 4;

/**
 * Extract per-scene asset claims from scene-data.
 *
 * A scene yields a claim when it has a non-empty `assetNeed`, is not
 * opted out (`mediaOptOut: true` wins over assetNeed), and its visualType
 * is allowed to carry media.
 *
 * @param {Array|null} scenes - Scene data array
 * @returns {Array<{sceneId: number, claim: string, voiceover: string}>}
 */
export function extractSceneClaims(scenes) {
  if (!scenes || !Array.isArray(scenes)) return [];

  const claims = [];
  for (const scene of scenes) {
    if (!scene) continue;
    if (skipsMediaSourcing(scene)) continue;

    const claim = typeof scene.assetNeed === "string" ? scene.assetNeed.trim() : "";
    if (!claim) continue;

    claims.push({
      sceneId: scene.id,
      assetNeed: claim,
      voiceover: scene.voiceover || "",
      // #185: original-language source material — zh keyword extraction
      // consumes sourceText; url/title ride along for attribution/audit.
      ...(scene.sourceRef ? { sourceRef: scene.sourceRef } : {}),
    });
  }
  return claims;
}

/**
 * Tokenize text into content words (lowercase, punctuation stripped,
 * stopwords dropped). Shared by claim keyword generation and the
 * relevance-overlap scorer so both use the same normalization.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeClaimWords(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/**
 * Chinese stopword characters — grams containing any of these are dropped.
 * Single characters keep the filter cheap (no word segmentation needed).
 */
export const ZH_STOPWORD_CHARS = new Set([
  "的",
  "了",
  "在",
  "是",
  "和",
  "与",
  "及",
  "对",
  "为",
  "等",
  "把",
  "将",
  "从",
  "被",
  "其",
  "这",
  "那",
  "也",
  "就",
  "都",
  "而",
  "或",
  "并",
  "以",
  "个",
  "很",
  "到",
  "说",
  "称",
]);

/**
 * Extract Chinese search keywords from original-language source text
 * (#185, approved direction B: no translation round-trip).
 *
 * No segmentation library (tool-admission avoided): punctuation splits the
 * text into runs, then 2-4 character n-grams are scored by frequency.
 * Grams containing stopword characters, digits or latin letters are
 * dropped. Deterministic order: frequency desc, then first appearance.
 * Grams must repeat ≥2 times — single-occurrence n-grams are noise.
 *
 * @param {string} text - Original Chinese source text (scene.sourceRef.sourceText)
 * @param {{limit?: number}} [opts]
 * @returns {string[]} Up to `limit` Chinese keywords (may be empty — callers
 *   fall back to the existing keyword pools)
 */
export function extractZhKeywords(text, opts = {}) {
  if (!text || typeof text !== "string") return [];
  const limit = Math.max(1, Math.round(opts.limit ?? 8));
  const runs = text.split(/[\s。！？；：，、“”‘’《》（）()\[\]【】—…·]+/).filter(Boolean);
  const freq = new Map();
  const firstPos = new Map();
  let pos = 0;
  for (const run of runs) {
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i + len <= run.length; i++) {
        const gram = run.slice(i, i + len);
        if (/[\dA-Za-z]/.test(gram)) continue;
        let bad = false;
        for (const ch of gram) {
          if (ZH_STOPWORD_CHARS.has(ch)) {
            bad = true;
            break;
          }
        }
        if (bad) continue;
        freq.set(gram, (freq.get(gram) || 0) + 1);
        if (!firstPos.has(gram)) firstPos.set(gram, pos);
        pos++;
      }
    }
  }
  // Greedy substring dedup: a gram contained in an already-kept (higher or
  // equal frequency) gram is the same concept — keep the longer form only.
  const ranked = [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        b[0].length - a[0].length || // equal frequency: prefer the longer gram
        firstPos.get(a[0]) - firstPos.get(b[0]),
    );
  const kept = [];
  for (const [gram] of ranked) {
    if (kept.some((k) => k.includes(gram))) continue;
    kept.push(gram);
    if (kept.length >= limit) break;
  }
  return kept;
}

/**
 * Convert an asset-claim description into deterministic search keywords.
 *
 * Pipeline: lowercase → strip punctuation → drop stopwords →
 * primary phrase (first 4 content words) + up to 2 single-word spares,
 * capped at MAX_KEYWORDS total.
 *
 * @param {string} claim - Asset-need description
 * @returns {string[]} Keyword array (0..3 entries)
 */
export function claimToKeywords(claim) {
  if (!claim || typeof claim !== "string") return [];

  const tokens = tokenizeClaimWords(claim);
  if (tokens.length === 0) return [];

  const keywords = [];
  if (tokens.length === 1) {
    keywords.push(tokens[0]);
  } else {
    keywords.push(tokens.slice(0, PRIMARY_PHRASE_WORDS).join(" "));
    for (const token of tokens.slice(PRIMARY_PHRASE_WORDS)) {
      if (keywords.length >= MAX_KEYWORDS) break;
      keywords.push(token);
    }
  }
  return keywords;
}
