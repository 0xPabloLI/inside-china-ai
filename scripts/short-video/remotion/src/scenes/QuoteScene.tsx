/**
 * QuoteScene — large quote with attribution and verified badge.
 * Scene 6 in the Unitree video ("filing admits robots can't do real work").
 *
 * Light (#738): the quotation is the protagonist and flashes white as it
 * lands; the attribution takes the focus at 1.8s. The red corner wash is gone —
 * it was a second, competing key light with no subject.
 */
import { useCurrentFrame, interpolate } from "remotion";
import { Underline } from "@remotion/rough-notation";
import { type SceneData } from "../types";
import { GridBg, Scanlines, BrandBar, FrameGlow, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { FadeIn, SlideUp, StampIn } from "../components/animations/entrance";
import { SPACING, COLOR } from "../components/shared";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";

export const QuoteScene: React.FC<{ scene: SceneData; duration: number }> = ({
  scene,
  duration,
}) => {
  const txt = scene.texts || {};
  const sceneId = `quote-${scene.id}`;
  const frame = useCurrentFrame();
  const quoteLight = useFocusLight("quote", "quote", duration);
  const sourceLight = useFocusLight("quote", "source", duration);
  const underlineProgress = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GridBg />
      <Scanlines />
      <BrandBar />
      <FrameGlow variant="amber" />

      <Camera visualType="quote" duration={duration}>
        <Slot variant="hero">
          <div style={{ textAlign: "center", maxWidth: 820 }}>
            <FadeIn delay={0.2} duration={0.5}>
              <div
                style={{
                  fontSize: 160,
                  fontWeight: 900,
                  color: "rgba(239,68,68,0.15)",
                  lineHeight: 0.8,
                  marginBottom: -30,
                }}
              >
                "
              </div>
            </FadeIn>
            {txt.quote && (
              <SlideUp delay={0.5} duration={0.6}>
                <TextGate sceneId={sceneId} slotId="quote.hero-center.quote">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 700,
                        color: COLOR.text,
                        lineHeight: 1.35,
                        // #738: protagonist light, white flash on landing.
                        ...quoteLight,
                      }}
                    >
                      <Underline color={COLOR.brand} progress={underlineProgress}>
                        {txt.quote as string}
                      </Underline>
                    </div>
                  )}
                </TextGate>
              </SlideUp>
            )}
            {txt.source && (
              <FadeIn delay={1.3} duration={0.5} style={{ marginTop: SPACING["3xl"] }}>
                <TextGate sceneId={sceneId} slotId="quote.hero-center.source">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 700,
                        color: COLOR.textMuted,
                        letterSpacing: "2px",
                        // #738: the focus moves to the attribution.
                        ...sourceLight,
                      }}
                    >
                      {txt.source as string}
                    </div>
                  )}
                </TextGate>
              </FadeIn>
            )}
            {txt.verified && (
              <StampIn delay={1.8} duration={0.4}>
                <div style={{ marginTop: 24 }}>
                  <TextGate sceneId={sceneId} slotId="quote.hero-center.verified" settledFrame={66}>
                    {(fontSize) => (
                      // The badge decoration lives INSIDE the gate: the gate is
                      // the 820px slot centered in the band, so its layout box
                      // stays in the safe zone; the inline-flex badge wraps the
                      // text and inherits the slot's centering. (The reverse
                      // nesting — gate inside the badge — forced an 820px block
                      // through an inline-fit container and shifted it 30px
                      // right; pipeline regression quote-7 verified.)
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "14px 28px",
                          border: "2px solid rgba(245,158,11,0.3)",
                          borderRadius: 10,
                          background: "rgba(245,158,11,0.06)",
                        }}
                      >
                        <span
                          style={{
                            fontSize,
                            fontWeight: 800,
                            color: COLOR.amber,
                            letterSpacing: "2px",
                          }}
                        >
                          {txt.verified as string}
                        </span>
                      </div>
                    )}
                  </TextGate>
                </div>
              </StampIn>
            )}
          </div>
        </Slot>
      </Camera>
    </div>
  );
};
