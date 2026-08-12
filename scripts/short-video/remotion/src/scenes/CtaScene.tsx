/**
 * CtaScene — the standard end card.
 *
 * Maps from ctaScene() in lib/scene-templates.mjs.
 * Fixed layout: brand logo → brand name → tagline → action stamp → topic.
 * Ignores the `media` field (CTA never has background media).
 */
import { staticFile, Img } from "remotion";
import type { SceneData } from "../types";
import { GridBg, Glow, Scanlines, Slot } from "../components/visuals";
import { ScaleIn, StampIn } from "../components/animations/entrance";
import { LogoPulse } from "../components/animations/loops";

export const CtaScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene }) => {
  const txt = scene.texts || {};
  const brand = (txt.brand as string) ?? "CHINA AI NEWS";
  const brandHighlight = (txt.brandHighlight as string) ?? "AI";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Background */}
      <GridBg />
      <Glow color="blue" />
      <Scanlines />

      {/* Hero slot — brand logo + name + tagline */}
      <Slot variant="hero">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <LogoPulse interval={3}>
            <ScaleIn delay={0.1} duration={0.6}>
              <Img
                src={staticFile("assets/china-ai-news-mark-video.svg")}
                style={{
                  width: 130,
                  height: 130,
                  marginBottom: 40,
                }}
              />
            </ScaleIn>
          </LogoPulse>

          <ScaleIn delay={0.3} duration={0.6}>
            <div style={{
              fontSize: 72,
              fontWeight: 900,
              color: "#f5f5f5",
              letterSpacing: "4px",
              marginBottom: 16,
            }}>
              {brand.split(brandHighlight).map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span style={{ color: "#4d8bff" }}>{brandHighlight}</span>
                  )}
                </span>
              ))}
            </div>
          </ScaleIn>

          {txt.tagline && (
            <div style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#cbd5e1",
              letterSpacing: "3px",
              opacity: 1,
            }}>
              {txt.tagline as string}
            </div>
          )}
        </div>
      </Slot>

      {/* Support slot — action + topic */}
      <Slot variant="support">
        {txt.action && (
          <StampIn delay={1.0}>
            <div style={{
              display: "inline-block",
              padding: "20px 40px",
              border: "2px solid #f59e0b",
              borderRadius: 12,
              background: "rgba(245,158,11,0.06)",
              textAlign: "center",
            }}>
              <div style={{
                fontSize: 36,
                fontWeight: 900,
                color: "#f59e0b",
                letterSpacing: "2px",
                textShadow: "0 0 30px rgba(245,158,11,0.3)",
              }}>
                {txt.action as string}
              </div>
            </div>
          </StampIn>
        )}
        {txt.topic && (
          <div style={{
            fontSize: 36,
            fontWeight: 700,
            color: "#cbd5e1",
            letterSpacing: "3px",
            marginTop: 24,
          }}>
            {txt.topic as string}
          </div>
        )}
      </Slot>
    </div>
  );
};
