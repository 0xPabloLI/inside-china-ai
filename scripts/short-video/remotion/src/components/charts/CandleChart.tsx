/**
 * CandleChart — native daily candlesticks (#1405).
 *
 * Replaces the chart-img screenshot: the same 6-month K-line, but drawn from
 * the baked series (`bake-quotes.mjs`) instead of an 800×600 PNG with a
 * CHART-IMG.COM watermark through the middle. The scene declares the window;
 * this component only draws what the file contains, so a wrong price is a
 * preflight finding (`info.data`) rather than a picture nobody can audit.
 *
 * Geometry follows the shared 820×620 chart frame (`chart-tokens.ts`), the
 * same frame every native chart uses, and stays inside the media-led hook's
 * 820×619 contain band (the CSS height is 1px shorter; the SVG letterboxes
 * by 0.16%, nothing clips).
 *
 * The one highlighted bar is the narration's anchor — for the zhipu pack that
 * is the June peak the voiceover says out loud. It gets an amber marker and
 * its high value printed, because a K-line's shape alone does not tell a
 * viewer which candle the sentence means.
 */
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { CandleBar, InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";
import { formatChartValue } from "./format";
import { ChartSvg } from "./ChartPanel";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Plot box inside the shared frame. The left gutter holds price labels. */
const PLOT = { left: 116, right: 776, top: 64, bottom: 468 };
const DATE_BASELINE = 516;
const CREDIT_BASELINE = 590;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function isBar(value: unknown): value is CandleBar {
  const bar = value as CandleBar;
  return (
    Boolean(bar) &&
    typeof bar.date === "string" &&
    ["open", "high", "low", "close"].every((field) =>
      Number.isFinite(bar[field as keyof CandleBar]),
    )
  );
}

/**
 * Axis ticks are bare numbers: the shared formatter already applies the same
 * `autoDecimals` rule as every sibling chart (0 digits at |v| ≥ 100, 1 below),
 * and the unit lives in the chart's own label rather than on all three ticks.
 */
function formatPrice(value: number, decimals: number | null): string {
  return formatChartValue(value, { decimals, unit: "", prefix: "", suffix: "" });
}

/** `2026-06-22` → `JUN 22`; the year is carried by the credit line. */
function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1] ?? match[2];
  return `${month} ${Number(match[3])}`;
}

export const CandleChart: React.FC<{ info: InfoSpec }> = ({ info }) => {
  const frame = useCurrentFrame();
  const revealId = React.useId();
  const bars = Array.isArray(info.data) ? (info.data as unknown[]).filter(isBar) : [];
  if (bars.length === 0) {
    throw new Error("CandleChart received no OHLC bars — run npm run bake:quotes -- <pack>");
  }

  const lows = bars.map((bar) => bar.low);
  const highs = bars.map((bar) => bar.high);
  const baseline = Number.isFinite(info.baseline) ? (info.baseline as number) : null;
  const domainMin = Math.min(...lows, ...(baseline === null ? [] : [baseline]));
  const domainMax = Math.max(...highs, ...(baseline === null ? [] : [baseline]));
  const pad = (domainMax - domainMin) * 0.07 || 1;
  const min = domainMin - pad;
  const max = domainMax + pad;
  const yFor = (value: number) =>
    PLOT.bottom - ((value - min) / (max - min)) * (PLOT.bottom - PLOT.top);

  const step = (PLOT.right - PLOT.left) / bars.length;
  const bodyWidth = Math.max(2, Math.min(14, step * 0.62));
  const progress = interpolate(frame, [8, 44], [0, 1], clamp);

  const highlight =
    bars.find((bar) => bar.highlight === true) ??
    (info.highlight ? bars.find((bar) => bar.date === info.highlight) : undefined) ??
    null;
  const highlightIndex = highlight ? bars.indexOf(highlight) : -1;

  const axisValues = [Math.max(...highs), (domainMin + domainMax) / 2, Math.min(...lows)];
  const unit = info.unit || "";
  const credit = info.credit || "";

  return (
    <ChartSvg
      label={`candlestick chart, ${shortDate(bars[0].date)} to ${shortDate(bars[bars.length - 1].date)}`}
    >
      <g data-chart-type="candle">
        <clipPath id={`${revealId}-reveal`}>
          <rect
            x={PLOT.left - 2}
            y={PLOT.top - 40}
            width={(PLOT.right - PLOT.left + 4) * progress}
            height={PLOT.bottom - PLOT.top + 90}
          />
        </clipPath>

        {/* Price grid: three hairlines, no filled grid — the panel treatment
            from #1398 keeps the picture as the only heavy object. */}
        {axisValues.map((value, index) => (
          <g key={`tick-${index}`}>
            <line
              x1={PLOT.left}
              x2={PLOT.right}
              y1={yFor(value)}
              y2={yFor(value)}
              stroke={CHART.colors.grid}
              strokeWidth={1}
            />
            <text
              x={12}
              y={yFor(value) + 9}
              fill={CHART.colors.muted}
              fontSize={28}
              fontWeight={600}
              textAnchor="start"
            >
              {formatPrice(value, info.decimals)}
            </text>
          </g>
        ))}

        {baseline !== null && (
          <g>
            <line
              x1={PLOT.left}
              x2={PLOT.right}
              y1={yFor(baseline)}
              y2={yFor(baseline)}
              stroke={CHART.colors.amber}
              strokeWidth={2}
              strokeDasharray="10 8"
              opacity={0.7}
            />
            <text
              x={PLOT.right}
              y={yFor(baseline) - 12}
              fill={CHART.colors.amber}
              fontSize={26}
              fontWeight={700}
              textAnchor="end"
            >
              {formatPrice(baseline, info.decimals)}
            </text>
          </g>
        )}

        <g clipPath={`url(#${revealId}-reveal)`}>
          {bars.map((bar, index) => {
            const x = PLOT.left + step * (index + 0.5);
            const rising = bar.close >= bar.open;
            const color = rising ? CHART.colors.green : CHART.colors.red;
            const bodyTop = yFor(Math.max(bar.open, bar.close));
            const bodyBottom = yFor(Math.min(bar.open, bar.close));
            return (
              <g key={bar.date} data-candle={bar.date}>
                <line
                  x1={x}
                  x2={x}
                  y1={yFor(bar.high)}
                  y2={yFor(bar.low)}
                  stroke={color}
                  strokeWidth={1.4}
                  opacity={0.75}
                />
                <rect
                  x={x - bodyWidth / 2}
                  y={bodyTop}
                  width={bodyWidth}
                  height={Math.max(1.6, bodyBottom - bodyTop)}
                  fill={color}
                  opacity={0.92}
                />
              </g>
            );
          })}

          {highlight && (
            <g data-candle-peak={highlight.date}>
              <circle
                cx={PLOT.left + step * (highlightIndex + 0.5)}
                cy={yFor(highlight.high) - 10}
                r={7}
                fill={CHART.colors.amber}
              />
              <text
                x={PLOT.left + step * (highlightIndex + 0.5)}
                y={
                  yFor(highlight.high) - 26 < 40
                    ? yFor(highlight.high) + 40
                    : yFor(highlight.high) - 26
                }
                fill={CHART.colors.amber}
                fontSize={34}
                fontWeight={800}
                textAnchor={highlightIndex < bars.length / 2 ? "start" : "end"}
              >
                PEAK · {shortDate(highlight.date)}
              </text>
            </g>
          )}
        </g>

        {/* Unit + window, printed inside the frame like every native chart. */}
        {unit && (
          <text
            x={PLOT.right}
            y={44}
            fill={CHART.colors.muted}
            fontSize={30}
            fontWeight={700}
            textAnchor="end"
          >
            {unit}
          </text>
        )}
        <text
          x={PLOT.left}
          y={DATE_BASELINE}
          fill={CHART.colors.muted}
          fontSize={30}
          fontWeight={600}
          textAnchor="start"
        >
          {shortDate(bars[0].date)}
        </text>
        <text
          x={PLOT.right}
          y={DATE_BASELINE}
          fill={CHART.colors.muted}
          fontSize={30}
          fontWeight={600}
          textAnchor="end"
        >
          {shortDate(bars[bars.length - 1].date)}
        </text>
        {credit && (
          <text
            x={12}
            y={CREDIT_BASELINE}
            fill={CHART.colors.dim}
            fontSize={26}
            fontWeight={600}
            textAnchor="start"
          >
            {credit}
          </text>
        )}
      </g>
    </ChartSvg>
  );
};
