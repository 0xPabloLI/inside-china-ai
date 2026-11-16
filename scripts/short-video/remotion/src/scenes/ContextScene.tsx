/**
 * ContextScene — context card with badge, title, and detail.
 * Scene 7 in the Unitree video (DeepSeek + Tencent backing).
 *
 * Light (#738): the card title is the protagonist; the amber context line and
 * the detail are supporting copy and stay dark (配角默认不发光). The blue
 * corner tint is ground colour, not a second key light.
 */
import { type SceneData } from "../types";
import { Glow, BrandBar, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { StampIn, SlideUp, StaggerWords } from "../components/animations/entrance";
import { SPACING, COLOR } from "../components/shared";
import { TextGate } from "../components/text-gate";
import { MediaBackground } from "../components/MediaBackground";
import { Camera } from "../components/Camera";
import { FlowArrow } from "../components/topology";
import { resolveRenderLayout } from "../../../lib/text-slots.mjs";

/** One node in the flow topology (declared at module scope: creating a
 * component inside render resets its state every frame). */
const FlowNode: React.FC<{
  children: React.ReactNode;
  delay: number;
  tone: string;
  bg: string;
  glow?: React.CSSProperties;
  pill?: boolean;
  width?: number;
}> = ({ children, delay, tone, bg, glow, pill, width = 480 }) => (
  <SlideUp delay={delay} duration={0.4}>
    <div
      data-text-container
      style={{
        width,
        padding: pill ? "14px 24px" : 24,
        borderRadius: pill ? 999 : 10,
        border: `1px solid ${tone}`,
        background: bg,
        display: "flex",
        justifyContent: "center",
        ...glow,
      }}
    >
      {children}
    </div>
  </SlideUp>
);

export const ContextScene: React.FC<{ scene: SceneData; duration: number; contentDir: string }> = ({
  scene,
  duration,
  contentDir,
}) => {
  const txt = scene.texts || {};
  const sceneId = `context-${scene.id}`;
  const hasMedia = !!scene.media;
  const titleLight = useFocusLight("context", "title", duration);
  const layout = resolveRenderLayout(scene);

  if (layout === "flow") {
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {hasMedia && (
          <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
        )}
        <Glow color="blue" />
        <BrandBar />

        <Camera visualType="context" duration={duration}>
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 200,
              // Below BrandBar (top 236).
              top: 320,
              height: 790,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            {txt.badge && (
              <FlowNode
                delay={0.2}
                tone="rgba(77,139,255,0.35)"
                bg="rgba(77,139,255,0.08)"
                width={360}
              >
                <TextGate sceneId={sceneId} slotId="context.flow.badge" slotWidth={310}>
                  {(fontSize) => (
                    <div
                      style={{
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
              </FlowNode>
            )}

            {txt.badge && <FlowArrow delay={0.35} />}

            {txt.title && (
              <FlowNode
                delay={0.4}
                tone="rgba(245,158,11,0.45)"
                bg="rgba(245,158,11,0.06)"
                glow={titleLight}
              >
                <TextGate
                  sceneId={sceneId}
                  slotId="context.flow.title"
                  // Long causal titles ("THE ENGINE BEHIND …") at 43px are
                  // 458px wide; 40px keeps them inside the 430px node.
                  lockFontSize={40}
                >
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 900,
                        color: COLOR.text,
                        textAlign: "center",
                        lineHeight: 1.2,
                      }}
                    >
                      {txt.title as string}
                      {txt.titleHighlight && (
                        <>
                          {" "}
                          <span style={{ color: COLOR.brand }}>{txt.titleHighlight as string}</span>
                        </>
                      )}
                    </div>
                  )}
                </TextGate>
              </FlowNode>
            )}

            {txt.context && (
              <>
                <FlowArrow delay={0.6} />
                <FlowNode delay={0.65} tone="rgba(77,139,255,0.35)" bg="rgba(77,139,255,0.06)">
                  <TextGate sceneId={sceneId} slotId="context.flow.context">
                    {(fontSize) => (
                      <div
                        style={{
                          fontSize,
                          fontWeight: 700,
                          color: COLOR.amber,
                          textAlign: "center",
                        }}
                      >
                        {txt.context as string}
                      </div>
                    )}
                  </TextGate>
                </FlowNode>
              </>
            )}

            {txt.detail && (
              <>
                <FlowArrow delay={0.85} />
                <FlowNode delay={0.9} tone="rgba(148,163,184,0.28)" bg="rgba(255,255,255,0.03)">
                  <TextGate sceneId={sceneId} slotId="context.flow.detail">
                    {(fontSize) => (
                      <div
                        style={{
                          fontSize,
                          fontWeight: 600,
                          color: COLOR.textMuted,
                          textAlign: "center",
                        }}
                      >
                        {txt.detail as string}
                      </div>
                    )}
                  </TextGate>
                </FlowNode>
              </>
            )}
          </div>
        </Camera>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {hasMedia && (
        <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
      )}
      <Glow color="blue" />
      <BrandBar />

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
