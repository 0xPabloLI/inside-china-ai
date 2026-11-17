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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The curated entity → EXCHANGE:SYMBOL map that chart pins already use. */
const SYMBOL_MAP_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "config",
  "chart-symbols.json",
);

/**
 * Resolve a scene's `info.entity` to the full symbol the bake endpoints need.
 *
 * The map is the same file chart pins resolve through, so a pack names one
 * entity and never hand-writes a ticker twice (`chart-symbols.json` says so
 * itself: "Add entities here, never hardcode symbols in code").
 *
 * @param {string} entity - map key or alias (case-insensitive)
 * @returns {string} `EXCHANGE:SYMBOL`
 * @throws when the entity is not in the map
 */
export function resolveEntitySymbol(entity) {
  const wanted = String(entity ?? "")
    .trim()
    .toLowerCase();
  const map = JSON.parse(readFileSync(SYMBOL_MAP_PATH, "utf8"));
  const hit = (map.entities ?? []).find(
    (entry) =>
      entry.key?.toLowerCase() === wanted ||
      (entry.aliases ?? []).some((alias) => alias.toLowerCase() === wanted),
  );
  if (!hit) {
    throw new Error(
      `candle entity "${entity}" not in config/chart-symbols.json — add it there rather than hardcoding a symbol`,
    );
  }
  return hit.symbol;
}

/**
 * Read a baked series for a scene.
 *
 * @param {URL|string} dataFileUrl - resolved with `new URL("./data/x.json", import.meta.url)`
 * @param {{symbol?: string, entity?: string}} [options] - `symbol` (or an
 *        `entity` resolved through the symbol map) must match the file's symbol
 * @returns {{rows: Array<object>}} - empty rows mean "not baked yet", which the
 *          info grammar's data floor turns into the `bake:quotes` fix
 */
export function readBakedCandleSeries(dataFileUrl, options = {}) {
  const path = dataFileUrl instanceof URL ? fileURLToPath(dataFileUrl) : String(dataFileUrl);
  if (!existsSync(path)) return { rows: [] };
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`baked candle file ${path} is not valid JSON: ${error.message}`);
  }
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error(`baked candle file ${path} has no rows array`);
  }
  const declared = options.symbol
    ? options.symbol
    : options.entity
      ? resolveEntitySymbol(options.entity)
      : "";
  if (declared && payload.symbol !== declared) {
    // A mismatch must not render as "not enough points": say which file and
    // which instrument disagreed, then let the empty series block preflight.
    console.warn(
      `[candle] ${path} holds ${payload.symbol}, scene declares ${declared} — re-bake the right instrument`,
    );
    return { rows: [] };
  }
  return { rows: payload.rows };
}
