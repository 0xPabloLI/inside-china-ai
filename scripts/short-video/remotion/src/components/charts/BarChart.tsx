import { interpolate, useCurrentFrame } from "remotion";
import type { InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";
import { chartData, domainFor, formatChartValue, isHighlighted } from "./format";
import { ChartSvg } from "./ChartPanel";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/**
 * Horizontal bars: labels sit above the bar, never in a rotated axis. This is
 * the fallback for long categories and the default for magnitude/ranking.
 */
export const BarChart: React.FC<{ info: InfoSpec }> = ({ info }) => {
  const frame = useCurrentFrame();
  const data = chartData(info);
  const baseline = info.baseline ?? 0;
  const deviation = info.relationship === "deviation" && baseline !== 0;
  const domain = domainFor(data, {
    includeZero: !deviation,
    zeroFloor: !deviation,
    baseline,
  });
  const left = 28;
  const right = 792;
  const span = domain.max - domain.min || 1;
  const xFor = (value: number) => left + ((value - domain.min) / span) * (right - left);
  const baselineX = xFor(baseline);
  const barHeight = data.length > 6 ? 14 : 20;

  return (
    <ChartSvg label={info.unit ? `bar chart in ${info.unit}` : "bar chart"}>
      <g data-chart-type="bar">
        {domain.min < baseline && (
          <line
            x1={baselineX}
            x2={baselineX}
            y1={28}
            y2={576}
            stroke={CHART.colors.axis}
            strokeWidth={1}
          />
        )}
        {data.map((datum, index) => {
          // Each row needs a 40px label, a 6px gap and a 14px bar. Eight rows
          // fit 40..560; the old 420px band packed them into an overlap.
          const centerY = 40 + ((index + 0.5) * 520) / data.length;
          const labelY = centerY - 44;
          const barY = centerY + 2;
          const highlighted = isHighlighted(info, datum);
          const appear = interpolate(frame, [6 + index * 3, 24 + index * 3], [0, 1], clamp);
          const valueX = xFor(datum.value);
          const width = Math.abs(valueX - baselineX) * appear;
          const x = datum.value >= baseline ? baselineX : baselineX - width;
          const fill = highlighted
            ? CHART.colors.amber
            : datum.value < baseline
              ? CHART.colors.red
              : CHART.colors.brand;
          return (
            <g key={`${datum.label}-${index}`}>
              <text
                x={left}
                y={labelY}
                fill={highlighted ? CHART.colors.amber : CHART.colors.muted}
                fontSize={CHART.labelSize}
                fontWeight={highlighted ? 800 : 600}
                dominantBaseline="hanging"
              >
                {datum.label}
              </text>
              <text
                x={right}
                y={labelY}
                fill={highlighted ? CHART.colors.amber : CHART.colors.text}
                fontSize={CHART.valueSize}
                fontWeight={800}
                textAnchor="end"
                dominantBaseline="hanging"
              >
                {formatChartValue(datum.value, info)}
              </text>
              <rect
                x={left}
                y={barY}
                width={right - left}
                height={barHeight}
                rx={barHeight / 2}
                fill={CHART.colors.track}
              />
              <rect
                x={x}
                y={barY}
                width={Math.max(0, width)}
                height={barHeight}
                rx={barHeight / 2}
                fill={fill}
                opacity={highlighted ? 1 : 0.82}
              />
            </g>
          );
        })}
      </g>
    </ChartSvg>
  );
};
