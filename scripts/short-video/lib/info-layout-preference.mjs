/**
 * Info-layout preference, extracted from the #1406 blind review.
 *
 * The blind review compared six pairs of legacy `chart-card` stills against
 * native `chart` stills (seed 20261116). The single rater preferred the native
 * chart in five pairs, the legacy card in zero, and called one pair a tie.
 * Clarity was the largest dimension gain.
 *
 * This is a descriptive result: six pairs and one rater are below the analysis
 * floor (8 pairs / 2 raters), so it is a design prior, not a statistical
 * verdict. It must never override the structural `checkInfoSpec` contract.
 *
 * Pure Node: no fs, no Remotion. `auditInfoLayoutPreference` is an advisory
 * runner, so a future pack still has to justify a real chart-card screenshot
 * but the gate never blocks a legal render.
 */

import { allowedChartsFor } from "./info-grammar.mjs";

export const INFO_LAYOUT_REVIEW = Object.freeze({
  experimentId: "info-layout-v2",
  capturedAt: "2026-11-17T15:44:37.668Z",
  raters: 1,
  pairs: 6,
  variants: Object.freeze({
    A: "chart-card legacy",
    B: "native chart",
  }),
  preference: Object.freeze({ native: 5, legacy: 0, tie: 1 }),
  dimensions: Object.freeze({
    clarity: Object.freeze({ native: 6.67, legacy: 5.5, deltaNativeMinusLegacy: 1.17 }),
    credibility: Object.freeze({ native: 6.67, legacy: 6.0, deltaNativeMinusLegacy: 0.67 }),
    memorability: Object.freeze({ native: 6.5, legacy: 5.83, deltaNativeMinusLegacy: 0.67 }),
    hierarchy: Object.freeze({ native: 6.5, legacy: 6.17, deltaNativeMinusLegacy: 0.33 }),
  }),
  confidence: "descriptive",
});

/**
 * The preferred data-scene layout for a known data relationship.
 *
 * `chart-card` is not a fallback for "we did not feel like building a chart":
 * it stays the right choice when the relationship has no native chart shape,
 * or when the scene carries a real screenshot / custom annotation that cannot
 * be expressed as `info.data`.
 *
 * @param {string} relationship `magnitude` / `ranking` / `change-over-time` /
 *   `part-to-whole` / `deviation` / `distribution` / `correlation` / `flow` /
 *   `spatial`
 * @param {{ hasStructuredData?: boolean }} [opts]
 * @returns {"chart"|"chart-card"}
 */
export function preferredDataLayout(relationship, opts = {}) {
  if (opts.hasStructuredData === false) return "chart-card";
  const charts = allowedChartsFor(relationship);
  return charts.length > 0 ? "chart" : "chart-card";
}

/**
 * Advisory runner: report how the pack's data scenes line up with the blind
 * review's preference. Never returns `fail`; `runAllSceneDataChecks` turns this
 * into the editorial/advisory bucket.
 *
 * @param {Array<{id?: string, visualType?: string, layout?: string, info?: object}>} scenes
 * @returns {Array<{level: "pass"|"warn", category: string, check: string, detail: string, fix?: string}>}
 */
export function auditInfoLayoutPreference(scenes) {
  const dataScenes = (scenes || []).filter(
    (scene) =>
      scene?.visualType === "data" &&
      (scene.layout === "chart" || scene.layout === "chart-card") &&
      // A `chart` pin is an explicit real-market screenshot (chart-img or the
      // HKEX candle path); the blind review does not claim native charts can
      // replace it, so it is outside this preference.
      !scene.chart,
  );
  if (dataScenes.length === 0) return [];

  const native = dataScenes.filter((scene) => scene.layout === "chart");
  const legacy = dataScenes.filter((scene) => scene.layout === "chart-card");
  const result = {
    category: "Data",
    check: "Info layout preference",
  };

  if (legacy.length === 0) {
    return [
      {
        ...result,
        level: "pass",
        detail: `Native chart on ${native.length}/${dataScenes.length} data scene(s); blind review preferred native 5:0:1 (n=6, one rater, descriptive).`,
      },
    ];
  }

  const ids = legacy.map((scene) => scene.id ?? "(unnamed)").join(", ");
  return [
    {
      ...result,
      level: "warn",
      detail: `chart-card on ${legacy.length}/${dataScenes.length} data scene(s): ${ids}. Blind review preferred native 5:0:1 (n=6, one rater, descriptive); use layout "chart" + scene.info when the numbers are known. Keep chart-card for a real chart screenshot or a relationship native charts cannot draw.`,
      fix: 'If the scene has 2-12 known values and a native-supported relationship, migrate to `visualType: "data"` + `layout: "chart"` + `scene.info`; otherwise record why the chart-card screenshot is required.',
    },
  ];
}
