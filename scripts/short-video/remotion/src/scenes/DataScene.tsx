/**
 * DataScene — big stat reveal with source attribution.
 * Pure CSS, no media background.
 * Scene 3 in the Unitree video (8,288× oversubscribed).
 *
 * Light (#738): the stat is the protagonist and lands with a white flash; the
 * label takes the focus half a second later. The decorative corner wash that
 * used to sit behind this scene is gone — a full-frame gradient is not a
 * subject.
 */
import { Interactive, useCurrentFrame, interpolate } from "remotion";
import { Circle } from "@remotion/rough-notation";
import { type SceneData } from "../types";
import { GridBg, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { StampIn, SlideUp, FadeIn } from "../components/animations/entrance";
import { SPACING, COLOR } from "../components/shared";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";

export const DataScene: React.FC<{ scene: SceneData; duration: number }> = ({
  scene,
  duration,
}) => {
  const txt = scene.texts || {};
  const sceneId = `data-${scene.id}`;
  const frame = useCurrentFrame();
  const statLight = useFocusLight("data", "stat", duration);
  const labelLight = useFocusLight("data", "statLabel", duration);
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

      <Camera visualType="data" duration={duration}>
        <Slot variant="hero">
          {txt.stat && (
            <StampIn delay={0.2} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="data.hero-center.stat">
                {(fontSize) => (
                  <Interactive.Div
                    name="stat"
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
                      ...statLight,
                    }}
                  >
                    <Circle color={COLOR.amber} progress={circleProgress}>
                      {txt.stat as string}
                    </Circle>
                  </Interactive.Div>
                )}
              </TextGate>
            </StampIn>
          )}
          {txt.statLabel && (
            <SlideUp delay={0.5} duration={0.5} style={{ marginTop: SPACING.lg }}>
              <TextGate sceneId={sceneId} slotId="data.hero-center.label">
                {(fontSize) => (
                  <Interactive.Div
                    name="statLabel"
                    style={{
                      fontSize,
                      fontWeight: 800,
                      color: COLOR.text,
                      letterSpacing: "4px",
                      // #738: the focus moves here after the number lands.
                      ...labelLight,
                    }}
                  >
                    {txt.statLabel as string}
                  </Interactive.Div>
                )}
              </TextGate>
            </SlideUp>
          )}
          {txt.subtext && (
            <FadeIn delay={0.8} duration={0.5} style={{ marginTop: SPACING.xl }}>
              <TextGate sceneId={sceneId} slotId="data.hero-center.subtext">
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
            <FadeIn delay={1.0} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="data.hero-center.source">
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
