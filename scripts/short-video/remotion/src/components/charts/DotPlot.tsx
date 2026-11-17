import { interpolate, useCurrentFrame } from "remotion";
import type { InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";
import { chartData, domainFor, formatChartValue, isHighlighted } from "./format";
import { ChartSvg } from "./ChartPanel";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Dot plot: position on a common scale, one row per category. */
export const DotPlot: React.FC<{ info: InfoSpec }> = ({ info }) => {
  const frame = useCurrentFrame();
  const data = chartData(info);
  const domain = domainFor(data, { includeZero: false });
  const left = 350;
  const right = 680;
  const span = domain.max - domain.min || 1;
  const xFor = (value: number) => left + ((value - domain.min) / span) * (right - left);
  const rowHeight = Math.min(52, 520 / Math.max(1, data.length));
  const startY = 40 + Math.max(0, (520 - rowHeight * data.length) / 2);

  return (
    <ChartSvg label={info.unit ? `dot plot in ${info.unit}` : "dot plot"}>
      <g data-chart-type="dot-plot">
        {data.map((datum, index) => {
          const y = startY + index * rowHeight + rowHeight / 2;
          const highlighted = isHighlighted(info, datum);
          const appear = interpolate(frame, [6 + index * 3, 22 + index * 3], [0, 1], clamp);
          const targetX = xFor(datum.value);
          const cx = left + (targetX - left) * appear;
          const color = highlighted ? CHART.colors.amber : CHART.colors.brand;
          return (
            <g key={`${datum.label}-${index}`}>
              <line x1={left} x2={right} y1={y} y2={y} stroke={CHART.colors.grid} strokeWidth={1} />
              <text
                x={0}
                y={y}
                fill={highlighted ? CHART.colors.amber : CHART.colors.muted}
                fontSize={CHART.labelSize}
                fontWeight={highlighted ? 800 : 600}
                dominantBaseline="middle"
              >
                {datum.label}
              </text>
              <circle
                cx={cx}
                cy={y}
                r={highlighted ? 12 : 9}
                fill={color}
                opacity={interpolate(appear, [0, 1], [0.3, 1], clamp)}
              />
              <text
                x={700}
                y={y}
                fill={highlighted ? CHART.colors.amber : CHART.colors.text}
                fontSize={CHART.valueSize}
                fontWeight={800}
                dominantBaseline="middle"
              >
                {formatChartValue(datum.value, info)}
              </text>
            </g>
          );
        })}
      </g>
    </ChartSvg>
  );
};
