/**
 * ContrastScene — two-column comparison (left vs right).
 * Scene 8 in the Unitree video (Unitree vs AgiBot).
 */
import { Interactive } from "remotion";
import { type SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { SlideUp, StampIn, FadeIn } from "../components/animations/entrance";
import { SPACING } from "../components/shared";

export const ContrastScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
  const txt = scene.texts || {};
  const left = txt.left ?? [];
  const right = txt.right ?? [];

  const Chip: React.FC<{ text: string; color: string; bg: string; delay: number }> = ({ text, color, bg, delay }) => (
    <SlideUp delay={delay} duration={0.4}>
      <div style={{
        display: "inline-block",
        padding: "8px 16px",
        borderRadius: 6,
        fontSize: 22,
        fontWeight: 700,
        color,
        background: bg,
      }}>
        {text}
      </div>
    </SlideUp>
  );

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GridBg />
      <Glow color="blue" />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

      <Slot variant="hero">
        {txt.title && (
          <SlideUp delay={0.2} duration={0.5} style={{ marginBottom: SPACING.xl }}>
            <Interactive.Div name="title" style={{ fontSize: 36, fontWeight: 900, color: "#f5f5f5", textAlign: "center" }}>
              {txt.title as string}
            </Interactive.Div>
          </SlideUp>
        )}
        {txt.vs && (
          <StampIn delay={0.4} duration={0.4}>
            <div style={{
              display: "inline-block",
              padding: "6px 20px",
              border: "1px solid #94a3b8",
              borderRadius: 6,
              fontSize: 22,
              fontWeight: 900,
              color: "#94a3b8",
              letterSpacing: "2px",
              marginBottom: 20,
            }}>
              {txt.vs as string}
            </div>
          </StampIn>
        )}

        {/* Left card */}
        <div style={{
          padding: 24,
          borderRadius: 10,
          marginBottom: 16,
          width: "100%",
          border: "2px solid rgba(245,158,11,0.3)",
          background: "rgba(245,158,11,0.05)",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {left.map((item, i) => (
              <Chip key={i} text={item} color="#f59e0b" bg="rgba(245,158,11,0.1)" delay={0.6 + i * 0.12} />
            ))}
          </div>
        </div>

        {/* Right card */}
        <div style={{
          padding: 24,
          borderRadius: 10,
          marginBottom: 16,
          width: "100%",
          border: "2px solid rgba(77,139,255,0.3)",
          background: "rgba(77,139,255,0.05)",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {right.map((item, i) => (
              <Chip key={i} text={item} color="#4d8bff" bg="rgba(77,139,255,0.1)" delay={0.9 + i * 0.12} />
            ))}
          </div>
        </div>

        {txt.note && (
          <FadeIn delay={1.2} duration={0.5}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#cbd5e1", textAlign: "center" }}>
              {txt.note as string}
              {txt.noteHighlight && (
                <span style={{ color: "#ef4444" }}>{txt.noteHighlight as string}</span>
              )}
            </div>
          </FadeIn>
        )}
      </Slot>
    </div>
  );
};
