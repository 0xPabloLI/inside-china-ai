/**
 * Currency Normalization — RMB → USD dual-annotation auto-fix.
 *
 * Scans all voiceover and texts string values for RMB amounts
 * (¥\d+ or \d+ (?:billion|million|thousand) yuan) and inserts
 * the USD equivalent in $X (¥Y) format when a $ equivalent is
 * not already present nearby.
 *
 * Called in main.mjs Step 0 (after scene-data load, before TTS).
 * Exchange rate: ¥1 ≈ $0.14 (7.14 CNY/USD). Review semi-annually.
 *
 * @module normalize-currency
 */

/** Exchange rate: ¥1 ≈ $0.14 (7.14 CNY/USD). */
export const CNY_TO_USD_RATE = 0.14;

// ─── Patterns ───

/** Matches ¥<number> patterns, e.g. "¥445" or "¥1,100" */
const YEN_PATTERN = /¥([\d,.]+)\s*(billion|million|thousand|K|B|M)?/gi;

/** Matches "<number> (billion|million|thousand) yuan" patterns */
const YUAN_PATTERN = /(\d[\d,.]*)\s*(billion|million|thousand)\s*yuan/gi;

// ─── Helpers ───

/**
 * Parse a number string that may contain commas and magnitude words.
 * @param {string} numStr - e.g. "445", "1,100"
 * @param {string} [magnitude] - "billion" | "million" | "thousand" | "K" | "B" | "M"
 * @returns {number} numeric value
 */
function parseAmount(numStr, magnitude) {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (!magnitude) return n;
  const mag = magnitude.toLowerCase();
  if (mag === "billion" || mag === "b") return n * 1_000_000_000;
  if (mag === "million" || mag === "m") return n * 1_000_000;
  if (mag === "thousand" || mag === "k") return n * 1_000;
  return n;
}

/**
 * Format a USD amount for display.
 * Uses "billion"/"million" suffix for large amounts, rounded number for small.
 * @param {number} usdAmount - USD value
 * @param {string} [originalMagnitude] - magnitude word from original ("billion", "million")
 * @returns {string} formatted USD string, e.g. "$63 billion" or "$154"
 */
function formatUsd(usdAmount, originalMagnitude) {
  if (originalMagnitude) {
    const mag = originalMagnitude.toLowerCase();
    if (mag === "billion") {
      return `$${Math.round(usdAmount / 1_000_000_000)} billion`;
    }
    if (mag === "million") {
      return `$${Math.round(usdAmount / 1_000_000)} million`;
    }
    if (mag === "thousand") {
      return `$${Math.round(usdAmount / 1_000)} thousand`;
    }
  }
  // Small amount: round to nearest dollar
  return `$${Math.round(usdAmount)}`;
}

/**
 * Check if a $ equivalent already appears near the match position.
 * Looks within 30 characters before the match for a $ amount.
 * @param {string} text - full string
 * @param {number} matchIndex - start index of the RMB match
 * @returns {boolean}
 */
function hasNearbyUsd(text, matchIndex) {
  const windowStart = Math.max(0, matchIndex - 30);
  const before = text.substring(windowStart, matchIndex);
  return /\$\d/.test(before);
}

/**
 * Normalize a single string: insert USD dual-annotation for RMB amounts.
 * @param {string} str - input string
 * @returns {string} normalized string
 */
function normalizeString(str) {
  if (typeof str !== "string") return str;

  // Process ¥<number> patterns
  str = str.replace(YEN_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseAmount(numStr, magnitude);
    const usdAmount = cnyAmount * CNY_TO_USD_RATE;
    const usdStr = formatUsd(usdAmount, magnitude);
    return `${usdStr} (${match})`;
  });

  // Process "<number> (billion|million|thousand) yuan" patterns
  str = str.replace(YUAN_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseAmount(numStr, magnitude);
    const usdAmount = cnyAmount * CNY_TO_USD_RATE;
    const usdStr = formatUsd(usdAmount, magnitude);
    return `${usdStr} (${match})`;
  });

  return str;
}

/**
 * Scan all voiceover and texts string values for RMB amounts and insert
 * USD dual-annotation in $X (¥Y) format using CNY_TO_USD_RATE.
 *
 * Mutates scenes in place and returns the same array reference.
 *
 * @param {Array} scenes - scene-data array
 * @param {Object} _meta - video meta (reserved for future use)
 * @returns {Array} the same scenes array (mutated in place)
 */
export function normalizeSceneData(scenes, _meta = {}) {
  for (const scene of scenes) {
    // Normalize voiceover
    if (scene.voiceover) {
      scene.voiceover = normalizeString(scene.voiceover);
    }

    // Normalize all texts string values
    if (scene.texts && typeof scene.texts === "object") {
      for (const key of Object.keys(scene.texts)) {
        if (typeof scene.texts[key] === "string") {
          scene.texts[key] = normalizeString(scene.texts[key]);
        }
      }
    }
  }

  return scenes;
}
