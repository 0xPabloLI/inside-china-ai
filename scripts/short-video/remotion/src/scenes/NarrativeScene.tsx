/**
 * NarrativeScene — video/image background + text overlay.
 * Used for scenes that tell a story with media backdrop.
 * Scenes 2 and 5 in the Unitree video.
 */
import { type SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { SlideUp, StampIn, FadeIn } from "../components/animations/entrance";
import { MediaBackground } from "../components/MediaBackground";

export const NarrativeScene: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const glowColor = scene.id === 5 ? "red" : "blue";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.media && <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />}
      <GridBg />
      <Glow color={glowColor} />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

      <Slot variant="kicker">
        {txt.badge && (
          <StampIn delay={0.2} duration={0.4}>
            <div style={{
              display: "inline-block",
              padding: "10px 24px",
              border: `2px solid ${glowColor === "red" ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`,
              borderRadius: 8,
              background: glowColor === "red" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
              fontSize: 22,
              fontWeight: 800,
              color: glowColor === "red" ? "#ef4444" : "#f59e0b",
              letterSpacing: "2px",
            }}>
              {txt.badge as string}
            </div>
          </StampIn>
        )}
      </Slot>

      <Slot variant="hero">
        {txt.company && (
          <SlideUp delay={0.4} duration={0.5} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#f5f5f5" }}>
              {txt.company as string}
            </div>
          </SlideUp>
        )}
        {txt.action && (
          <SlideUp delay={0.6} duration={0.5} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#cbd5e1" }}>
              {txt.action as string}
            </div>
          </SlideUp>
        )}
        {txt.result && (
          <StampIn delay={0.8} duration={0.5}>
            <div style={{
              fontSize: 56,
              fontWeight: 900,
              color: glowColor === "red" ? "#ef4444" : "#f59e0b",
            }}>
              {txt.result as string}
            </div>
          </StampIn>
        )}
      </Slot>

      <Slot variant="support">
        {txt.context && (
          <FadeIn delay={1.0} duration={0.5}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#cbd5e1" }}>
              {txt.context as string}
            </div>
          </FadeIn>
        )}
      </Slot>
    </div>
  );
};
