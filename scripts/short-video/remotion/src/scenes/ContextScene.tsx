/**
 * ContextScene — context card with badge, title, and detail.
 * Scene 7 in the Unitree video (DeepSeek + Tencent backing).
 */
import { type SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { StampIn, SlideUp, FadeIn } from "../components/animations/entrance";

export const ContextScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
  const txt = scene.texts || {};

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GridBg />
      <Glow color="blue" />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="blue" />

      <Slot variant="kicker">
        {txt.badge && (
          <StampIn delay={0.2} duration={0.4}>
            <div style={{
              display: "inline-block",
              padding: "8px 20px",
              border: "1px solid rgba(77,139,255,0.3)",
              borderRadius: 6,
              fontSize: 18,
              fontWeight: 800,
              color: "#4d8bff",
              letterSpacing: "2px",
            }}>
              {txt.badge as string}
            </div>
          </StampIn>
        )}
      </Slot>

      <Slot variant="hero">
        <div style={{
          padding: 36,
          border: "2px solid rgba(77,139,255,0.2)",
          borderRadius: 12,
          background: "rgba(10,10,20,0.6)",
          width: "100%",
        }}>
          {txt.title && (
            <SlideUp delay={0.4} duration={0.5}>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#f5f5f5", marginBottom: 8 }}>
                {txt.title as string}
                {txt.titleHighlight && (
                  <span style={{ color: "#4d8bff" }}>{txt.titleHighlight as string}</span>
                )}
              </div>
            </SlideUp>
          )}
          {txt.context && (
            <SlideUp delay={0.6} duration={0.5} style={{ marginTop: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>
                {txt.context as string}
              </div>
            </SlideUp>
          )}
          {txt.detail && (
            <FadeIn delay={0.8} duration={0.5} style={{ marginTop: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: "#cbd5e1" }}>
                {txt.detail as string}
              </div>
            </FadeIn>
          )}
        </div>
      </Slot>
    </div>
  );
};
