/**
 * Claim Keywords — per-scene asset-claim extraction and deterministic
 * keyword generation for asset-sourcer.
 *
 * Scene-data declares visual intent via the structured `assetNeed` field
 * (the inline `[ASSET NEEDED: ...]` text annotation is deprecated — it
 * leaks into TTS if written into voiceover; scene-rules B13 guards that).
 * #354 made that field an override: every sourcing-eligible scene without
 * bound media derives a claim from its voiceover, and a writer can add
 * `searchHints` to replace the derived search phrases.
 *
 * Pure functions only — no I/O, no LLM. Same input always yields the same
 * keywords, so sourcing runs are reproducible and unit-testable.
 *
 * @module claim-keywords
 */

import { shouldSourceStock } from "./media-strategies.mjs";

/**
 * Scene types that must never receive media — single source of truth.
 * asset-sourcer imports this; do not mirror the set elsewhere.
 */
export const NO_MEDIA_TYPES = new Set(["cta", "data", "stat-reveal"]);

/**
 * Layouts that are skipped when the scene declares no media intent (#191).
 * `hero-center` covers the text-only templates, but context / info-card / hook
 * also render media behind it — so "CSS-only" here means "no media unless the
 * scene asks for it". `stacked-cards` is the narrative text-first layout
 * (ambient background only; evidence is rejected at preflight by #761).
 */
const CSS_ONLY_LAYOUTS = new Set(["hero-center", "stacked-cards"]);

/**
 * Whether a scene is excluded from media sourcing (#191).
 *
 * Precedence: NO_MEDIA_TYPES → hook (#299: manually curated, never
 * auto-sourced) → explicit `media: null` ("permanently no media", survives
 * reruns) → deprecated `mediaOptOut` (legacy content, still honored) →
 * CSS-only layouts. Derived supply additionally honours `shouldSourceStock`
 * (#354); an explicit `assetNeed` does not, until #355 unifies the chain.
 */
export function skipsMediaSourcing(scene) {
  if (!scene) return true;
  if (NO_MEDIA_TYPES.has(scene.visualType)) return true;
  // #299: hooks are manually curated — even an assetNeed must not trigger
  // auto-sourcing (the curated hook cover is a per-package authoring decision).
  if (scene.visualType === "hook") return true;
  if (scene.media === null) return true;
  if (scene.mediaOptOut === true) return true; // deprecated (#191)
  // A scene that explicitly declares assetNeed is asking for media regardless
  // of layout. hero-center renders it for context / info-card / hook; the two
  // text-first layouts (stacked-cards, contrast) only show it as a background,
  // and #761 fails evidence needs there at preflight — sourcing itself stays
  // layout-agnostic.
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
  // Pronouns (#354): voiceover narration is full of them and none can be a
  // visual subject — "we build moat" must reduce to "build moat".
  "i",
  "me",
  "my",
  "we",
  "us",
  "our",
  "you",
  "your",
  "they",
  "them",
  "their",
  "he",
  "him",
  "his",
  "she",
  "her",
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
  "not",
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
  "contrast",
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
 * with letters (H800, Qwen3, 3D) or it carries an internal capital (DeepSeek).
 */
const NON_KEYWORD_WORDS = new Set([
  ...STOPWORDS,
  ...FRAMING_WORDS,
  ...STYLE_WORDS,
  ...GENERIC_WORDS,
]);

/** Max keywords returned per claim. */
const MAX_KEYWORDS = 3;

/** Max writer-supplied search phrases per scene (#354). */
const MAX_SEARCH_HINTS = 4;

/** Words in the primary search phrase. */
const PRIMARY_PHRASE_WORDS = 4;

/** Words per supplementary phrase window. */
const PHRASE_WINDOW_WORDS = 3;

/**
 * Extract per-scene asset claims from scene-data.
 *
 * #354: every sourcing-eligible scene owns a claim. An explicit `assetNeed`
 * wins; a scene that only has narration gets a derived claim — the voiceover
 * is the claim text, and claimQueryPhrases() tokenizes it for search. The
 * derivation is on-demand, so legacy packages without `assetNeed` need no
 * backfill. Scenes that already carry bound media are not derived for: they
 * already have their asset, and a derived claim there could only produce
 * searches whose candidates assignment rejects as occupied. Generation-only
 * strategies (`b-roll`, `ai-image`) are not derived for either — the Step 1.5
 * rule says they must not buy stock.
 *
 * @param {Array|null} scenes - Scene data array
 * @returns {Array<{sceneId: number, assetNeed: string, voiceover: string, searchHints?: string[], sourceRef?: object}>}
 */
export function extractSceneClaims(scenes) {
  if (!scenes || !Array.isArray(scenes)) return [];

  const claims = [];
  for (const scene of scenes) {
    if (!scene) continue;
    if (skipsMediaSourcing(scene)) continue;

    const declared = typeof scene.assetNeed === "string" ? scene.assetNeed.trim() : "";
    // `media.path` is the binding test, not the object: a malformed `media: {}`
    // has no asset to protect, and other checks report the shape.
    if (!declared && scene.media?.path) continue;
    if (!declared && !shouldSourceStock(scene)) continue;

    const voiceover = typeof scene.voiceover === "string" ? scene.voiceover : "";
    if (!declared && !voiceover.trim()) continue;

    const searchHints = normalizeSearchHints(scene.searchHints);
    claims.push({
      sceneId: scene.id,
      assetNeed: declared,
      voiceover,
      ...(searchHints.length > 0 ? { searchHints } : {}),
      // #185: original-language source material — zh keyword extraction
      // consumes sourceText; url/title ride along for attribution/audit.
      ...(scene.sourceRef ? { sourceRef: scene.sourceRef } : {}),
    });
  }
  return claims;
}

/**
 * Search phrases per scene, including scenes whose claim yields none (an empty
 * array). Preflight asks two questions of this one map: "does this scene have a
 * usable claim?" (media coverage) and "would a declared searchHints be read at
 * all?" (schema check) — building the claim set twice invited the two answers
 * to drift.
 *
 * @param {Array|null} scenes
 * @returns {Map<number, string[]>} sceneId → phrases
 */
export function sceneClaimPhrases(scenes) {
  const map = new Map();
  for (const claim of extractSceneClaims(scenes)) {
    map.set(claim.sceneId, claimQueryPhrases(claim));
  }
  return map;
}

/**
 * The phrase one `searchHints` entry contributes, or "" when it cannot be
 * used. Shared by the preflight validator and the runtime normalizer so the
 * two cannot disagree about what "usable" means.
 *
 * @param {unknown} hint
 * @returns {string}
 */
function usableHintPhrase(hint) {
  if (typeof hint !== "string") return "";
  if (hint.trim().split(/\s+/).length > PRIMARY_PHRASE_WORDS) return "";
  return claimToKeywords(hint)[0] ?? "";
}

/**
 * Whether a scene's `searchHints` are usable (#354): a non-empty array of at
 * most MAX_SEARCH_HINTS short phrases, each of which survives the #635
 * sanitiser without losing words. Preflight uses this so a typo
 * (`searchHints: "robot"`), a style-only phrase ("cinematic close-up"), an
 * over-long list, or a phrase longer than the primary-phrase window (which
 * would be silently truncated) cannot degrade sourcing unnoticed.
 *
 * @param {unknown} hints
 * @returns {boolean}
 */
export function isUsableSearchHints(hints) {
  if (hints === undefined) return true;
  if (!Array.isArray(hints) || hints.length === 0 || hints.length > MAX_SEARCH_HINTS) return false;
  return hints.every((hint) => usableHintPhrase(hint) !== "");
}

/**
 * Normalize the writer's `searchHints` override (#354).
 *
 * Hints are already human-written search phrases, but they pass through the
 * same #635 sanitiser as claim-derived keywords: a hint that is pure style or
 * framing ("cinematic close-up") sanitises to nothing and is dropped, and a
 * long hint is cut to its primary phrase. Order is preserved — writers list
 * specific phrases first, general fallbacks after — and duplicates collapse.
 *
 * @param {unknown} hints
 * @returns {string[]} 0..MAX_SEARCH_HINTS phrases
 */
function normalizeSearchHints(hints) {
  if (!Array.isArray(hints)) return [];
  const out = [];
  const seen = new Set();
  for (const hint of hints) {
    const phrase = usableHintPhrase(hint);
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
    if (out.length >= MAX_SEARCH_HINTS) break;
  }
  return out;
}

/**
 * The search phrases a claim contributes to sourcing.
 *
 * A writer-supplied `searchHints` list replaces the deterministic tokenization
 * of the claim text: the writer knows which phrases the stock indexes can
 * retrieve. Without hints, the explicit `assetNeed` — or, for a derived claim,
 * the scene's voiceover — is tokenized by claimToKeywords, so the #635 rules
 * still keep a style phrase like "cinematic close-up" from becoming a query.
 *
 * @param {{assetNeed?: string, voiceover?: string, searchHints?: string[]}|null|undefined} claim
 * @returns {string[]}
 */
export function claimQueryPhrases(claim) {
  if (!claim) return [];
  if (Array.isArray(claim.searchHints) && claim.searchHints.length > 0) return claim.searchHints;
  return claimToKeywords(claim.assetNeed || claim.voiceover || "");
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
  return (
    text
      .toLowerCase()
      // Contractions are function words, not tokens: stripping the apostrophe
      // to a space turned "they'd" into "they d" and "couldn't" into "couldn t",
      // and those fragments consumed phrase slots. Voiceover-derived claims
      // (#354) hit this constantly; curated assetNeed text mostly did not.
      .replace(/\b(can|won)['’]t\b/gu, (_, stem) => (stem === "can" ? "can not" : "will not"))
      .replace(/\b(\p{L}+)n['’]t\b/gu, "$1 not")
      // Possessives are part of the noun: "Unitree's" must not become "unitree s".
      .replace(/['’](?:s|d|ll|re|ve|m)\b/gu, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      // A single letter is never a subject ("s", "d", "t" left by an
      // unexpanded contraction); digits are quantifiers, never subjects.
      .filter((t) => t.length > 1 && !/^\d+$/u.test(t) && !NON_KEYWORD_WORDS.has(t))
  );
}

/**
 * Anchor words — the only tokens allowed to stand alone as a query: model and
 * serial identifiers (H800, Qwen3, 3D) and brand-style tokens with an internal
 * capital (DeepSeek, iPhone). Capitalization alone is never a cue: an
 * all-caps token has no lowercase letter to distinguish a brand from shouted
 * filler, so it is not an anchor — "ROBOT" / "HAND" cannot leak back in as
 * bare queries, and acronyms such as "GPU" only survive inside a phrase.
 * Sentence-start capitalization is ignored for the same reason ("Robot",
 * "Split"); those brands are covered by the caller's fallback pool.
 * Returns lowercase forms to match the token stream.
 *
 * @param {string} claim - Raw claim text (casing intact)
 * @returns {Set<string>}
 */
function anchorWords(claim) {
  const anchors = new Set();
  for (const raw of claim.split(/\s+/)) {
    const bare = raw.replace(/['’]s\b/giu, "").replace(/[^\p{L}\p{N}]/gu, "");
    if (!bare || /^\d+$/u.test(bare)) continue; // bare numbers are quantifiers
    const hasLowercase = /[a-z]/.test(bare);
    if (/[0-9]/u.test(bare) || (hasLowercase && /[A-Z]/u.test(bare.slice(1)))) {
      anchors.add(bare.toLowerCase());
    }
  }
  return anchors;
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
 *   stream. The color/lighting entries are a deliberate blunt trade: in this
 *   pipeline's claims they are always grading ("dark blue tech aesthetic"),
 *   and dropping them keeps style phrases like "blue night" from consuming a
 *   query slot — a future subject that genuinely needs a color belongs in
 *   these lists' curation, not in a special case;
 * - the primary phrase is the first N content words, with repeated words
 *   collapsed;
 * - remaining tokens are grouped into phrase windows. A window qualifies when
 *   it has ≥2 words or is a single anchor word, so a bare generic word never
 *   becomes a query;
 * - when the claim leaves no usable phrase (all filtered, or a single
 *   non-anchor word), the scene yields no claim keywords and the caller's
 *   pool takes over — fail-closed beats a noisy query.
 *
 * Scope boundary: this function only decides *what to search with* when the
 * writer has not supplied `searchHints` (#354); the VLM still scores
 * candidates against the untouched claim text (#294 owns relevance judgment).
 *
 * @param {string} claim - Asset-need description
 * @returns {string[]} Keyword array (0..3 entries; each is a ≥2-word phrase or an anchor)
 */
export function claimToKeywords(claim) {
  if (!claim || typeof claim !== "string") return [];

  const tokens = dedupeTokens(tokenizeClaimWords(claim));
  if (tokens.length === 0) return [];
  const anchors = anchorWords(claim);
  if (tokens.length === 1) {
    return anchors.has(tokens[0]) ? [tokens[0]] : [];
  }

  const keywords = [tokens.slice(0, PRIMARY_PHRASE_WORDS).join(" ")];
  for (
    let i = PRIMARY_PHRASE_WORDS;
    i < tokens.length && keywords.length < MAX_KEYWORDS;
    i += PHRASE_WINDOW_WORDS
  ) {
    const window = tokens.slice(i, i + PHRASE_WINDOW_WORDS);
    const qualifies = window.length >= 2 || (window.length === 1 && anchors.has(window[0]));
    if (!qualifies) break;
    keywords.push(window.join(" "));
  }
  return keywords;
}
