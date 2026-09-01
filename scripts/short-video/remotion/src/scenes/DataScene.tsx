/**
 * DataScene — big stat reveal with source attribution.
 * Pure CSS, no media background.
 * Scene 3 in the Unitree video (8,288× oversubscribed).
 */
import { Interactive, useCurrentFrame, interpolate } from "remotion";
import { Circle } from "@remotion/rough-notation";
import { type SceneData } from "../types";
import { GridBg, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { StampIn, SlideUp, FadeIn } from "../components/animations/entrance";
import { SPACING } from "../components/shared";
import { TextGate } from "../components/text-gate";

export const DataScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
  const txt = scene.texts || {};
  const sceneId = `data-${scene.id}`;
  const frame = useCurrentFrame();
  const circleProgress = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GridBg />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          right: -200,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 60%)",
        }}
      />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

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
                    color: "#f59e0b",
                    // The gate box is a fixed-width block; pre-gate this div
                    // was a shrink-to-fit flex item that Slot centered. Keep
                    // the text centered so the Circle ellipse stays centered
                    // in the band (T5).
                    textAlign: "center",
                    // ≥ the font's natural ascent+descent (~1.1em): tighter
                    // line-height makes the inline text rects poke above the
                    // gate box and false-fail Fit (T5).
                    lineHeight: 1.2,
                    textShadow: "0 0 60px rgba(245,158,11,0.4)",
                  }}
                >
                  <Circle color="#f59e0b" progress={circleProgress}>
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
                  style={{ fontSize, fontWeight: 800, color: "#f5f5f5", letterSpacing: "4px" }}
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
                <div style={{ fontSize, fontWeight: 600, color: "#cbd5e1" }}>
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
                <div style={{ fontSize, fontWeight: 600, color: "#94a3b8", letterSpacing: "1px" }}>
                  {txt.source as string}
                </div>
              )}
            </TextGate>
          </FadeIn>
        )}
      </Slot>
    </div>
  );
};
