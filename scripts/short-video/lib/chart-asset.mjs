/**
 * CHART-IMG chart assets (#1353 follow-up, 2026-11-15 user verdict).
 *
 * This content line narrates price/index claims ("Zhipu peaked at 2,980
 * Hong Kong dollars", "恒生科技 -25%") whose standard visual is a candlestick
 * chart of the named instrument. Web-image sourcing cannot produce that
 * reliably — the 2026-11-15 zhipu run rejected 27/27 candidates and fell
 * back to AI-generated B-roll that had nothing to do with the claim. A
 * parameterized chart-screenshot service (chart-img.com, TradingView data)
 * is deterministic: entity → symbol via the curated map
 * (`config/chart-symbols.json`), fetch → PNG. There is nothing for the VLM
 * relevance gate to judge, so these assets carry `chartPin: true` and are
 * admitted by `relevance-verdict.admissionSource` with source "chart-pin".
 *
 * Free-tier (BASIC) facts verified live on 2026-11-15:
 *   - The v2 POST endpoint reads its parameters from the JSON body, which
 *     bypasses the GET "Max Parameter 3" limit — symbol/interval/range/theme
 *     are all honored. Resolution stays 800×600 and the CHART-IMG.COM
 *     watermark is baked in (it doubles as the attribution).
 *   - Auth: pass the key as the `key` query param (the x-chart-img-api-key
 *     header returns 403 on free tier).
 *   - HKEX individual stocks: v1 ❌ / v2 Delayed ✔ (works, ~15min lag —
 *     fine for a "6-month trend" narrative, not for last-price claims).
 *   - Indices live under `HSI:*` (Hang Seng Indexes provider), not `HKEX:*`.
 *   - NEVER use bare numeric symbols: bare `2513` resolves to an unrelated
 *     FOREX.com CFD. Always the full `EXCHANGE:SYMBOL` form.
 *
 * Scene contract: a scene opts in with `chart: { entity: "zhipu", range?:
 * "6M" | { from, to }, interval?: "1D", theme?: "dark", annotations?: [...] }`
 * in scene-data.
 * `theme` defaults to `dark` (a light K-line reads as a bright rectangle on the
 * 0a0a14 video canvas) and, like `interval`/`range`, is resolved through the
 * map's `defaults` — see CHART_PARAM_FALLBACKS for the last-resort values and
 * why the map stays authoritative.
 * `range` passes through to chart-img verbatim — a string selects a preset
 * window, an object `{ from, to }` (ISO 8601) pins an exact window (e.g.
 * peak-to-now, verified live 2026-11-15, ≤1000 bars per chart-img v3 notes).
 * `annotations` becomes the request's `drawings` array verbatim (#1378).
 * chart-img selects the shape by `name` — there is NO `type` field — and reads
 * the coordinates from `input`. Three shapes verified live 2026-11-15:
 *   - `{ name: "Horizontal Line", input: { price } }`
 *   - `{ name: "Trend Line", input: { startDatetime, startPrice,
 *       endDatetime, endPrice } }` (the `Datetime` suffix is required —
 *       `startTime`/`points` 422s and echoes the real keys back)
 *   - `{ name: "Arrow Mark Down", input: { datetime, price } }`
 * `override` / `zOrder` ride along untouched. BASIC caps studies+drawings at
 * 3 per request, so a fourth annotation is rejected before the call rather
 * than as an opaque 400.
 * `entity` must resolve through the symbol map — free-text symbols are
 * deliberately not accepted from scene-data so one typo cannot put the wrong
 * company's chart on screen.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PNG_SIGNATURE } from "./media-integrity.mjs";

export const CHART_IMG_V2_URL = "https://api.chart-img.com/v2/tradingview/advanced-chart";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 600;
/** Sibling network calls in this pipeline all bound a 30s timeout. */
const CHART_FETCH_TIMEOUT_MS = 30000;

/**
 * Exchanges whose v2 data is Delayed per chart-img's availability table
 * (doc.chart-img.com, Stocks Asia/Pacific, checked 2026-11-15). The asset
 * entry records this so the credit line can say "delayed quote" — a stale
 * price on screen must not read as live data. Instrument-level exceptions
 * are visible in the rendered chart header ("(Delayed)") regardless.
 */
const DELAYED_EXCHANGES = new Set(["HKEX"]);

/**
 * Load and validate the symbol map. A malformed map is a config bug, not a
 * runtime condition — throw so the caller can report it loudly.
 *
 * @param {string} mapPath - absolute path to config/chart-symbols.json
 * @returns {{version: string, defaults: object, entities: Array<object>}}
 */
export function loadChartSymbolMap(mapPath) {
  if (!existsSync(mapPath)) {
    throw new Error(`chart symbol map not found: ${mapPath}`);
  }
  const raw = JSON.parse(readFileSync(mapPath, "utf8"));
  if (!Array.isArray(raw.entities)) {
    throw new Error(`chart symbol map malformed (missing entities array): ${mapPath}`);
  }
  for (const entity of raw.entities) {
    if (typeof entity.key !== "string" || typeof entity.symbol !== "string") {
      throw new Error(`chart symbol map entity missing key/symbol: ${JSON.stringify(entity)}`);
    }
    if (!/^[A-Z0-9_]+:[A-Z0-9._!]+$/.test(entity.symbol)) {
      throw new Error(
        `chart symbol "${entity.symbol}" is not the full EXCHANGE:SYMBOL form (bare symbols ` +
          `resolve to arbitrary instruments — see module docblock): entity ${entity.key}`,
      );
    }
  }
  return raw;
}

/**
 * Last-resort chart parameters, used only when `config/chart-symbols.json`
 * omits a key from its own `defaults` block (the map is the declared single
 * source, and a drift test in `__tests__/chart-asset.test.mjs` pins these to
 * it).
 *
 * They used to be spelled inline at both resolution sites, which is how the
 * code kept claiming `"light"` after the map flipped to `"dark"` — a second
 * copy of a default is a second chance to disagree.
 */
export const CHART_PARAM_FALLBACKS = Object.freeze({
  interval: "1D",
  range: "6M",
  theme: "dark",
});

/**
 * BASIC-plan parameter cap: `studies` + `drawings` per request (chart-img docs,
 * Parameter Limit table, checked 2026-11-15). Only drawings are wired today,
 * so this is the whole drawings budget; exceeding it is a hard 400 upstream.
 */
export const CHART_DRAWINGS_LIMIT = 3;

/**
 * The request parameters for one scene's chart pin: the scene's own values
 * first, then the curated map's `defaults`, then {@link CHART_PARAM_FALLBACKS}.
 *
 * `drawings` is present only when the scene declared `annotations` — an empty
 * array is a different request and would drift every existing scene's body.
 *
 * @param {{interval?: string, range?: string|object, theme?: string,
 *          annotations?: Array<object>}} chart
 * @param {{interval?: string, range?: string, theme?: string}} [defaults]
 * @returns {{interval: string, range: string|object, theme: string,
 *            drawings?: Array<object>}}
 * @throws when `chart.annotations` is malformed or over the BASIC budget
 */
export function resolveChartParams(chart = {}, defaults = {}) {
  const params = {
    interval: chart.interval || defaults.interval || CHART_PARAM_FALLBACKS.interval,
    range: chart.range || defaults.range || CHART_PARAM_FALLBACKS.range,
    theme: chart.theme || defaults.theme || CHART_PARAM_FALLBACKS.theme,
  };
  const drawings = resolveChartDrawings(chart);
  if (drawings.length > 0) params.drawings = drawings;
  return params;
}

/**
 * Validate `chart.annotations` and hand it back as the request's `drawings`.
 * Loud on every failure mode: a scene that declares annotations and gets a
 * chart without them is the silent-wrong-output case this module exists to
 * prevent, and a dropped declaration is worse than a failed fetch (which falls
 * back to web sourcing).
 *
 * Entries are NOT reshaped — chart-img's own `{ name, input, override?, zOrder? }`
 * shape is the scene contract, so what a writer reads in the docs is what goes
 * over the wire.
 *
 * @param {{annotations?: Array<object>}} chart
 * @returns {Array<object>} empty when the scene declared none
 */
export function resolveChartDrawings(chart = {}) {
  const annotations = chart.annotations;
  if (annotations === undefined || annotations === null) return [];
  if (!Array.isArray(annotations)) {
    throw new Error(
      `chart.annotations must be an array of { name, input } drawings (got ${typeof annotations})`,
    );
  }
  if (annotations.length > CHART_DRAWINGS_LIMIT) {
    throw new Error(
      `chart-img BASIC allows at most ${CHART_DRAWINGS_LIMIT} drawings per request ` +
        `(studies+drawings share the cap); scene declared ${annotations.length}`,
    );
  }
  annotations.forEach((entry, index) => {
    const where = `chart.annotations[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${where} must be an object shaped { name, input }`);
    }
    if (typeof entry.name !== "string" || entry.name.trim() === "") {
      throw new Error(
        `${where}.name must be a non-empty string — the drawing kind, e.g. "Horizontal Line" ` +
          `(chart-img has no \`type\` field)`,
      );
    }
    if (!entry.input || typeof entry.input !== "object" || Array.isArray(entry.input)) {
      throw new Error(`${where}.input must be an object carrying the drawing coordinates`);
    }
  });
  return annotations;
}

/**
 * Resolve free entity text against the curated map. Exact key first, then
 * aliases: latin aliases match on word boundaries (so "hsi" does not fire
 * inside "history"), CJK aliases match by substring. Boundary checks are
 * manual (no RegExp construction from map data — the curated map is trusted,
 * but Semgrep flags dynamic RegExp and a static check costs nothing).
 *
 * @param {string} entityText - scene.chart.entity (writer-curated)
 * @param {{entities: Array<object>}} map
 * @returns {{key: string, symbol: string, label: string}|null}
 */
export function resolveChartEntity(entityText, map) {
  const text = typeof entityText === "string" ? entityText.trim().toLowerCase() : "";
  if (!text) return null;
  for (const entity of map.entities) {
    if (entity.key.toLowerCase() === text) return entity;
  }
  const isWordChar = (ch) => /[a-z0-9]/.test(ch);
  for (const entity of map.entities) {
    for (const alias of entity.aliases || []) {
      const lower = alias.toLowerCase();
      if (/[^\x00-\x7f]/.test(lower)) {
        if (text.includes(lower)) return entity;
        continue;
      }
      let at = text.indexOf(lower);
      while (at !== -1) {
        const before = at > 0 ? text[at - 1] : " ";
        const after = at + lower.length < text.length ? text[at + lower.length] : " ";
        if (!isWordChar(before) && !isWordChar(after)) return entity;
        at = text.indexOf(lower, at + 1);
      }
    }
  }
  return null;
}

/**
 * Fetch one chart PNG from chart-img v2 and build an asset entry shaped like
 * the other sourcer entries (so downstream analysis/report/attribution code
 * needs no special cases beyond the documented ones).
 *
 * @param {{entity: object, sceneId: number, chart?: object, assetsDir: string,
 *          apiKey: string, defaults?: object}} opts
 * @returns {Promise<object>} asset entry (path absolute; normalized later)
 * @throws when the API returns a non-200 or a non-PNG body
 */
export async function fetchChartAsset({
  entity,
  sceneId,
  chart = {},
  assetsDir,
  apiKey,
  defaults = {},
}) {
  const body = {
    symbol: entity.symbol,
    ...resolveChartParams(chart, defaults),
  };
  const buf = await fetchChartPng({ entity, apiKey, body });
  const destPath = join(assetsDir, chartFileName(entity, sceneId, body));
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
  writeFileSync(destPath, buf);
  return chartEntry({ entity, sceneId, body, path: destPath });
}

/**
 * POST the v2 request and return the raw PNG buffer. Loud on non-200 and on
 * non-PNG bodies (error JSON can hide behind a 200).
 */
async function fetchChartPng({ entity, apiKey, body }) {
  const res = await fetch(`${CHART_IMG_V2_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CHART_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 120);
    throw new Error(`chart-img ${res.status} for ${entity.symbol}: ${detail}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`chart-img returned a non-PNG body for ${entity.symbol}`);
  }
  return buf;
}

/** Range may be a preset string or a {from,to} object — keep filenames sane. */
function rangeSlug(range) {
  if (typeof range === "string") return range;
  return `custom-${Buffer.from(JSON.stringify(range ?? {}))
    .toString("base64url")
    .slice(0, 8)}`;
}

function chartFileName(entity, sceneId, body) {
  return `chart-img-${entity.key}-s${sceneId}-${body.interval}-${rangeSlug(body.range)}${drawingsSlug(body.drawings)}.png`;
}

/**
 * Annotations change the pixels, so they must change the filename too: two
 * scenes on the same entity/range with different drawings would otherwise
 * write the same path and the second PNG would silently clobber the first.
 */
function drawingsSlug(drawings) {
  if (!Array.isArray(drawings) || drawings.length === 0) return "";
  const digest = createHash("sha256").update(JSON.stringify(drawings)).digest("hex");
  return `-a${digest.slice(0, 8)}`;
}

function chartEntry({ entity, sceneId, body, path }) {
  return {
    title: `Chart: ${entity.label}`,
    url: `${CHART_IMG_V2_URL}#${entity.symbol}`,
    source: "chart-img",
    type: "image",
    path,
    status: "downloaded",
    score: 100,
    searchKeyword: `chart ${entity.key}`,
    claimSceneId: sceneId,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    contentKind: "chart",
    // Deterministic asset — admitted by relevance-verdict "chart-pin", never
    // VLM-scored (see analyzeAssets exclusion in asset-sourcer main()).
    chartPin: true,
    chart: {
      ...body,
      label: entity.label,
      delayed: DELAYED_EXCHANGES.has(entity.exchange ?? entity.symbol.split(":")[0]),
    },
  };
}

/**
 * Fetch chart assets for every scene that declares one. Per-scene isolation:
 * one scene's fetch failure must not take down the others' — failures are
 * returned alongside successes so the caller logs and falls through to web
 * sourcing for the failed scenes.
 *
 * Identical entity+params declarations are fetched ONCE and the PNG is
 * re-used per scene (per-scene file copies keep asset paths distinct, so the
 * assignment seam's duplicate-path rule never silently drops the second
 * scene, and the shared 50/day free-tier quota is not burned twice).
 *
 * @param {Array<object>} scenes - raw scene-data scenes
 * @param {{assetsDir: string, apiKey: string, mapPath: string,
 *          logger?: console}} opts
 * @returns {Promise<{assets: Array<object>, failures: Array<{sceneId: number, error: string}>}>}
 */
export async function buildChartAssets(scenes, { assetsDir, apiKey, mapPath, logger = console }) {
  const map = loadChartSymbolMap(mapPath);
  const defaults = map.defaults && typeof map.defaults === "object" ? map.defaults : {};
  const assets = [];
  const failures = [];
  const fetchedByParams = new Map();
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const chart = scene?.chart;
    if (!chart || typeof chart !== "object") continue;
    const entity = resolveChartEntity(chart.entity, map);
    if (!entity) {
      failures.push({
        sceneId: scene.id,
        error: `chart entity "${chart.entity}" not in symbol map (add it to config/chart-symbols.json)`,
      });
      continue;
    }
    try {
      // Resolved inside the try: malformed annotations are this scene's
      // failure and must fall through to web sourcing, not abort the run.
      const params = resolveChartParams(chart, defaults);
      const paramsKey = JSON.stringify([
        entity.key,
        params.interval,
        params.range,
        params.theme,
        // Different drawings are different pixels — never share a fetch.
        params.drawings ?? null,
      ]);
      let entry = fetchedByParams.get(paramsKey);
      let reused = false;
      if (!entry) {
        entry = await fetchChartAsset({
          entity,
          sceneId: scene.id,
          chart,
          assetsDir,
          apiKey,
          defaults,
        });
        fetchedByParams.set(paramsKey, entry);
      } else {
        const copiedPath = join(assetsDir, chartFileName(entity, scene.id, params));
        copyFileSync(entry.path, copiedPath);
        entry = { ...entry, path: copiedPath, claimSceneId: scene.id };
        reused = true;
      }
      assets.push(entry);
      logger.log(
        `  📈 chart-img: ${entity.label} (${entity.symbol}) → scene ${scene.id}${reused ? " (shared fetch)" : ""}`,
      );
    } catch (err) {
      failures.push({ sceneId: scene.id, error: err.message });
      logger.warn(`  ⚠️  chart-img scene ${scene.id} (${entity.symbol}): ${err.message}`);
    }
  }
  return { assets, failures };
}
