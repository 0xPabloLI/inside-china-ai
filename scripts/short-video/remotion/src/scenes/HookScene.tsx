/**
 * HookScene — the opening "hook" scene template.
 *
 * Derived from the retired hookScene() HTML template
 * (removed 2026-09-20, see git history).
 * All font sizes, colors, positions are精确对照 from its templateCss().
 *
 * Two variants: number-led (bigNumber) or claim-led (hookText + revealText).
 * Optionally renders a media background when scene.media is present.
 */
import { staticFile, CanvasImage, Interactive, useCurrentFrame, interpolate } from "remotion";
import { Circle } from "@remotion/rough-notation";
import type { SceneData } from "../types";
import {
  GridBg,
  Glow,
  Scanlines,
  BrandBar,
  BadgePill,
  StatCard,
  Slot,
  FrameGlow,
} from "../components/visuals";
import { SlideUp, ScaleIn, StampIn } from "../components/animations/entrance";
import { SPACING, ANNOTATION, CANVAS } from "../components/shared";
import { NumberPulse, ScanSweep } from "../components/animations/loops";
import { MediaBackground } from "../components/MediaBackground";
import { MediaScrims } from "../components/MediaScrims";
import { MediaCard } from "../components/MediaCard";
import { TextGate } from "../components/text-gate";
import { HOOK_SUBJECT_ROW, hookSubjectTextWidth } from "../../../lib/text-slots.mjs";
import { AnnotationCollisionAssert } from "../components/annotation-collision-gate";
import { SplitHighlight } from "../components/substring-highlight";

const COLORS: Record<string, string> = {
  blue: "#4d8bff",
  red: "#ef4444",
  amber: "#f59e0b",
  green: "#34d399",
  purple: "#6d4eff",
  cyan: "#22d3ee",
};

/**
 * The hook's three-band partition of the safe zone (y 220-1150, 930px).
 *
 * Re-derived from the band CONTENTS under the #688 type scale, measured by
 * rendering every hook scene of every content pack plus the gate fixtures
 * through a temporary box-union probe (each band's [data-text-container]
 * children, min top to max bottom). Each band's budget is its worst case, and
 * the three worst cases come from different scenes:
 *
 *   band     need (worst case)                    was   now
 *   kicker   71  badge pill (hook)                180   78
 *   hero     539 hook-logo-long: 2-line subject   550   542
 *                at 64 + bigNumber + numberLabel
 *   support  305.8 hook-logo-claim: 1 stat card   200   310
 *                at 64 (two-line 0.5em label) +
 *                two-line 40px source
 *
 * Sum 915.8 of 930 — the remaining 14.2px is the distributed slack (7 / 3 /
 * 4.2). Before the re-derivation the support band's 200px cancelled every
 * hook whose stat card carries a two-line label AND whose source wraps, and
 * the 180px kicker held a 71px pill.
 *
 * Reclaiming the budget needed three on-scale tightenings rather than a
 * shave: the badge pill's vertical padding 16 -> 12, the stat card's 16 -> 12,
 * and the source line's margin 12 -> 8 (12 was off the 8px spacing scale —
 * see docs/conventions/visual-design-loop.md).
 *
 * The three bands stay contiguous and inside the safe zone.
 */
const HOOK_BANDS = {
  kicker: { top: 220, height: 78 },
  hero: { top: 298, height: 542 },
  support: { top: 840, height: 310 },
};

export const HookScene: React.FC<{ scene: SceneData; duration: number; contentDir?: string }> = ({
  scene,
  duration,
  contentDir,
}) => {
  const txt = scene.texts || {};
  const colorKey = /^(blue|red|amber|green|purple|cyan)$/.test(txt.color as string)
    ? (txt.color as string)
    : "blue";
  const color = COLORS[colorKey] ?? COLORS.blue;
  const stats = Array.isArray(txt.stats) ? txt.stats : [];
  const sceneId = `hook-${scene.id}`;
  const frame = useCurrentFrame();
  const circleProgress = interpolate(frame, ANNOTATION.circle.progressRange, [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const underlineProgress = interpolate(frame, ANNOTATION.underline.progressRange, [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Decision 7: the circle annotation exists only around a SHORT number —
  // one predicate gates the box="inside" Circle, the gate's annotation
  // expectation, and the F7 collision assert so the three can never drift.
  const circleAroundNumber = !!txt.bigNumber && (txt.bigNumber as string).length <= 5;

  // #422: the logo shares the subject row, so it spends its own box and the
  // row gap before the text starts. The slot contract measures the whole band
  // (820); the subject gate may only render into what is left, or the row
  // grows past the band and the safe-zone / container assert cancels the
  // render (the bug that kept `texts.subjectLogo` unrenderable).
  const hasSubjectLogo = !!txt.subjectLogo;
  const subjectWidth = hookSubjectTextWidth({ hasLogo: hasSubjectLogo });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.media &&
        (scene.media.mode === "card" ? (
          <MediaCard media={scene.media} duration={duration} />
        ) : (
          <>
            <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
            {/* The hook's media is full-frame, so it covers the action rail and
                the subtitle gap directly. The scrims are what hold those
                regions under the frame gate's brightness limit for daylight
                footage — see the MEDIA_BAND note in lib/safe-zones.mjs. */}
            <MediaScrims mediaBottom={CANVAS.height} />
          </>
        ))}
      {/* Background layers — CSS: .grid-bg + .glow-tint + .scanlines + .scan-sweep */}
      <GridBg />
      <div
        style={{
          position: "absolute",
          bottom: -250,
          left: -200,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}1a 0%, transparent 60%)`,
        }}
      />
      <Scanlines />
      <ScanSweep duration={duration} />
      <BrandBar />
      <FrameGlow variant="amber" />

      {/* Kicker slot — optional badge pill (NOT breaking badge) */}
      {txt.badge && (
        <Slot variant="kicker" top={HOOK_BANDS.kicker.top} height={HOOK_BANDS.kicker.height}>
          <StampIn delay={0.2} duration={0.4}>
            <TextGate sceneId={sceneId} slotId="hook.hero-center.badge">
              {(fontSize) => <BadgePill text={txt.badge as string} fontSize={fontSize} />}
            </TextGate>
          </StampIn>
        </Slot>
      )}

      {/* Hero slot — subject row + focal */}
      <Slot variant="hero" top={HOOK_BANDS.hero.top} height={HOOK_BANDS.hero.height}>
        {/* Subject row (logo 96px + name 64px) */}
        {(txt.subjectLogo || txt.subject) && (
          <SlideUp
            delay={0.2}
            duration={0.4}
            dataMeasureBox="subject-row"
            // #422: the row is a flex item of a centre-aligned column band, so
            // its cross size is fit-content — with the logo it measured
            // 96+24+820 = 940, 120px wider than the band, and the centred row
            // pushed the logo (and the gate) past the safe zone on BOTH sides.
            // Capping it at the band's content box makes the overflow
            // impossible regardless of what the row's children claim.
            style={{
              display: "flex",
              alignItems: "center",
              // Only bites when the row is narrower than the band — i.e. the
              // logo-only shape, where it keeps the mark centred as before.
              // With a subject the gate's width is fixed at the reserved
              // budget, so the lockup fills the row and reads left-anchored
              // (exactly as the no-logo shape always did); optically centring
              // a short name is a #291 design question, not this fix's.
              justifyContent: "center",
              gap: HOOK_SUBJECT_ROW.gap,
              width: "100%",
              marginBottom: 32,
            }}
          >
            {txt.subjectLogo && (
              // Fixed-size brand mark: the wrapper owns the box so the logo
              // can never be squeezed by the text's flex claim, and so the
              // #422 probe can read its real geometry (`measure:hook-logo-row`).
              <div
                data-measure-box="subject-logo"
                style={{
                  flexShrink: 0,
                  width: HOOK_SUBJECT_ROW.logoSize,
                  height: HOOK_SUBJECT_ROW.logoSize,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CanvasImage
                  src={staticFile(`assets/logos/${txt.subjectLogo}.svg`)}
                  style={{
                    width: HOOK_SUBJECT_ROW.logoSize,
                    height: HOOK_SUBJECT_ROW.logoSize,
                    filter: "drop-shadow(0 0 25px rgba(77,139,255,0.3))",
                    // Brand marks are wide wordmarks (deepseek.svg is 195×41);
                    // a canvas defaults to object-fit: fill, which stretched
                    // this one to the square box. contain keeps the wordmark
                    // at its own aspect, centred in the box.
                    objectFit: "contain",
                  }}
                />
              </div>
            )}
            {txt.subject && (
              // minWidth:0 lets the row shrink this wrapper to the reserved
              // width instead of the gate's min-content — without it a long
              // unbreakable word silently re-widens the row back out of the
              // band. Inside a plain block the gate's `width` is exact, so
              // Fit still measures the reserved width, not a flex artefact.
              <div style={{ minWidth: 0, maxWidth: subjectWidth, flexShrink: 1 }}>
                <TextGate
                  sceneId={sceneId}
                  slotId="hook.hero-center.subject"
                  slotWidth={subjectWidth}
                >
                  {(fontSize) => (
                    <span
                      style={{
                        fontSize,
                        fontWeight: 900,
                        color: "#f5f5f5",
                        letterSpacing: "4px",
                        textShadow: `0 0 30px ${color}66`,
                      }}
                    >
                      {txt.subject as string}
                    </span>
                  )}
                </TextGate>
              </div>
            )}
          </SlideUp>
        )}

        {/* Focal — number-led preferred (contract bigNumber 240, amber) */}
        {txt.bigNumber ? (
          <div style={{ textAlign: "center" }}>
            <TextGate
              sceneId={sceneId}
              slotId="hook.hero-center.bigNumber"
              expectAnnotation={circleAroundNumber}
            >
              {(fontSize) => (
                <Interactive.Div
                  name="bigNumber"
                  style={{
                    fontSize,
                    fontWeight: 900,
                    color: "#f59e0b",
                    letterSpacing: "-10px",
                    // ≥ the font's natural ascent+descent (~1.1em): 0.9 made
                    // the inline text rects poke ~19px above the gate box and
                    // false-fail Fit (T5).
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    textShadow: "0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3)",
                  }}
                >
                  <NumberPulse interval={2} color="rgba(245,158,11">
                    {circleAroundNumber ? (
                      // T10 (decision 7): box="inside" keeps the ellipse within
                      // the number's own box — the circle must never cover the
                      // subject above or the numberLabel below. F7 asserts that
                      // contract on every settled frame (assert mounted below).
                      <Circle
                        color="#f59e0b"
                        strokeWidth={ANNOTATION.circle.strokeWidth}
                        padding={ANNOTATION.circle.padding}
                        progress={circleProgress}
                        box="inside"
                      >
                        {txt.bigNumber as string}
                      </Circle>
                    ) : (
                      (txt.bigNumber as string)
                    )}
                  </NumberPulse>
                </Interactive.Div>
              )}
            </TextGate>
            {txt.numberLabel && (
              <SlideUp delay={0.6} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="hook.hero-center.numberLabel">
                  {(fontSize) => (
                    <Interactive.Div
                      name="numberLabel"
                      style={{
                        fontSize,
                        fontWeight: 800,
                        color: "#f5f5f5",
                        letterSpacing: "3px",
                        marginTop: SPACING.lg,
                        textAlign: "center",
                      }}
                    >
                      {(txt.numberLabel as string).replace(
                        (txt.numberHighlight as string) ?? "",
                        "",
                      )}
                      {txt.numberHighlight && (
                        <span style={{ color: "#ef4444" }}>{txt.numberHighlight as string}</span>
                      )}
                    </Interactive.Div>
                  )}
                </TextGate>
              </SlideUp>
            )}
            {/* F7 (decision 7): the circle vs subject / numberLabel, each its
                own ≤2% denominator — mounted only when the circle exists. */}
            {circleAroundNumber && (
              <AnnotationCollisionAssert
                sceneId={sceneId}
                sourceSlotId="hook.hero-center.bigNumber"
                targetSlotIds={[
                  ...(txt.subject ? ["hook.hero-center.subject"] : []),
                  ...(txt.numberLabel ? ["hook.hero-center.numberLabel"] : []),
                ]}
              />
            )}
          </div>
        ) : txt.hookText ? (
          <div style={{ textAlign: "center" }}>
            {/* Focal claim — contract hookText 78, line-height 1.1 */}
            <TextGate sceneId={sceneId} slotId="hook.hero-center.hookText">
              {(fontSize) => (
                <Interactive.Div
                  name="hookText"
                  style={{
                    fontSize,
                    fontWeight: 900,
                    color: "#f5f5f5",
                    letterSpacing: "2px",
                    lineHeight: 1.1,
                    textShadow: `0 0 40px ${color}66`,
                  }}
                >
                  <SplitHighlight
                    text={txt.hookText as string}
                    highlight={txt.highlight}
                    field="hookText"
                    progress={underlineProgress}
                    variant="underline"
                    color={color}
                  />
                </Interactive.Div>
              )}
            </TextGate>
            {/* Focal reveal — contract revealText 80, stampIn at 0.8s */}
            {txt.revealText && (
              <StampIn delay={0.8} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="hook.hero-center.revealText">
                  {(fontSize) => (
                    <Interactive.Div
                      name="revealText"
                      style={{
                        fontSize,
                        fontWeight: 900,
                        color,
                        letterSpacing: "2px",
                        // ≥ the font's natural line box (~1.107em): at 1.05
                        // the Range rect poked 2px past BOTH edges of the
                        // element's own box at every candidate size, so Fit
                        // exhausted its ladder at the 56px floor and cancelled
                        // the render — claim-led hooks with a reveal could not
                        // render at all (#576; same trap as the bigNumber /
                        // source line-heights noted below). At 1.1 the rect sits
                        // flush inside the box (measured 0px poke at 80px).
                        lineHeight: 1.1,
                        marginTop: SPACING.xl,
                        textAlign: "center",
                      }}
                    >
                      {txt.revealText as string}
                    </Interactive.Div>
                  )}
                </TextGate>
              </StampIn>
            )}
          </div>
        ) : null}
      </Slot>

      {/* Support slot — stats + source */}
      <Slot variant="support" top={HOOK_BANDS.support.top} height={HOOK_BANDS.support.height}>
        {stats.length > 0 && (
          <div style={{ display: "flex", gap: 24, justifyContent: "center", width: "100%" }}>
            {stats.map((s, i) => (
              <SlideUp key={i} delay={0.8 + i * 0.15} duration={0.5}>
                <StatCard
                  num={s.num}
                  unit={s.unit}
                  label={s.label}
                  color={i === 0 ? "#f59e0b" : color}
                  sceneId={sceneId}
                  index={i}
                />
              </SlideUp>
            ))}
          </div>
        )}
        {txt.source && (
          <TextGate sceneId={sceneId} slotId="hook.hero-center.source">
            {(fontSize) => (
              <div
                style={{
                  fontSize,
                  fontWeight: 700,
                  color: "#cbd5e1",
                  letterSpacing: "3px",
                  textAlign: "center",
                  // ≥ the font's natural ascent+descent (~1.1em): tighter
                  // line-height makes the inline text rects poke below the
                  // gate box and false-fail the settled assert (T5).
                  lineHeight: 1.2,
                  // #255: stats + source stack fills the support band almost
                  // exactly, resting the source gate flush on the band's
                  // bottom edge — which coincides with the content safe-zone
                  // bottom — so a glyph ink descent ("p" in "DeepSeek")
                  // overflowed the container by 0.277px. 8px keeps the gate
                  // off that edge (and is on the 8px spacing scale; the
                  // original 12px was not).
                  marginTop: stats.length > 0 ? 8 : 0,
                }}
              >
                {txt.source as string}
              </div>
            )}
          </TextGate>
        )}
      </Slot>
    </div>
  );
};
