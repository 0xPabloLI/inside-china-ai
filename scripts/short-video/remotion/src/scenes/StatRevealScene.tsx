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
import { GridBg, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { StampIn, SlideUp, FadeIn } from "../components/animations/entrance";
import { SPACING, COLOR } from "../components/shared";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";

export const StatRevealScene: React.FC<{ scene: SceneData; duration: number }> = ({
  scene,
  duration,
}) => {
  const txt = scene.texts || {};
  const sceneId = `stat-reveal-${scene.id}`;
  const frame = useCurrentFrame();
  const numberLight = useFocusLight("stat-reveal", "bigNumber", duration);
  const labelLight = useFocusLight("stat-reveal", "label", duration);
  const circleProgress = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GridBg />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

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
                    <Circle color={COLOR.amber} progress={circleProgress}>
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
