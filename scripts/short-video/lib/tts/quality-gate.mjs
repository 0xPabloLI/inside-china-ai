/**
 * TTS Quality Gate & Self-Healing Loop (#225, #230).
 *
 * Automatically verifies TTS output using local Whisper ASR back-transcription,
 * completeness checks (e.g. ensuring "0910" / "September tenth" is not swallowed),
 * tail truncation detection, pacing bounds (WPM), and phonetic confusion guards.
 *
 * Prevents defective audio from flowing downstream into video rendering,
 * eliminating the need for manual human ear inspection on every iteration.
 *
 * @module tts/quality-gate
 */

import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { transcribeVideo } from "../video-understand.mjs";
import { hasAudioBytes } from "./audio-file.mjs";
import { DEFAULT_WHISPER_CPP_MODEL_NAME } from "../asr-defaults.mjs";
import {
  splitDigitUnitToken,
  cardinalSpokenWords,
  currencySpokenWords,
} from "../normalize-tts-text.mjs";
import { FAILURE_CLASS, asrOptOutEnabled } from "./failure-class.mjs";
import { validateInstructSignature } from "./instruct.mjs";
import { cleanText, measureSceneWpm, tokenize } from "./text-tokens.mjs";

// #786: the tokenizer moved to ./text-tokens.mjs so the registry can judge an
// already-approved cached take with the SAME words-per-minute the gate measures,
// without loading this module's ASR stack. Re-exported here because this module
// owns the verification semantics (tts-quality-gate.test.mjs reads them here).
export { cleanText, tokenize } from "./text-tokens.mjs";

// Pacing boundaries for vertical short videos (English)
export const MIN_ACCEPTABLE_WPM = 115; // Below 115 WPM indicates dragging / unnatural pause / accent drift
const MAX_ACCEPTABLE_WPM = 225; // Above 225 WPM is too rushed for audience comprehension
// Exported for the verified tail cut (#232): alignment-guards re-runs this
// threshold against a trimmed take before committing the cut.
export const MIN_TEXT_SIMILARITY = 0.75; // Minimum normalized token similarity threshold

/**
 * #271 failure families (pacing vs acoustic) live in ./failure-class.mjs so the
 * pacing ladder and the registry can share the vocabulary without loading this
 * module's ASR dependency. Re-exported here because this is the module that
 * assigns a family to each evaluation.
 */
export { FAILURE_CLASS };

/** Issue texts that belong to the pacing family — this module owns them. */
const PACING_ISSUE_PATTERN = /^Pacing\b/i;

/** Issue texts that mean "the gate could not verify this take" (#415 ①). */
const INFRA_ISSUE_PATTERN = /^ASR unavailable\b/i;

/**
 * Classify a gate FAILURE from its issue list (#271, #415 ①): which family's
 * repair the pipeline should target.
 *
 * Precedence: a list made only of infrastructure issues means verification
 * never ran, so no take-level repair applies. Any other mix resolves to
 * `acoustic`: a take whose words cannot be trusted is not speed-fixable, so
 * the conservative family wins.
 *
 * @param {string[]} [issues]
 * @returns {"pacing"|"acoustic"|"infra"|null} null when there is no issue at all
 */
export function classifyFailure(issues) {
  const list = (issues || []).filter((i) => typeof i === "string" && i.trim() !== "");
  if (list.length === 0) return null;
  if (list.every((i) => INFRA_ISSUE_PATTERN.test(i.trim()))) return FAILURE_CLASS.INFRA;
  return list.every((i) => PACING_ISSUE_PATTERN.test(i.trim()))
    ? FAILURE_CLASS.PACING
    : FAILURE_CLASS.ACOUSTIC;
}

// #415 ①: the routing helpers live in the leaf module (failure-class.mjs) so
// the registry can import them without loading this module's ASR stack.
// Re-exported here because this module owns the failure semantics.
export { partitionGateFailures, infraBlockError } from "./failure-class.mjs";

/**
 * Extract critical entity tokens (numbers, dates, proper nouns, and tail tokens).
 *
 * @param {string} text - expected voiceover or ttsText
 * @returns {{ criticalWords: string[], tailWords: string[] }}
 */
export function extractGuardedTokens(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { criticalWords: [], tailWords: [] };
  }

  // Tail words: the last 2 valid tokens (critical for detecting TTS truncation)
  const tailWords = tokens.slice(-2);

  // Critical words: digits, dates, key technical terms
  const dateMonthWords = new Set([
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
    "tenth",
    "10th",
    "eighth",
    "8th",
    "first",
    "second",
    "third",
    "fourth",
  ]);

  const criticalWords = [];
  for (const t of tokens) {
    if (/\d/.test(t) || dateMonthWords.has(t)) {
      criticalWords.push(t);
    }
  }

  return { criticalWords, tailWords };
}

/**
 * Prefix shared by every recognition-variance advisory (#689). These are
 * warnings, never issues: the words were spoken, the ASR just spelled them
 * differently.
 */
const RECOGNITION_VARIANCE_PREFIX = "Recognition variance";

/** Lowercase and strip everything the tokenizer would split on. */
function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Normalize the optional expected-token contract to a lookup Set. */
function toExpectedTokenSet(expectedTokens) {
  if (!expectedTokens) return null;
  const values = expectedTokens instanceof Set ? expectedTokens : Array.from(expectedTokens);
  const set = new Set();
  for (const value of values) {
    if (typeof value === "string" && value !== "") set.add(value.toLowerCase());
  }
  return set;
}

/**
 * Find adjacent 2- or 3-token ASR joins that spell an expected token (#689).
 * The join is evidence only when the expected side already carries that exact
 * token, so "deep" + "seek" can satisfy "deepseek" while "seek" + "ships"
 * never invents "seekships".
 *
 * `start` / `width` let the caller fold the consumed tokens into one ASR unit
 * for the similarity denominator (Finding A of the #689 follow-up): "Deep
 * Seek" is two ASR tokens but one spoken word.
 *
 * Width 3 stays on purpose (#689 review): whisper.cpp can split one long token
 * into THREE words, not just two — "singapore" can come back as "sing a pore" —
 * so a 2-token window alone would miss the exact join and fail a correct take.
 *
 * @param {string[]} asrTokens
 * @param {Set<string>|null} expectedSet
 * @returns {Array<{joined: string, parts: string[], start: number, width: number}>}
 */
function findSplitJoins(asrTokens, expectedSet) {
  if (!expectedSet || expectedSet.size === 0) return [];
  const joins = [];
  for (let i = 0; i < asrTokens.length; i++) {
    for (const width of [2, 3]) {
      if (i + width > asrTokens.length) continue;
      const parts = asrTokens.slice(i, i + width);
      const joined = parts.join("");
      if (expectedSet.has(joined)) joins.push({ joined, parts, start: i, width });
    }
  }
  return joins;
}

/** Raw expected-side words that contain a hyphen ("re-run"). */
function hyphenatedExpectedWords(text) {
  return String(text || "").match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g) || [];
}

function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i++;
  return i;
}

/** Levenshtein distance ≤ maxDistance, with row-minimum early exit. */
function withinEditDistance(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  if (a === b) return true;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return false;
    prev = curr;
  }
  return prev[b.length] <= maxDistance;
}

/**
 * Every near-miss candidate a heard transcript offers (#689): the raw ASR
 * tokens plus every adjacent 2/3-token join. whisper.cpp can split a name AND
 * mishear it ("Deep Seq" for "DeepSeek"), which lives only in the join — the
 * token set then holds "deep" and "seq", neither of which can be the near-miss
 * itself. Each candidate remembers its position so a join that IS used as
 * evidence can be folded into one ASR unit for the denominator.
 *
 * @param {string[]} asrTokens
 * @returns {Array<{heard: string, parts: string[], start: number, width: number}>}
 */
function collectNearMissCandidates(asrTokens) {
  const candidates = [];
  for (let i = 0; i < asrTokens.length; i++) {
    candidates.push({ heard: asrTokens[i], parts: [asrTokens[i]], start: i, width: 1 });
  }
  for (const width of [2, 3]) {
    for (let i = 0; i + width <= asrTokens.length; i++) {
      const parts = asrTokens.slice(i, i + width);
      candidates.push({ heard: parts.join(""), parts, start: i, width });
    }
  }
  // Deterministic pick: sorted heard form first (the pre-join behavior for
  // single tokens), then the narrower/earlier candidate on a tie.
  return candidates.sort(
    (a, b) =>
      (a.heard < b.heard ? -1 : a.heard > b.heard ? 1 : 0) ||
      a.width - b.width ||
      a.start - b.start,
  );
}

/**
 * Pick a heard token or join that is a near-miss of a protected name (#689):
 * "deepseq" / "deep seq" for "deepseek". A strict prefix ("deepsee") is real
 * truncation and must keep failing, so it is never accepted as evidence.
 *
 * @param {string} name - normalized protected name (length ≥ 6 enforced here)
 * @param {Array<{heard: string, parts: string[], start: number, width: number}>} candidates
 * @returns {{heard: string, parts: string[], start: number, width: number}|null}
 */
function findNearMissCandidate(name, candidates) {
  if (name.length < 6) return null;
  const minLength = name.length - 2;
  const maxLength = name.length + 1;
  const minPrefix = Math.max(5, name.length - 2);
  for (const candidate of candidates) {
    if (candidate.heard === name) continue;
    if (candidate.heard.length < minLength || candidate.heard.length > maxLength) continue;
    if (candidate.heard.length < name.length && name.startsWith(candidate.heard)) continue;
    if (commonPrefixLength(candidate.heard, name) < minPrefix) continue;
    if (!withinEditDistance(candidate.heard, name, 2)) continue;
    return candidate;
  }
  return null;
}

/**
 * Count ASR units for the similarity denominator (#689): every adjacent 2/3
 * token join that was used as recognition evidence is ONE spoken unit, while
 * every token outside those joins still counts on its own. Extra/hallucinated
 * words therefore stay in the denominator — folding can never eat them.
 *
 * Overlaps resolve greedily left-to-right (wider join first at the same
 * start), so no token is counted twice.
 *
 * @param {string[]} asrTokens
 * @param {Array<{start: number, width: number}>} foldRanges
 * @returns {number}
 */
function countAsrUnits(asrTokens, foldRanges) {
  const ranges = foldRanges
    .filter((r) => r.width >= 2)
    .sort((a, b) => a.start - b.start || b.width - a.width);
  let units = 0;
  let cursor = 0;
  let index = 0;
  while (cursor < asrTokens.length) {
    while (index < ranges.length && ranges[index].start < cursor) index++;
    const range = ranges[index];
    if (range && range.start === cursor) {
      units++;
      cursor += range.width;
      index++;
    } else {
      units++;
      cursor++;
    }
  }
  return units;
}

/**
 * Protected names the near-miss rule may rescue (#689): entities declared in
 * `keyEntities`, plus words the expected text marks as proper names — an
 * uppercase letter after the first character ("DeepSeek", "ZeroBench",
 * "iFlytek"), or a letter+digit word the tokenizer keeps whole ("Qwen3").
 *
 * @param {string} expectedText
 * @param {object|null} keyEntities
 * @returns {Set<string>} normalized names
 */
function collectProtectedNames(expectedText, keyEntities) {
  const expectedTokens = new Set(tokenize(expectedText));
  const names = new Set();
  if (keyEntities && typeof keyEntities === "object") {
    for (const entities of Object.values(keyEntities)) {
      if (!Array.isArray(entities)) continue;
      for (const entity of entities) {
        if (typeof entity !== "string") continue;
        // #689 review: a declaration only protects a name the SCRIPT actually
        // says. meta.keyEntities is per-episode, so a company declared for a
        // different scene used to turn a hallucinated word ("byte danse") into
        // near-miss evidence and fold it out of the similarity denominator.
        // The expected tokens are the ground truth; the declaration only adds
        // permission for a name that is already spoken.
        const whole = normalizeName(entity);
        if (whole && expectedTokens.has(whole)) names.add(whole);
        for (const segment of entity.split(/[^A-Za-z0-9]+/)) {
          const normalized = normalizeName(segment);
          if (normalized.length >= 6 && expectedTokens.has(normalized)) names.add(normalized);
        }
      }
    }
  }

  const words = String(expectedText || "").match(/[A-Za-z][A-Za-z0-9]*/g) || [];
  for (const word of words) {
    const camelCase = /[A-Z]/.test(word.slice(1));
    const letterDigit = /\d/.test(word) && /[A-Za-z]/.test(word) && tokenize(word).length === 1;
    if (!camelCase && !letterDigit) continue;
    const normalized = normalizeName(word);
    if (normalized) names.add(normalized);
  }
  return names;
}

/**
 * Single-pass ASR evidence builder: the expanded token set plus the split
 * joins admitted into it (#689). The join scan runs ONCE, against one
 * normalization of `options.expectedTokens`; callers that also need the joins
 * (warning text, denominator folds) reuse this result instead of rescanning
 * with a second, separately-built Set (review P2).
 *
 * @param {string[]} asrTokens
 * @param {string|null} [rawText] - the untokenized transcript; lets comma-
 *   grouped cardinals ("115,000" → "115" + "000") still supply their spoken
 *   words to the comparison.
 * @param {object} [options]
 * @param {Set<string>|string[]} [options.expectedTokens] - expected-side
 *   tokens; when supplied, adjacent 2- or 3-token ASR joins become evidence
 *   only if the join spells one of them (#689: "Deep Seek" → "deepseek").
 * @returns {{set: Set<string>, splitJoins: Array<{joined: string, parts: string[], start: number, width: number}>}}
 */
function buildAsrEvidence(asrTokens, rawText = null, options = {}) {
  const expanded = new Set(asrTokens);
  for (const t of asrTokens) {
    // Unpack "v4" / "v41" into "v" + digits
    const vMatch = /^v(\d+)$/i.exec(t);
    if (vMatch) {
      expanded.add("v");
      expanded.add(vMatch[1]);
    }
    // #251: ASR hears version letters as roman numerals — "V4.1" transcribes
    // as "VI 4.1". A short roman-numeral-looking token containing a leading
    // "v" yields the version-letter evidence ("vi" → "v"), so a critical
    // "v4" can be satisfied by "v" + the digit. Real words ("vision") are
    // excluded by the strict roman alphabet + length cap.
    if (/^v[ivx]{1,3}$/i.test(t)) {
      expanded.add("v");
    }
    // #548: mirror of #239 on the heard side. The expected text is normalized
    // to "720 P" (digit + unit split), while whisper.cpp commonly re-merges
    // the heard form to "720p" — without this alias the critical "720" has no
    // evidence and a CORRECT take hard-blocks as acoustic (#271). The alias
    // comes from the SAME curated whitelist as normalize-tts-text, so hex,
    // multiplier and codename tokens (0x12a, 10x, H100, B200, "$1.4B" → 4b)
    // never expand, and a merged token only ever yields its OWN digit+unit
    // pair ("7200p" is not evidence for "720"; "720k" cannot yield "p").
    const unitSplit = splitDigitUnitToken(t);
    if (unitSplit) {
      expanded.add(unitSplit.digits);
      expanded.add(unitSplit.unit.toLowerCase());
    }
  }

  // Cardinal integers: the spoken track carries words ("one hundred fifteen
  // thousand") while whisper.cpp writes what it heard as digits ("115,000"),
  // so a CORRECT take would look truncated ("missing tail word(s) [thousand]")
  // and the self-heal loop regenerates forever. Observed 2026-10-14 on
  // deepseek-flash-silent-update scene 3.
  //
  // Expansion runs on the RAW transcript, not the token stream: tokenize()
  // splits on the comma ("115,000" → "115" + "000") and on decimals
  // ("$1.4B" → "1" + "4b"), so a bare digit token cannot be told apart from a
  // fragment of a larger number. cardinalSpokenWords applies the same
  // CARDINAL_RE the spoken side uses, so both sides agree by construction.
  if (rawText) {
    for (const w of cardinalSpokenWords(rawText)) expanded.add(w);
    // Heard-side currency mirror: the spoken track spells amounts out while
    // whisper.cpp normalizes what it heard to "$38", and CARDINAL_RE skips
    // $-prefixed digits by design — so a CORRECT take loses the words the
    // audio does contain. Observed 2026-10-21 on deepinfer scene 4: the raw
    // similarity scored 73.3% against the 75% floor, and the fixed TTS seed
    // made the self-heal loop regenerate the identical take three times.
    for (const w of currencySpokenWords(rawText)) expanded.add(w);
  }

  // #689: whisper.cpp sometimes splits one brand token into adjacent words
  // ("Deep Seek") while the expected track carries the joined spelling. The
  // join is admitted only when it exactly equals an expected token, so the
  // rule cannot manufacture evidence for an unlisted compound.
  //
  // Review Q4: this EXACT adjacent join needs no keyEntities declaration — the
  // expected line itself is the declaration ("moon shot" for "moonshot" is
  // allowed). Only the looser near-miss rule requires a declared entity or a
  // structural proper name, because there the heard form does not match the
  // script at all and "anything goes" would excuse real mishearing.
  const expectedSet = toExpectedTokenSet(options.expectedTokens);
  const splitJoins = findSplitJoins(asrTokens, expectedSet);
  for (const { joined } of splitJoins) {
    expanded.add(joined);
  }

  return { set: expanded, splitJoins };
}

/**
 * Build an expanded ASR token set that automatically unpacks composite tokens,
 * version prefixes (e.g. "v4" -> "v", "4", "four"), decimals (#234), and
 * merged digit+unit tokens (#548: "720p" -> "720", "p").
 *
 * @param {string[]} asrTokens
 * @param {string|null} [rawText] - the untokenized transcript; lets comma-
 *   grouped cardinals ("115,000" → "115" + "000") still supply their spoken
 *   words to the comparison.
 * @param {object} [options]
 * @param {Set<string>|string[]} [options.expectedTokens] - expected-side
 *   tokens; when supplied, adjacent 2- or 3-token ASR joins become evidence
 *   only if the join spells one of them (#689: "Deep Seek" → "deepseek").
 *   Omitted → the #548 set, unchanged.
 * @returns {Set<string>}
 */
export function buildExpandedAsrTokenSet(asrTokens, rawText = null, options = {}) {
  return buildAsrEvidence(asrTokens, rawText, options).set;
}

/**
 * Check if an expected word is satisfied in the ASR token set,
 * taking numbers, digits, version prefixes, and phonetic expansion into account.
 * E.g., "tenth" is satisfied by "10th" or "10"; "8" is satisfied by "eighth" or "8th".
 *
 * @param {string} expectedWord
 * @param {Set<string>} asrTokenSet
 * @returns {boolean}
 */
export function isWordInAsr(expectedWord, asrTokenSet) {
  if (asrTokenSet.has(expectedWord)) return true;

  // #251: version tokens "v4" / "v41" are satisfied by version-letter
  // evidence ("v", possibly unpacked from a roman-numeral mishearing "vi")
  // plus the digit itself (either form, incl. inside a decimal "4.1" token).
  const vVersion = /^v(\d+)$/i.exec(expectedWord);
  if (vVersion) {
    const digit = vVersion[1];
    const digitEvidence =
      asrTokenSet.has(digit) ||
      [...asrTokenSet].some((t) => t.includes(digit) && /^\d+(\.\d+)?$/.test(t));
    if (asrTokenSet.has("v") && digitEvidence) return true;
  }

  const EQUIVALENTS = {
    1: ["one", "first", "1st"],
    one: ["1", "first", "1st"],
    first: ["1", "1st", "one"],
    "1st": ["1", "first", "one"],
    2: ["two", "second", "2nd"],
    two: ["2", "second", "2nd"],
    second: ["2", "2nd", "two"],
    "2nd": ["2", "second", "two"],
    3: ["three", "third", "3rd"],
    three: ["3", "third", "3rd"],
    third: ["3", "3rd", "three"],
    "3rd": ["3", "third", "three"],
    4: ["four", "fourth", "4th"],
    four: ["4", "fourth", "4th"],
    fourth: ["4", "4th", "four"],
    "4th": ["4", "fourth", "four"],
    8: ["eight", "eighth", "8th"],
    eight: ["8", "eighth", "8th"],
    eighth: ["8", "8th", "eight"],
    "8th": ["8", "eighth", "eight"],
    10: ["ten", "tenth", "10th"],
    ten: ["10", "tenth", "10th"],
    tenth: ["10", "10th", "ten"],
    "10th": ["10", "tenth", "ten"],
    "0910": ["september", "10", "10th", "tenth"],
  };
  const eqList = EQUIVALENTS[expectedWord];
  if (eqList) {
    for (const eq of eqList) {
      if (asrTokenSet.has(eq)) return true;
    }
  }

  // Handle phonetic expansion word "point" in versions / decimals
  // If expected has "point" and ASR has numbers/digits (e.g. "v4", "1"), it is satisfied
  if (expectedWord === "point") {
    for (const t of asrTokenSet) {
      if (/\d/.test(t) || /^v\d+/i.test(t)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Compute token similarity between expected and ASR tokens,
 * accounting for word equivalents and version/decimal normalization.
 *
 * @param {string[]} expectedTokens
 * @param {string[]} asrTokens
 * @param {string|null} [rawAsrText] - the untokenized transcript; lets comma-
 *   grouped cardinals ("115,000" → "115" + "000") still supply their spoken
 *   words to the comparison.
 * @param {object} [options]
 * @param {Set<string>} [options.asrTokenSet] - a set the caller already
 *   expanded with recognition-variance evidence (#689). Omitted → build one
 *   from the tokens, exactly as before.
 * @param {number} [options.asrUnits] - ASR tokens after folding the joins used
 *   as recognition evidence (#689); the denominator never drops below the
 *   expected token count. Omitted → raw `asrTokens.length`, exactly as before.
 * @returns {number} 0.0 - 1.0
 */
export function computeTokenSimilarity(expectedTokens, asrTokens, rawAsrText = null, options = {}) {
  if (expectedTokens.length === 0 && asrTokens.length === 0) return 1.0;
  if (expectedTokens.length === 0 || asrTokens.length === 0) return 0.0;

  const setB = options.asrTokenSet ?? buildExpandedAsrTokenSet(asrTokens, rawAsrText);
  let matches = 0;
  for (const token of expectedTokens) {
    if (isWordInAsr(token, setB)) matches++;
  }

  // Denominator considers semantic match without penalizing normalized syllable expansion
  return matches / Math.max(expectedTokens.length, options.asrUnits ?? asrTokens.length);
}

/**
 * Check for typical phonetic confusion (e.g. [v] -> [b]).
 *
 * @param {string} expected
 * @param {string} asr
 * @returns {string[]} detected confusion issues
 */
export function detectPhoneticConfusion(expected, asr) {
  const issues = [];
  const expLower = expected.toLowerCase();
  const asrLower = asr.toLowerCase();

  // "v4.1" / "v four" -> "b4.1" / "b four"
  if (
    (expLower.includes("v4.1") || expLower.includes("v four") || expLower.includes("v4")) &&
    (asrLower.includes("b4.1") ||
      asrLower.includes("b four") ||
      asrLower.includes("b4") ||
      asrLower.includes("be four"))
  ) {
    issues.push("Phonetic confusion: 'V4' pronounced as 'B4'");
  }

  // "multimodal" -> "multi mortem"
  if (expLower.includes("multimodal") && asrLower.includes("mortem")) {
    issues.push("Phonetic collapse: 'multimodal' recognized as 'multi mortem'");
  }

  return issues;
}

/**
 * whisper.cpp ASR adapter — bridges transcribeVideo ({segments,fullText}|null)
 * to the transcriber contract ({ok, segments}) expected by evaluateSceneTts.
 * Uses a temp dir so concurrent scenes don't clobber audio.wav (ADR-0020).
 */
async function transcribeViaWhisperCpp(audioPath, { languageHint } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "qg-asr-"));
  try {
    // whisper-cli defaults to `en`; pin the gate's hint so it is load-bearing
    // instead of decorative (it used to be dropped and only echoed into `meta`).
    const result = await transcribeVideo(audioPath, {
      outputDir: dir,
      language: languageHint ?? "en",
    });
    if (!result) {
      return {
        ok: false,
        segments: [],
        errorCode: "asr_null",
        meta: { degraded: true, backend: "whisper.cpp" },
      };
    }
    return {
      ok: true,
      segments: (result.segments || []).map((s) => ({
        startMs: Math.round(s.start),
        endMs: Math.round(s.end),
        text: s.text || "",
      })),
      language: languageHint ?? null,
      errorCode: null,
      meta: { backend: "whisper.cpp", model: DEFAULT_WHISPER_CPP_MODEL_NAME, degraded: false },
    };
  } catch (err) {
    return {
      ok: false,
      segments: [],
      errorCode: "asr_error",
      meta: { degraded: true, backend: "whisper.cpp", error: err.message },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Prefix every instruct-signature warning carries, so `runTtsQualityGate` can
 * surface them as their own block instead of burying them among take warnings.
 */
export const INSTRUCT_WARNING_PREFIX = "Instruct signature";

/**
 * Validate the instruct the ENGINE actually resolved for a scene (#270).
 *
 * The Quality Gate is the last seam before rendering, so it re-validates the
 * resolved text instead of trusting it: an engine that hand-rolls its own
 * instruct map (exactly how modal/NPU drifted onto the pre-#234 wording) or a
 * new call site that bypasses `lib/tts/instruct.mjs` shows up here, whereas the
 * pre-render gate only covers style coverage.
 *
 * Advisory by design. Blocking here would spend the #271 acoustic reroll budget
 * regenerating a take whose INSTRUCT is the defect, and then report the wrong
 * failure family; the hard stops live where the manifest is built
 * (`instruct.mjs` throws) and in the pre-render gate.
 *
 * @param {object} scene
 * @param {(scene: object) => string|undefined} [instructForScene] - the selected engine's resolver
 * @returns {string[]} warning strings (empty when there is nothing to report)
 */
export function collectInstructWarnings(scene, instructForScene) {
  if (typeof instructForScene !== "function") return [];

  let instruct;
  try {
    instruct = instructForScene(scene);
  } catch (err) {
    // The engine refuses this scene's instruct outright — surface the reason
    // instead of letting the gate's catch-all absorb it.
    return [`${INSTRUCT_WARNING_PREFIX} [unresolvable_instruct]: ${err.message}`];
  }
  if (typeof instruct !== "string" || instruct.trim() === "") return [];

  // Soft issues (a missing persona) are legitimate for hook/cta — not reported.
  return validateInstructSignature(instruct).hardIssues.map(
    (issue) => `${INSTRUCT_WARNING_PREFIX} [${issue.code}]: ${issue.detail}`,
  );
}

/**
 * Evaluate a single scene's generated audio against expected voiceover.
 *
 * @param {object} scene - { id, voiceover, ttsText, voiceoverTts }
 * @param {string} audioPath - path to wav/mp3 file
 * @param {number} durationSec - duration in seconds
 * @param {object} [options] - override thresholds or provide mock ASR for tests
 * @returns {Promise<object>} Evaluation result
 */
export async function evaluateSceneTts(scene, audioPath, durationSec, options = {}) {
  const {
    transcriber = transcribeViaWhisperCpp,
    minWpm = MIN_ACCEPTABLE_WPM,
    maxWpm = MAX_ACCEPTABLE_WPM,
    minSimilarity = MIN_TEXT_SIMILARITY,
    strict = false,
    instructForScene = null,
    // #689: author-declared entities (meta.keyEntities). Only these (plus
    // structurally proper names in the script) may be rescued by the
    // near-miss rule; an undeclared lowercase word must keep failing.
    keyEntities = null,
    // #415 ①: ASR is the only verifier of the WORDS. When it cannot run the
    // take is unverified — fail loudly by default, or opt into the legacy
    // render-unverified behavior explicitly. The env spelling lives in
    // failure-class.mjs because the pipeline-start preflight mirrors this gate
    // and the two must agree (#418).
    allowAsrUnavailable = asrOptOutEnabled(),
  } = options;

  // 1. Verify audio file exists and has non-zero size
  if (!hasAudioBytes(audioPath)) {
    return {
      sceneId: scene.id,
      passed: false,
      issues: ["Audio file missing or zero bytes"],
      // #271: no audio at all is an acoustic failure — there is nothing to
      // speed-compensate, only a take to regenerate.
      failureClass: FAILURE_CLASS.ACOUSTIC,
      action: "retry",
    };
  }

  const expectedSpokenText = scene.ttsText || scene.voiceoverTts || scene.voiceover || "";
  const expectedTokens = tokenize(expectedSpokenText);
  const wordCount = expectedTokens.length;

  // 2. Measure Pacing (WPM) — same helper the pacing ladder and the cached-take
  // re-judgement use, so all three cannot drift apart (#786).
  const wpm = measureSceneWpm(scene, durationSec);

  const issues = [];
  const warnings = [];

  // 2b. Instruct signature (#270) — see collectInstructWarnings for why this
  // reports a warning instead of an issue.
  warnings.push(...collectInstructWarnings(scene, instructForScene));

  const isLikelyEnglish = /[a-zA-Z]/.test(expectedSpokenText);
  if (isLikelyEnglish && wordCount >= 3) {
    if (wpm < minWpm) {
      issues.push(`Pacing too slow: ${wpm} WPM (minimum acceptable: ${minWpm} WPM)`);
    } else if (wpm > maxWpm) {
      warnings.push(`Pacing very fast: ${wpm} WPM (guideline max: ${maxWpm} WPM)`);
    }
  }

  // 3. ASR Back-Transcription
  let asrText = "";
  let asrOk = false;
  let asrFailure = null;
  try {
    const asrRes = await transcriber(audioPath, { languageHint: "en" });
    if (asrRes && asrRes.ok && Array.isArray(asrRes.segments)) {
      asrText = asrRes.segments
        .map((s) => s.text)
        .join(" ")
        .trim();
      asrOk = true;
    } else {
      asrFailure = `ASR unavailable (${asrRes?.errorCode ?? "no_segments"}): back-transcription could not run`;
    }
  } catch (err) {
    asrFailure = `ASR unavailable (asr_error): ${err.message}`;
  }

  if (!asrFailure && asrOk && !asrText) {
    // `ok: true` with no usable text is the "ran but transcribed nothing" case
    // (whisper exits 0 on an empty/unparsable JSON, so parseWhisperOutput hands
    // back an empty segment list). Treating it as a clean pass would ship a
    // take that was never word-checked — the exact green-but-unverified hole
    // this leg exists to close, so it takes the same INFRA route.
    asrFailure = "ASR unavailable (empty_transcript): back-transcription returned no segments";
  }

  if (asrFailure) {
    // #415 ①: without ASR the gate cannot run a single word-level check, so a
    // green verdict would mean "never verified", not "verified clean". That is
    // an infrastructure failure (non-retryable), not a take defect — unless the
    // caller explicitly opted into rendering unverified.
    if (allowAsrUnavailable) {
      warnings.push(`${asrFailure} — verification skipped (allowAsrUnavailable)`);
    } else {
      issues.push(asrFailure);
    }
  }

  if (asrOk && asrText) {
    const asrTokens = tokenize(asrText);
    // Expanded set (#251): version prefixes, decimals and roman-numeral
    // mishearings unpack BEFORE the critical/tail guards — the raw token set
    // would fail "v4" against an ASR "VI 4.1" and trip self-heal retries on
    // pure recognition variance. The raw transcript is passed alongside the
    // tokens because tokenize() splits comma-grouped cardinals ("115,000" →
    // "115" + "000") that the spoken track spells as words. The expected
    // tokens also gate the #689 split-join expansion ("Deep Seek" → brand).
    // The same evidence pass returns those joins, so the warnings and the
    // denominator folds below cannot diverge from the set (review P2).
    const { set: asrTokenSet, splitJoins } = buildAsrEvidence(asrTokens, asrText, {
      expectedTokens,
    });

    // #689: recognition variance is evidence plus an advisory, never a take
    // defect. Split joins were already added by the evidence builder; merged
    // ("rerun" for "re-run") and near-miss ("DeepSeq") evidence is added here,
    // then every event is reported once as a warning.
    //
    // Every join that ends up as evidence also collapses into ONE ASR unit for
    // the similarity denominator (follow-up Finding A): "Deep Seek" is two ASR
    // tokens but one spoken word, so a two-word scene must not score 2/3 and
    // fail on a correct take. Tokens outside the folds still count, so extra
    // words keep dragging the score down.
    const foldRanges = splitJoins.map(({ start, width }) => ({ start, width }));
    const varianceEvents = [];
    for (const { joined, parts } of splitJoins) {
      varianceEvents.push(
        `${RECOGNITION_VARIANCE_PREFIX} [split]: "${joined}" heard as "${parts.join(" ")}"`,
      );
    }
    for (const word of hyphenatedExpectedWords(expectedSpokenText)) {
      // #689 review: merged evidence requires at least one LETTER. A purely
      // numeric hyphen ("3-5") is two critical numbers, not one merged word:
      // "35" means thirty-five, while "3-5" means three to five. Bridging them
      // would add "3" + "5" evidence to a take that says neither. "re-run" /
      // "GPT-4" keep merging — those are the spellings whisper.cpp re-merges.
      if (!/[A-Za-z]/.test(word)) continue;
      const parts = tokenize(word);
      if (parts.length < 2) continue;
      const merged = parts.join("");
      if (!asrTokenSet.has(merged)) continue;
      for (const part of parts) asrTokenSet.add(part);
      varianceEvents.push(
        `${RECOGNITION_VARIANCE_PREFIX} [merged]: "${word.toLowerCase()}" heard as "${merged}"`,
      );
    }
    // Follow-up Finding B: the near-miss candidate set is the raw tokens PLUS
    // every adjacent 2/3-token join — "Deep Seq" only exists as a join, and a
    // join used as near-miss evidence must fold into one ASR unit as well.
    const nearMissCandidates = collectNearMissCandidates(asrTokens);
    for (const name of collectProtectedNames(expectedSpokenText, keyEntities)) {
      if (asrTokenSet.has(name)) continue;
      const hit = findNearMissCandidate(name, nearMissCandidates);
      if (!hit) continue;
      asrTokenSet.add(name);
      if (hit.width > 1) foldRanges.push({ start: hit.start, width: hit.width });
      // A single-token near-miss still reports its own heard form ("deepseq");
      // a joined one reports the original parts ("deep seq").
      varianceEvents.push(
        `${RECOGNITION_VARIANCE_PREFIX} [near-miss]: "${name}" heard as "${hit.parts.join(" ")}"`,
      );
    }
    for (const event of new Set(varianceEvents)) warnings.push(event);

    // 4. Critical Token & Tail Boundary Verification
    const { criticalWords, tailWords } = extractGuardedTokens(expectedSpokenText);

    // Check tail words (truncation guard)
    const missingTail = tailWords.filter((w) => !isWordInAsr(w, asrTokenSet));
    if (missingTail.length > 0 && tailWords.length > 0) {
      issues.push(`Truncation detected: missing tail word(s) [${missingTail.join(", ")}]`);
    }

    // Check critical number/date tokens (completeness guard)
    const missingCritical = criticalWords.filter((w) => !isWordInAsr(w, asrTokenSet));
    if (missingCritical.length > 0) {
      issues.push(`Incomplete speech: missing key token(s) [${missingCritical.join(", ")}]`);
    }

    // 5. Similarity Score — same expanded set, so variance evidence cannot
    // fail the score the tail/critical checks just accepted (#689). The
    // denominator folds evidence joins into single ASR units (Finding A).
    const asrUnits = countAsrUnits(asrTokens, foldRanges);
    const similarity = computeTokenSimilarity(expectedTokens, asrTokens, asrText, {
      asrTokenSet,
      asrUnits,
    });
    if (similarity < minSimilarity) {
      issues.push(
        `Low text similarity: ${(similarity * 100).toFixed(1)}% (threshold: ${minSimilarity * 100}%)`,
      );
    }

    // 6. Phonetic Confusion
    const phoneticIssues = detectPhoneticConfusion(expectedSpokenText, asrText);
    for (const pIssue of phoneticIssues) {
      if (strict) {
        issues.push(pIssue);
      } else {
        warnings.push(pIssue);
      }
    }

    return {
      sceneId: scene.id,
      passed: issues.length === 0,
      wpm,
      similarity,
      asrText,
      asrVerified: true,
      expectedText: expectedSpokenText,
      issues,
      warnings,
      // #271: the registry routes on this — pacing → compensation loop,
      // acoustic → reroll then fail-closed, infra → stop (#415 ①).
      failureClass: classifyFailure(issues),
      action: issues.length === 0 ? "pass" : "retry",
    };
  }

  // ASR produced no usable text (unavailable, degraded, or empty): the pacing
  // sanity checks above still run, but nothing verified the words.
  return {
    sceneId: scene.id,
    passed: issues.length === 0,
    wpm,
    similarity: null,
    asrText: null,
    asrVerified: false,
    expectedText: expectedSpokenText,
    issues,
    warnings,
    failureClass: classifyFailure(issues),
    action: issues.length === 0 ? "pass" : "retry",
  };
}

/**
 * Run TTS Quality Gate for an entire batch of generated audio results.
 *
 * @param {Array<object>} scenes
 * @param {Array<{sceneId: number, audioPath: string, duration: number}>} ttsResults
 * @param {object} [options]
 * @returns {Promise<{passed: boolean, evaluations: Array<object>, failedCount: number}>}
 */
export async function runTtsQualityGate(scenes, ttsResults, options = {}) {
  console.log(`\n🔍 Running TTS Quality Gate on ${ttsResults.length} scene(s)...`);

  const evaluations = [];
  let failedCount = 0;

  for (const r of ttsResults) {
    const scene = scenes.find((s) => s.id === r.sceneId);
    if (!scene) continue;

    const evalResult = await evaluateSceneTts(scene, r.audioPath, r.duration, options);
    evaluations.push(evalResult);

    // #270: instruct drift is a CONFIG defect, not a take defect, so it gets its
    // own block rather than mixing into the take warnings below.
    const instructWarnings = evalResult.warnings.filter((w) =>
      w.startsWith(INSTRUCT_WARNING_PREFIX),
    );
    if (instructWarnings.length > 0) {
      console.warn(
        `  ⛔ [Instruct] Scene ${scene.id} instruct violates the 4D standard (#270):\n` +
          instructWarnings.map((w) => `     ${w}`).join("\n") +
          `\n     → fix scripts/short-video/lib/tts/instruct.mjs (INSTRUCT_STANDARD); ` +
          `never hand-write instruct text at a call site`,
      );
    }

    if (!evalResult.passed) {
      failedCount++;
      // #689 Q5: a failed take can still carry recognition-variance warnings
      // (e.g. it failed on similarity while a split was detected). Print them
      // after the issues so the "heard differently" events stay countable on
      // failed takes too. Instruct warnings already have their own block above.
      const takeWarnings = evalResult.warnings.filter(
        (w) => !w.startsWith(INSTRUCT_WARNING_PREFIX),
      );
      console.warn(
        `  ❌ Scene ${scene.id} FAILED Quality Gate:\n` +
          `     Expected: "${evalResult.expectedText}"\n` +
          `     ASR Heard: "${evalResult.asrText || "(ASR unavailable)"}"\n` +
          `     WPM: ${evalResult.wpm} | Issues: ${evalResult.issues.join("; ")}` +
          (takeWarnings.length > 0 ? `\n     Warnings: ${takeWarnings.join("; ")}` : ""),
      );
    } else {
      const warnInfo =
        evalResult.warnings.length > 0 ? ` (⚠️  ${evalResult.warnings.join("; ")})` : "";
      console.log(
        `  ✅ Scene ${scene.id} PASSED Quality Gate: ${evalResult.wpm} WPM, ` +
          `similarity ${evalResult.similarity != null ? (evalResult.similarity * 100).toFixed(0) + "%" : "N/A"}${warnInfo}`,
      );
    }
  }

  return {
    passed: failedCount === 0,
    failedCount,
    evaluations,
  };
}
