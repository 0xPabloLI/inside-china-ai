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
    if (scene.mediaOptOut === true) continue;
    if (NO_MEDIA_TYPES.has(scene.visualType)) continue;

    const claim = typeof scene.assetNeed === "string" ? scene.assetNeed.trim() : "";
    if (!claim) continue;

    claims.push({
      sceneId: scene.id,
      assetNeed: claim,
      voiceover: scene.voiceover || "",
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
