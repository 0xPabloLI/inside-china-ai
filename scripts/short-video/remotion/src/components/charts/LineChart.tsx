import { interpolate, useCurrentFrame } from "remotion";
import type { InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";
import { chartData, domainFor, formatChartValue, isHighlighted } from "./format";
import { ChartSvg } from "./ChartPanel";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Change over time: one line, direct value labels, no legend. */
export const LineChart: React.FC<{ info: InfoSpec }> = ({ info }) => {
  const frame = useCurrentFrame();
  const data = chartData(info);
  const domain = domainFor(data, { includeZero: false });
  const left = 82;
  const right = 780;
  const top = 80;
  const bottom = 500;
  const span = domain.max - domain.min || 1;
  const yFor = (value: number) => bottom - ((value - domain.min) / span) * (bottom - top);
  const step = data.length > 1 ? (right - left) / (data.length - 1) : 0;
  const points = data.map((datum, index) => ({
    datum,
    x: left + step * index,
    y: yFor(datum.value),
    index,
  }));
  const progress = interpolate(frame, [8, 40], [0, 1], clamp);

  return (
    <ChartSvg label={info.unit ? `line chart in ${info.unit}` : "line chart"}>
      <g data-chart-type="line">
        <path
          d={points
            .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
            .join(" ")}
          fill="none"
          stroke={CHART.colors.brand}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - progress}
        />
        {points.map((point) => {
          const highlighted = isHighlighted(info, point.datum);
          const valueBelow = point.y < 130;
          const anchor =
            point.index === 0 ? "start" : point.index === points.length - 1 ? "end" : "middle";
          return (
            <g key={`${point.datum.label}-${point.index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={highlighted ? 13 : 9}
                fill={highlighted ? CHART.colors.amber : CHART.colors.brand}
                stroke={CHART.colors.canvas}
                strokeWidth={3}
                opacity={interpolate(progress, [0.55, 1], [0, 1], clamp)}
              />
              <text
                x={point.x}
                y={valueBelow ? point.y + 58 : point.y - 22}
                fill={highlighted ? CHART.colors.amber : CHART.colors.text}
                fontSize={CHART.valueSize}
                fontWeight={800}
                textAnchor={anchor}
              >
                {formatChartValue(point.datum.value, info)}
              </text>
              <text
                x={point.x}
                y={566}
                fill={highlighted ? CHART.colors.amber : CHART.colors.muted}
                fontSize={CHART.labelSize}
                fontWeight={highlighted ? 800 : 600}
                textAnchor={anchor}
              >
                {point.datum.label}
              </text>
            </g>
          );
        })}
      </g>
    </ChartSvg>
  );
};
