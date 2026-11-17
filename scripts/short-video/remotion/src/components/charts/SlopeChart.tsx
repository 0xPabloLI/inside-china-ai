import { interpolate, useCurrentFrame } from "remotion";
import type { InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";
import { chartData, domainFor, formatChartValue, isHighlighted } from "./format";
import { ChartSvg } from "./ChartPanel";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/**
 * Two-point slope: the same categories measured before and after. Direct labels
 * sit outside the plot; an endpoint label names each side.
 */
export const SlopeChart: React.FC<{ info: InfoSpec }> = ({ info }) => {
  const frame = useCurrentFrame();
  const data = chartData(info);
  const domain = domainFor(data, { includeZero: false });
  const leftX = 252;
  const rightX = 568;
  const top = 76;
  const bottom = 500;
  const span = domain.max - domain.min || 1;
  const yFor = (value: number) => bottom - ((value - domain.min) / span) * (bottom - top);
  const endpoints: [string, string] = info.axisLabels ?? [
    info.time?.from ?? "BEFORE",
    info.time?.to ?? "AFTER",
  ];

  return (
    <ChartSvg label={info.unit ? `slope chart in ${info.unit}` : "slope chart"}>
      <g data-chart-type="slope">
        <text
          x={leftX}
          y={28}
          fill={CHART.colors.dim}
          fontSize={CHART.labelSize}
          fontWeight={700}
          textAnchor="middle"
        >
          {endpoints[0]}
        </text>
        <text
          x={rightX}
          y={28}
          fill={CHART.colors.dim}
          fontSize={CHART.labelSize}
          fontWeight={700}
          textAnchor="middle"
        >
          {endpoints[1]}
        </text>
        {data.map((datum, index) => {
          const y1 = yFor(datum.value);
          const y2 = yFor(datum.value2 ?? datum.value);
          const highlighted = isHighlighted(info, datum);
          const color = highlighted
            ? CHART.colors.amber
            : CHART.series[index % CHART.series.length];
          const appear = interpolate(frame, [8 + index * 3, 26 + index * 3], [0, 1], clamp);
          return (
            <g key={`${datum.label}-${index}`} opacity={appear}>
              <line
                x1={leftX}
                y1={y1}
                x2={rightX}
                y2={y2}
                stroke={color}
                strokeWidth={highlighted ? 6 : 4}
                strokeLinecap="round"
                opacity={highlighted ? 1 : 0.62}
              />
              <circle cx={leftX} cy={y1} r={9} fill={color} />
              <circle cx={rightX} cy={y2} r={9} fill={color} />
              <text
                x={leftX - 16}
                y={y1 - 6}
                fill={highlighted ? CHART.colors.amber : CHART.colors.text}
                fontSize={CHART.labelSize}
                fontWeight={highlighted ? 800 : 600}
                textAnchor="end"
              >
                {datum.label}
              </text>
              <text
                x={leftX - 16}
                y={y1 + 36}
                fill={CHART.colors.muted}
                fontSize={CHART.valueSize}
                fontWeight={700}
                textAnchor="end"
              >
                {formatChartValue(datum.value, info)}
              </text>
              <text
                x={rightX + 16}
                y={y2 - 6}
                fill={highlighted ? CHART.colors.amber : CHART.colors.text}
                fontSize={CHART.labelSize}
                fontWeight={highlighted ? 800 : 600}
                textAnchor="start"
              >
                {datum.label}
              </text>
              <text
                x={rightX + 16}
                y={y2 + 36}
                fill={CHART.colors.muted}
                fontSize={CHART.valueSize}
                fontWeight={700}
                textAnchor="start"
              >
                {formatChartValue(datum.value2 ?? datum.value, info)}
              </text>
            </g>
          );
        })}
      </g>
    </ChartSvg>
  );
};
