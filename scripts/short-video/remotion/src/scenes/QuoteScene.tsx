/**
 * QuoteScene — large quote with attribution and verified badge.
 * Scene 6 in the Unitree video ("filing admits robots can't do real work").
 */
import { type SceneData } from "../types";
import { GridBg, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { FadeIn, SlideUp, StampIn } from "../components/animations/entrance";

export const QuoteScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
  const txt = scene.texts || {};

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GridBg />
      <div style={{
        position: "absolute",
        bottom: -200,
        left: -200,
        width: 900,
        height: 900,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 60%)",
      }} />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

      <Slot variant="hero">
        <div style={{ textAlign: "center", maxWidth: 820 }}>
          <FadeIn delay={0.2} duration={0.5}>
            <div style={{
              fontSize: 160,
              fontWeight: 900,
              color: "rgba(239,68,68,0.15)",
              lineHeight: 0.8,
              marginBottom: -30,
            }}>
              "
            </div>
          </FadeIn>
          {txt.quote && (
            <SlideUp delay={0.5} duration={0.6}>
              <div style={{
                fontSize: 42,
                fontWeight: 700,
                color: "#f5f5f5",
                lineHeight: 1.35,
              }}>
                {txt.quote as string}
              </div>
            </SlideUp>
          )}
          {txt.source && (
            <FadeIn delay={1.3} duration={0.5} style={{ marginTop: 36 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#cbd5e1", letterSpacing: "2px" }}>
                {txt.source as string}
              </div>
            </FadeIn>
          )}
          {txt.verified && (
            <StampIn delay={1.8} duration={0.4}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 28px",
                border: "2px solid rgba(245,158,11,0.3)",
                borderRadius: 10,
                background: "rgba(245,158,11,0.06)",
                marginTop: 24,
              }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b", letterSpacing: "2px" }}>
                  {txt.verified as string}
                </span>
              </div>
            </StampIn>
          )}
        </div>
      </Slot>
    </div>
  );
};
