/**
 * Preflight contract for a chart-img pin (`scene.chart`, #1353/#1378/#1398).
 *
 * The pin is a different feature from `scene.info`: it buys a real K-line PNG
 * for a price/index claim. This gate validates it before sourcing, so a bad
 * entity or a fourth annotation is a preflight failure instead of an exception
 * after research spend.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChartSymbolMap, validateChartPin } from "./chart-asset.mjs";

const DEFAULT_MAP_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "config",
  "chart-symbols.json",
);

/**
 * @param {object[]} scenes
 * @param {{mapPath?: string, map?: object}} [opts]
 * @returns {Array<{level: string, category: string, check: string, detail?: string, fix?: string}>}
 */
export function checkChartPinContract(scenes, opts = {}) {
  const rows = Array.isArray(scenes) ? scenes : [];
  const chartScenes = rows.filter(
    (scene) => scene?.chart && typeof scene.chart === "object" && !Array.isArray(scene.chart),
  );
  if (chartScenes.length === 0) {
    return [
      {
        level: "pass",
        category: "Structure",
        check: "Chart pin contract",
        detail: "no chart-img pins in this pack",
      },
    ];
  }

  let map = opts.map ?? null;
  if (!map) {
    try {
      map = loadChartSymbolMap(opts.mapPath ?? DEFAULT_MAP_PATH);
    } catch (error) {
      return [
        {
          level: "fail",
          category: "Structure",
          check: "Chart pin contract",
          detail: error.message,
          fix: "Restore config/chart-symbols.json before sourcing chart assets",
        },
      ];
    }
  }

  const results = [];
  for (const scene of chartScenes) {
    const verdict = validateChartPin(scene.chart, map);
    if (verdict.ok) {
      results.push({
        level: "pass",
        category: "Structure",
        check: `Scene ${scene.id} chart pin`,
        detail: `entity "${scene.chart.entity}" resolves; annotations/drawings valid`,
      });
      continue;
    }
    for (const error of verdict.errors) {
      results.push({
        level: "fail",
        category: "Structure",
        check: `Scene ${scene.id} chart pin`,
        detail: error,
        fix: "Fix scene.chart in scene-data; the Step 1.5 chart fetch will fail on the same input",
      });
    }
  }
  return results;
}
