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
 *
 * Light (#738): the framing claim is the protagonist and flashes as it lands;
 * at 1.3s the right-hand answer card takes the focus (a box light). The left
 * card stays dark — in a contrast, the side being argued against is not the
 * subject.
 */
import { Interactive } from "remotion";
import { type SceneData } from "../types";
import { Glow, BrandBar, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { SlideUp, StampIn, FadeIn } from "../components/animations/entrance";
import { SPACING, COLOR } from "../components/shared";
import { TextGate } from "../components/text-gate";
import { MediaBackground } from "../components/MediaBackground";
import { Camera } from "../components/Camera";
import { resolveRenderLayout } from "../../../lib/text-slots.mjs";

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
  const titleLight = useFocusLight("contrast", "title", duration);
  const rightLight = useFocusLight("contrast", "right", duration);
  const layout = resolveRenderLayout(scene);

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

  if (layout === "split") {
    const column = (
      items: string[],
      side: "left" | "right",
      tone: string,
      bg: string,
      delay: number,
      glow: React.CSSProperties | undefined,
    ) => (
      <div
        data-text-container
        style={{
          width: 380,
          minHeight: 300,
          padding: 24,
          borderRadius: 12,
          border: `2px solid ${tone}`,
          background: bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          ...glow,
        }}
      >
        {items.map((item, i) => (
          <SlideUp key={i} delay={delay + i * 0.12} duration={0.4}>
            <TextGate sceneId={sceneId} slotId={`contrast.split.${side}[${i}]`}>
              {(fontSize) => (
                <div
                  style={{
                    display: "inline-block",
                    padding: i === 0 ? "8px 16px" : "0 6px",
                    // 12px, not a full pill: the lead can wrap to three lines
                    // and a 999px radius then draws an ellipse around them.
                    borderRadius: i === 0 ? 12 : 0,
                    background: i === 0 ? bg : "transparent",
                    border: i === 0 ? `1px solid ${tone}` : "none",
                    fontSize,
                    fontWeight: i === 0 ? 900 : 700,
                    color: i === 0 ? tone : COLOR.text,
                    textAlign: "center",
                  }}
                >
                  {item}
                </div>
              )}
            </TextGate>
          </SlideUp>
        ))}
      </div>
    );

    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {hasMedia && (
          <MediaBackground media={scene.media!} duration={duration} contentDir={contentDir} />
        )}
        <Glow color="blue" />
        <BrandBar />

        <Camera visualType="contrast" duration={duration}>
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 200,
              // Below BrandBar (top 236); the gate is 138px at preferred 60.
              top: 320,
              height: 140,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {txt.title && (
              <TextGate sceneId={sceneId} slotId="contrast.split.title">
                {(fontSize) => (
                  <Interactive.Div
                    name="title"
                    style={{
                      fontSize,
                      fontWeight: 900,
                      color: COLOR.text,
                      textAlign: "center",
                      ...titleLight,
                    }}
                  >
                    {txt.title as string}
                  </Interactive.Div>
                )}
              </TextGate>
            )}
          </div>

          {/* One flow column: VS overlays the card gap, the note follows the
              cards' real height instead of a fixed 1080px that left a hole
              under short real copy and collided with tall copy. */}
          <div
            style={{
              position: "absolute",
              left: 60,
              width: 820,
              top: 475,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ position: "relative", display: "flex", gap: 60 }}>
              {txt.vs && (
                <div
                  style={{
                    position: "absolute",
                    // The gate is 820px wide; a narrower parent makes its
                    // `margin: 0 auto` negative and shifts the glyph off the
                    // row. 820 also keeps it centred in the 60px card gap.
                    left: 0,
                    top: 0,
                    width: 820,
                    textAlign: "center",
                  }}
                >
                  <TextGate sceneId={sceneId} slotId="contrast.split.vs" lockFontSize={36}>
                    {(fontSize) => (
                      <div
                        style={{
                          // Bare symbol, not a pill: 48px + 40px padding was
                          // 88px wide and covered both column borders.
                          fontSize,
                          fontWeight: 900,
                          color: COLOR.textDim,
                          letterSpacing: "2px",
                        }}
                      >
                        {txt.vs as string}
                      </div>
                    )}
                  </TextGate>
                </div>
              )}
              {column(left, "left", COLOR.amber, "rgba(245,158,11,0.06)", 0.5, undefined)}
              {column(right, "right", COLOR.brand, "rgba(77,139,255,0.06)", 0.8, rightLight)}
            </div>

            {txt.note && (
              <FadeIn delay={1.2} duration={0.5} style={{ marginTop: 36, width: 820 }}>
                <TextGate sceneId={sceneId} slotId="contrast.split.note">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 700,
                        color: COLOR.textMuted,
                        textAlign: "center",
                      }}
                    >
                      {txt.note as string}
                      {txt.noteHighlight && (
                        <span style={{ color: COLOR.red }}>{txt.noteHighlight as string}</span>
                      )}
                    </div>
                  )}
                </TextGate>
              </FadeIn>
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

      {/* #688: the shared hero band (400-950) was sized for 22px chips. At the
          48px copy floor this scene's own content — title, vs chip, two chip
          cards and the note — measures 718px (fixture `measure:contrast`), so
          the band becomes the whole safe zone (220-1150, 930px). The content
          stays vertically centred (flex), so it lands on the safe zone's centre
          (685) rather than the old band's (675) — a 10px shift, and the old
          550px band could not hold the content at all. */}
      <Camera visualType="contrast" duration={duration}>
        <Slot variant="hero" top={220} height={930}>
          {txt.title && (
            <SlideUp delay={0.2} duration={0.5} style={{ marginBottom: SPACING.xl }}>
              <TextGate sceneId={sceneId} slotId="contrast.hero-center.title">
                {(fontSize) => (
                  <Interactive.Div
                    name="title"
                    style={{
                      fontSize,
                      fontWeight: 900,
                      color: COLOR.text,
                      textAlign: "center",
                      // #738: the claim is the protagonist, flash on landing.
                      ...titleLight,
                    }}
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
                      border: `1px solid ${COLOR.textDim}`,
                      borderRadius: 6,
                      fontSize,
                      fontWeight: 900,
                      color: COLOR.textDim,
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
                  color={COLOR.amber}
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
              // #738: the answer card takes the focus at 0.9s.
              ...rightLight,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {right.map((item, i) => (
                <Chip
                  key={i}
                  text={item}
                  color={COLOR.brand}
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
                  <div
                    style={{
                      fontSize,
                      fontWeight: 700,
                      color: COLOR.textMuted,
                      textAlign: "center",
                    }}
                  >
                    {txt.note as string}
                    {txt.noteHighlight && (
                      <span style={{ color: COLOR.red }}>{txt.noteHighlight as string}</span>
                    )}
                  </div>
                )}
              </TextGate>
            </FadeIn>
          )}
        </Slot>
      </Camera>
    </div>
  );
};
