import { interpolate, useCurrentFrame } from "remotion";
import type { InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";
import { chartData, domainFor, formatChartValue, isHighlighted } from "./format";
import { ChartSvg } from "./ChartPanel";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Vertical columns for short time labels; labels always sit below, unrotated. */
export const ColumnChart: React.FC<{ info: InfoSpec }> = ({ info }) => {
  const frame = useCurrentFrame();
  const data = chartData(info);
  const domain = domainFor(data, { zeroFloor: true });
  const left = 48;
  const right = 772;
  const top = 60;
  const bottom = 500;
  const span = domain.max - domain.min || 1;
  const yFor = (value: number) => bottom - ((value - domain.min) / span) * (bottom - top);
  const zeroY = yFor(0);
  const slot = (right - left) / Math.max(1, data.length);
  const barWidth = Math.min(104, slot * 0.56);
  const base = yFor(0);

  return (
    <ChartSvg label={info.unit ? `column chart in ${info.unit}` : "column chart"}>
      <g data-chart-type="column">
        <line
          x1={left}
          x2={right}
          y1={zeroY}
          y2={zeroY}
          stroke={CHART.colors.baseline}
          strokeWidth={1.5}
        />
        {data.map((datum, index) => {
          const center = left + slot * (index + 0.5);
          const highlighted = isHighlighted(info, datum);
          const appear = interpolate(frame, [6 + index * 3, 24 + index * 3], [0, 1], clamp);
          const targetY = yFor(datum.value);
          const fullHeight = Math.abs(targetY - base);
          const height = fullHeight * appear;
          const y = datum.value >= 0 ? base - height : base;
          const fill = highlighted
            ? CHART.colors.amber
            : datum.value < 0
              ? CHART.colors.red
              : CHART.colors.brand;
          const valueY = datum.value >= 0 ? targetY - 14 : targetY + 44;
          return (
            <g key={`${datum.label}-${index}`}>
              <rect
                x={center - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(0, height)}
                rx={6}
                fill={fill}
                opacity={highlighted ? 1 : 0.82}
              />
              <text
                x={center}
                y={valueY}
                fill={highlighted ? CHART.colors.amber : CHART.colors.text}
                fontSize={CHART.valueSize}
                fontWeight={800}
                textAnchor="middle"
              >
                {formatChartValue(datum.value, info)}
              </text>
              <text
                x={center}
                y={552}
                fill={highlighted ? CHART.colors.amber : CHART.colors.muted}
                fontSize={CHART.labelSize}
                fontWeight={highlighted ? 800 : 600}
                textAnchor="middle"
              >
                {datum.label}
              </text>
            </g>
          );
        })}
      </g>
    </ChartSvg>
  );
};
