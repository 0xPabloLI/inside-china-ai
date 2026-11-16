/**
 * StatRevealScene — large number reveal with label and source.
 * Scene 9 in the Unitree video (China 97% market share).
 *
 * Light (#738): the number is the protagonist (white flash as it stamps in),
 * the label takes the focus at 1.1s. The centre wash behind the number is gone;
 * the number itself is now what carries the light.
 */
import { useCurrentFrame, interpolate } from "remotion";
import { Circle } from "@remotion/rough-notation";
import { type SceneData } from "../types";
import { BrandBar, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { StampIn, SlideUp, FadeIn } from "../components/animations/entrance";
import { SPACING, COLOR, ANNOTATION } from "../components/shared";
import { Camera } from "../components/Camera";
import { MediaBackground } from "../components/MediaBackground";
import { TextGate } from "../components/text-gate";
import { ComparisonRail } from "../components/topology";
import { resolveRenderLayout } from "../../../lib/text-slots.mjs";

/** Animated numeric prefix for the set-piece count-up (20 frames to land). */
function countUpText(text: string, frame: number, windowFrames = 20): string {
  const match = /^([^0-9]*)(\d+(?:\.\d+)?)(.*)$/.exec(text);
  if (!match) return text;
  const value = Number(match[2]);
  const decimals = (match[2].split(".")[1] ?? "").length;
  const progress = Math.max(0, Math.min(1, frame / windowFrames));
  return `${match[1]}${(value * progress).toFixed(decimals)}${match[3]}`;
}

export const StatRevealScene: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const sceneId = `stat-reveal-${scene.id}`;
  const frame = useCurrentFrame();
  const numberLight = useFocusLight("stat-reveal", "bigNumber", duration);
  const labelLight = useFocusLight("stat-reveal", "label", duration);
  const circleProgress = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const layout = resolveRenderLayout(scene);
  // The set-piece requires a comparison object: `subtext` is the baseline
  // label. Without it the hero-center layout is the honest rendering, not a
  // large number pretending to be a comparison.
  const setPiece = layout === "set-piece" && Boolean(txt.bigNumber) && Boolean(txt.subtext);

  if (setPiece) {
    const full = txt.bigNumber as string;
    const animated = countUpText(full, frame);
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {scene.media && (
          <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
        )}
        <BrandBar />

        <Camera visualType="stat-reveal" duration={duration}>
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 200,
              // Below BrandBar (top 236) and the 220 safe-zone top.
              top: 320,
              height: 660,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
            }}
          >
            <TextGate sceneId={sceneId} slotId="stat-reveal.set-piece.bigNumber">
              {(fontSize) => (
                <div
                  style={{
                    position: "relative",
                    fontSize,
                    fontWeight: 900,
                    color: COLOR.amber,
                    lineHeight: 1.2,
                    // The rough-notation circle paints ~29px past the 288px
                    // line box; vertical padding gives the annotation assert
                    // the room without changing the glyphs or the line box.
                    padding: "20px 0",
                    textAlign: "center",
                    ...numberLight,
                  }}
                >
                  <Circle
                    color={COLOR.amber}
                    strokeWidth={ANNOTATION.circle.strokeWidth}
                    padding={ANNOTATION.circle.padding}
                    progress={circleProgress}
                    box="inside"
                  >
                    {/* Hidden only while the count-up overlay owns the
                        glyphs; `visibility` keeps the box measurable. */}
                    <span style={{ visibility: frame < 22 ? "hidden" : "visible" }}>{full}</span>
                  </Circle>
                  {frame < 22 && <span style={{ position: "absolute", inset: 0 }}>{animated}</span>}
                </div>
              )}
            </TextGate>

            {txt.label && (
              <SlideUp delay={0.7} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="stat-reveal.set-piece.label">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 800,
                        color: COLOR.text,
                        letterSpacing: "3px",
                        textAlign: "center",
                        ...labelLight,
                      }}
                    >
                      {txt.label as string}
                    </div>
                  )}
                </TextGate>
              </SlideUp>
            )}

            <FadeIn delay={0.9} duration={0.5}>
              <ComparisonRail
                width={560}
                reveal={interpolate(frame, [8, 30], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })}
                valueNode={
                  <div
                    aria-hidden
                    style={{ width: 18, height: 18, borderRadius: 3, background: COLOR.amber }}
                  />
                }
                baselineNode={
                  <TextGate
                    sceneId={sceneId}
                    slotId="stat-reveal.set-piece.subtext"
                    slotWidth={512}
                  >
                    {(fontSize) => (
                      <div
                        style={{
                          fontSize,
                          fontWeight: 600,
                          color: COLOR.textMuted,
                          textAlign: "right",
                        }}
                      >
                        {txt.subtext as string}
                      </div>
                    )}
                  </TextGate>
                }
              />
            </FadeIn>

            {txt.source && (
              <FadeIn delay={1.1} duration={0.5} style={{ marginTop: SPACING.lg }}>
                <TextGate sceneId={sceneId} slotId="stat-reveal.set-piece.source">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 600,
                        color: COLOR.textDim,
                        letterSpacing: "1px",
                        textAlign: "center",
                      }}
                    >
                      {txt.source as string}
                    </div>
                  )}
                </TextGate>
              </FadeIn>
            )}
          </div>
        </Camera>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Ambient media layer (media-density pass, 2026-11-14): the number
          stays the protagonist — the background is dimmed by the stat-reveal
          entry in lib/media-overlay.mjs (0.65, same as info-card) and the
          focus light + white flash on the number read on top of it. */}
      {scene.media && (
        <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
      )}
      <BrandBar />

      <Camera visualType="stat-reveal" duration={duration}>
        <Slot variant="hero">
          {txt.bigNumber && (
            <StampIn delay={0.2} duration={0.6}>
              <TextGate sceneId={sceneId} slotId="stat-reveal.hero-center.bigNumber">
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 900,
                      color: COLOR.amber,
                      // The gate box is a fixed-width block; pre-gate this div
                      // was a shrink-to-fit flex item that Slot centered. Keep
                      // the text centered so the Circle ellipse stays centered
                      // in the band (T5).
                      textAlign: "center",
                      // ≥ the font's natural ascent+descent (~1.1em): tighter
                      // line-height makes the inline text rects poke above the
                      // gate box and false-fail Fit (T5).
                      lineHeight: 1.2,
                      // #738: protagonist light, white flash on landing.
                      ...numberLight,
                    }}
                  >
                    <Circle
                      color={COLOR.amber}
                      strokeWidth={ANNOTATION.circle.strokeWidth}
                      padding={ANNOTATION.circle.padding}
                      progress={circleProgress}
                      box="inside"
                    >
                      {txt.bigNumber as string}
                    </Circle>
                  </div>
                )}
              </TextGate>
            </StampIn>
          )}
          {txt.label && (
            <SlideUp delay={0.6} duration={0.5} style={{ marginTop: SPACING.lg }}>
              <TextGate sceneId={sceneId} slotId="stat-reveal.hero-center.label">
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 800,
                      color: COLOR.text,
                      letterSpacing: "4px",
                      // #738: the focus moves here after the number lands.
                      ...labelLight,
                    }}
                  >
                    {txt.label as string}
                  </div>
                )}
              </TextGate>
            </SlideUp>
          )}
          {txt.subtext && (
            <FadeIn delay={0.9} duration={0.5} style={{ marginTop: SPACING.xl }}>
              <TextGate sceneId={sceneId} slotId="stat-reveal.hero-center.subtext">
                {(fontSize) => (
                  <div style={{ fontSize, fontWeight: 600, color: COLOR.textMuted }}>
                    {txt.subtext as string}
                  </div>
                )}
              </TextGate>
            </FadeIn>
          )}
        </Slot>

        <Slot variant="support">
          {txt.source && (
            <FadeIn delay={1.1} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="stat-reveal.hero-center.source">
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 600,
                      color: COLOR.textDim,
                      letterSpacing: "1px",
                    }}
                  >
                    {txt.source as string}
                  </div>
                )}
              </TextGate>
            </FadeIn>
          )}
        </Slot>
      </Camera>
    </div>
  );
};
