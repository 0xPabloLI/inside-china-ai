/**
 * Claim → visual-scene prompt derivation for the chain's T2I rung (#1324).
 *
 * The chain's fallback still prompt was the voiceover verbatim
 * (media-strategies `resolveGenerationPrompt`, source "voiceover"). A narration
 * sentence is not art direction: the T2I model renders its literal content, so
 * "That is 80 percent gone in five months..." became a background painting a
 * giant "80%" that fights the scene's own bigNumber overlay, and the "no text"
 * negative clause cannot suppress a prompt whose words demand a number.
 *
 * This module converts the claim into a text-free visual scene description:
 * numerals, quantity/currency words and narration-meta words are dropped, and
 * the surviving content words become a short scene clause. The injection layer
 * (prompt-injection.mjs) still decorates the clause with BRAND base, entity
 * accent and NEGATIVE constants — so the clause itself must avoid
 * art-direction vocabulary (dark/background/gradient/color names) that would
 * trip `declaresOwnArtDirection` and suppress the brand constants.
 *
 * Scope: only the voiceover-derived source is transformed. A writer-declared
 * `aiImage.prompt` is art direction and passes untouched; a declared
 * `assetNeed` is search intent the writer chose and also passes untouched.
 *
 * Deterministic and pure: no IO, no LLM call, no scene mutation — the report's
 * promptHash must stay reproducible across runs for the cache rules.
 */

/** The prompt-source label the orchestrator persists for transformed prompts. */
export const DERIVED_VOICEOVER_SOURCE = "voiceover-visual";

/**
 * Narration words that must never become visual subjects. Grouped by why each
 * word is excluded:
 * - quantity/currency — their foreground counterpart is the scene's own
 *   bigNumber overlay; rendering them in the background is the #1324 failure.
 * - attribution/meta — how the claim was learned, not what it looks like.
 * - relative time — dates render as text, never as imagery.
 * - small numbers spelled out — same quantity argument as digits.
 */
const VISUAL_META_STOPWORDS = new Set([
  // quantity / currency
  "percent",
  "percentage",
  "half",
  "quarter",
  "double",
  "triple",
  "million",
  "billion",
  "trillion",
  "thousand",
  "hundred",
  "dozen",
  "yuan",
  "dollar",
  "dollars",
  "cent",
  "cents",
  "usd",
  "cny",
  "rmb",
  // attribution / narration meta
  "according",
  "per",
  "reported",
  "report",
  "reports",
  "said",
  "says",
  "stated",
  "announced",
  "announcement",
  "claims",
  "claiming",
  "citing",
  "via",
  "sources",
  "statement",
  "disclosed",
  "revealed",
  // prompt-craft self-reference — the word "prompt" inside a prompt invites
  // the model to paint a UI with lettering
  "prompt",
  "prompts",
  "mostly",
  // markets / screens — finance-domain nouns steer the model toward exchange
  // boards and data displays, which are wall-to-wall numbers and lettering
  // (verified: "hkex listing" painted a giant "80%" quote board, #1324)
  "hkex",
  "nasdaq",
  "nyse",
  "sse",
  "szse",
  "seng",
  "index",
  "indices",
  "listing",
  "listed",
  "ipo",
  "exchange",
  "exchanges",
  "stock",
  "stocks",
  "share",
  "shares",
  "market",
  "markets",
  "trading",
  "trades",
  "ticker",
  "closes",
  "valuation",
  "api",
  "apis",
  // relative time
  "today",
  "yesterday",
  "week",
  "weeks",
  "month",
  "months",
  "quarterly",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  // spelled-out small numbers (digits are already dropped by the tokenizer)
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
  "first",
  "second",
  "third",
]);

/** Function words the visual clause must not carry. */
const VISUAL_FUNCTION_WORDS = new Set([
  "that",
  "this",
  "these",
  "those",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "for",
  "in",
  "on",
  "at",
  "with",
  "from",
  "to",
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "but",
  "not",
  "no",
  "yes",
  "most",
  "more",
  "than",
  "then",
  "still",
  "also",
  "just",
  "even",
  "only",
  "about",
  "into",
  "over",
  "under",
  "up",
  "out",
  "off",
  "all",
  "any",
  "each",
  "every",
  "some",
  "such",
  "so",
  "as",
  "by",
  "has",
  "have",
  "had",
  "did",
  "does",
  "doing",
  "will",
  "would",
  "can",
  "could",
  "should",
  "shall",
  "may",
  "might",
  "must",
  "while",
  "when",
  "where",
  "what",
  "which",
  "who",
  "how",
  "there",
  "here",
]);

/** Fallback clause when the claim leaves no usable content words. */
const GENERIC_CLAUSE = "abstract cinematic tech scene, ambient atmosphere";

/**
 * Normalize a claim the way the sourcing tokenizer does (#635): contractions
 * expand, possessives merge, punctuation becomes space. Returns tokens with
 * their casing intact — brand detection needs the original capitals, and
 * `isVisualWord` lowercases the survivors.
 */
function tokenize(text) {
  return (text ?? "")
    .replace(/\b(can|won)['’]t\b/gu, (_, stem) => (stem === "can" ? "can not" : "will not"))
    .replace(/\b(\p{L}+)n['’]t\b/gu, "$1 not")
    .replace(/['’](?:s|d|ll|re|ve|m)\b/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Brand-style / acronym tokens must never become visual subjects: the T2I
 * model renders them as giant wordmarks (verified: "qbitai image scene"
 * painted a huge — and misspelled — "qibitai", #1324). Attribution belongs
 * to the injection layer's entity accent (a colored glow, not lettering), so
 * the clause carries none of the naming.
 *
 * Detection is casing-based on the original token: any uppercase beyond the
 * first letter marks a brand ("QbitAI", "MiniMax") or an acronym ("HKEX",
 * "API") — sentence-initial capitals are exempt, so ordinary words like
 * "Zhipu" survive as lowercase content words.
 */
function isBrandToken(token) {
  return /[\p{Lu}]/u.test(token.slice(1));
}

/**
 * Whether a token may become part of a visual scene clause. A digit-led token
 * ("16", "4k", "h3", "0.2" fragments) is a spec or quantity, not imagery —
 * rendering it is exactly the #1324 text-in-background failure, so digit-led
 * tokens drop even when they name a model.
 */
function isVisualWord(token) {
  const lower = token.toLowerCase();
  if (lower.length <= 1) return false;
  if (/^\d/u.test(token)) return false;
  if (isBrandToken(token)) return false;
  if (VISUAL_META_STOPWORDS.has(lower)) return false;
  if (VISUAL_FUNCTION_WORDS.has(lower)) return false;
  return true;
}

/**
 * Convert a voiceover-derived claim into a visual scene clause.
 *
 * Surviving content words keep their claim order (the earliest mention is the
 * subject, mirroring the entity-detection heuristic), duplicates collapse, and
 * the clause is capped at six words so the T2I backend reads it as one scene
 * instead of a keyword dump. Every trigger word for the injection layer's
 * art-direction skip is deliberately absent from the scaffolding.
 *
 * @param {string} claimText raw voiceover (or any derived claim) text
 * @param {object} [scene] scene context, for the fallback's visualType flavor
 * @returns {string} a non-empty visual scene clause
 */
export function deriveVisualScenePrompt(claimText, scene) {
  const seen = new Set();
  const words = [];
  for (const token of tokenize(claimText)) {
    const lower = token.toLowerCase();
    if (!isVisualWord(token) || seen.has(lower)) continue;
    seen.add(lower);
    words.push(lower);
    if (words.length === 6) break;
  }
  if (words.length === 0) {
    const flavor =
      typeof scene?.visualType === "string" && scene.visualType.trim()
        ? scene.visualType.trim()
        : "tech";
    return `${GENERIC_CLAUSE}, ${flavor} mood`;
  }
  return `${words.join(" ")} scene, abstract cinematic atmosphere`;
}
