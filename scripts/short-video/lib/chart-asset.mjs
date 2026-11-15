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
 * "6M", interval?: "1D", theme?: "light" }` in scene-data. `entity` must
 * resolve through the symbol map — free-text symbols are deliberately not
 * accepted from scene-data so one typo cannot put the wrong company's chart
 * on screen.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CHART_IMG_V2_URL = "https://api.chart-img.com/v2/tradingview/advanced-chart";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 600;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

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

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Resolve free entity text against the curated map. Exact key first, then
 * aliases: latin aliases match on word boundaries (so "hsi" does not fire
 * inside "history"), CJK aliases match by substring.
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
  for (const entity of map.entities) {
    for (const alias of entity.aliases || []) {
      const lower = alias.toLowerCase();
      if (/[\u4e00-\u9fff]/.test(lower)) {
        if (text.includes(lower)) return entity;
      } else if (new RegExp(`\\b${escapeRegExp(lower)}\\b`).test(text)) {
        return entity;
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
 *          apiKey: string}} opts
 * @returns {Promise<object>} asset entry (path absolute; normalized later)
 * @throws when the API returns a non-200 or a non-PNG body
 */
export async function fetchChartAsset({ entity, sceneId, chart = {}, assetsDir, apiKey }) {
  const body = {
    symbol: entity.symbol,
    interval: chart.interval || "1D",
    range: chart.range || "6M",
    theme: chart.theme || "light",
  };
  const res = await fetch(`${CHART_IMG_V2_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 120);
    throw new Error(`chart-img ${res.status} for ${entity.symbol}: ${detail}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 4).equals(PNG_MAGIC)) {
    throw new Error(`chart-img returned a non-PNG body for ${entity.symbol}`);
  }
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
  const destPath = join(assetsDir, `chart-img-${entity.key}-${body.interval}-${body.range}.png`);
  writeFileSync(destPath, buf);

  return {
    title: `Chart: ${entity.label}`,
    url: `${CHART_IMG_V2_URL}#${entity.symbol}`,
    source: "chart-img",
    type: "image",
    path: destPath,
    status: "downloaded",
    score: 100,
    searchKeyword: `chart ${entity.key}`,
    claimSceneId: sceneId,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
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
 * @param {Array<object>} scenes - raw scene-data scenes
 * @param {{assetsDir: string, apiKey: string, mapPath: string,
 *          logger?: console}} opts
 * @returns {Promise<{assets: Array<object>, failures: Array<{sceneId: number, error: string}>}>}
 */
export async function buildChartAssets(scenes, { assetsDir, apiKey, mapPath, logger = console }) {
  const map = loadChartSymbolMap(mapPath);
  const assets = [];
  const failures = [];
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
      assets.push(await fetchChartAsset({ entity, sceneId: scene.id, chart, assetsDir, apiKey }));
      logger.log(`  📈 chart-img: ${entity.label} (${entity.symbol}) → scene ${scene.id}`);
    } catch (err) {
      failures.push({ sceneId: scene.id, error: err.message });
      logger.warn(`  ⚠️  chart-img scene ${scene.id} (${entity.symbol}): ${err.message}`);
    }
  }
  return { assets, failures };
}
