import { interpolate, useCurrentFrame } from "remotion";
import type { InfoDatum, InfoSpec } from "../../types";
import { CHART } from "./chart-tokens";
import { chartData, formatChartValue, isHighlighted } from "./format";
import { ChartSvg } from "./ChartPanel";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

type Segment = {
  datum: InfoDatum;
  index: number;
  fullHeight: number;
  finalY: number;
  y: number;
  revealed: number;
  appear: number;
  highlighted: boolean;
  color: string;
  share: number;
};

/**
 * Part-to-whole as one vertical stacked bar with direct labels. No pie: the
 * common baseline is the point, and labels sit at their own segment.
 */
export const ProportionBar: React.FC<{ info: InfoSpec }> = ({ info }) => {
  const frame = useCurrentFrame();
  const data = chartData(info);
  const total = data.reduce((sum, datum) => sum + Math.max(0, datum.value), 0) || 1;
  const barX = 56;
  const barWidth = 220;
  const barTop = 40;
  const barHeight = 440;
  const labelX = 316;

  // Resolve every cumulative position before JSX. Mutating a cursor inside the
  // render map is both a React-compiler error and frame-contamination: the next
  // render would start from the previous frame's cursor.
  const segments = data.reduce<Segment[]>((acc, datum, index) => {
    const previous = acc[acc.length - 1];
    const share = Math.max(0, datum.value) / total;
    const fullHeight = share * barHeight;
    const finalY = previous ? previous.finalY + previous.fullHeight : barTop;
    const y = previous ? previous.y + previous.revealed : barTop;
    const appear = interpolate(frame, [8 + index * 4, 26 + index * 4], [0, 1], clamp);
    const highlighted = isHighlighted(info, datum);
    acc.push({
      datum,
      index,
      fullHeight,
      finalY,
      y,
      revealed: fullHeight * appear,
      appear,
      highlighted,
      color: highlighted ? CHART.colors.amber : CHART.series[index % CHART.series.length],
      share,
    });
    return acc;
  }, []);

  return (
    <ChartSvg label={info.unit ? `proportion bar in ${info.unit}` : "proportion bar"}>
      <g data-chart-type="proportion-bar">
        {segments.map((segment) => {
          const {
            datum,
            index,
            fullHeight,
            finalY,
            y,
            revealed,
            appear,
            highlighted,
            color,
            share,
          } = segment;
          const center = finalY + fullHeight / 2;
          const valueText = formatChartValue(datum.value, info);
          const shareText = info.unit === "%" ? "" : ` · ${Math.round(share * 100)}%`;
          return (
            <g
              key={`${datum.label}-${index}`}
              opacity={interpolate(appear, [0, 1], [0.4, 1], clamp)}
            >
              <rect
                x={barX}
                y={y}
                width={barWidth}
                height={Math.max(0, revealed)}
                fill={color}
                rx={index === 0 ? 8 : 0}
              />
              <rect x={labelX - 24} y={center - 9} width={18} height={18} rx={3} fill={color} />
              <text
                x={labelX}
                y={center - 10}
                fill={highlighted ? CHART.colors.amber : CHART.colors.text}
                fontSize={CHART.labelSize}
                fontWeight={highlighted ? 800 : 600}
                dominantBaseline="middle"
              >
                {datum.label}
              </text>
              <text
                x={labelX}
                y={center + 34}
                fill={CHART.colors.muted}
                fontSize={CHART.valueSize}
                fontWeight={700}
                dominantBaseline="middle"
              >
                {valueText}
                {shareText}
              </text>
            </g>
          );
        })}
      </g>
    </ChartSvg>
  );
};
