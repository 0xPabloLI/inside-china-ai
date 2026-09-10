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

const DIGIT_WORDS = [
  "zero", "one", "two", "three", "four",
  "five", "six", "seven", "eight", "nine",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ORDINAL_WORDS = [
  "zeroth", "first", "second", "third", "fourth", "fifth",
  "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
  "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
  "twenty-first", "twenty-second", "twenty-third", "twenty-fourth",
  "twenty-fifth", "twenty-sixth", "twenty-seventh", "twenty-eighth",
  "twenty-ninth", "thirtieth", "thirty-first",
];

/**
 * Convert a decimal number string to spoken form.
 * "1.32" → "one point three two"
 * @param {string} intPart - integer part before the dot
 * @param {string} decPart - decimal part after the dot
 * @returns {string} spoken form
 */
function decimalToSpoken(intPart, decPart) {
  const intSpoken = parseInt(intPart, 10) === 0
    ? "zero"
    : numberToWords(parseInt(intPart, 10));
  const decDigits = decPart.split("").map((d) => DIGIT_WORDS[parseInt(d, 10)]).join(" ");
  return `${intSpoken} point ${decDigits}`;
}

/**
 * Convert a small integer (0-9999) to words.
 * @param {number} n
 * @returns {string}
 */
function numberToWords(n) {
  if (n === 0) return "zero";
  if (n < 0) return `negative ${numberToWords(-n)}`;
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const teens = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  if (n < 1000) return `${ones[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ""}`;
  if (n < 10000) return `${ones[Math.floor(n / 1000)]} thousand${n % 1000 ? ` ${numberToWords(n % 1000)}` : ""}`;
  return String(n);
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
  str = str.replace(/\b([VvG])(\d+)\.(\d+)\b/g, (match, prefix, intPart, decPart) => {
    const prefixWord = prefix.toUpperCase() === "V" ? "V" : prefix.toUpperCase();
    return record(match, `${prefixWord} ${decimalToSpoken(intPart, decPart)}`);
  });

  // 2. Standalone model names with dots: "GLM 6.0", "GPT 4.0"
  str = str.replace(/\b([A-Z]{2,4})\s+(\d+)\.(\d+)\b/g, (match, prefix, intPart, decPart) => {
    return record(match, `${prefix} ${decimalToSpoken(intPart, decPart)}`);
  });

  // 3. Bare decimal numbers: "1.32", "0.14"
  //    Skip IP addresses (N.N.N.N) and file paths
  str = str.replace(/\b(\d+)\.(\d+)\b/g, (match, intPart, decPart) => {
    const afterMatch = str.slice(str.indexOf(match) + match.length);
    if (/^\.\d/.test(afterMatch)) return match;
    return record(match, decimalToSpoken(intPart, decPart));
  });

  // 4. Hyphenated version: "GPT-4", "GPT-4o"
  str = str.replace(/\b([A-Z]{2,4})-(\d+)([a-z]?)\b/g, (match, prefix, num, suffix) => {
    return record(match, `${prefix} ${numberToWords(parseInt(num, 10))}${suffix ? ` ${suffix}` : ""}`);
  });

  // 5. Four-digit dates in context: "expires on 0910", "deadline 0910"
  str = str.replace(
    /\b(expires|deadline|until|through|ends?)\s+(?:on\s+)?(\d{4})\b/gi,
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
  str = str.replace(/\b(0[1-9]|1[0-2])[/\-](0[1-9]|[12]\d|3[01])\b/g, (match, mm, dd) => {
    return record(match, `${MONTH_NAMES[parseInt(mm, 10) - 1]} ${ORDINAL_WORDS[parseInt(dd, 10)]}`);
  });

  // 7. Bare 4-digit MMDD when preceded by "on" or "by"
  str = str.replace(
    /\b(?:on|by)\s+(\d{4})\b/gi,
    (match, digits) => {
      const dateSpoken = mmddToDateSpoken(digits);
      return dateSpoken ? record(digits, dateSpoken) : match;
    },
  );

  return str;
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
  for (const scene of scenes) {
    if (!scene.voiceover) continue;
    // Author-authored spoken form wins — semantics (is "0910" a date?) are
    // content knowledge, not something a regex can infer.
    if (scene.voiceoverTts) {
      scene.ttsText = scene.voiceoverTts;
      // Generate replacements from voiceover so restore-tokens can map
      // spoken words back to display tokens.  The author-written voiceoverTts
      // is used as ttsText, but the replacement mapping is derived from the
      // original voiceover via the same normalize rules.
      const reps = [];
      normalizeVoiceover(scene.voiceover, reps);
      scene.ttsReplacements = reps;
      changeCount++;
      continue;
    }
    const replacements = [];
    const spoken = normalizeVoiceover(scene.voiceover, replacements);
    if (spoken !== scene.voiceover) {
      scene.ttsText = spoken;
      scene.ttsReplacements = replacements;
      changeCount++;
    }
  }
  if (changeCount > 0) {
    console.log(`  📝 TTS dual-track normalization: ${changeCount} scene(s) — voiceover (display) untouched, ttsText (spoken) derived`);
  }
  return scenes;
}
