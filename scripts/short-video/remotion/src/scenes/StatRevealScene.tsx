/**
 * StatRevealScene — large number reveal with label and source.
 * Scene 9 in the Unitree video (China 97% market share).
 */
import { useCurrentFrame, interpolate } from "remotion";
import { Circle } from "@remotion/rough-notation";
import { type SceneData } from "../types";
import { GridBg, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { StampIn, SlideUp, FadeIn } from "../components/animations/entrance";
import { SPACING } from "../components/shared";

export const StatRevealScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
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
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 1000,
        height: 1000,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 60%)",
      }} />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

      <Slot variant="hero">
        {txt.bigNumber && (
          <StampIn delay={0.2} duration={0.6}>
            <div style={{
              fontSize: 220,
              fontWeight: 900,
              color: "#f59e0b",
              lineHeight: 0.9,
              textShadow: "0 0 80px rgba(245,158,11,0.5)",
            }}>
              <Circle color="#f59e0b" progress={circleProgress}>
                {txt.bigNumber as string}
              </Circle>
            </div>
          </StampIn>
        )}
        {txt.label && (
          <SlideUp delay={0.6} duration={0.5} style={{ marginTop: SPACING.lg }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#f5f5f5", letterSpacing: "4px" }}>
              {txt.label as string}
            </div>
          </SlideUp>
        )}
        {txt.subtext && (
          <FadeIn delay={0.9} duration={0.5} style={{ marginTop: SPACING.xl }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: "#cbd5e1" }}>
              {txt.subtext as string}
            </div>
          </FadeIn>
        )}
      </Slot>

      <Slot variant="support">
        {txt.source && (
          <FadeIn delay={1.1} duration={0.5}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#94a3b8", letterSpacing: "1px" }}>
              {txt.source as string}
            </div>
          </FadeIn>
        )}
      </Slot>
    </div>
  );
};
