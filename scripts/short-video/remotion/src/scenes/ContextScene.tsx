/**
 * ContextScene — context card with badge, title, and detail.
 * Scene 7 in the Unitree video (DeepSeek + Tencent backing).
 *
 * Light (#738): the card title is the protagonist; the amber context line and
 * the detail are supporting copy and stay dark (配角默认不发光). The blue
 * corner tint is ground colour, not a second key light.
 */
import { type SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { StampIn, SlideUp, StaggerWords } from "../components/animations/entrance";
import { SPACING, COLOR } from "../components/shared";
import { TextGate } from "../components/text-gate";
import { MediaBackground } from "../components/MediaBackground";
import { Camera } from "../components/Camera";

export const ContextScene: React.FC<{ scene: SceneData; duration: number; contentDir: string }> = ({
  scene,
  duration,
  contentDir,
}) => {
  const txt = scene.texts || {};
  const sceneId = `context-${scene.id}`;
  const hasMedia = !!scene.media;
  const titleLight = useFocusLight("context", "title", duration);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {hasMedia && (
        <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
      )}
      {!hasMedia && <GridBg />}
      <Glow color="blue" />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="blue" />

      <Camera visualType="context" duration={duration}>
        <Slot variant="kicker">
          {txt.badge && (
            <StampIn delay={0.2} duration={0.4}>
              <TextGate sceneId={sceneId} slotId="context.hero-center.badge">
                {(fontSize) => (
                  <div
                    style={{
                      display: "inline-block",
                      padding: "8px 20px",
                      border: "1px solid rgba(77,139,255,0.3)",
                      borderRadius: 6,
                      fontSize,
                      fontWeight: 800,
                      color: COLOR.brand,
                      letterSpacing: "2px",
                    }}
                  >
                    {txt.badge as string}
                  </div>
                )}
              </TextGate>
            </StampIn>
          )}
        </Slot>

        <Slot variant="hero">
          <div
            data-text-container
            style={{
              padding: 36,
              border: "2px solid rgba(77,139,255,0.2)",
              borderRadius: 12,
              background: "rgba(10,10,20,0.6)",
              width: "100%",
            }}
          >
            {txt.title && (
              <SlideUp delay={0.4} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="context.hero-center.title">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 900,
                        color: COLOR.text,
                        marginBottom: SPACING.sm,
                        // #738: the title is the shot's protagonist.
                        ...titleLight,
                      }}
                    >
                      {txt.title as string}
                      {txt.titleHighlight && (
                        <span style={{ color: COLOR.brand }}>{txt.titleHighlight as string}</span>
                      )}
                    </div>
                  )}
                </TextGate>
              </SlideUp>
            )}
            {txt.context && (
              <SlideUp delay={0.6} duration={0.5} style={{ marginTop: SPACING.lg }}>
                <TextGate sceneId={sceneId} slotId="context.hero-center.context">
                  {(fontSize) => (
                    <div style={{ fontSize, fontWeight: 700, color: COLOR.amber }}>
                      {txt.context as string}
                    </div>
                  )}
                </TextGate>
              </SlideUp>
            )}
            {txt.detail && (
              <div style={{ marginTop: SPACING.md }}>
                <TextGate sceneId={sceneId} slotId="context.hero-center.detail">
                  {(fontSize) => (
                    <div style={{ fontSize, fontWeight: 600, color: COLOR.textMuted }}>
                      <StaggerWords text={txt.detail as string} delay={0.8} duration={0.5} />
                    </div>
                  )}
                </TextGate>
              </div>
            )}
          </div>
        </Slot>
      </Camera>
    </div>
  );
};
