/**
 * InfoCardScene — image background (ken-burns) + info card with bullet points.
 * Scene 4 in the Unitree video (company background).
 *
 * Light (#738): the points card is the object — a box light, not a text glow
 * (an individual bullet is never the shot). The card is lit from the first
 * frame and gains the focus as its bullets start landing.
 */
import { type SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { SlideUp, StaggerLines } from "../components/animations/entrance";
import { SPACING, MOTION, COLOR } from "../components/shared";
import { MediaBackground } from "../components/MediaBackground";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";

export const InfoCardScene: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const sceneId = `info-card-${scene.id}`;
  const points = txt.points ?? [];
  const cardLight = useFocusLight("info-card", "points", duration);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.media && (
        <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
      )}
      {!scene.media && <GridBg />}
      <Glow color="blue" />
      <Scanlines />
      <BrandBar />

      <Camera visualType="info-card" duration={duration}>
        <Slot variant="kicker">
          {txt.title && (
            <SlideUp delay={0.2} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="info-card.hero-center.title">
                {(fontSize) => (
                  <div style={{ fontSize, fontWeight: 900, color: COLOR.brand }}>
                    {txt.title as string}
                    {txt.titleHighlight && (
                      <span style={{ color: COLOR.amber }}>{txt.titleHighlight as string}</span>
                    )}
                  </div>
                )}
              </TextGate>
            </SlideUp>
          )}
          {txt.subtitle && (
            <SlideUp delay={0.4} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="info-card.hero-center.subtitle">
                {(fontSize) => (
                  <div style={{ fontSize, fontWeight: 600, color: COLOR.textMuted, marginTop: 8 }}>
                    {txt.subtitle as string}
                  </div>
                )}
              </TextGate>
            </SlideUp>
          )}
        </Slot>

        <Slot variant="hero">
          <div
            data-text-container
            style={{
              padding: 32,
              border: "2px solid rgba(77,139,255,0.2)",
              borderRadius: 12,
              background: "rgba(10,10,20,0.6)",
              width: "100%",
              // #738: the card is the protagonist — a box light, not a text glow.
              ...cardLight,
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <StaggerLines delay={0.5} duration={0.4} stagger={MOTION.stagger.line}>
                {points.map((point, i) => (
                  <TextGate key={i} sceneId={sceneId} slotId={`info-card.hero-center.points[${i}]`}>
                    {(fontSize) => (
                      <li
                        style={{
                          fontSize,
                          fontWeight: 700,
                          color: COLOR.text,
                          // ≥ the font's natural ascent+descent (~1.1em): the
                          // normal line-height lets inline text rects poke 1px
                          // below the line box and false-fail the assert (T5).
                          lineHeight: 1.2,
                          marginBottom: 12,
                          paddingLeft: 28,
                          position: "relative",
                        }}
                      >
                        <span style={{ position: "absolute", left: 0, color: COLOR.amber }}>▸</span>
                        {point}
                      </li>
                    )}
                  </TextGate>
                ))}
              </StaggerLines>
            </ul>
          </div>
        </Slot>
      </Camera>
    </div>
  );
};
