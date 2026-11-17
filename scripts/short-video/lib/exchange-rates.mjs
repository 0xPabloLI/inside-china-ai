/**
 * Exchange-rate resolution for the currency dual-annotation step (Step 0.5).
 *
 * One fetch per pipeline run converts USD-based quotes into the
 * "USD per unit of local currency" factors `normalize-currency.mjs` needs.
 * The provider is deliberately not a build-time dependency: a timeout, an
 * HTTP error or a malformed body all degrade to the authored fallback
 * constants and never abort a render (#1415).
 *
 * @module exchange-rates
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Fallback rates (USD per unit), used when the live fetch fails. */
export const DEFAULT_RATES = Object.freeze({ CNY: 0.14, HKD: 0.13 });

/** Provider identity written into `meta.currencyRates.source`. */
export const RATE_PROVIDER = "open.er-api.com";

/** USD-based quote endpoint (free, keyless; returns units per USD). */
const RATE_ENDPOINT = "https://open.er-api.com/v6/latest/USD";

/** Default network budget for the single rate lookup. */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @typedef {object} ExchangeRateReport
 * @property {{CNY: number, HKD: number}} rates - USD per unit of local currency
 * @property {string} source - provider name, or "fallback"
 * @property {string|null} providerTime - upstream quote timestamp, when known
 * @property {string} fetchedAt - ISO timestamp of this resolution (local clock)
 * @property {boolean} fallback - true when the constants were used
 * @property {string} [error] - why the live fetch was abandoned
 */

/**
 * Resolve CNY/HKD → USD rates once per run.
 *
 * Never throws: a failed lookup returns the fallback constants with
 * `fallback: true` and an `error` string for the caller to log.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests
 * @param {number} [options.timeoutMs] - network budget for the single lookup
 * @param {() => Date} [options.now] - injectable clock
 * @returns {Promise<ExchangeRateReport>}
 */
export async function resolveExchangeRates({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  const fetchedAt = now().toISOString();
  try {
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch is unavailable in this runtime");
    }
    const res = await fetchImpl(RATE_ENDPOINT, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${RATE_PROVIDER}`);

    const payload = await res.json();
    if (payload?.result && payload.result !== "success") {
      const kind = payload["error-type"] ? ` (${payload["error-type"]})` : "";
      throw new Error(`provider returned result "${payload.result}"${kind}`);
    }

    // The provider quotes units per USD; the pipeline needs USD per unit.
    const cnyPerUsd = Number(payload?.rates?.CNY);
    const hkdPerUsd = Number(payload?.rates?.HKD);
    if (!Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) {
      throw new Error("provider payload has no usable CNY rate");
    }
    if (!Number.isFinite(hkdPerUsd) || hkdPerUsd <= 0) {
      throw new Error("provider payload has no usable HKD rate");
    }

    return {
      rates: { CNY: 1 / cnyPerUsd, HKD: 1 / hkdPerUsd },
      source: RATE_PROVIDER,
      providerTime: payload?.time_last_update_utc ?? null,
      fetchedAt,
      fallback: false,
    };
  } catch (e) {
    const error =
      e?.name === "TimeoutError" ? `timed out after ${timeoutMs}ms` : e?.message || String(e);
    return {
      rates: { ...DEFAULT_RATES },
      source: "fallback",
      providerTime: null,
      fetchedAt,
      fallback: true,
      error,
    };
  }
}

/**
 * Persist the rate report beside the run artifacts so audio-reusing entry
 * points can reproduce the exact rates the audio was generated with.
 * Best-effort: a read-only output directory must not abort the run.
 *
 * @param {string} filePath - e.g. `output/<id>/currency-rates.json`
 * @param {ExchangeRateReport} report
 * @returns {boolean} whether the write succeeded
 */
export function writeRateReport(filePath, report) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Read back a report written by `writeRateReport`.
 *
 * @param {string} filePath
 * @returns {ExchangeRateReport|null} null when absent or malformed
 */
export function readRateReport(filePath) {
  try {
    const report = JSON.parse(readFileSync(filePath, "utf-8"));
    const cny = Number(report?.rates?.CNY);
    const hkd = Number(report?.rates?.HKD);
    if (!Number.isFinite(cny) || cny <= 0 || !Number.isFinite(hkd) || hkd <= 0) return null;
    return report;
  } catch {
    return null;
  }
}
