/**
 * Chart panel + SVG frame (#1398).
 *
 * Default is the evidence-backed clean panel: a low-contrast ground, a 1px
 * hairline, no grid. The `terminal` variant keeps the old 3px white frame and
 * #4A4A4A grid only for A/B tests — the default is not a style preference, it
 * is the treatment we are testing against.
 */
import type { ReactNode } from "react";
import { CHART } from "./chart-tokens";

export const ChartPanel: React.FC<{
  children?: ReactNode;
  variant?: "clean" | "terminal";
  /** Frame height; the media-led hook band is 619px, one short of the default. */
  height?: number;
}> = ({ children, variant = "clean", height = CHART.height }) => {
  const terminal = variant === "terminal";
  return (
    <div
      data-chart-panel={variant}
      style={{
        width: CHART.width,
        height,
        border: terminal ? "3px solid #ffffff" : "1px solid rgba(245,245,245,0.12)",
        background: terminal ? "#000000" : "rgba(245,245,245,0.04)",
        position: "relative",
        overflow: "hidden",
        borderRadius: terminal ? 2 : 12,
      }}
    >
      {terminal && (
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
      )}
      <div style={{ position: "relative", width: "100%", height: "100%" }}>{children}</div>
    </div>
  );
};

/** SVG viewport every chart shares. */
export const ChartSvg: React.FC<{ children?: ReactNode; label?: string }> = ({
  children,
  label,
}) => (
  <svg
    width="100%"
    height="100%"
    viewBox={`0 0 ${CHART.width} ${CHART.height}`}
    role="img"
    aria-label={label || "data chart"}
    style={{ display: "block", fontFamily: CHART.fontFamily }}
  >
    {label ? <title>{label}</title> : null}
    {children}
  </svg>
);
