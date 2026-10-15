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
const CSS_ONLY_LAYOUTS = new Set(["hero-center", "stacked-cards"]);

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
  // A scene that explicitly declares assetNeed wants media regardless of
  // layout — both hero-center and stacked-cards render MediaBackground when
  // scene.media is present. Only skip CSS-only layouts when no assetNeed.
  if (CSS_ONLY_LAYOUTS.has(scene.layout) && !scene.assetNeed) return true;
  return false;
}

/** Small English stopword list for claim tokenization — function words only. */
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
  // #635: prepositions/particles/auxiliaries the original list missed — they
  // survived tokenization and padded phrases ("robot arm picking up").
  "up",
  "down",
  "out",
  "off",
  "onto",
  "upon",
  "through",
  "throughout",
  "across",
  "along",
  "around",
  "between",
  "behind",
  "beside",
  "near",
  "next",
  "toward",
  "towards",
  "without",
  "within",
  "inside",
  "outside",
  "beyond",
  "during",
  "after",
  "before",
  "while",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  "what",
  "how",
  "then",
  "than",
  "also",
  "still",
  "both",
  "each",
  "more",
  "most",
  "very",
  "just",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "vs",
  "versus",
  "per",
  "via",
  "including",
  "etc",
]);

/**
 * Shot framing / composition vocabulary (#635). These words describe *how* a
 * shot is framed, never *what* it shows — a phrase cut from them ("close up
 * advanced ai") retrieves nothing, and they only displace the content words
 * that do. "center" is deliberately absent: it is half of "data center".
 */
const FRAMING_WORDS = new Set([
  "close",
  "closeup",
  "closeups",
  "split",
  "splits",
  "pane",
  "panes",
  "shot",
  "shots",
  "view",
  "views",
  "angle",
  "angles",
  "frame",
  "frames",
  "framing",
  "background",
  "backgrounds",
  "foreground",
  "overlay",
  "side",
  "sides",
  "left",
  "right",
  "top",
  "bottom",
  "middle",
  "wide",
  "aerial",
  "full",
  "body",
  "scene",
  "scenes",
  "layout",
]);

/**
 * Rendering-style and meta vocabulary (#635): production craft ("cinematic",
 * colors, lighting) and request language ("ai", "tech", "generated") that
 * carry no retrievable subject. Kept out of the token stream so they can
 * neither stand alone nor pad a phrase window.
 */
const STYLE_WORDS = new Set([
  "cinematic",
  "aesthetic",
  "quality",
  "high",
  "end",
  "generated",
  "concept",
  "abstract",
  "theme",
  "tech",
  "glowing",
  "ai",
  "dates",
  "date",
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "amber",
  "purple",
  "pink",
  "gold",
  "silver",
  "cyan",
  "dark",
  "light",
  "bright",
  "neon",
]);

/**
 * Generic filler (#635): quantifiers and sizes, placeholder nouns and generic
 * actions. A bare "small" or "object" query is noise in every stock library;
 * as phrase padding these words only displace the subject.
 */
const GENERIC_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "small",
  "large",
  "big",
  "tiny",
  "huge",
  "massive",
  "giant",
  "little",
  "multiple",
  "several",
  "various",
  "object",
  "objects",
  "thing",
  "things",
  "item",
  "items",
  "stuff",
  "work",
  "working",
  "installed",
  "connected",
]);

/**
 * The single filter set for claim keyword tokens: function words, prompt
 * craft, generic filler. Bare digits are dropped separately (quantifiers,
 * not subject matter) — a token survives as an "anchor" only when digits ride
 * with letters (H800, Qwen3, 3D).
 */
const NON_KEYWORD_WORDS = new Set([
  ...STOPWORDS,
  ...FRAMING_WORDS,
  ...STYLE_WORDS,
  ...GENERIC_WORDS,
]);

/** Max keywords returned per claim. */
const MAX_KEYWORDS = 3;

/** Words in the primary search phrase. */
const PRIMARY_PHRASE_WORDS = 4;

/** Words per supplementary phrase window. */
const SPARE_PHRASE_WORDS = 3;

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
 * Tokenize text into keyword content words (lowercase, punctuation stripped,
 * function/prompt-craft/generic words dropped, bare digits dropped).
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeClaimWords(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^\d+$/u.test(t) && !NON_KEYWORD_WORDS.has(t));
}

/**
 * Keep the first occurrence of each token. A claim that names the same word
 * twice ("humanoid robot arm or robot hand") must not echo it into the phrase
 * ("humanoid robot arm robot").
 *
 * @param {string[]} tokens
 * @returns {string[]}
 */
function dedupeTokens(tokens) {
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * Chinese stopword characters — grams containing any of these are dropped.
 * Single characters keep the filter cheap (no word segmentation needed).
 */
const ZH_STOPWORD_CHARS = new Set([
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
 * #635 policy — a keyword must be a retrievable image-search phrase, not a
 * bag of tokens:
 * - prompt-craft vocabulary (framing, style, colors, "ai") and generic filler
 *   (quantifiers, sizes, placeholders such as "object") never enter the token
 *   stream;
 * - the primary phrase is the first N content words, with repeated words
 *   collapsed;
 * - remaining tokens are grouped into phrase windows, and a window shorter
 *   than two tokens is dropped — so a bare single word never becomes a query
 *   unless it is an alphanumeric anchor (H800, Qwen3, 3D);
 * - when the claim leaves no usable phrase (all filtered, or a single
 *   non-anchor word), the scene yields no claim keywords and the caller's
 *   pool takes over — fail-closed beats a noisy query.
 *
 * Scope boundary: this function only decides *what to search with*. The VLM
 * still scores candidates against the untouched assetNeed text (#294 owns
 * relevance judgment; #354 owns handwritten searchHints overrides).
 *
 * @param {string} claim - Asset-need description
 * @returns {string[]} Keyword array (0..3 entries; each is a ≥2-word phrase or an anchor)
 */
export function claimToKeywords(claim) {
  if (!claim || typeof claim !== "string") return [];

  const tokens = dedupeTokens(tokenizeClaimWords(claim));
  if (tokens.length === 0) return [];
  if (tokens.length === 1) {
    return /[0-9]/u.test(tokens[0]) ? [tokens[0]] : [];
  }

  const keywords = [tokens.slice(0, PRIMARY_PHRASE_WORDS).join(" ")];
  for (
    let i = PRIMARY_PHRASE_WORDS;
    i < tokens.length && keywords.length < MAX_KEYWORDS;
    i += SPARE_PHRASE_WORDS
  ) {
    const window = tokens.slice(i, i + SPARE_PHRASE_WORDS);
    if (window.length < 2) break;
    keywords.push(window.join(" "));
  }
  return keywords;
}
