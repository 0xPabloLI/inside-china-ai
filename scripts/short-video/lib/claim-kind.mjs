/**
 * Claim kind seam (#1353).
 *
 * Asset sourcing derives its search queries from the scene claim, and the
 * relevance gate judges the candidates against that same claim. Both assume
 * the claim describes **an event**: "today's launch", "the 80% drawdown this
 * quarter". That assumption is wrong for a large, routine class of scenes —
 * an index chart, a skyline, a company logo — where nothing time-bound
 * happened and the picture only has to be the right *kind* of thing. Judging
 * those against an event claim is how a topically perfect stock photo scores
 * 17/100 (#1325) and how 27 candidates get thrown away.
 *
 * So the pipeline needs to name the two kinds before it derives anything:
 *
 *   - `news` — the claim carries a time anchor or an event verb. Everything
 *     the pipeline does today is correct here; this kind is the default and
 *     the status quo.
 *   - `evergreen` — no time anchor and no event verb: a standing fact
 *     ("the Hang Seng TECH index is off 80% from its peak"), a comparison, an
 *     industry landscape.
 *
 * Rules, not a model, and deliberately asymmetric: a single time or event cue
 * makes a claim `news`, so the classifier only says `evergreen` when it found
 * nothing time-bound at all. Misclassifying towards `news` costs nothing —
 * that is the path the pipeline already walks — while the reverse would relax
 * the gate on a real event.
 *
 * A bare year is **not** a cue. "80% below its 2021 peak" is a standing fact,
 * and a date alone says nothing happened; the event vocabulary carries the
 * "something happened" signal.
 *
 * The kind alone decides nothing downstream. `evergreen` is only acted on when
 * a visual archetype is also identifiable (see `visual-archetypes.mjs`); the
 * query and gate changes both gate on the pair. That keeps the relaxation
 * bound to scenes where "the right kind of picture" is a complete answer.
 *
 * Leaf module: no imports, no I/O.
 */

/** The two kinds. Exported so callers and artifacts spell them the same way. */
export const CLAIM_KIND = {
  NEWS: "news",
  EVERGREEN: "evergreen",
};

/**
 * Absolute time anchors. Matched as whole words on the lowercased claim so
 * "today" cannot fire inside "today's"-style compounds — it should, and does:
 * the possessive strip happens before the match.
 *
 * Weak recency adverbs are deliberately absent. "now", "just", "latest" and
 * "recently" appear in evergreen sentences far more often than in event ones
 * ("the index is now 80% off its peak" is the standing fact this module exists
 * for), and a cue that fires on them would classify exactly the claims the
 * split is meant to catch. A genuinely recent event carries a hard anchor
 * ("today", "yesterday", a date) *and* usually an event verb, so nothing is
 * lost. "may" is absent for the obvious reason: it is a modal verb before it
 * is a month name.
 */
const TIME_ANCHORS = new Set([
  "today",
  "tonight",
  "yesterday",
  "tomorrow",
  "breaking",
  "ago",
  "weekly",
  "monthly",
  "quarterly",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "q1",
  "q2",
  "q3",
  "q4",
]);

/**
 * Event verbs and event nouns — the "something happened" vocabulary. Covered
 * forms are the ones a Chinese-tech voiceover actually uses: launches, funding
 * rounds, earnings, price moves, regulatory action.
 */
const EVENT_WORDS = new Set([
  "announce",
  "announces",
  "announced",
  "announcing",
  "launch",
  "launches",
  "launched",
  "launching",
  "unveil",
  "unveils",
  "unveiled",
  "disclose",
  "discloses",
  "disclosed",
  "disclosing",
  "reveal",
  "reveals",
  "revealed",
  "revealing",
  "confirm",
  "confirms",
  "confirmed",
  "confirming",
  "showcased",
  "showcases",
  "release",
  "releases",
  "released",
  "ship",
  "ships",
  "shipped",
  "debut",
  "debuts",
  "debuted",
  "raise",
  "raises",
  "raised",
  "raising",
  "funding",
  "invests",
  "invested",
  "investment",
  "acquire",
  "acquires",
  "acquired",
  "acquisition",
  "merge",
  "merges",
  "merged",
  "partner",
  "partners",
  "partnered",
  "partnering",
  "sign",
  "signs",
  "signed",
  "deal",
  "deals",
  "cut",
  "cuts",
  "layoffs",
  "beats",
  "misses",
  "reports",
  "reported",
  "earnings",
  "revenue",
  "profit",
  "ipo",
  "files",
  "filed",
  "sues",
  "sued",
  "warns",
  "warned",
  "bans",
  "banned",
  "approves",
  "approved",
  "surges",
  "surged",
  "soars",
  "soared",
  "plunges",
  "plunged",
  "crashes",
  "crashed",
  "tumbles",
  "tumbled",
  "jumps",
  "jumped",
  "drops",
  "dropped",
  "falls",
  "fell",
  "rises",
  "rose",
  "slides",
  "slid",
  "hits",
  "hit",
  "tops",
  "topped",
  "slumps",
  "slumped",
]);

/**
 * Chinese cues. Substring matching, because the language does not delimit
 * words — `宣布` inside `宣布推出` is still an event marker, and requiring
 * word boundaries here would silently miss most of the channel's material.
 */
const ZH_EVENT_CUES = [
  "今天",
  "今日",
  "昨天",
  "昨日",
  "明天",
  "本周",
  "上周",
  "下周",
  "本月",
  "上月",
  "今年",
  "去年",
  "刚刚",
  "最新",
  "宣布",
  "发布",
  "推出",
  "上线",
  "公布",
  "财报",
  "季度",
  "营收",
  "利润",
  "融资",
  "收购",
  "签约",
  "合作",
  "起诉",
  "裁员",
  "获批",
  "暴跌",
  "暴涨",
  "大涨",
  "大跌",
  "跌超",
  "涨超",
  "创下",
  "新高",
  "新低",
];

/**
 * The text a claim is classified on.
 *
 * `assetNeed` is the writer's own description of the desired picture and wins
 * when present; the voiceover is the fallback derivation (#354) and usually
 * carries the extra context ("… this quarter") that makes an event obvious.
 * The source title rides along when the claim is empty, because a claim built
 * from a news title should not read as evergreen.
 *
 * @param {{assetNeed?: string, voiceover?: string, sourceRef?: {title?: string}}|null|undefined} claim
 * @returns {string}
 */
function claimText(claim) {
  if (!claim) return "";
  const parts = [claim.assetNeed, claim.voiceover, claim.sourceRef?.title];
  return parts
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .trim();
}

/**
 * Lowercase word tokens, with possessives and contractions flattened so
 * "today's" and "today" are the same cue.
 *
 * @param {string} text
 * @returns {string[]}
 */
function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’](?:s|d|ll|re|ve|m)\b/gu, "")
    .replace(/n['’]t\b/gu, " not")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Classify a claim as `news` or `evergreen`.
 *
 * @param {{assetNeed?: string, voiceover?: string, searchHints?: string[], sourceRef?: {title?: string}}|null|undefined} claim
 * @returns {"news"|"evergreen"}
 */
export function classifyClaimKind(claim) {
  const text = claimText(claim);
  if (!text) return CLAIM_KIND.NEWS; // nothing to judge — keep the status quo
  if (ZH_EVENT_CUES.some((cue) => text.includes(cue))) return CLAIM_KIND.NEWS;
  for (const word of words(text)) {
    if (TIME_ANCHORS.has(word) || EVENT_WORDS.has(word)) return CLAIM_KIND.NEWS;
  }
  return CLAIM_KIND.EVERGREEN;
}

/**
 * Whether a claim should be sourced and judged as a standing subject rather
 * than an event. Thin wrapper so callers read as a sentence and the two
 * spellings of the kind cannot drift.
 *
 * @param {object|null|undefined} claim
 * @returns {boolean}
 */
export function isEvergreenClaim(claim) {
  return classifyClaimKind(claim) === CLAIM_KIND.EVERGREEN;
}
