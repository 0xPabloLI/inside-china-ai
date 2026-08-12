/**
 * HookScene — the opening "hook" scene template.
 *
 * Maps from hookScene() in lib/scene-templates.mjs.
 * Two variants: number-led (bigNumber) or claim-led (hookText + revealText).
 * Ignores the `media` field (hook card never has background media).
 */
import { useCurrentFrame, staticFile, Img } from "remotion";
import type { SceneData } from "../types";
import { interpolate, secToFrames, clamp, easeOutExpo } from "../components/shared";
import { GridBg, Glow, Scanlines, BrandBar, BreakingBadge, StatCard, Slot } from "../components/visuals";
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
  const frame = useCurrentFrame();
  const txt = scene.texts || {};
  const colorKey = /^(blue|red|amber|green|purple|cyan)$/.test(txt.color as string) ? txt.color as string : "blue";
  const color = COLORS[colorKey] ?? COLORS.blue;
  const stats = Array.isArray(txt.stats) ? txt.stats : [];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Background layers */}
      <GridBg />
      <Glow color="red" />
      <Scanlines />
      <ScanSweep duration={duration} />
      <BrandBar />

      {/* Kicker slot — optional badge */}
      {txt.badge && (
        <Slot variant="kicker">
          <BreakingBadge text={txt.badge as string} />
        </Slot>
      )}

      {/* Hero slot — subject row + focal */}
      <Slot variant="hero">
        {/* Subject row (logo + name) */}
        {(txt.subjectLogo || txt.subject) && (
          <SlideUp delay={0.3} style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 30 }}>
            {txt.subjectLogo && (
              <Img
                src={staticFile(`assets/logos/${txt.subjectLogo}.svg`)}
                style={{ width: 64, height: 64 }}
              />
            )}
            {txt.subject && (
              <span style={{
                fontSize: 56,
                fontWeight: 800,
                color: "#cbd5e1",
                letterSpacing: "4px",
                textShadow: `0 0 30px ${color}66`,
              }}>
                {txt.subject as string}
              </span>
            )}
          </SlideUp>
        )}

        {/* Focal — number-led preferred */}
        {txt.bigNumber ? (
          <div style={{ textAlign: "center" }}>
            <ScaleIn delay={0.5} duration={0.6} style={{}}>
              <NumberPulse interval={2}>
                <div style={{
                  fontSize: 260,
                  fontWeight: 900,
                  color: "#f59e0b",
                  letterSpacing: "-10px",
                  lineHeight: 0.9,
                }}>
                  {txt.bigNumber as string}
                </div>
              </NumberPulse>
            </ScaleIn>
            {txt.numberLabel && (
              <SlideUp delay={0.8}>
                <div style={{
                  fontSize: 52,
                  fontWeight: 800,
                  color: "#f5f5f5",
                  letterSpacing: "3px",
                  marginTop: 12,
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
            <SlideUp delay={0.3}>
              <div style={{
                fontSize: 72,
                fontWeight: 900,
                color: "#f5f5f5",
                letterSpacing: "2px",
                textShadow: `0 0 40px ${color}66`,
              }}>
                {txt.hookText as string}
              </div>
            </SlideUp>
            {txt.revealText && (
              <StampIn delay={0.8}>
                <div style={{
                  fontSize: 64,
                  fontWeight: 900,
                  color,
                  letterSpacing: "3px",
                  marginTop: 20,
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
          <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
            {stats.map((s, i) => (
              <SlideUp key={i} delay={0.8 + i * 0.15}>
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
          <SlideUp delay={1.0} style={{ marginTop: 20 }}>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "2px",
              textAlign: "center",
            }}>
              {txt.source as string}
            </div>
          </SlideUp>
        )}
      </Slot>
    </div>
  );
};
