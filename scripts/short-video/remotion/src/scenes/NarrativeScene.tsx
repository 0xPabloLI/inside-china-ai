/**
 * NarrativeScene — layout-driven scene template.
 *
 * Dispatches by `scene.layout` field into 4 variants:
 *   - media-bottom-bar: full-bleed media to the subtitle lane, text over a
 *     gradient scrim (see MEDIA_BAND in lib/safe-zones.mjs)
 *   - media-split: media left half, text right half
 *   - media-overlay: fullscreen media, text overlay top+bottom
 *   - stacked-cards: text-first cards; `scene.media` renders as a dimmed
 *     full-bleed background behind them (ambient only — evidence is routed to
 *     the media-window layouts by #761)
 *
 * Each variant has its own entrance animation pattern and uses
 * SPACING tokens, Interactive.Div on company/result, and conditional GridBg.
 */
import { Interactive, useCurrentFrame, interpolate } from "remotion";
import type { SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, FrameGlow } from "../components/visuals";
import {
  SlideUp,
  SlideDown,
  SlideRight,
  SlideUpFromBottom,
  StampIn,
  ScaleIn,
  FadeIn,
} from "../components/animations/entrance";
import { SPACING, SAFE_ZONES, CANVAS, ANNOTATION } from "../components/shared";
import {
  mediaBottomBarHeightFor,
  mediaBottomBarTopFor,
  MEDIA_BAND,
} from "../../../lib/safe-zones.mjs";
import { MediaScrims } from "../components/MediaScrims";
import { MediaBackground } from "../components/MediaBackground";
import { MediaCard } from "../components/MediaCard";
import { TextGate } from "../components/text-gate";
import { TextGroupGate } from "../components/text-group-gate";
import { SplitHighlight } from "../components/substring-highlight";

type Layout = "media-bottom-bar" | "media-split" | "media-overlay" | "stacked-cards";

/** Fixture-only per-slot TextGate overrides (e.g. lockFontSize for F1). */
type GateOverrides = Record<
  string,
  {
    lockFontSize?: number;
    slotWidth?: number;
    checkContainer?: boolean;
    /** Fixture-only vertical budget override for a TextGroupGate band. */
    groupMaxHeight?: number;
  }
>;

export const NarrativeScene: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir: string;
  gateOverrides?: GateOverrides;
}> = ({ scene, duration, contentDir, gateOverrides }) => {
  const txt = scene.texts || {};
  const layout = (scene.layout ?? "media-bottom-bar") as Layout;
  const hasMedia = !!scene.media;
  const glowColor = scene.id % 2 === 0 ? "red" : "blue";
  const sceneId = `narrative-${scene.id}`;
  const ov = (slot: string) => gateOverrides?.[slot] ?? {};
  const frame = useCurrentFrame();
  const highlightProgress = interpolate(frame, ANNOTATION.highlight.progressRange, [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ─── Shared text elements — every field renders inside a TextGate whose
  // slot id follows the layout, so the contract (sizes, widths, floors) is
  // the single source of truth for all four variants (T5). ───
  const CompanyText = ({ variant = layout }: { variant?: Layout }) =>
    txt.company ? (
      <TextGate
        sceneId={sceneId}
        slotId={`narrative.${variant}.company`}
        {...ov(`narrative.${variant}.company`)}
      >
        {(fontSize) => (
          <Interactive.Div name="company" style={{ fontSize, fontWeight: 900, color: "#f5f5f5" }}>
            {txt.company as string}
          </Interactive.Div>
        )}
      </TextGate>
    ) : null;

  const ResultText = ({ variant = layout }: { variant?: Layout }) =>
    txt.result ? (
      <TextGate
        sceneId={sceneId}
        slotId={`narrative.${variant}.result`}
        {...ov(`narrative.${variant}.result`)}
      >
        {(fontSize) => (
          <Interactive.Div
            name="result"
            style={{
              fontSize,
              fontWeight: 900,
              color: glowColor === "red" ? "#ef4444" : "#f59e0b",
            }}
          >
            <SplitHighlight
              text={txt.result as string}
              highlight={txt.highlight}
              field="result"
              progress={highlightProgress}
              variant="highlight"
            />
          </Interactive.Div>
        )}
      </TextGate>
    ) : null;

  const ActionText = ({ variant = layout }: { variant?: Layout }) =>
    txt.action ? (
      <TextGate
        sceneId={sceneId}
        slotId={`narrative.${variant}.action`}
        {...ov(`narrative.${variant}.action`)}
      >
        {(fontSize) => (
          <div style={{ fontSize, fontWeight: 700, color: "#cbd5e1" }}>
            <SplitHighlight
              text={txt.action as string}
              highlight={txt.highlight}
              field="action"
              progress={highlightProgress}
              variant="highlight"
            />
          </div>
        )}
      </TextGate>
    ) : null;

  const ContextText = ({ variant = layout }: { variant?: Layout }) =>
    txt.context ? (
      <TextGate
        sceneId={sceneId}
        slotId={`narrative.${variant}.context`}
        {...ov(`narrative.${variant}.context`)}
      >
        {(fontSize) => (
          <div style={{ fontSize, fontWeight: 600, color: "#cbd5e1" }}>{txt.context as string}</div>
        )}
      </TextGate>
    ) : null;

  const SourceText = ({ variant = layout }: { variant?: Layout }) =>
    txt.source ? (
      <TextGate
        sceneId={sceneId}
        slotId={`narrative.${variant}.source`}
        {...ov(`narrative.${variant}.source`)}
      >
        {(fontSize) => (
          <div style={{ fontSize, fontWeight: 600, color: "#94a3b8", letterSpacing: "1px" }}>
            {txt.source as string}
          </div>
        )}
      </TextGate>
    ) : null;

  // ─── Layout dispatch ───
  const renderLayout = () => {
    switch (layout) {
      case "media-bottom-bar":
        return <MediaBottomBar />;
      case "media-split":
        return <MediaSplit />;
      case "media-overlay":
        return <MediaOverlay />;
      case "stacked-cards":
        return <StackedCards />;
      default:
        return <MediaBottomBar />;
    }
  };

  // ─── Variant: media-bottom-bar ───
  // Media top, text bar in lower safe zone (above subtitle lane)
  // Safe zone: y∈[220,1150]. Text bar anchored to y=1150, grows upward.
  const MediaBottomBar: React.FC = () => {
    // Geometry lives in safe-zones.mjs next to EVIDENCE_CARD — the card's
    // bottom edge IS this bar's top edge, so the two cannot drift apart.
    // The bar height is per scene (2026-10-24): a scene that declares fewer
    // rows gets a shorter bar, so its text block starts lower in the frame.
    const textBarHeight = mediaBottomBarHeightFor(txt);
    const textBarTop = mediaBottomBarTopFor(txt);
    return (
      <>
        {/* Media fills the frame down to the subtitle lane (2026-10-25), not
            just to the text bar. The picture used to stop at textBarTop and
            the rest of the frame was opaque panel, which put the composition's
            weight in the top half. The scrims below are what keep a full-bleed
            band inside the frame gate's rail and subtitle-gap limits — see the
            MEDIA_BAND note in lib/safe-zones.mjs. Card mode keeps its own
            geometry: it renders a page capture, not a full-bleed picture. */}
        {hasMedia &&
          (scene.media!.mode === "card" ? (
            <MediaCard media={scene.media!} duration={duration} bottom={textBarTop} />
          ) : (
            <>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: MEDIA_BAND.bottom,
                  overflow: "hidden",
                }}
              >
                <MediaBackground
                  media={scene.media!}
                  duration={duration}
                  contentDir={contentDir}
                />
              </div>
              {/* The scrims are what keep a full-bleed band inside the frame
                  gate's rail and subtitle-gap limits — see the MEDIA_BAND note
                  in lib/safe-zones.mjs. */}
              <MediaScrims mediaBottom={MEDIA_BAND.bottom} />
            </>
          ))}
        {/* Text block anchored to the safe zone bottom (y=1150), drawn over the
            picture. No panel background: the bottom scrim already guarantees
            contrast, and an opaque bar would undo the full-bleed band. */}
        <div
          data-text-container
          style={{
            position: "absolute",
            top: textBarTop,
            left: SAFE_ZONES.left,
            right: SAFE_ZONES.right,
            height: textBarHeight,
            maxWidth: CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right - 2 * SPACING.xl,
            padding: `${SPACING.lg}px ${SPACING.xl}px`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: SPACING.sm,
            overflow: "hidden",
            borderTop: `2px solid ${glowColor === "red" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
          }}
        >
          <SlideUpFromBottom delay={0.2} duration={0.5}>
            <CompanyText variant="media-bottom-bar" />
          </SlideUpFromBottom>
          <SlideUp delay={0.4} duration={0.5}>
            <ActionText variant="media-bottom-bar" />
          </SlideUp>
          <StampIn delay={0.6} duration={0.5}>
            <ResultText variant="media-bottom-bar" />
          </StampIn>
          <FadeIn delay={0.8} duration={0.5}>
            <SourceText variant="media-bottom-bar" />
          </FadeIn>
        </div>
      </>
    );
  };

  // ─── Variant: media-split ───
  // Media left half, text right half within safe zone
  // Safe zone: y∈[220,1150], x∈[60,880]
  const MediaSplit: React.FC = () => (
    <>
      {hasMedia && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "50%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
        </div>
      )}
      <div
        data-text-container
        style={{
          position: "absolute",
          top: SAFE_ZONES.top, // 220
          right: SAFE_ZONES.right, // 200 → right edge at x=880
          bottom: SAFE_ZONES.bottom, // 770 → bottom edge at y=1150
          width: 420, // fits in x∈[460,880] (right half minus safe zone)
          maxWidth: 420 - 2 * SPACING.xl,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: SPACING.lg,
          overflow: "hidden",
        }}
      >
        <SlideRight delay={0.2} duration={0.5}>
          <CompanyText variant="media-split" />
        </SlideRight>
        <SlideUp delay={0.4} duration={0.5}>
          <ActionText variant="media-split" />
        </SlideUp>
        <ScaleIn delay={0.6} duration={0.5}>
          <ResultText variant="media-split" />
        </ScaleIn>
        <FadeIn delay={0.8} duration={0.5}>
          <ContextText variant="media-split" />
        </FadeIn>
        <FadeIn delay={1.0} duration={0.5}>
          <SourceText variant="media-split" />
        </FadeIn>
      </div>
    </>
  );

  // ─── Variant: media-overlay ───
  // Fullscreen media, text overlay top+bottom within safe zone
  // Safe zone: y∈[220,1150]. Top overlay at y=220, bottom overlay anchored to y=1150.
  // T9 (decision 68): each band's fields share one vertical budget enforced
  // by TextGroupGate — over budget it shrinks the band's fields in contract
  // order instead of silently growing into the other band.
  const MediaOverlay: React.FC = () => (
    <>
      {hasMedia && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
        </div>
      )}
      {/* Top overlay — badge/company/action, starting at safe zone top (y=220) */}
      <TextGroupGate
        sceneId={sceneId}
        groupId="narrative.media-overlay.top-band"
        maxHeight={ov("narrative.media-overlay.top-band").groupMaxHeight}
        style={{
          position: "absolute",
          top: SAFE_ZONES.top, // 220
          left: SAFE_ZONES.left, // 60
          right: SAFE_ZONES.right, // 200 → right edge at x=880
          maxWidth: CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right,
          display: "flex",
          flexDirection: "column",
          gap: SPACING.sm,
          overflow: "hidden",
        }}
      >
        <FadeIn delay={0.2} duration={0.5}>
          {txt.badge && (
            <TextGate sceneId={sceneId} slotId="narrative.media-overlay.badge">
              {(fontSize) => (
                <div
                  style={{
                    display: "inline-block",
                    padding: `${SPACING.md}px ${SPACING.xl}px`,
                    border: `2px solid ${glowColor === "red" ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`,
                    borderRadius: 8,
                    background:
                      glowColor === "red" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                    fontSize,
                    fontWeight: 800,
                    color: glowColor === "red" ? "#ef4444" : "#f59e0b",
                    letterSpacing: "2px",
                  }}
                >
                  {txt.badge as string}
                </div>
              )}
            </TextGate>
          )}
        </FadeIn>
        <SlideDown delay={0.4} duration={0.5}>
          <CompanyText variant="media-overlay" />
        </SlideDown>
        <SlideUp delay={0.55} duration={0.5}>
          <ActionText variant="media-overlay" />
        </SlideUp>
      </TextGroupGate>
      {/* Bottom overlay — result/context/source, anchored to safe zone bottom (y=1150) */}
      <TextGroupGate
        sceneId={sceneId}
        groupId="narrative.media-overlay.bottom-band"
        maxHeight={ov("narrative.media-overlay.bottom-band").groupMaxHeight}
        style={{
          position: "absolute",
          bottom: SAFE_ZONES.bottom, // 770 → bottom edge at y=1150
          left: SAFE_ZONES.left,
          right: SAFE_ZONES.right,
          maxWidth: CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right - 2 * SPACING["2xl"],
          display: "flex",
          flexDirection: "column",
          gap: SPACING.sm,
          background: "linear-gradient(to top, rgba(10,10,20,0.8), transparent)",
          padding: `${SPACING.xl}px ${SPACING["2xl"]}px`,
          overflow: "hidden",
        }}
      >
        <StampIn delay={0.6} duration={0.5}>
          <ResultText variant="media-overlay" />
        </StampIn>
        <FadeIn delay={0.75} duration={0.5}>
          <ContextText variant="media-overlay" />
        </FadeIn>
        <FadeIn delay={0.9} duration={0.5}>
          <SourceText variant="media-overlay" />
        </FadeIn>
      </TextGroupGate>
    </>
  );

  // ─── Variant: stacked-cards ───
  // Text-first cards stack vertically within the safe zone. A bound
  // `scene.media` renders as a full-bleed background behind them (see the
  // render block below) — ambient only, never evidence (#761).
  // Safe zone: y∈[220,1150], x∈[60,880]
  const StackedCards: React.FC = () => {
    const cards = [
      { label: txt.company, value: txt.action, delay: 0.2 },
      { label: txt.context, value: txt.result, delay: 0.5 },
    ].filter((c) => c.label || c.value);

    return (
      <div
        data-text-container
        style={{
          position: "absolute",
          top: SAFE_ZONES.top, // 220
          left: SAFE_ZONES.left, // 60
          right: SAFE_ZONES.right, // 200 → right edge at x=880
          bottom: SAFE_ZONES.bottom, // 770 → bottom edge at y=1150
          maxWidth: CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: SPACING.xl,
          overflow: "hidden",
        }}
      >
        {/* Badge chip above the cards — same shape as the media-overlay chip;
            the gate wraps the chip so its padding/border stay INSIDE the slot
            (quote-7 lesson: never nest the gate inside the decoration). */}
        {txt.badge && (
          <FadeIn delay={0.1} duration={0.5}>
            <TextGate sceneId={sceneId} slotId="narrative.stacked-cards.badge">
              {(fontSize) => (
                <div
                  style={{
                    display: "inline-block",
                    padding: SPACING.md + "px " + SPACING.xl + "px",
                    border:
                      "2px solid " +
                      (glowColor === "red" ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"),
                    borderRadius: 8,
                    background:
                      glowColor === "red" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                    fontSize,
                    fontWeight: 800,
                    color: glowColor === "red" ? "#ef4444" : "#f59e0b",
                    letterSpacing: "2px",
                  }}
                >
                  {txt.badge as string}
                </div>
              )}
            </TextGate>
          </FadeIn>
        )}
        {cards.map((card, i) => (
          <StampIn key={i} delay={card.delay} duration={0.5}>
            <div
              style={{
                padding: SPACING["2xl"],
                border: `2px solid ${i === 0 ? "rgba(77,139,255,0.2)" : "rgba(245,158,11,0.2)"}`,
                borderRadius: 12,
                background: "rgba(10,10,20,0.6)",
              }}
            >
              {/* Cards read label/value from the contract fields: card 0 shows
                  company+action, card 1 shows context+result. */}
              {card.label && (
                <ScaleIn delay={card.delay + 0.1} duration={0.4}>
                  <div style={{ marginBottom: SPACING.sm }}>
                    {i === 0 ? (
                      <CompanyText variant="stacked-cards" />
                    ) : (
                      <ContextText variant="stacked-cards" />
                    )}
                  </div>
                </ScaleIn>
              )}
              {card.value &&
                (i === 0 ? (
                  <ActionText variant="stacked-cards" />
                ) : (
                  <ResultText variant="stacked-cards" />
                ))}
            </div>
          </StampIn>
        ))}
        <SlideUp delay={1.0} duration={0.5}>
          <SourceText variant="stacked-cards" />
        </SlideUp>
      </div>
    );
  };

  // ─── Render ───
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.layout === "stacked-cards" && hasMedia && (
        <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
      )}
      {renderLayout()}
      {/* GridBg only when no media */}
      {!hasMedia && <GridBg />}
      <Glow color={glowColor} />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />
    </div>
  );
};
