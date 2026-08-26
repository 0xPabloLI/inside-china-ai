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

export const DataScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
  const txt = scene.texts || {};
  const frame = useCurrentFrame();
  const circleProgress = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GridBg />
      <div style={{
        position: "absolute",
        bottom: -200,
        right: -200,
        width: 900,
        height: 900,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 60%)",
      }} />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

      <Slot variant="hero">
        {txt.stat && (
          <StampIn delay={0.2} duration={0.5}>
            <Interactive.Div
              name="stat"
              style={{
                fontSize: 180,
                fontWeight: 900,
                color: "#f59e0b",
                lineHeight: 0.9,
                textShadow: "0 0 60px rgba(245,158,11,0.4)",
              }}
            >
              <Circle color="#f59e0b" progress={circleProgress}>
                {txt.stat as string}
              </Circle>
            </Interactive.Div>
          </StampIn>
        )}
        {txt.statLabel && (
          <SlideUp delay={0.5} duration={0.5} style={{ marginTop: SPACING.lg }}>
            <Interactive.Div name="statLabel" style={{ fontSize: 36, fontWeight: 800, color: "#f5f5f5", letterSpacing: "4px" }}>
              {txt.statLabel as string}
            </Interactive.Div>
          </SlideUp>
        )}
        {txt.subtext && (
          <FadeIn delay={0.8} duration={0.5} style={{ marginTop: SPACING.xl }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: "#cbd5e1" }}>
              {txt.subtext as string}
            </div>
          </FadeIn>
        )}
      </Slot>

      <Slot variant="support">
        {txt.source && (
          <FadeIn delay={1.0} duration={0.5}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#94a3b8", letterSpacing: "1px" }}>
              {txt.source as string}
            </div>
          </FadeIn>
        )}
      </Slot>
    </div>
  );
};
