/**
 * Chart tokens (#1398). One palette and one type scale for every native chart,
 * so a bar and a line never disagree about the size of a label.
 */
import { BRAND_FONT_STACK } from "../../../../lib/safe-zones.mjs";
import { COLOR } from "../shared";

export const CHART = {
  width: 820,
  height: 620,
  /** Plot-safe padding inside the panel. */
  padding: { top: 36, right: 40, bottom: 64, left: 40 },
  fontFamily: BRAND_FONT_STACK,
  labelSize: 40,
  valueSize: 40,
  titleSize: 60,
  colors: {
    canvas: "#0a0a14",
    axis: "rgba(245,245,245,0.32)",
    baseline: "rgba(245,245,245,0.42)",
    grid: "rgba(245,245,245,0.08)",
    track: "rgba(245,245,245,0.06)",
    text: COLOR.text,
    muted: COLOR.textMuted,
    dim: COLOR.textDim,
    brand: COLOR.brand,
    amber: COLOR.amber,
    red: COLOR.red,
    green: COLOR.green,
    cyan: COLOR.cyan,
    purple: COLOR.purple,
  },
  // Amber is reserved for the one highlighted mark. Using it in the series
  // palette made the second non-highlighted series look highlighted.
  series: [COLOR.brand, COLOR.cyan, COLOR.purple, COLOR.green],
} as const;
