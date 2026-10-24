/**
 * ContrastScene — two-column comparison (left vs right).
 * Scene 8 in the Unitree video (Unitree vs AgiBot).
 *
 * Media role (#761): `scene.media` renders as a full-bleed ambient background,
 * exactly like `narrative/stacked-cards` — the comparison cards sit on top of
 * it. Evidence assets (charts, screenshots) are not routed here because the
 * text block covers them; `scene-rules.checkLayoutMediaRouting` fails that
 * combination. Before this wiring the template dropped a bound `scene.media`
 * silently (two real scenes had product photos that never rendered).
 */
import { Interactive } from "remotion";
import { type SceneData } from "../types";
import { GridBg, Glow, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { SlideUp, StampIn, FadeIn } from "../components/animations/entrance";
import { SPACING } from "../components/shared";
import { TextGate } from "../components/text-gate";
import { MediaBackground } from "../components/MediaBackground";

export const ContrastScene: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const sceneId = `contrast-${scene.id}`;
  const left = txt.left ?? [];
  const right = txt.right ?? [];
  const hasMedia = Boolean(scene.media);

  const Chip: React.FC<{
    text: string;
    color: string;
    bg: string;
    delay: number;
    slotId: string;
  }> = ({ text, color, bg, delay, slotId }) => (
    <SlideUp delay={delay} duration={0.4}>
      <TextGate sceneId={sceneId} slotId={slotId}>
        {(fontSize) => (
          <div
            style={{
              display: "inline-block",
              padding: "8px 16px",
              borderRadius: 6,
              fontSize,
              fontWeight: 700,
              color,
              background: bg,
            }}
          >
            {text}
          </div>
        )}
      </TextGate>
    </SlideUp>
  );

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {hasMedia && (
        <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
      )}
      {/* GridBg only when no media — same rule as NarrativeScene, so the grid
          never competes with a bound background image. */}
      {!hasMedia && <GridBg />}
      <Glow color="blue" />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

      {/* #688: the shared hero band (400-950) was sized for 22px chips. At the
          48px copy floor this scene's own content — title, vs chip, two chip
          cards and the note — measures 718px (fixture `measure:contrast`), so
          the band becomes the whole safe zone (220-1150, 930px). The content
          stays vertically centred (flex), so it lands on the safe zone's centre
          (685) rather than the old band's (675) — a 10px shift, and the old
          550px band could not hold the content at all. */}
      <Slot variant="hero" top={220} height={930}>
        {txt.title && (
          <SlideUp delay={0.2} duration={0.5} style={{ marginBottom: SPACING.xl }}>
            <TextGate sceneId={sceneId} slotId="contrast.hero-center.title">
              {(fontSize) => (
                <Interactive.Div
                  name="title"
                  style={{ fontSize, fontWeight: 900, color: "#f5f5f5", textAlign: "center" }}
                >
                  {txt.title as string}
                </Interactive.Div>
              )}
            </TextGate>
          </SlideUp>
        )}
        {txt.vs && (
          <StampIn delay={0.4} duration={0.4}>
            <TextGate sceneId={sceneId} slotId="contrast.hero-center.vs">
              {(fontSize) => (
                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 20px",
                    border: "1px solid #94a3b8",
                    borderRadius: 6,
                    fontSize,
                    fontWeight: 900,
                    color: "#94a3b8",
                    letterSpacing: "2px",
                    marginBottom: 20,
                  }}
                >
                  {txt.vs as string}
                </div>
              )}
            </TextGate>
          </StampIn>
        )}

        {/* Left card */}
        <div
          data-text-container
          style={{
            padding: 24,
            borderRadius: 10,
            marginBottom: 16,
            width: "100%",
            border: "2px solid rgba(245,158,11,0.3)",
            background: "rgba(245,158,11,0.05)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {left.map((item, i) => (
              <Chip
                key={i}
                text={item}
                color="#f59e0b"
                bg="rgba(245,158,11,0.1)"
                delay={0.6 + i * 0.12}
                slotId={`contrast.hero-center.left[${i}]`}
              />
            ))}
          </div>
        </div>

        {/* Right card */}
        <div
          data-text-container
          style={{
            padding: 24,
            borderRadius: 10,
            marginBottom: 16,
            width: "100%",
            border: "2px solid rgba(77,139,255,0.3)",
            background: "rgba(77,139,255,0.05)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {right.map((item, i) => (
              <Chip
                key={i}
                text={item}
                color="#4d8bff"
                bg="rgba(77,139,255,0.1)"
                delay={0.9 + i * 0.12}
                slotId={`contrast.hero-center.right[${i}]`}
              />
            ))}
          </div>
        </div>

        {txt.note && (
          <FadeIn delay={1.2} duration={0.5}>
            <TextGate sceneId={sceneId} slotId="contrast.hero-center.note">
              {(fontSize) => (
                <div style={{ fontSize, fontWeight: 700, color: "#cbd5e1", textAlign: "center" }}>
                  {txt.note as string}
                  {txt.noteHighlight && (
                    <span style={{ color: "#ef4444" }}>{txt.noteHighlight as string}</span>
                  )}
                </div>
              )}
            </TextGate>
          </FadeIn>
        )}
      </Slot>
    </div>
  );
};
