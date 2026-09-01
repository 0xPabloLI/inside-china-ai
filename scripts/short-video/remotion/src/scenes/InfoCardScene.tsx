/**
 * InfoCardScene — image background (ken-burns) + info card with bullet points.
 * Scene 4 in the Unitree video (company background).
 */
import { type SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { SlideUp, StampIn } from "../components/animations/entrance";
import { SPACING } from "../components/shared";
import { MediaBackground } from "../components/MediaBackground";
import { TextGate } from "../components/text-gate";

export const InfoCardScene: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const sceneId = `info-card-${scene.id}`;
  const points = txt.points ?? [];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.media && (
        <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
      )}
      {!scene.media && <GridBg />}
      <Glow color="blue" />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="blue" />

      <Slot variant="kicker">
        {txt.title && (
          <SlideUp delay={0.2} duration={0.5}>
            <TextGate sceneId={sceneId} slotId="info-card.hero-center.title">
              {(fontSize) => (
                <div style={{ fontSize, fontWeight: 900, color: "#4d8bff" }}>
                  {txt.title as string}
                  {txt.titleHighlight && (
                    <span style={{ color: "#f59e0b" }}>{txt.titleHighlight as string}</span>
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
                <div style={{ fontSize, fontWeight: 600, color: "#cbd5e1", marginTop: 8 }}>
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
          }}
        >
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {points.map((point, i) => (
              <SlideUp key={i} delay={0.5 + i * 0.15} duration={0.4}>
                <TextGate sceneId={sceneId} slotId={`info-card.hero-center.points[${i}]`}>
                  {(fontSize) => (
                    <li
                      style={{
                        fontSize,
                        fontWeight: 700,
                        color: "#f5f5f5",
                        // ≥ the font's natural ascent+descent (~1.1em): the
                        // normal line-height lets inline text rects poke 1px
                        // below the line box and false-fail the assert (T5).
                        lineHeight: 1.2,
                        marginBottom: 12,
                        paddingLeft: 28,
                        position: "relative",
                      }}
                    >
                      <span style={{ position: "absolute", left: 0, color: "#f59e0b" }}>▸</span>
                      {point}
                    </li>
                  )}
                </TextGate>
              </SlideUp>
            ))}
          </ul>
        </div>
      </Slot>
    </div>
  );
};
