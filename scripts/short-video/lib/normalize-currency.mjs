/**
 * Currency Normalization — RMB/HKD → USD dual-annotation auto-fix.
 *
 * Scans all voiceover and texts string values for RMB/HKD amounts and
 * inserts the USD equivalent in `$X (original)` format when a $ equivalent
 * is not already present nearby.
 *
 * Recognised spellings (#1415):
 *   CNY  ¥1200 · ￥1,200 · ¥3.5亿 · ¥1,200万 · 12.4 billion yuan · 67.7B RMB ·
 *        3,500 亿元 · 3500 亿人民币 · 120 万元 · 500 万人民币 · 500 人民币 ·
 *        1,200 元 · ￥ 1,200
 *   HKD  HK$454 · 80B HKD · 2,526 Hong Kong dollars · 2,980 港币/港元
 *
 * Called in the pipeline's Step 0.5 (after scene-data load, before TTS).
 * Rates are resolved once per run by `resolveExchangeRates()` — live quote
 * first, authored fallback constants on any failure — and persisted beside the
 * run artifacts (`currency-rates.json`) so audio-reusing entry points can
 * reproduce the exact numbers the audio was aligned against.
 * The Chinese-number spellings ("三亿五千万") are deliberately out of scope:
 * only Arabic numerals are converted.
 *
 * @module normalize-currency
 */

import { DEFAULT_RATES, resolveExchangeRates, writeRateReport } from "./exchange-rates.mjs";

// ─── Patterns ───

/**
 * Matches ¥<number> patterns, e.g. "¥445" or "¥1,100".
 * Chinese magnitudes and the 元 suffix are handled by the CNY_* patterns below
 * so `¥3.5亿` / `¥1,200万` route through the Chinese-amount parser.
 */
const YEN_PATTERN = /¥\s*([\d,.]+)\s*(billion|million|thousand|K|B|M)?/gi;

/** Matches full-width "￥<number>" patterns, e.g. "￥1,200" or "￥3.5亿" */
const FULLWIDTH_YEN_PATTERN = /￥\s*([\d,.]+)\s*(亿|万)?(?:\s*元)?/g;

/** Matches "<number> (billion|million|thousand) yuan" patterns */
const YUAN_PATTERN = /(\d[\d,.]*)\s*(billion|million|thousand)\s*yuan/gi;

/**
 * Matches bare "<number> yuan" with no magnitude word, e.g. "0.39 yuan".
 * Kept AFTER YUAN_PATTERN so the magnitude form owns its own span; without
 * this pattern the auto-fix silently skipped the most common price-list shape
 * (2026-11-17 DeepSeek pack shipped "0.39 YUAN" untouched).
 */
const YUAN_BARE_PATTERN = /(\d[\d,.]*)\s*yuan\b/gi;

/**
 * Spelled-out amounts, detection only: "five yuan", "thirty nine fen",
 * "one point five yuan". No auto-conversion (a word-number parser is out of
 * scope), so the verify gate fails closed and the author rewrites in USD.
 */
const SPELLED_CNY_PATTERN =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|point)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|point))*\s+(?:yuan|renminbi|fen)\b/gi;

/** Matches "<number> (billion|million|thousand|B|M|K) RMB" patterns */
const RMB_PATTERN = /(\d[\d,.]*)\s*(billion|million|thousand|B|M|K)\s*RMB/gi;

/**
 * Matches optional ¥/￥ prefix + "<number> 亿元 / 亿人民币",
 * e.g. "3,500 亿元", "¥3.5亿", "￥3.5 亿元".
 */
const CNY_YI_PATTERN = /(?:[¥￥]\s*)?(\d[\d,.]*)\s*亿\s*(?:人民币|元(?![素宇旦]))/g;

/** Matches optional ¥/￥ prefix + "<number> 万元 / 万人民币" */
const CNY_WAN_PATTERN = /(?:[¥￥]\s*)?(\d[\d,.]*)\s*万\s*(?:人民币|元(?![素宇旦]))/g;

/** Matches optional ¥/￥ prefix + bare "<number> 人民币" (no 亿/万) */
const CNY_RMB_PATTERN = /(?:[¥￥]\s*)?(\d[\d,.]*)\s*人民币/g;

/** Matches optional ¥/￥ prefix + bare "<number> 元", e.g. "1,200 元" */
const CNY_YUAN_PATTERN = /(?:[¥￥]\s*)?(\d[\d,.]*)\s*元(?![素宇旦])/g;

/** Matches "¥<number>亿/万" without a 元/人民币 suffix, e.g. "¥3.5亿" */
const YEN_CN_MAG_PATTERN = /[¥￥]\s*(\d[\d,.]*)\s*(亿|万)/g;

/** Matches "<number> (亿|万)? 港币/港元" */
const HKD_CN_PATTERN = /(\d[\d,.]*)\s*(亿|万)?\s*港[币元]/g;

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

/**
 * Ordered detection table. Order is priority: longer / more specific forms
 * first, so `500 万人民币` wins over bare `人民币` and `￥1,200 元` over `￥`.
 * Both Step 0.5 and the verify-time advisory consume this single list.
 */
const SPELLING_PATTERNS = [
  { re: CNY_YI_PATTERN, kind: "CNY", amount: (m) => parseChineseAmount(m[1], "亿") },
  { re: CNY_WAN_PATTERN, kind: "CNY", amount: (m) => parseChineseAmount(m[1], "万") },
  { re: CNY_RMB_PATTERN, kind: "CNY", amount: (m) => parseChineseAmount(m[1]) },
  { re: CNY_YUAN_PATTERN, kind: "CNY", amount: (m) => parseChineseAmount(m[1]) },
  {
    re: YEN_CN_MAG_PATTERN,
    kind: "CNY",
    amount: (m) => parseChineseAmount(m[1], m[2]),
  },
  {
    re: HKD_CN_PATTERN,
    kind: "HKD",
    amount: (m) => parseChineseAmount(m[1], m[2]),
  },
  {
    re: FULLWIDTH_YEN_PATTERN,
    kind: "CNY",
    amount: (m) => parseChineseAmount(m[1], m[2]),
  },
  {
    re: YEN_PATTERN,
    kind: "CNY",
    amount: (m) => parseAmount(m[1], m[2]),
    magnitude: (m) => m[2],
  },
  { re: YUAN_PATTERN, kind: "CNY", amount: (m) => parseAmount(m[1], m[2]), magnitude: (m) => m[2] },
  { re: YUAN_BARE_PATTERN, kind: "CNY", amount: (m) => parseAmount(m[1]) },
  { re: RMB_PATTERN, kind: "CNY", amount: (m) => parseAmount(m[1], m[2]), magnitude: (m) => m[2] },
  {
    re: HKD_PATTERN,
    kind: "HKD",
    amount: (m) => parseAmount(m[1], m[2]),
    magnitude: (m) => m[2],
  },
  {
    re: HK_DOLLAR_PREFIX_PATTERN,
    kind: "HKD",
    amount: (m) => parseAmount(m[1], m[2]),
    magnitude: (m) => m[2],
  },
  {
    re: HK_DOLLAR_NAME_PATTERN,
    kind: "HKD",
    amount: (m) => parseAmount(m[1], m[2]),
    magnitude: (m) => m[2],
  },
  {
    re: SPELLED_CNY_PATTERN,
    kind: "CNY",
    amount: () => null,
    fixable: false,
  },
];

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
  if (usdAmount >= 1_000_000_000) return `$${billions} billion`;
  if (usdAmount >= 1_000_000) return `$${Math.round(usdAmount / 1_000_000)} million`;
  // Sub-$10 amounts are per-call prices (0.39 yuan/hour, 5 yuan/1k calls).
  // Rounding those to whole dollars printed "$0", which is worse than no fix.
  if (usdAmount < 10) return `$${usdAmount.toFixed(2)}`;
  return `$${groupDigits(Math.round(usdAmount))}`;
}

/**
 * Check if a $ equivalent already appears near the match position.
 * Looks within 30 characters before the match for a $ amount.
 * @param {string} text - full string
 * @param {number} matchIndex - start index of the RMB match
 * @returns {boolean}
 */
export function hasNearbyUsd(text, matchIndex) {
  const windowStart = Math.max(0, matchIndex - 30);
  const before = text.substring(windowStart, matchIndex);
  return /\$\d/.test(before);
}

/**
 * Find every CNY/HKD amount spelling in a string, in one pass over the
 * original text. Overlapping alternatives (`￥1,200 元` vs bare `元`) collapse
 * to the first (longest) form, so callers never annotate the same span twice.
 *
 * @param {string} text
 * @returns {Array<{start: number, end: number, text: string, kind: "CNY"|"HKD", amount: number, magnitude?: string}>}
 */
export function findCurrencySpellings(text) {
  if (typeof text !== "string") return [];
  const found = [];

  for (const { re, kind, amount, magnitude, fixable = true } of SPELLING_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (found.some((x) => start < x.end && end > x.start)) continue;
      found.push({
        start,
        end,
        text: m[0],
        kind,
        amount: amount(m),
        magnitude: magnitude?.(m),
        fixable,
      });
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/**
 * Normalize a single string: insert USD dual-annotation for RMB/HKD amounts.
 * All matches are detected against the untouched input and replacements are
 * applied right-to-left, so an annotation inserted for one amount can never
 * suppress the amount that follows it.
 * @param {string} str - input string
 * @param {{CNY: number, HKD: number}} rates - USD per unit of local currency
 * @param {{annotated: number}} [stats] - mutation counter for run reporting
 * @returns {string} normalized string
 */
function normalizeString(str, rates, stats) {
  if (typeof str !== "string") return str;

  const matches = findCurrencySpellings(str);
  let out = str;

  for (let i = matches.length - 1; i >= 0; i--) {
    const item = matches[i];
    if (item.fixable === false) continue; // spelled amount: the gate must catch it
    if (hasNearbyUsd(str, item.start)) continue;
    const usdAmount = item.amount * rates[item.kind];
    const usdStr = item.magnitude ? formatUsd(usdAmount, item.magnitude) : formatUsdAuto(usdAmount);
    out = `${out.slice(0, item.start)}${usdStr} (${item.text})${out.slice(item.end)}`;
    if (stats) stats.annotated++;
  }

  return out;
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
 * @param {{CNY: number, HKD: number}} [options.rates] - reuse rates recorded by
 *   the audio-generating run; skips the network lookup
 * @param {string} [options.rateSource] - source label for the reused report
 * @param {string} [options.ratesFile] - write the report beside the run artifacts
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests
 * @param {number} [options.timeoutMs] - network budget for the single lookup
 * @param {() => Date} [options.now] - injectable clock
 * @param {Console|null} [options.logger] - null silences the provenance line
 * @returns {Promise<import("./exchange-rates.mjs").ExchangeRateReport>}
 */
export async function normalizeSceneDataWithLiveRates(scenes, meta = {}, options = {}) {
  const report = options.rates
    ? {
        rates: { ...options.rates },
        source: options.rateSource ?? "run-artifact",
        providerTime: null,
        fetchedAt: new Date().toISOString(),
        fallback: false,
      }
    : await resolveExchangeRates({
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        now: options.now,
      });

  meta.currencyRates = report;
  const stats = { annotated: 0 };
  normalizeSceneData(scenes, meta, { rates: report.rates, stats });
  meta.currencyAnnotation = stats;

  if (options.ratesFile) writeRateReport(options.ratesFile, report);

  const logger = options.logger === null ? null : (options.logger ?? console);
  if (logger) {
    const ratesText = `CNY ${report.rates.CNY.toFixed(4)} / HKD ${report.rates.HKD.toFixed(4)}`;
    if (report.fallback) {
      logger.warn(
        `💱 Exchange rate fallback (${report.error}): ${ratesText} @ ${report.fetchedAt} — ${stats.annotated} amount(s) annotated`,
      );
    } else {
      const reuse = String(report.source).startsWith("run-artifact");
      const providerTime = report.providerTime ? `, quote ${report.providerTime}` : "";
      logger.log(
        `💱 Exchange rates ${reuse ? "reused" : "live"} (${report.source}${providerTime}): ${ratesText} @ ${report.fetchedAt} — ${stats.annotated} amount(s) annotated`,
      );
    }
  }

  return report;
}
