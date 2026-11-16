/**
 * Infographic topology primitives (#1215).
 *
 * Shared shapes for the six information layouts: the dot matrix that expresses
 * "many" as a counted grid (not as scattered decoration), the flow arrow, and
 * the framed chart card. All three are graphics, not text slots — the text
 * inside them still goes through TextGate; the layout declares the focal
 * geometry the empty-field rule reads (lib/type-scale.mjs LAYOUT_FOCAL).
 *
 * The source rules were absorbed as geometry only (anything2explainer is
 * PolyForm Noncommercial; see docs/research/repo-survey-tracking.md §C). The
 * palette is ours: amber for the value, brand blue for the answer side.
 */
import { interpolate, useCurrentFrame } from "remotion";
import type { ReactNode } from "react";
import { COLOR } from "./shared";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/**
 * A counted dot grid — the "多" rule: quantity is shown as an ordered matrix
 * that lights on the beat, never as confetti behind the content.
 */
export const DotMatrix: React.FC<{
  count: number;
  columns?: number;
  dotSize?: number;
  gap?: number;
  color?: string;
  /** Seconds before the first dot lights; each subsequent dot is `stagger` later. */
  start?: number;
  stagger?: number;
}> = ({
  count,
  columns = 6,
  dotSize = 12,
  gap = 10,
  color = COLOR.amber,
  start = 0.4,
  stagger = 0.06,
}) => {
  const frame = useCurrentFrame();
  if (count <= 0) return null;
  return (
    <div
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, ${dotSize}px)`,
        gap,
        justifyContent: "center",
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const at = (start + i * stagger) * 30;
        const opacity = interpolate(frame, [at, at + 3], [0.18, 1], clamp);
        return (
          <div
            key={i}
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: 2,
              background: color,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};

/** Vertical causal arrow: 3px shaft, 22px head (source rule, portrait scale). */
export const FlowArrow: React.FC<{
  height?: number;
  color?: string;
  delay?: number;
}> = ({ height = 34, color = COLOR.textDim, delay = 0 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay * 30, delay * 30 + 8], [0, 1], clamp);
  return (
    <div
      aria-hidden
      style={{
        width: 24,
        height,
        position: "relative",
        display: "flex",
        justifyContent: "center",
        opacity: 0.85 * progress,
      }}
    >
      <div
        style={{
          width: 3,
          height: height - 14,
          marginTop: 2,
          background: color,
          transform: `scaleY(${progress})`,
          transformOrigin: "top",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: 0,
          height: 0,
          borderLeft: "11px solid transparent",
          borderRight: "11px solid transparent",
          borderTop: `14px solid ${color}`,
        }}
      />
    </div>
  );
};

/**
 * Framed chart card: white 3px border, black ground, #4A4A4A grid. A bound
 * chart asset renders above the grid; with no asset the grid is the honest
 * placeholder and the caller falls back to another layout.
 */
export const ChartFrame: React.FC<{
  width?: number;
  height?: number;
  children?: ReactNode;
}> = ({ width = 440, height = 300, children }) => (
  <div
    style={{
      width,
      height,
      border: "3px solid #ffffff",
      background: "#000000",
      position: "relative",
      overflow: "hidden",
      borderRadius: 2,
    }}
  >
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(to right, #4A4A4A 1px, transparent 1px), linear-gradient(to bottom, #4A4A4A 1px, transparent 1px)",
        backgroundSize: "55px 50px",
        opacity: 0.7,
      }}
    />
    {children}
  </div>
);

/**
 * Horizontal comparison rail for the set-piece: the value sits at the lit
 * marker, the baseline label at the far end. It is a relationship, not a
 * quantitative chart — no scale is invented from a unit we cannot parse.
 */
export const ComparisonRail: React.FC<{
  valueNode: ReactNode;
  baselineNode: ReactNode;
  width?: number;
  reveal?: number;
}> = ({ valueNode, baselineNode, width = 560, reveal = 1 }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
    <div
      style={{
        width,
        height: 6,
        borderRadius: 3,
        background: "rgba(245,158,11,0.22)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.max(8, reveal * 100)}%`,
          borderRadius: 3,
          background: COLOR.amber,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -7,
          top: -5,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: COLOR.brand,
          border: `2px solid ${COLOR.canvas}`,
        }}
      />
    </div>
    <div
      style={{
        width,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 24,
      }}
    >
      {valueNode}
      {baselineNode}
    </div>
  </div>
);
