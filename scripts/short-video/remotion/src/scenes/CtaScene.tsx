/**
 * CtaScene — the standard end card.
 *
 * Maps from ctaScene() in lib/scene-templates.mjs.
 * All font sizes, colors, positions are精确对照 from templateCss().
 */
import { staticFile, CanvasImage, Interactive } from "remotion";
import type { SceneData } from "../types";
import { GridBg, Glow, Scanlines, Slot, FrameGlow } from "../components/visuals";
import { ScaleIn, StampIn, FadeIn } from "../components/animations/entrance";
import { SPACING } from "../components/shared";
import { LogoPulse } from "../components/animations/loops";
import { TextGate } from "../components/text-gate";

export const CtaScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
  const txt = scene.texts || {};
  const brand = (txt.brand as string) ?? "CHINA AI NEWS";
  const brandHighlight = (txt.brandHighlight as string) ?? "AI";
  const sceneId = `cta-${scene.id}`;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Background */}
      <GridBg />
      <Glow color="blue" />
      <Scanlines />
      <FrameGlow variant="blue" />

      {/* Hero slot — brand logo 130px + name 72px + tagline 32px */}
      <Slot variant="hero">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Brand logo — scaleIn 0.6s at 0.1s + logoPulse 3s at 1s */}
          <LogoPulse interval={3}>
            <ScaleIn delay={0.1} duration={0.6}>
              <CanvasImage
                src={staticFile("assets/china-ai-news-mark-video.svg")}
                style={{
                  width: 130,
                  height: 130,
                  marginBottom: 40,
                }}
              />
            </ScaleIn>
          </LogoPulse>

          {/* Brand name — scaleIn 0.6s at 0.3s, contract brand 72px */}
          <ScaleIn delay={0.3} duration={0.6}>
            <TextGate sceneId={sceneId} slotId="cta.hero-center.brand">
              {(fontSize) => (
                <Interactive.Div
                  name="brand"
                  style={{
                    fontSize,
                    fontWeight: 900,
                    color: "#f5f5f5",
                    letterSpacing: "4px",
                    marginBottom: SPACING.lg,
                  }}
                >
                  {brand.split(brandHighlight).map((part, i, arr) => (
                    <span key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <span style={{ color: "#4d8bff" }}>{brandHighlight}</span>
                      )}
                    </span>
                  ))}
                </Interactive.Div>
              )}
            </TextGate>
          </ScaleIn>

          {/* Tagline — fadeIn 0.5s at 0.7s, contract tagline 32px */}
          {txt.tagline && (
            <FadeIn delay={0.7} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="cta.hero-center.tagline">
                {(fontSize) => (
                  <Interactive.Div
                    name="tagline"
                    style={{
                      fontSize,
                      fontWeight: 600,
                      color: "#cbd5e1",
                      letterSpacing: "3px",
                    }}
                  >
                    {txt.tagline as string}
                  </Interactive.Div>
                )}
              </TextGate>
            </FadeIn>
          )}
        </div>
      </Slot>

      {/* Support slot — action stamp + topic */}
      <Slot variant="support">
        {/* Action — stampIn 0.5s at 1.0s, contract action 32px amber */}
        {txt.action && (
          <StampIn delay={1.0} duration={0.5}>
            <div
              style={{
                display: "inline-block",
                padding: "20px 40px",
                border: "2px solid #f59e0b",
                borderRadius: 12,
                background: "rgba(245,158,11,0.06)",
                textAlign: "center",
              }}
            >
              <TextGate sceneId={sceneId} slotId="cta.hero-center.action">
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 900,
                      color: "#f59e0b",
                      letterSpacing: "2px",
                      textShadow: "0 0 30px rgba(245,158,11,0.3)",
                    }}
                  >
                    {txt.action as string}
                  </div>
                )}
              </TextGate>
            </div>
          </StampIn>
        )}
        {/* Topic — fadeIn 0.5s at 1.3s, contract topic 36px */}
        {txt.topic && (
          <FadeIn delay={1.3} duration={0.5}>
            <TextGate sceneId={sceneId} slotId="cta.hero-center.topic">
              {(fontSize) => (
                <div
                  style={{
                    fontSize,
                    fontWeight: 700,
                    color: "#cbd5e1",
                    letterSpacing: "3px",
                    marginTop: 24,
                  }}
                >
                  {txt.topic as string}
                </div>
              )}
            </TextGate>
          </FadeIn>
        )}
      </Slot>
    </div>
  );
};
