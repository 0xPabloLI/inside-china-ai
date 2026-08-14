/**
 * HookScene — the opening "hook" scene template.
 *
 * Maps from hookScene() in lib/scene-templates.mjs.
 * All font sizes, colors, positions are精确对照 from templateCss().
 *
 * Two variants: number-led (bigNumber) or claim-led (hookText + revealText).
 * Ignores the `media` field (hook card never has background media).
 */
import { staticFile, Img } from "remotion";
import type { SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, BadgePill, StatCard, Slot, FrameGlow } from "../components/visuals";
import { SlideUp, ScaleIn, StampIn } from "../components/animations/entrance";
import { NumberPulse, ScanSweep } from "../components/animations/loops";

const COLORS: Record<string, string> = {
  blue: "#4d8bff",
  red: "#ef4444",
  amber: "#f59e0b",
  green: "#34d399",
  purple: "#6d4eff",
  cyan: "#22d3ee",
};

export const HookScene: React.FC<{ scene: SceneData; duration: number }> = ({ scene, duration }) => {
  const txt = scene.texts || {};
  const colorKey = /^(blue|red|amber|green|purple|cyan)$/.test(txt.color as string) ? txt.color as string : "blue";
  const color = COLORS[colorKey] ?? COLORS.blue;
  const stats = Array.isArray(txt.stats) ? txt.stats : [];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Background layers — CSS: .grid-bg + .glow-tint + .scanlines + .scan-sweep */}
      <GridBg />
      <div style={{
        position: "absolute",
        bottom: -250,
        left: -200,
        width: 900,
        height: 900,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}1a 0%, transparent 60%)`,
      }} />
      <Scanlines />
      <ScanSweep duration={duration} />
      <BrandBar />
      <FrameGlow variant="amber" />

      {/* Kicker slot — optional badge pill (NOT breaking badge) */}
      {txt.badge && (
        <Slot variant="kicker">
          <StampIn delay={0.2} duration={0.4}>
            <BadgePill text={txt.badge as string} />
          </StampIn>
        </Slot>
      )}

      {/* Hero slot — subject row + focal */}
      <Slot variant="hero">
        {/* Subject row (logo 96px + name 64px) */}
        {(txt.subjectLogo || txt.subject) && (
          <SlideUp delay={0.2} duration={0.4} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 32 }}>
            {txt.subjectLogo && (
              <Img
                src={staticFile(`assets/logos/${txt.subjectLogo}.svg`)}
                style={{
                  width: 96,
                  height: 96,
                  filter: "drop-shadow(0 0 25px rgba(77,139,255,0.3))",
                }}
              />
            )}
            {txt.subject && (
              <span style={{
                fontSize: 64,
                fontWeight: 900,
                color: "#f5f5f5",
                letterSpacing: "4px",
                textShadow: `0 0 30px ${color}66`,
              }}>
                {txt.subject as string}
              </span>
            )}
          </SlideUp>
        )}

        {/* Focal — number-led preferred (300px amber) */}
        {txt.bigNumber ? (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 300,
              fontWeight: 900,
              color: "#f59e0b",
              letterSpacing: "-10px",
              lineHeight: 0.9,
              textShadow: "0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3)",
            }}>
              <NumberPulse interval={2} color="rgba(245,158,11">
                {txt.bigNumber as string}
              </NumberPulse>
            </div>
            {txt.numberLabel && (
              <SlideUp delay={0.6} duration={0.5}>
                <div style={{
                  fontSize: 48,
                  fontWeight: 800,
                  color: "#f5f5f5",
                  letterSpacing: "3px",
                  marginTop: 16,
                  textAlign: "center",
                }}>
                  {(txt.numberLabel as string).replace(
                    txt.numberHighlight as string ?? "",
                    "",
                  )}
                  {txt.numberHighlight && (
                    <span style={{ color: "#ef4444" }}>{txt.numberHighlight as string}</span>
                  )}
                </div>
              </SlideUp>
            )}
          </div>
        ) : txt.hookText ? (
          <div style={{ textAlign: "center" }}>
            {/* Focal claim — 78px, line-height 1.1 */}
            <div style={{
              fontSize: 78,
              fontWeight: 900,
              color: "#f5f5f5",
              letterSpacing: "2px",
              lineHeight: 1.1,
              textShadow: `0 0 40px ${color}66`,
            }}>
              {txt.hookText as string}
            </div>
            {/* Focal reveal — 80px, stampIn at 0.8s */}
            {txt.revealText && (
              <StampIn delay={0.8} duration={0.5}>
                <div style={{
                  fontSize: 80,
                  fontWeight: 900,
                  color,
                  letterSpacing: "2px",
                  lineHeight: 1.05,
                  marginTop: 24,
                  textAlign: "center",
                }}>
                  {txt.revealText as string}
                </div>
              </StampIn>
            )}
          </div>
        ) : null}
      </Slot>

      {/* Support slot — stats + source */}
      <Slot variant="support">
        {stats.length > 0 && (
          <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
            {stats.map((s, i) => (
              <SlideUp key={i} delay={0.8 + i * 0.15} duration={0.5}>
                <StatCard
                  num={s.num}
                  unit={s.unit}
                  label={s.label}
                  color={i === 0 ? "#f59e0b" : color}
                />
              </SlideUp>
            ))}
          </div>
        )}
        {txt.source && (
          <div style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#cbd5e1",
            letterSpacing: "3px",
            textAlign: "center",
            lineHeight: 1,
            marginTop: stats.length > 0 ? 24 : 0,
          }}>
            {txt.source as string}
          </div>
        )}
      </Slot>
    </div>
  );
};
