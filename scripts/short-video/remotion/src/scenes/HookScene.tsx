/**
 * HookScene — the opening "hook" scene template.
 *
 * Derived from the retired hookScene() HTML template
 * (retired-html-path/scene-templates.mjs).
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
import { SPACING, ANNOTATION } from "../components/shared";
import { NumberPulse, ScanSweep } from "../components/animations/loops";
import { MediaBackground } from "../components/MediaBackground";
import { TextGate } from "../components/text-gate";
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

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.media && (
        <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
      )}
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
        <Slot variant="kicker">
          <StampIn delay={0.2} duration={0.4}>
            <TextGate sceneId={sceneId} slotId="hook.hero-center.badge">
              {(fontSize) => <BadgePill text={txt.badge as string} fontSize={fontSize} />}
            </TextGate>
          </StampIn>
        </Slot>
      )}

      {/* Hero slot — subject row + focal */}
      <Slot variant="hero">
        {/* Subject row (logo 96px + name 64px) */}
        {(txt.subjectLogo || txt.subject) && (
          <SlideUp
            delay={0.2}
            duration={0.4}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              marginBottom: 32,
            }}
          >
            {txt.subjectLogo && (
              <CanvasImage
                src={staticFile(`assets/logos/${txt.subjectLogo}.svg`)}
                style={{
                  width: 96,
                  height: 96,
                  filter: "drop-shadow(0 0 25px rgba(77,139,255,0.3))",
                }}
              />
            )}
            {txt.subject && (
              <TextGate sceneId={sceneId} slotId="hook.hero-center.subject">
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
                      <Circle color="#f59e0b" progress={circleProgress} box="inside">
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
                        lineHeight: 1.05,
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
      <Slot variant="support">
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
                  marginTop: stats.length > 0 ? 24 : 0,
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
