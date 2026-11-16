/**
 * InfoCardScene — image background (ken-burns) + info card with bullet points.
 * Scene 4 in the Unitree video (company background).
 *
 * Light (#738): the points card is the object — a box light, not a text glow
 * (an individual bullet is never the shot). The card is lit from the first
 * frame and gains the focus as its bullets start landing.
 */
import { type SceneData } from "../types";
import { Glow, BrandBar, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { SlideUp, StaggerLines } from "../components/animations/entrance";
import { SPACING, MOTION, COLOR } from "../components/shared";
import { MediaBackground } from "../components/MediaBackground";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";
import { DotMatrix } from "../components/topology";
import { resolveRenderLayout } from "../../../lib/text-slots.mjs";

export const InfoCardScene: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const sceneId = `info-card-${scene.id}`;
  const points = txt.points ?? [];
  const cardLight = useFocusLight("info-card", "points", duration);
  const layout = resolveRenderLayout(scene);

  if (layout === "array") {
    const n = points.length;
    // Portrait card array: four points or fewer get two wide cards; 5–11 get
    // three; the source's ≥12 density rule shrinks to an 8-column matrix of
    // 92px cards. The 10–11 band stays at three columns because a 190px card
    // could not hold a long model name ("DEEPSEEK") at a readable size. The card group is the declared focal
    // object (lib/type-scale.mjs LAYOUT_FOCAL), so this layout clears the
    // empty-field rule by geometry, not by inflating the title.
    //
    // The ≥12 branch is a COUNT matrix, not a label grid: 72px of content
    // cannot hold a model name at the 35px floor, so each card carries its
    // ordinal and the dot matrix carries the total; the voiceover names the
    // points. Label gates would otherwise fail the render on legal copy.
    const dense = n >= 12;
    const spec = dense
      ? { cols: 8, width: 92, height: 92, gap: 8, pad: 8 }
      : n >= 5
        ? { cols: 3, width: 250, height: 150, gap: 24, pad: 16 }
        : { cols: 2, width: 390, height: 200, gap: 24, pad: 22 };
    // Padding + 1px border on each side live outside the card's content box;
    // the extra 2px keeps sub-pixel centering from pushing the gate 1px left
    // of the content box (observed on the 190px card).
    const contentWidth = spec.width - spec.pad * 2 - 4;

    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {scene.media && (
          <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
        )}
        <Glow color="blue" />
        <BrandBar />

        <Camera visualType="info-card" duration={duration}>
          {/* Not Slot kicker: that band starts at 220, above BrandBar (236). */}
          <div
            style={{
              position: "absolute",
              left: 60,
              width: 820,
              top: 300,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            {txt.title && (
              <SlideUp delay={0.2} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="info-card.array.title" lockFontSize={48}>
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 900,
                        color: COLOR.brand,
                        textAlign: "center",
                      }}
                    >
                      {txt.title as string}
                      {txt.titleHighlight && (
                        <>
                          {" "}
                          <span style={{ color: COLOR.amber }}>{txt.titleHighlight as string}</span>
                        </>
                      )}
                    </div>
                  )}
                </TextGate>
              </SlideUp>
            )}
            {txt.subtitle && (
              <SlideUp delay={0.35} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="info-card.array.subtitle" lockFontSize={36}>
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 600,
                        color: COLOR.textMuted,
                        textAlign: "center",
                      }}
                    >
                      {txt.subtitle as string}
                    </div>
                  )}
                </TextGate>
              </SlideUp>
            )}
          </div>

          <div
            data-text-container
            style={{
              position: "absolute",
              left: 60,
              right: 200,
              top: 430,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 22,
              ...cardLight,
            }}
          >
            <DotMatrix
              count={n}
              columns={dense ? 8 : Math.min(6, Math.max(2, n))}
              dotSize={dense ? 8 : 10}
              gap={8}
              start={0.35}
              stagger={0.04}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${spec.cols}, ${spec.width}px)`,
                gap: spec.gap,
                justifyContent: "center",
              }}
            >
              {points.map((point, i) => (
                <SlideUp key={i} delay={0.45 + i * (2 / 30)} duration={0.4}>
                  <div
                    data-text-container
                    style={{
                      width: spec.width,
                      height: spec.height,
                      padding: spec.pad,
                      border: "1px solid rgba(77,139,255,0.3)",
                      borderRadius: 8,
                      background: "rgba(10,10,20,0.55)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        background: COLOR.amber,
                        opacity: 0.85,
                      }}
                    />
                    {dense ? (
                      <div
                        aria-hidden
                        style={{
                          fontSize: 35,
                          fontWeight: 700,
                          color: COLOR.textMuted,
                          lineHeight: 1,
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </div>
                    ) : (
                      <TextGate
                        sceneId={sceneId}
                        slotId={`info-card.array.points[${i}]`}
                        slotWidth={contentWidth}
                        // Wide two-column cards need 40 for a three-line label
                        // to stay inside the 154px content height; the 3-column
                        // 116px content box fits at the gate's own ladder.
                        lockFontSize={n < 5 ? 40 : undefined}
                      >
                        {(fontSize) => (
                          <div
                            style={{
                              fontSize,
                              fontWeight: 700,
                              color: COLOR.text,
                              textAlign: "center",
                              lineHeight: 1.15,
                            }}
                          >
                            {point}
                          </div>
                        )}
                      </TextGate>
                    )}
                  </div>
                </SlideUp>
              ))}
            </div>
          </div>
        </Camera>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {scene.media && (
        <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
      )}
      <Glow color="blue" />
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
