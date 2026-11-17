/**
 * Currency Normalization — RMB/HKD → USD dual-annotation auto-fix.
 *
 * Scans all voiceover and texts string values for RMB/HKD amounts and
 * inserts the USD equivalent in `$X (original)` format when a $ equivalent
 * is not already present nearby.
 *
 * Recognised spellings (#1415):
 *   CNY  ¥1200 · ￥1,200 · 12.4 billion yuan · 67.7B RMB · 3,500 亿元 ·
 *        3500 亿人民币 · 120 万元 · 500 万人民币 · 1,200 元
 *   HKD  HK$454 · 80B HKD · 2,526 Hong Kong dollars
 *
 * Called in the pipeline's Step 0.5 (after scene-data load, before TTS).
 * Rates are resolved once per run by `resolveExchangeRates()` — live quote
 * first, authored fallback constants on any failure — and recorded in
 * `meta.currencyRates` so the log and the artefacts can be audited.
 * The Chinese-number spellings ("三亿五千万") are deliberately out of scope:
 * only Arabic numerals are converted.
 *
 * @module normalize-currency
 */

import { DEFAULT_RATES, resolveExchangeRates } from "./exchange-rates.mjs";

/** Fallback exchange rate: ¥1 ≈ $0.14 (7.14 CNY/USD). */
export const CNY_TO_USD_RATE = DEFAULT_RATES.CNY;

/** Fallback exchange rate: HK$1 ≈ $0.13 (7.8 HKD/USD). */
export const HKD_TO_USD_RATE = DEFAULT_RATES.HKD;

// ─── Patterns ───

/** Matches ¥<number> patterns, e.g. "¥445" or "¥1,100" */
const YEN_PATTERN = /¥([\d,.]+)\s*(billion|million|thousand|K|B|M)?/gi;

/** Matches full-width "￥<number>" patterns, e.g. "￥1,200" or "￥3.5亿" */
const FULLWIDTH_YEN_PATTERN = /￥\s*([\d,.]+)\s*(亿|万)?(?:\s*元)?/g;

/** Matches "<number> (billion|million|thousand) yuan" patterns */
const YUAN_PATTERN = /(\d[\d,.]*)\s*(billion|million|thousand)\s*yuan/gi;

/** Matches "<number> (billion|million|thousand|B|M|K) RMB" patterns */
const RMB_PATTERN = /(\d[\d,.]*)\s*(billion|million|thousand|B|M|K)\s*RMB/gi;

/** Matches "<number> 亿元 / 亿人民币", e.g. "3,500 亿元" or "3500 亿人民币" */
const CNY_YI_PATTERN = /(\d[\d,.]*)\s*亿\s*(?:人民币|元(?![素宇旦]))/g;

/** Matches "<number> 万元 / 万人民币", e.g. "120 万元" or "500 万人民币" */
const CNY_WAN_PATTERN = /(\d[\d,.]*)\s*万\s*(?:人民币|元(?![素宇旦]))/g;

/** Matches bare "<number> 元", e.g. "1,200 元" */
const CNY_YUAN_PATTERN = /(\d[\d,.]*)\s*元(?![素宇旦])/g;

/** Matches "<number> (billion|million|thousand) HKD" or "<number> (B|M) HKD" patterns */
const HKD_PATTERN = /(\d[\d,.]*)\s*(billion|million|thousand|B|M)?\s*HKD/gi;

/**
 * Matches "HK$<number>" prefix patterns, e.g. "HK$454" or "HK$2,526".
 * (#1324 verification finding: zhipu-valuation's on-screen texts use the
 * prefix form, which the suffix-only HKD_PATTERN never saw.)
 */
const HK_DOLLAR_PREFIX_PATTERN = /HK\$\s*([\d,.]+)(?:\s*(billion|million|thousand|B|M|K)\b)?/gi;

/**
 * Matches "<number> (magnitude)? Hong Kong dollars" full-name patterns,
 * e.g. "2,526 Hong Kong dollars a share vanished". Voiceovers spell the
 * currency out for TTS clarity; the suffix-only HKD_PATTERN never matched.
 */
const HK_DOLLAR_NAME_PATTERN = /(\d[\d,.]*)\s*(billion|million|thousand)?\s*Hong Kong dollars?/gi;

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
 * Parse a Chinese-magnitude amount: 亿 = 10^8, 万 = 10^4.
 * @param {string} numStr - e.g. "3,500"
 * @param {string} [magnitude] - "亿" | "万"
 * @returns {number}
 */
function parseChineseAmount(numStr, magnitude) {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (magnitude === "亿") return n * 100_000_000;
  if (magnitude === "万") return n * 10_000;
  return n;
}

/**
 * Format a USD amount for display.
 * Uses "billion"/"million" suffix for large amounts, rounded number for small.
 * @param {number} usdAmount - USD value
 * @param {string} [originalMagnitude] - magnitude word from original ("billion", "B", "million", "M", etc.)
 * @returns {string} formatted USD string, e.g. "$63 billion" or "$154"
 */
function formatUsd(usdAmount, originalMagnitude) {
  if (originalMagnitude) {
    const mag = originalMagnitude.toLowerCase();
    if (mag === "billion" || mag === "b") {
      return `$${Math.round(usdAmount / 1_000_000_000)} billion`;
    }
    if (mag === "million" || mag === "m") {
      return `$${Math.round(usdAmount / 1_000_000)} million`;
    }
    if (mag === "thousand" || mag === "k") {
      return `$${Math.round(usdAmount / 1_000)} thousand`;
    }
  }
  // Small amount: round to nearest dollar
  return `$${Math.round(usdAmount)}`;
}

/** Group a rounded integer with thousands separators (locale-independent). */
function groupDigits(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format a USD amount by its own magnitude — the Chinese spellings carry a
 * magnitude the English formatter cannot map (亿/万), so pick the unit from
 * the converted value instead.
 * @param {number} usdAmount
 * @returns {string} e.g. "$49 billion", "$168,000", "$168"
 */
function formatUsdAuto(usdAmount) {
  const billions = Math.round(usdAmount / 1_000_000_000);
  if (billions >= 1) return `$${billions} billion`;
  if (usdAmount >= 1_000_000) return `$${Math.round(usdAmount / 1_000_000)} million`;
  return `$${groupDigits(Math.round(usdAmount))}`;
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
 * Normalize a single string: insert USD dual-annotation for RMB/HKD amounts.
 * @param {string} str - input string
 * @param {{CNY: number, HKD: number}} rates - USD per unit of local currency
 * @param {{annotated: number}} [stats] - mutation counter for run reporting
 * @returns {string} normalized string
 */
function normalizeString(str, rates, stats) {
  if (typeof str !== "string") return str;

  const annotate = (match, usdStr) => `${usdStr} (${match})`;

  // Process ¥<number> patterns
  str = str.replace(YEN_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseAmount(numStr, magnitude);
    const usdStr = formatUsd(cnyAmount * rates.CNY, magnitude);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process full-width ￥<number> patterns
  str = str.replace(FULLWIDTH_YEN_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseChineseAmount(numStr, magnitude);
    const usdStr = formatUsdAuto(cnyAmount * rates.CNY);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process "<number> 亿元 / 亿人民币" patterns
  str = str.replace(CNY_YI_PATTERN, (match, numStr, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseChineseAmount(numStr, "亿");
    const usdStr = formatUsdAuto(cnyAmount * rates.CNY);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process "<number> 万元 / 万人民币" patterns
  str = str.replace(CNY_WAN_PATTERN, (match, numStr, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseChineseAmount(numStr, "万");
    const usdStr = formatUsdAuto(cnyAmount * rates.CNY);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process bare "<number> 元" patterns
  str = str.replace(CNY_YUAN_PATTERN, (match, numStr, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseChineseAmount(numStr);
    const usdStr = formatUsdAuto(cnyAmount * rates.CNY);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process "<number> (billion|million|thousand) yuan" patterns
  str = str.replace(YUAN_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseAmount(numStr, magnitude);
    const usdStr = formatUsd(cnyAmount * rates.CNY, magnitude);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process "<number> (billion|million|thousand|B|M|K) RMB" patterns
  str = str.replace(RMB_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const cnyAmount = parseAmount(numStr, magnitude);
    const usdStr = formatUsd(cnyAmount * rates.CNY, magnitude);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process "<number> HKD" patterns (e.g. "80B HKD", "12.4 billion HKD")
  str = str.replace(HKD_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const hkdAmount = parseAmount(numStr, magnitude);
    const usdStr = formatUsd(hkdAmount * rates.HKD, magnitude);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process "HK$<number>" prefix patterns (e.g. "HK$454 CLOSE")
  str = str.replace(HK_DOLLAR_PREFIX_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const hkdAmount = parseAmount(numStr, magnitude);
    const usdStr = formatUsd(hkdAmount * rates.HKD, magnitude);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  // Process "<number> Hong Kong dollars" full-name patterns
  // (e.g. "2,526 Hong Kong dollars a share vanished")
  str = str.replace(HK_DOLLAR_NAME_PATTERN, (match, numStr, magnitude, offset, fullStr) => {
    if (hasNearbyUsd(fullStr, offset)) return match;
    const hkdAmount = parseAmount(numStr, magnitude);
    const usdStr = formatUsd(hkdAmount * rates.HKD, magnitude);
    if (stats) stats.annotated++;
    return annotate(match, usdStr);
  });

  return str;
}

/**
 * Scan all voiceover and texts string values for RMB/HKD amounts and insert
 * USD dual-annotation in `$X (original)` format.
 *
 * Mutates scenes in place and returns the same array reference. Pure with
 * respect to the network: pass `options.rates` (or reuse the rates already
 * recorded on `meta.currencyRates`) to keep tests offline.
 *
 * @param {Array} scenes - scene-data array
 * @param {Object} [meta] - video meta; `meta.currencyRates.rates` is reused when
 *   `options.rates` is omitted
 * @param {Object} [options]
 * @param {{CNY: number, HKD: number}} [options.rates] - USD per unit of local currency
 * @param {{annotated: number}} [options.stats] - receives the annotation count
 * @returns {Array} the same scenes array (mutated in place)
 */
export function normalizeSceneData(scenes, meta = {}, options = {}) {
  const rates = options.rates ?? meta?.currencyRates?.rates ?? DEFAULT_RATES;
  const stats = options.stats ?? null;

  for (const scene of scenes) {
    // Normalize voiceover
    if (scene.voiceover) {
      scene.voiceover = normalizeString(scene.voiceover, rates, stats);
    }

    // Normalize all texts string values
    if (scene.texts && typeof scene.texts === "object") {
      for (const key of Object.keys(scene.texts)) {
        if (typeof scene.texts[key] === "string") {
          scene.texts[key] = normalizeString(scene.texts[key], rates, stats);
        }
      }
    }
  }

  return scenes;
}

/**
 * Step 0.5 entry point: resolve the USD rates once, record them on `meta`,
 * annotate the scenes, and log the rate provenance (rate + source + time).
 * Rate lookup failure never aborts the run — the fallback constants apply
 * and the log line is marked `fallback`.
 *
 * @param {Array} scenes - scene-data array (mutated in place)
 * @param {Object} [meta] - video meta; receives `currencyRates` and `currencyAnnotation`
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests
 * @param {number} [options.timeoutMs] - network budget for the single lookup
 * @param {() => Date} [options.now] - injectable clock
 * @param {Console|null} [options.logger] - null silences the provenance line
 * @returns {Promise<import("./exchange-rates.mjs").ExchangeRateReport>}
 */
export async function normalizeSceneDataWithLiveRates(scenes, meta = {}, options = {}) {
  const report = await resolveExchangeRates({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    now: options.now,
  });

  meta.currencyRates = report;
  const stats = { annotated: 0 };
  normalizeSceneData(scenes, meta, { rates: report.rates, stats });
  meta.currencyAnnotation = stats;

  const logger = options.logger === null ? null : (options.logger ?? console);
  if (logger) {
    const ratesText = `CNY ${report.rates.CNY.toFixed(4)} / HKD ${report.rates.HKD.toFixed(4)}`;
    if (report.fallback) {
      logger.warn(
        `💱 Exchange rate fallback (${report.error}): ${ratesText} @ ${report.fetchedAt} — ${stats.annotated} amount(s) annotated`,
      );
    } else {
      const providerTime = report.providerTime ? `, quote ${report.providerTime}` : "";
      logger.log(
        `💱 Exchange rates live (${report.source}${providerTime}): ${ratesText} @ ${report.fetchedAt} — ${stats.annotated} amount(s) annotated`,
      );
    }
  }

  return report;
}
