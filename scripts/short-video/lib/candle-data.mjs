/**
 * Baked candle series loader (#1405).
 *
 * The renderer must never fetch a quote: `bake-quotes.mjs` writes the checked
 * series into `content/<pack>/data/<symbol>-daily.json`, and a candle scene
 * reads it here at import time. Because scene-data.mjs is imported by every
 * Node consumer (preflight, render, stills, experiments) and never bundled into
 * Remotion, this is the one seam where the rows enter the pipeline — the props
 * JSON that Remotion receives carries plain numbers, and Chrome never sees a
 * path or a network call.
 *
 * A missing file is NOT a fatal import error: the first bake happens after the
 * scene declares its window, and throwing on import would make `bake:quotes`
 * itself unable to read the pack it is about to fill. The loader returns an
 * empty series instead, which preflight rejects through the info grammar's
 * `data.length` floor with the fix "run npm run bake:quotes". Silent empty
 * charts cannot reach a render because that gate is structural, not advisory.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Read a baked series for a scene.
 *
 * @param {URL|string} dataFileUrl - resolved with `new URL("./data/x.json", import.meta.url)`
 * @param {{symbol?: string}} [options] - when given, the file's symbol must match
 * @returns {{rows: Array<object>, range: {from: string, to: string}|null,
 *            fetchedAt: string|null, sources: Array<object>, missing: boolean,
 *            error: string|null}}
 */
export function readBakedCandleSeries(dataFileUrl, options = {}) {
  const path = dataFileUrl instanceof URL ? fileURLToPath(dataFileUrl) : String(dataFileUrl);
  const missing = {
    rows: [],
    range: null,
    fetchedAt: null,
    sources: [],
    missing: true,
    error: null,
  };
  if (!existsSync(path)) return missing;
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { ...missing, error: `baked candle file is not valid JSON: ${error.message}` };
  }
  if (!payload || !Array.isArray(payload.rows)) {
    return { ...missing, error: "baked candle file has no rows array" };
  }
  if (options.symbol && payload.symbol !== options.symbol) {
    return {
      ...missing,
      error: `baked candle file is for ${payload.symbol}, scene declares ${options.symbol}`,
    };
  }
  return {
    rows: payload.rows,
    range: payload.range ?? null,
    fetchedAt: payload.fetchedAt ?? null,
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    missing: false,
    error: null,
  };
}
