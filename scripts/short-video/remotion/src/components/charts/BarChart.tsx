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
  const domain = domainFor(data, { zeroFloor: true });
  const left = 28;
  const right = 792;
  const span = domain.max - domain.min || 1;
  const xFor = (value: number) => left + ((value - domain.min) / span) * (right - left);
  const zeroX = xFor(0);
  const barHeight = data.length > 6 ? 14 : 20;

  return (
    <ChartSvg label={info.unit ? `bar chart in ${info.unit}` : "bar chart"}>
      <g data-chart-type="bar">
        {domain.min < 0 && (
          <line x1={zeroX} x2={zeroX} y1={28} y2={568} stroke={CHART.colors.axis} strokeWidth={1} />
        )}
        {data.map((datum, index) => {
          // Distribute row centres across the panel instead of packing a
          // 2-row chart into the top third. The label sits 48px above the
          // centre, the bar 2px below it, so an 8-row chart still clears the
          // next label and a 2-row chart fills the frame vertically.
          const centerY = 100 + ((index + 0.5) * 420) / data.length;
          const labelY = centerY - 48;
          const barY = centerY + 2;
          const highlighted = isHighlighted(info, datum);
          const appear = interpolate(frame, [6 + index * 3, 24 + index * 3], [0, 1], clamp);
          const valueX = xFor(datum.value);
          const width = Math.abs(valueX - zeroX) * appear;
          const x = datum.value >= 0 ? zeroX : zeroX - width;
          const fill = highlighted
            ? CHART.colors.amber
            : datum.value < 0
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
