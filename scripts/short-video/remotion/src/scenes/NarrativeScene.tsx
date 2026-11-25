/**
 * NarrativeScene — layout-driven scene template.
 *
 * Dispatches by `scene.layout` field into 5 variants:
 *   - media-first: picture owns the content band, compact copy overlaid at the
 *     bottom (see MEDIA_FIRST in lib/safe-zones.mjs; #1524)
 *   - media-bottom-bar: full-bleed media to the content bottom, text over its
 *     own opaque MediaTextPanel (see MEDIA_BAND in lib/safe-zones.mjs)
 *   - media-split: media left half, text right half
 *   - media-overlay: fullscreen media, text overlay top+bottom
 *   - stacked-cards: text-first cards; `scene.media` renders as a full-bleed
 *     background behind them without dimming (ambient only — evidence is
 *     routed to the media-window layouts by #761)
 *
 * Each variant has its own entrance animation pattern and uses
 * SPACING tokens and Interactive.Div on company/result.
 */
import { Interactive, useCurrentFrame, interpolate } from "remotion";
import type { SceneData } from "../types";
import { Glow, BrandBar } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import {
  SlideUp,
  SlideDown,
  SlideRight,
  SlideUpFromBottom,
  StampIn,
  ScaleIn,
  FadeIn,
} from "../components/animations/entrance";
import { SPACING, SAFE_ZONES, CANVAS, ANNOTATION, COLOR } from "../components/shared";
import {
  mediaBottomBarHeightFor,
  mediaBottomBarTopFor,
  mediaFirstBarHeightFor,
  mediaFirstBarTopFor,
  MEDIA_FIRST,
  MEDIA_BAND,
} from "../../../lib/safe-zones.mjs";
import { MediaTextPanel } from "../components/MediaTextPanel";
import { MediaBackground } from "../components/MediaBackground";
import { MediaCard } from "../components/MediaCard";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";
import { TextGroupGate } from "../components/text-group-gate";
import { SplitHighlight } from "../components/substring-highlight";
import { mediaRoleOf, MEDIA_ROLE } from "../../../lib/media-role.mjs";
import { compactMediaTexts, isCompactMediaScene } from "../../../lib/media-copy.mjs";

type Layout =
  "media-first" | "media-bottom-bar" | "media-split" | "media-overlay" | "stacked-cards";

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
  // media role (2026-11-18): decorative media is declared but never gets the
  // full-bleed band — it renders in the same bounded card the evidence path uses.
  const mediaRole = mediaRoleOf(scene);
  const glowColor = scene.id % 2 === 0 ? "red" : "blue";
  const sceneId = `narrative-${scene.id}`;
  const ov = (slot: string) => gateOverrides?.[slot] ?? {};
  const frame = useCurrentFrame();
  const highlightProgress = interpolate(frame, ANNOTATION.highlight.progressRange, [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // #738: the payoff is the protagonist (every layout draws it once), the
  // company line takes the focus first. Narrative alternates its accent per
  // scene id, so the light follows the colour the template actually paints.
  const lightTone = glowColor === "red" ? ("red" as const) : ("amber" as const);
  const companyLight = useFocusLight("narrative", "company", duration, { tone: lightTone });
  const resultLight = useFocusLight("narrative", "result", duration, { tone: lightTone });

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
          <Interactive.Div
            name="company"
            style={{
              fontSize,
              fontWeight: 900,
              color: COLOR.text,
              // #738: first beat — the subject takes the focus, then hands it on.
              ...companyLight,
            }}
          >
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
              color: glowColor === "red" ? COLOR.red : COLOR.amber,
              // #738: protagonist light — the payoff owns the frame from 1.1s.
              ...resultLight,
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
          <div style={{ fontSize, fontWeight: 700, color: COLOR.textMuted }}>
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
          <div style={{ fontSize, fontWeight: 600, color: COLOR.textMuted }}>
            {txt.context as string}
          </div>
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
          <div
            style={{
              fontSize,
              fontWeight: 600,
              color: variant === "media-first" ? COLOR.text : COLOR.textDim,
              letterSpacing: "1px",
            }}
          >
            {txt.source as string}
          </div>
        )}
      </TextGate>
    ) : null;

  // ─── Layout dispatch ───
  const hasMedia = !!scene.media;
  // A picture that owns the frame is the page: a small brand lockup laid over
  // it covers the exact evidence the viewer came for. Keep the lockup for
  // text-only pages and bounded cards; drop it when media is full-bleed.
  const hasFullBleedMedia =
    hasMedia && !(scene.media!.mode === "card" || mediaRole === MEDIA_ROLE.CARD);

  const renderLayout = () => {
    // #1524: media-first is evidence-only. The picture owns the content band
    // and the copy is a compact overlay; a decorative/ambient picture is
    // explicitly routed to the bounded card path below instead.
    if (layout === "media-first" && mediaRole === MEDIA_ROLE.EVIDENCE) return <MediaFirst />;
    // Non-evidence media: no split, no overlay. The bottom bar is the only
    // layout that can hold a text block plus either a background band or a
    // bounded card, and it is what keeps text out of the picture's focal area.
    if (hasMedia && mediaRole !== MEDIA_ROLE.EVIDENCE) return <MediaBottomBar />;
    switch (layout) {
      case "media-first":
        return <MediaFirst />;
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
    //
    // 2026-11-25: a full-bleed evidence page renders only its two highest-signal
    // rows. The picture owns the page; four rows of caption were pushing it up
    // and crowding the subtitle lane. A card/page capture keeps its full block.
    const compact = isCompactMediaScene(scene);
    const displayTexts = compact ? compactMediaTexts(txt) : txt;
    const textBarHeight = mediaBottomBarHeightFor(displayTexts);
    const textBarTop = mediaBottomBarTopFor(displayTexts);
    return (
      <>
        {/* Media owns the band above the text bar. On a contain binding the
            picture's bottom edge IS textBarTop (2026-11-25): the two regions
            never overlap, even when the copy runs to four rows. A cover
            binding fills the content band and the text bar gets its own opaque
            panel; the picture itself is never dimmed. Card mode keeps its own
            geometry: it renders a page capture, not a full-bleed picture. */}
        {hasMedia &&
          (scene.media!.mode === "card" || mediaRole === MEDIA_ROLE.CARD ? (
            <MediaCard media={scene.media!} duration={duration} bottom={textBarTop} />
          ) : (
            <>
              <div
                style={{
                  position: "absolute",
                  // contain → the picture's own band, hung on the text bar
                  // (textBarTop, with containAlign="bottom" passed below —
                  // MediaBackground defaults to centring, #1075).
                  // cover → the full-bleed band, unchanged.
                  top: scene.media!.fit === "contain" ? SAFE_ZONES.top : 0,
                  left: 0,
                  right: 0,
                  height:
                    scene.media!.fit === "contain"
                      ? textBarTop - SAFE_ZONES.top
                      : MEDIA_BAND.bottom,
                  overflow: "hidden",
                }}
              >
                <MediaBackground
                  media={scene.media!}
                  duration={duration}
                  contentDir={contentDir}
                  containAlign="bottom"
                />
              </div>
              {/* Copy always gets its own opaque surface. On contain the
                  picture already ends at textBarTop; on cover this covers its
                  lower part. Neither mode dims the picture. */}
              <MediaTextPanel top={textBarTop} bottom={MEDIA_BAND.bottom} />
            </>
          ))}
        {/* Text block anchored to the safe zone bottom (y=1150), drawn on the
            opaque panel above. The picture keeps its own brightness; the text
            gets its own surface. */}
        <Camera visualType="narrative" duration={duration}>
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
            {displayTexts.company && (
              <SlideUpFromBottom delay={0.2} duration={0.5}>
                <CompanyText variant="media-bottom-bar" />
              </SlideUpFromBottom>
            )}
            {displayTexts.action && (
              <SlideUp delay={0.4} duration={0.5}>
                <ActionText variant="media-bottom-bar" />
              </SlideUp>
            )}
            {displayTexts.result && (
              <StampIn delay={0.6} duration={0.5}>
                <ResultText variant="media-bottom-bar" />
              </StampIn>
            )}
            {displayTexts.source && (
              <FadeIn delay={0.8} duration={0.5}>
                <SourceText variant="media-bottom-bar" />
              </FadeIn>
            )}
          </div>
        </Camera>
      </>
    );
  };

  // ─── Variant: media-first (#1524) ───
  // Picture first: media runs the whole canvas (1080×1920) and the copy is a
  // compact plate anchored to the content bottom. A 16:9 source stays at full
  // width with `fit:"contain"` + `fill:"blur"`, so the subject is never cropped
  // and no black bar is visible; `containAlign="upper"` drops the picture into
  // the top third, leaving the blurred fill below it for the copy and the
  // subtitle lane. No gradient vignettes and no dim layer: media is never
  // darkened, so contrast comes from the flat copy plate.
  const MediaFirst: React.FC = () => {
    const displayTexts = compactMediaTexts(txt);
    const blockHeight = mediaFirstBarHeightFor(displayTexts);
    const blockTop = mediaFirstBarTopFor(displayTexts);
    return (
      <>
        {hasMedia && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <MediaBackground
              media={scene.media!}
              duration={duration}
              contentDir={contentDir}
              containAlign="upper"
            />
          </div>
        )}
        {blockHeight > 0 && (
          <div
            style={{
              position: "absolute",
              top: blockTop,
              left: 0,
              right: 0,
              height: blockHeight,
              background: `rgba(10,10,20,${MEDIA_FIRST.textBedAlpha})`,
            }}
          />
        )}
        {blockHeight > 0 && (
          <Camera visualType="narrative" duration={duration}>
            <div
              data-text-container
              style={{
                position: "absolute",
                top: blockTop,
                left: SAFE_ZONES.left,
                right: SAFE_ZONES.right,
                height: blockHeight,
                maxWidth: CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right - 2 * SPACING.xl,
                padding: `${SPACING.lg}px ${SPACING.xl}px`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: SPACING.sm,
                overflow: "hidden",
                // No border and no text shadow: the flat plate behind this
                // block is the contrast bed. It is a hard-edged 256px band,
                // not a gradient over the picture.
              }}
            >
              {displayTexts.company && (
                <SlideUpFromBottom delay={0.2} duration={0.5}>
                  <CompanyText variant="media-first" />
                </SlideUpFromBottom>
              )}
              {displayTexts.result && (
                <StampIn delay={0.4} duration={0.5}>
                  <ResultText variant="media-first" />
                </StampIn>
              )}
              {displayTexts.source && (
                <FadeIn delay={0.6} duration={0.5}>
                  <SourceText variant="media-first" />
                </FadeIn>
              )}
            </div>
          </Camera>
        )}
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
      <Camera visualType="narrative" duration={duration}>
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
      </Camera>
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
      <Camera visualType="narrative" duration={duration}>
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
            background: COLOR.canvas,
            outline: `${SPACING.xl}px solid ${COLOR.canvas}`,
            borderRadius: 12,
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
                      color: glowColor === "red" ? COLOR.red : COLOR.amber,
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
            background: COLOR.canvas,
            borderRadius: 12,
            outline: `${SPACING.xl}px solid ${COLOR.canvas}`,
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
      </Camera>
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
      <Camera visualType="narrative" duration={duration}>
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
                      color: glowColor === "red" ? COLOR.red : COLOR.amber,
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
                  background: COLOR.canvas,
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
      </Camera>
    );
  };

  // ─── Render ───
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.layout === "stacked-cards" && hasMedia && (
        <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
      )}
      {/* Background chrome precedes content, as in the other eight
          templates. Until #1215 the background layers were painted after
          renderLayout(), i.e. on top of the text. */}
      <Glow color={glowColor} />
      {/* media-overlay puts copy in the top band, so there the brand bar must
          stay behind the layout. Every other layout paints the lockup LAST so
          text cannot bury it — except when a full-bleed picture owns the
          frame, where the lockup is omitted instead of covering the evidence. */}
      {scene.layout === "media-overlay" && <BrandBar />}
      {renderLayout()}
      {scene.layout !== "media-overlay" && !hasFullBleedMedia && <BrandBar />}
    </div>
  );
};
