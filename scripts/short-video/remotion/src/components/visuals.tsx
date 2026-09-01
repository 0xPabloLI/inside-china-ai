/**
 * Visual components — brand system elements shared across all scenes.
 *
 * These replace the CSS classes of the retired HTML templates
 * (retired-html-path/base-styles.mjs + scene-templates.mjs)
 * with React components using safe-zones.mjs constants for positioning.
 *
 * All values are精确对照 from their templateCss() / baseStyles().
 */
import { staticFile, CanvasImage } from "remotion";
import { CANVAS, SAFE_ZONES, WATERMARK_POS } from "./shared";
import { TextGate } from "./text-gate";
import type { ReactNode } from "react";

// ── Background layers ──

/** Grid background — 60px grid with subtle blue lines. */
export const GridBg: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `
      linear-gradient(rgba(77,139,255,0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(77,139,255,0.015) 1px, transparent 1px)
    `,
      backgroundSize: "60px 60px",
    }}
  />
);

/** Radial glow — colored radial gradient positioned at a corner. */
export const Glow: React.FC<{ color: "red" | "blue" }> = ({ color }) => {
  const config =
    color === "red"
      ? { top: -200, right: -200, size: 800, rgba: "rgba(239,68,68,0.15)" }
      : { bottom: -250, left: -200, size: 900, rgba: "rgba(77,139,255,0.10)" };
  return (
    <div
      style={{
        position: "absolute",
        width: config.size,
        height: config.size,
        ...(config.top !== undefined ? { top: config.top } : {}),
        ...(config.right !== undefined ? { right: config.right } : {}),
        ...(config.bottom !== undefined ? { bottom: config.bottom } : {}),
        ...(config.left !== undefined ? { left: config.left } : {}),
        background: `radial-gradient(circle, ${config.rgba} 0%, transparent 60%)`,
        borderRadius: "50%",
      }}
    />
  );
};

/** Scanlines texture — repeating horizontal lines. */
export const Scanlines: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.008) 3px, rgba(255,255,255,0.008) 4px)",
      pointerEvents: "none",
    }}
  />
);

/** Frame glow — decorative border + inner glow on every scene frame edge. */
export const FrameGlow: React.FC<{ variant?: "amber" | "blue" }> = ({ variant = "amber" }) => {
  const c =
    variant === "blue"
      ? { border: "rgba(77,139,255,0.2)", shadow: "rgba(77,139,255,0.08)" }
      : { border: "rgba(245,158,11,0.2)", shadow: "rgba(245,158,11,0.08)" };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        border: `3px solid ${c.border}`,
        boxShadow: `inset 0 0 40px ${c.shadow}`,
        pointerEvents: "none",
        zIndex: 99,
      }}
    />
  );
};

// ── Brand elements ──

/** Channel brand bar — top-left, below the TikTok nav zone. */
export const BrandBar: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 140,
      left: 60,
      right: 200,
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}
  >
    <CanvasImage
      src={staticFile("assets/china-ai-news-mark-video.svg")}
      style={{ width: 48, height: 48 }}
    />
    <span
      style={{
        fontSize: 24,
        fontWeight: 900,
        color: "#f5f5f5",
        letterSpacing: "3px",
      }}
    >
      CHINA <span style={{ color: "#4d8bff" }}>AI</span> NEWS
    </span>
    <span
      style={{
        marginLeft: "auto",
        fontSize: 20,
        fontWeight: 700,
        color: "#cbd5e1",
        letterSpacing: "2px",
        padding: "5px 12px",
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: 6,
      }}
    >
      BRIEFING
    </span>
  </div>
);

/**
 * Badge pill — hook scene badge (NOT the breaking badge). Matches
 * .s-hook .badge-pill. `fontSize` is injected by the TextGate when gated
 * (contract field `badge`, 22px); the 26 below is only the ungated default.
 */
export const BadgePill: React.FC<{ text: string; fontSize?: number }> = ({
  text,
  fontSize = 22,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      background: "#ef4444",
      color: "white",
      padding: "16px 48px",
      fontSize,
      fontWeight: 900,
      letterSpacing: "4px",
      borderRadius: 8,
    }}
  >
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: "white",
      }}
    />
    {text}
  </div>
);

/**
 * Stat card — matches .stat-card in templateCss().
 *
 * When `sceneId` + `index` are given (T5), the card gates WHOLE through one
 * TextGate (slot hook.hero-center.statCard[i]): num and unit share a nowrap
 * row, so their widths compete and cannot be gated apart. The gate injects
 * the number size; unit/label render at fixed ratios (0.5em / 0.36em) so the
 * fit ladder scales the whole card proportionally. The card root carries
 * data-text-container so the container assert catches a gate wider than the
 * card's actual content box (cards are flex:1 — width varies with count).
 * Without sceneId/index the card renders statically, ungated.
 */
export const StatCard: React.FC<{
  num: string;
  unit?: string;
  label?: string;
  color?: string;
  sceneId?: string;
  index?: number;
}> = ({ num, unit, label, color = "#4d8bff", sceneId, index }) => {
  const gated = sceneId !== undefined && index !== undefined;

  const numRow = (unitSize: string | number, labelNode: ReactNode): ReactNode => (
    <>
      {/* lineHeight ≥ 1.1 required: at lineHeight 1 the Chrome text rects
          report the font's natural ascent and the first line overhangs the
          line box above (negative y), which Fit reads as overflow. */}
      <div style={{ lineHeight: 1.2, color, whiteSpace: "nowrap" }}>
        {num}
        {unit && <span style={{ fontSize: unitSize, fontWeight: 700 }}>{unit}</span>}
      </div>
      {labelNode}
    </>
  );

  return (
    <div
      data-text-container
      style={{
        flex: 1,
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)",
        borderTop: `5px solid ${color}`,
        borderRadius: 14,
        padding: "16px 20px",
        textAlign: "center",
      }}
    >
      {gated ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TextGate sceneId={sceneId} slotId={`hook.hero-center.statCard[${index}]`}>
            {(fontSize) => (
              <div style={{ fontSize, fontWeight: 900 }}>
                {numRow(
                  "0.5em",
                  label ? (
                    <div
                      style={{
                        fontSize: "0.36em",
                        fontWeight: 700,
                        color: "#cbd5e1",
                        letterSpacing: "1px",
                        marginTop: 8,
                      }}
                    >
                      {label}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </TextGate>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 56, fontWeight: 900 }}>
            {numRow(
              28,
              label ? (
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#cbd5e1",
                    letterSpacing: "1px",
                    marginTop: 8,
                  }}
                >
                  {label}
                </div>
              ) : null,
            )}
          </div>
        </>
      )}
    </div>
  );
};

/** Channel watermark — top-left corner. */
export const Watermark: React.FC = () => (
  <CanvasImage
    src={staticFile("assets/china-ai-news-mark-video.svg")}
    style={{
      position: "absolute",
      top: WATERMARK_POS.top,
      left: WATERMARK_POS.left,
      width: 55,
      height: 55,
      opacity: 0.35,
      zIndex: 100,
    }}
  />
);

// ── Slot layout ──

/**
 * Slot container — absolute positioned band within the safe zone.
 *
 * Carries `data-text-container` so every TextGate inside asserts its drawn
 * box stays within the band (spec decision 44): Fit never sees the band's
 * fixed height, only the container assert catches vertical clipping.
 */
export const Slot: React.FC<{
  variant: "kicker" | "hero" | "support";
  align?: "center" | "start" | "end";
  top?: number;
  height?: number;
  children: ReactNode;
}> = ({ variant, align = "center", top, height, children }) => {
  const slots = {
    kicker: { top: 220, height: 180 }, // 220-400
    hero: { top: 400, height: 550 }, // 400-950
    support: { top: 950, height: 200 }, // 950-1150
  };
  const defaults = slots[variant];
  const resolvedTop = top ?? defaults.top;
  const resolvedHeight = height ?? defaults.height;
  const justifyContent = align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center";
  return (
    <div
      data-text-container
      style={{
        position: "absolute",
        left: SAFE_ZONES.left,
        right: SAFE_ZONES.right,
        top: resolvedTop,
        height: resolvedHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent,
        alignItems: "center",
      }}
    >
      {children}
    </div>
  );
};
