/**
 * TTS Text Normalization — dual-track spoken form.
 *
 * CosyVoice3's wetext/inflect frontend treats "." as a sentence boundary,
 * so "V4.1" is read as "v four" + pause + "one", and "1.32" gets a mid-
 * number stop.  Four-digit dates like "0910" are read as "nine hundred
 * ten" instead of "September tenth".
 *
 * Dual-track contract (2026-09-09, user decision):
 *   - scene.voiceover is NEVER modified. It is the display track: subtitles,
 *     review UI, and the article all show the original tokens ("V4.1").
 *   - scene.ttsText is the spoken track: what the TTS engine reads
 *     ("V four point one"). text-align.py aligns against this track (the
 *     wav2vec2 dictionary has no digit tokens, so spoken form is required
 *     for alignment), and lib/subtitles/restore-tokens.mjs maps the aligned
 *     spoken words back to the original display tokens.
 *   - scene.ttsReplacements records each rewrite as {spoken, original} so
 *     the restore step is exact, not heuristic.
 *
 * Scenes may set `voiceoverTts` explicitly in scene-data.mjs to author the
 * spoken form at content time (semantics are author knowledge — e.g. "0910"
 * is a date, not a count). The regex rules below are only a fallback.
 *
 * Called in main.mjs step 0.6 (after currency normalization, before TTS).
 *
 * @module normalize-tts-text
 */

import {
  filterConsumableReplacements,
  findLeaksInTrack,
  formatLeak,
} from "./subtitles/dual-track.mjs";

const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

/** Scale words for 3-digit groups, most-significant-last (see numberToWords). */
const SCALE_WORDS = ["", "thousand", "million", "billion", "trillion"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ORDINAL_WORDS = [
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "twenty-first",
  "twenty-second",
  "twenty-third",
  "twenty-fourth",
  "twenty-fifth",
  "twenty-sixth",
  "twenty-seventh",
  "twenty-eighth",
  "twenty-ninth",
  "thirtieth",
  "thirty-first",
];

/**
 * Convert a decimal number string to spoken form.
 * "1.32" → "one point three two"
 * @param {string} intPart - integer part before the dot
 * @param {string} decPart - decimal part after the dot
 * @returns {string} spoken form
 */
function decimalToSpoken(intPart, decPart) {
  const intSpoken = parseInt(intPart, 10) === 0 ? "zero" : numberToWords(parseInt(intPart, 10));
  const decDigits = decPart
    .split("")
    .map((d) => DIGIT_WORDS[parseInt(d, 10)])
    .join(" ");
  return `${intSpoken} point ${decDigits}`;
}

/**
 * Convert a non-negative integer to words.
 *
 * Exported so the quality gate can expand the DIGITS whisper.cpp writes
 * ("115,000") back into the same words this module puts on the spoken track —
 * one speller for both sides of the comparison, so they cannot drift.
 *
 * @param {number} n
 * @returns {string} words, or the digits again beyond the scale table
 */
export function numberToWords(n) {
  if (n === 0) return "zero";
  if (n < 0) return `negative ${numberToWords(-n)}`;
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const teens = [
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];

  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  if (n < 1000)
    return `${ones[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ""}`;
  if (n < 10000)
    return `${ones[Math.floor(n / 1000)]} thousand${n % 1000 ? ` ${numberToWords(n % 1000)}` : ""}`;
  // Larger cardinals split into 3-digit groups so every digit still becomes a
  // word. Returning String(n) here (the pre-2026-10-14 behavior) let "115,000"
  // reach text-align.py as a digit token, which wav2vec2 cannot align: the
  // aligner stopped short of the audio's real end and the #232 tail guard cut
  // the unmatched speech (deepseek-flash-silent-update scene 3 said "reached
  // 100" instead of "reached 115,000 views").
  const groups = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  // Beyond the scale table the magnitude word would silently vanish
  // (1e15 → "one"), and the digit guard in the callers cannot catch that —
  // the truncated string still contains no digits. Return the digits instead
  // so the callers leave the token alone, the same fallback the pre-2026-10-14
  // behavior gave every large number.
  if (groups.length > SCALE_WORDS.length) return String(n);
  groups.reverse();
  return groups
    .map((group, i) => {
      if (group === 0) return "";
      const scale = SCALE_WORDS[groups.length - 1 - i];
      return scale ? `${numberToWords(group)} ${scale}` : numberToWords(group);
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * Convert MMDD to "Month ordinal".
 * "0910" → "September tenth"
 * @param {string} mmdd - 4-digit string
 * @returns {string|null}
 */
function mmddToDateSpoken(mmdd) {
  const mm = parseInt(mmdd.slice(0, 2), 10);
  const dd = parseInt(mmdd.slice(2, 4), 10);
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  return `${MONTH_NAMES[mm - 1]} ${ORDINAL_WORDS[dd]}`;
}

/**
 * Digit + spec-unit tokens CosyVoice3 swallows (#239).
 *
 * Compact digit+letter tokens ("720p", "4K", "16GB") lose their trailing
 * letter in CosyVoice3 speech ("720p" is read as "720" — ant-lingbot-world-13b
 * Scene 3, Quality Gate "missing key token(s) [720p]"). Inserting a space
 * forces the letter to be pronounced on its own.
 *
 * This is a curated unit WHITELIST, not a generic (\d+)([a-zA-Z]) rule
 * (issue #239 review): a generic rule would mangle
 *   - chip codenames / letter-prefixed models: H100, A100, B200, A17, K2
 *     (letter BEFORE digits is never touched anyway, but the generic rule
 *     would also hit future digit-first names),
 *   - hex and multiplier tokens: 0x12a, 10x,
 *   - suffix letters with their own semantics: B (billion, "$1.4B" — the
 *     #227 regression test pins this), X ("50X cheaper").
 */
const UNIT_SPOKEN = {
  // resolution / display
  p: "P",
  k: "K",
  // acronyms read letter-by-letter
  fps: "FPS",
  nm: "NM",
  kb: "KB",
  mb: "MB",
  gb: "GB",
  tb: "TB",
  km: "KM",
  kg: "KG",
  // Hz: TN expands to "hertz" when alive, letter-name fallback otherwise
  hz: "Hz",
  // "bit" stays a word (all-caps "BIT" risks letter-by-letter spelling)
  bit: "bit",
  // metric / magnitude letters
  g: "G",
  t: "T",
  m: "M",
};

/**
 * Longest-first alternation DERIVED from UNIT_SPOKEN so the whitelist has a
 * single source of truth: splitDigitUnits (#239, spoken side) and
 * splitDigitUnitToken (#548, ASR-alias side) can never drift apart, and a new
 * unit only ever gets added to UNIT_SPOKEN.
 */
const DIGIT_UNIT_ALTERNATION = Object.keys(UNIT_SPOKEN)
  .sort((a, b) => b.length - a.length)
  .join("|");

/**
 * Whitespace-token boundary contract (#753).
 *
 * `restore-tokens.mjs` matches WHOLE whitespace tokens of the spoken track, and
 * text-align.py emits exactly those tokens as its word stream. A rewrite that
 * stops inside a token — "V3.2" out of "V3.2-Speciale", "2" out of "2-3x",
 * "20" out of "涨价20%" — glues the spoken words to the leftover text
 * ("two-Speciale", "twenty%"), restore cannot consume the run, and the spoken
 * form is burned into the subtitles ("GPT-5.6" shipped as "GPT-five").
 *
 * Every rule therefore asserts that its match starts at a token boundary
 * (`TOKEN_HEAD`), optionally carries the rest of a hyphen/slash compound
 * (`TOKEN_SUFFIX`), and ends at a token boundary (`TOKEN_END`). A match that
 * fails these guards is left untouched: no rewrite is always safe, a partial
 * rewrite never is.
 */
const TOKEN_HEAD = String.raw`(?<![\p{L}\p{N}_\-/])`;
const TOKEN_SUFFIX = String.raw`((?:[-/][\p{L}\p{N}]+)*)`;
const TOKEN_END = String.raw`(?![\p{L}\p{N}_\-/])`;
/**
 * Same boundary, plus a unit suffix. "10-20%" is a percentage range, not an
 * MM-DD date, and "2-3x" is not a bare cardinal — a rule that would rewrite
 * inside such a token must decline instead (#753).
 */
const TOKEN_END_NO_UNIT = String.raw`(?![\p{L}\p{N}_\-/%])`;

const DIGIT_UNIT_RE = new RegExp(
  `${TOKEN_HEAD}(\\d+)(${DIGIT_UNIT_ALTERNATION})${TOKEN_END}`,
  "giu",
);
/** Anchored to a single token — no /g, so .exec carries no lastIndex state. */
const DIGIT_UNIT_TOKEN_RE = new RegExp(`^(\\d+)(${DIGIT_UNIT_ALTERNATION})$`, "i");

/**
 * Bare cardinal integers that must not survive into the spoken track.
 *
 * text-align.py aligns scene.ttsText, and wav2vec2 has no digit tokens: a bare
 * "115,000" cannot be aligned against audio that reads "one hundred fifteen
 * thousand", so the aligner stops short of the audio's real end and the #232
 * tail guard cuts the unmatched speech.
 *
 * Excluded on purpose — each has its own rule:
 *   - any digit run touching a letter ("720p", "10x", "0x12a") and
 *     letter-prefixed codenames ("H100", "B200") — #239 owns digit+unit;
 *   - decimals ("5.1", the "1.4" in "$1.4B") — rules 1-3 own them;
 *   - currency-prefixed amounts ("$20 million") — step 0.5's currency
 *     normalization owns the symbol/amount pairing, and expanding only the
 *     digits there yields "$twenty million", which the engine would read as
 *     "dollars twenty million".
 * Sentence-final punctuation is deliberately NOT excluded: "...managed 40."
 * is exactly the position where an unexpanded digit breaks the aligner.
 */
const CARDINAL_RE = new RegExp(
  String.raw`(?<![\d.$€£¥,])(?<![\p{L}\p{N}_\-/])(\d{1,3}(?:,\d{3})+|\d+)(?!\.\d)` +
    TOKEN_END_NO_UNIT,
  "gu",
);

/**
 * Split compact digit+unit tokens into spoken-safe form: "720p" → "720 P".
 * Idempotent (already-split text has no digit+letter adjacency) and
 * whitelist-only, so unknown suffixes pass through untouched.
 *
 * @param {string} str
 * @returns {string}
 */
export function splitDigitUnits(str) {
  if (typeof str !== "string") return str;
  return str.replace(DIGIT_UNIT_RE, (match, digits, unit) => {
    return `${digits} ${UNIT_SPOKEN[unit.toLowerCase()]}`;
  });
}

/**
 * Token-level projection of the same whitelist (#548): split ONE compact
 * token, e.g. "720p" → { digits: "720", unit: "P" }, or return null when the
 * token is outside the whitelist ("0x12a", "10x", "H100", "$1.4B" → "4b").
 * The TTS Quality Gate uses this to mirror #239 on the heard side: whisper
 * re-merges "720 P" into "720p", so the critical token "720" needs aliases.
 *
 * @param {string} token
 * @returns {{digits: string, unit: string}|null}
 */
export function splitDigitUnitToken(token) {
  if (typeof token !== "string") return null;
  const m = DIGIT_UNIT_TOKEN_RE.exec(token);
  if (!m) return null;
  return { digits: m[1], unit: UNIT_SPOKEN[m[2].toLowerCase()] };
}

/**
 * Normalize a single voiceover string.
 *
 * @param {string} str
 * @param {Array<{spoken: string[], original: string}>} replacements - mutated: records each rewrite
 * @returns {string} the spoken-form text
 */
function normalizeVoiceover(str, replacements) {
  if (typeof str !== "string") return str;

  const record = (original, spokenText) => {
    replacements.push({ original, spoken: spokenText.split(" ") });
    return spokenText;
  };

  // 1. Version numbers: V4.1, v3.5, GPT-4.0, GLM 6.0
  //    TOKEN_SUFFIX keeps the rest of a hyphen compound ("V3.2-Speciale") in
  //    the same replacement: rewriting only "V3.2" glued "two-Speciale" into
  //    one token that restore could never match (#753).
  str = str.replace(
    new RegExp(`${TOKEN_HEAD}([VvG])(\\d+)\\.(\\d+)${TOKEN_SUFFIX}${TOKEN_END}`, "gu"),
    (match, prefix, intPart, decPart, suffix) => {
      const prefixWord = prefix.toUpperCase() === "V" ? "V" : prefix.toUpperCase();
      return record(match, `${prefixWord} ${decimalToSpoken(intPart, decPart)}${suffix}`);
    },
  );

  // 1b. Hyphenated model + dotted version: "GPT-5.6", "GLM-4.5".
  //     Must run BEFORE rule 3 (bare decimal): rule 3 would otherwise consume
  //     only "5.6", emitting "GPT-five point six" whose first whitespace token
  //     ("GPT-five") no longer matches the recorded spoken run ["five", ...],
  //     so restore-tokens silently leaves the spoken form in the timing data
  //     and Gate 1 false-positives. Recording the WHOLE token keeps the spoken
  //     track token-for-token with the replacement, and the hyphen spelling is
  //     preserved so the engine's input is unchanged.
  //     The prefix cap has to cover real model names: a 4-letter cap sent
  //     "Claude-3.5" / "Gemini-2.5" / "Llama-3.1" through to rule 3, which
  //     consumed only the digits and reproduced the exact break this rule
  //     exists to fix.
  str = str.replace(
    new RegExp(`${TOKEN_HEAD}([A-Za-z]{1,12})-(\\d+)\\.(\\d+)${TOKEN_SUFFIX}${TOKEN_END}`, "gu"),
    (match, prefix, intPart, decPart, suffix) => {
      return record(match, `${prefix}-${decimalToSpoken(intPart, decPart)}${suffix}`);
    },
  );

  // 2. Standalone model names with dots: "GLM 6.0", "GPT 4.0"
  str = str.replace(
    new RegExp(`${TOKEN_HEAD}([A-Z]{2,4})\\s+(\\d+)\\.(\\d+)${TOKEN_SUFFIX}${TOKEN_END}`, "gu"),
    (match, prefix, intPart, decPart, suffix) => {
      return record(match, `${prefix} ${decimalToSpoken(intPart, decPart)}${suffix}`);
    },
  );

  // 3. Bare decimal numbers: "1.32", "0.14"
  //    Skip IP addresses (N.N.N.N) and file paths. The offset argument (instead
  //    of indexOf) keeps dotted chains correct when the same number repeats.
  str = str.replace(
    new RegExp(`${TOKEN_HEAD}(\\d+)\\.(\\d+)${TOKEN_SUFFIX}${TOKEN_END}`, "gu"),
    (match, intPart, decPart, suffix, offset, whole) => {
      const afterMatch = whole.slice(offset + match.length);
      if (/^\.\d/.test(afterMatch)) return match;
      return record(match, `${decimalToSpoken(intPart, decPart)}${suffix}`);
    },
  );

  // 4. Hyphenated version: "GPT-4", "GPT-4o"
  str = str.replace(
    new RegExp(`${TOKEN_HEAD}([A-Z]{2,4})-(\\d+)([a-z]?)${TOKEN_SUFFIX}${TOKEN_END}`, "gu"),
    (match, prefix, num, suffixWord, tail) => {
      return record(
        match,
        `${prefix} ${numberToWords(parseInt(num, 10))}${suffixWord ? ` ${suffixWord}` : ""}${tail}`,
      );
    },
  );

  // 5. Four-digit dates in context: "expires on 0910", "deadline 0910"
  str = str.replace(
    new RegExp(
      `${TOKEN_HEAD}(expires|deadline|until|through|ends?)\\s+(?:on\\s+)?(\\d{4})${TOKEN_END}`,
      "giu",
    ),
    (match, keyword, digits) => {
      const dateSpoken = mmddToDateSpoken(digits);
      if (!dateSpoken) return match;
      // record ONLY the words that replace `digits` — the keyword ("expires")
      // stays in the sentence and must not be consumed by the restore step.
      replacements.push({ original: digits, spoken: dateSpoken.split(" ") });
      const hadOn = /\bon\b/i.test(match);
      return `${keyword}${hadOn ? " on" : ""} ${dateSpoken}`;
    },
  );

  // 6. Bare four-digit dates with slashes: "09/10", "09-10"
  //    The trailing guard rejects a unit suffix: "10-20%" is a percentage
  //    range, not October twentieth (#753).
  str = str.replace(
    new RegExp(
      `${TOKEN_HEAD}(0[1-9]|1[0-2])[/\\-](0[1-9]|[12]\\d|3[01])${TOKEN_END_NO_UNIT}`,
      "gu",
    ),
    (match, mm, dd) => {
      return record(
        match,
        `${MONTH_NAMES[parseInt(mm, 10) - 1]} ${ORDINAL_WORDS[parseInt(dd, 10)]}`,
      );
    },
  );

  // 7. Bare 4-digit MMDD when preceded by "on" or "by"
  str = str.replace(
    new RegExp(`${TOKEN_HEAD}(?:on|by)\\s+(\\d{4})${TOKEN_END}`, "giu"),
    (match, digits) => {
      const dateSpoken = mmddToDateSpoken(digits);
      return dateSpoken ? record(digits, dateSpoken) : match;
    },
  );

  // 7b. Numeric ranges with a unit: "2-3x", "10-20%".
  //     Without this rule the endpoints either fell through to the cardinal
  //     rule (which rewrote only "2" of "2-3x") or were mistaken for an MM-DD
  //     date ("10-20%" → "October twentieth%"). Both left the spoken words
  //     glued to the unrewritten half and restore could not map them back.
  //     Ranges without a unit keep the prior date/cardinal behaviour — the
  //     author can pin them with `voiceoverTts`.
  str = str.replace(
    new RegExp(
      `${TOKEN_HEAD}(\\d{1,3})\\s*[-–]\\s*(\\d{1,3})\\s*(%|x|×)${TOKEN_END_NO_UNIT}`,
      "gu",
    ),
    (match, from, to, unit) => {
      const a = parseInt(from, 10);
      const b = parseInt(to, 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return match;
      const unitWord = unit === "%" ? "percent" : "x";
      return record(match, `${numberToWords(a)} to ${numberToWords(b)} ${unitWord}`);
    },
  );

  // 8. Cardinal integers: "115,000" → "one hundred fifteen thousand",
  //    "40." → "forty". Runs BEFORE the digit+unit rule so a token like
  //    "720p" is still whole for #239 — CARDINAL_RE skips any digit run that
  //    touches a letter or a decimal point. Without this rule a bare cardinal
  //    reaches text-align.py as digits, the aligner cannot consume it, and the
  //    #232 tail guard cuts the speech it failed to align.
  str = str.replace(CARDINAL_RE, (match) => {
    const value = parseInt(match.replace(/,/g, ""), 10);
    if (!Number.isFinite(value)) return match;
    const spoken = numberToWords(value);
    // Beyond the scale table numberToWords returns the digits again — leave
    // the token alone rather than record a replacement restore cannot map.
    if (/\d/.test(spoken)) return match;
    return record(match, spoken);
  });

  // 9. Digit + spec-unit splitting (#239): "720p" → "720 P".
  //    Runs LAST so version rules (1-4) have already consumed "V4.1" /
  //    "GPT-4o" style tokens. Each match is recorded as a replacement so
  //    restore-tokens maps the spoken ["720","P"] run back to "720p" for
  //    display subtitles.
  str = str.replace(DIGIT_UNIT_RE, (match, digits, unit) => {
    return record(match, `${digits} ${UNIT_SPOKEN[unit.toLowerCase()]}`);
  });

  return str;
}

/**
 * Spoken words for every cardinal integer in `text` — "115,000" yields
 * ["one", "hundred", "fifteen", "thousand"].
 *
 * Exported for the quality gate's heard-side expansion: whisper.cpp writes
 * numbers as digits while the spoken track spells them out, so the gate needs
 * the same words this module produces. Sharing CARDINAL_RE and numberToWords
 * means the two sides of that comparison cannot drift, and the same
 * exclusions (decimals, hex, digit+unit, letter-prefixed codenames) apply.
 *
 * @param {string} text
 * @returns {string[]} words, empty when the text carries no cardinal
 */
export function cardinalSpokenWords(text) {
  const words = [];
  for (const match of String(text ?? "").matchAll(CARDINAL_RE)) {
    const value = parseInt(match[0].replace(/,/g, ""), 10);
    if (!Number.isFinite(value)) continue;
    const spoken = numberToWords(value);
    // Beyond the scale table numberToWords returns the digits — not evidence.
    if (/\d/.test(spoken)) continue;
    words.push(...spoken.split(" "));
  }
  return words;
}

/**
 * Build the dual-track TTS fields for all scenes.
 * Only ADDS scene.ttsText / scene.ttsReplacements — scene.voiceover (display
 * track) is left untouched.
 *
 * @param {Array} scenes - scene-data array (mutated in place)
 * @param {Object} [_meta] - video meta (reserved)
 * @returns {Array} the same scenes array
 */
export function normalizeTtsText(scenes, _meta = {}) {
  let changeCount = 0;
  /**
   * Plan one scene's dual track. A scene that cannot be mapped back is left on
   * the display track — per scene, not per batch: one unmappable line must not
   * switch off normalization for the whole package (the Step 0.6 caller only
   * warns, so a batch-wide failure would silently degrade every other scene).
   *
   * `authored` marks the author-written `voiceoverTts` path: there the author
   * decides which tokens to expand, so replacements absent from their track
   * are dropped rather than treated as a defect — but a spoken track that
   * differs with no mapping left is called out, because restore cannot undo it.
   */
  const planDualTrack = (scene, spoken, replacements, { authored = false } = {}) => {
    if (!authored) {
      const leaks = findLeaksInTrack(spoken, replacements);
      if (leaks.length > 0) {
        const detail = leaks.map((leak) => formatLeak({ ...leak, sceneId: scene.id })).join("; ");
        console.warn(
          `  ⚠️  Scene ${scene.id}: ${leaks.length} replacement(s) cannot be mapped back ` +
            `(${detail}) — leaving this scene on the display track. ` +
            `Set scene.voiceoverTts explicitly when the line needs a spoken form.`,
        );
        return null;
      }
      return { scene, spoken, reps: replacements };
    }

    const reps = filterConsumableReplacements(spoken, replacements);
    if (reps.length !== replacements.length) {
      const dropped = replacements.filter((rep) => !reps.includes(rep));
      console.log(
        `  ℹ️  Scene ${scene.id}: author-written voiceoverTts leaves ` +
          `${dropped.map((rep) => `"${rep.original}"`).join(", ")} in display form — ` +
          `no restore mapping recorded for them`,
      );
    }
    return { scene, spoken, reps };
  };

  // Plan every scene, then commit. A failed plan returns null, so nothing is
  // half-written and the other scenes still get their spoken track.
  const planned = [];
  for (const scene of scenes) {
    if (!scene.voiceover) continue;
    // Author-authored spoken form wins — semantics (is "0910" a date?) are
    // content knowledge, not something a regex can infer.
    if (scene.voiceoverTts) {
      // Generate replacements from voiceover so restore-tokens can map
      // spoken words back to display tokens.  The author-written voiceoverTts
      // is used as ttsText, but the replacement mapping is derived from the
      // original voiceover via the same normalize rules.
      const reps = [];
      normalizeVoiceover(scene.voiceover, reps);
      const plan = planDualTrack(scene, scene.voiceoverTts, reps, { authored: true });
      if (plan) planned.push(plan);
      continue;
    }
    const replacements = [];
    const spoken = normalizeVoiceover(scene.voiceover, replacements);
    if (spoken !== scene.voiceover) {
      const plan = planDualTrack(scene, spoken, replacements);
      if (plan) planned.push(plan);
    }
  }

  for (const { scene, spoken, reps } of planned) {
    scene.ttsText = spoken;
    scene.ttsReplacements = reps;
    changeCount++;
  }
  if (changeCount > 0) {
    console.log(
      `  📝 TTS dual-track normalization: ${changeCount} scene(s) — voiceover (display) untouched, ttsText (spoken) derived`,
    );
  }
  return scenes;
}
