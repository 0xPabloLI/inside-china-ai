/**
 * Chart formatting helpers. The grammar module is the source of truth for
 * number formatting, highlighting and sort order; these wrappers only add the
 * SVG-facing defaults.
 */
import {
  formatChartValue,
  isHighlighted,
  normalizeInfoSpec,
  sortData,
} from "../../../../lib/info-grammar.mjs";
import type { InfoDatum, InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";

export { formatChartValue, isHighlighted, normalizeInfoSpec, sortData };

export function chartData(info: InfoSpec): InfoDatum[] {
  return sortData(info).filter((datum: unknown): datum is InfoDatum => {
    if (!datum || typeof datum !== "object") return false;
    const candidate = datum as InfoDatum;
    return typeof candidate.label === "string" && Number.isFinite(candidate.value);
  });
}

export function chartValues(data: InfoDatum[]): number[] {
  const values: number[] = [];
  for (const datum of data) {
    if (Number.isFinite(datum.value)) values.push(datum.value);
    if (Number.isFinite(datum.value2)) values.push(datum.value2 as number);
  }
  return values;
}

export function domainFor(data: InfoDatum[], { includeZero = true, zeroFloor = false } = {}) {
  const values = chartValues(data);
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (includeZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) max = min + 1;
  const pad = (max - min) * 0.08;
  // Bar/column charts anchor their baseline at the edge of the plot. Padding
  // below a zero baseline would draw a phantom negative region and shrink
  // every bar by 8% — the exact opposite of the FT zero-baseline rule.
  return { min: zeroFloor ? min : min - pad, max: max + pad };
}

export function textFill(highlight: boolean): string {
  return highlight ? CHART.colors.amber : CHART.colors.text;
}
