/**
 * DataScene — big stat reveal with source attribution.
 * CSS-first. A declared `scene.media` may render as a full-bleed background
 * behind the stat (LingSante re-cut, 2026-11-24); without it the frame stays
 * the original pure-CSS layout. The media keeps its own brightness (#1541).
 * Scene 3 in the Unitree video (8,288× oversubscribed).
 *
 * Light (#738): the stat is the protagonist and lands with a white flash; the
 * label takes the focus once the number has settled. The decorative corner wash that
 * used to sit behind this scene is gone — a full-frame gradient is not a
 * subject.
 */
import { Img, Interactive, staticFile, useCurrentFrame, interpolate } from "remotion";
import { Circle } from "@remotion/rough-notation";
import { type InfoSpec, type SceneData } from "../types";
import { BrandBar, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { StampIn, SlideUp, FadeIn } from "../components/animations/entrance";
import { SPACING, COLOR, ANNOTATION } from "../components/shared";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";
import { ChartFrame } from "../components/topology";
import { ChartPanel, ChartRenderer } from "../components/charts";
import { normalizeInfoSpec } from "../../../lib/info-grammar.mjs";
import { resolveRenderLayout } from "../../../lib/text-slots.mjs";

/** Resolve a scene media path to a static file URL, preserving the assets/ prefix. */
const assetSrc = (path: string): string =>
  staticFile(path.startsWith("assets/") ? path : `assets/${path}`);

/** Chart card media, only when the resolved layout renders a chart card. */
const chartSrcFor = (layout: string, media: SceneData["media"]): string | null =>
  layout === "chart-card" && media?.path ? assetSrc(media.path) : null;

/** DataScene full-bleed media source. */
const mediaSrcFor = (media: SceneData["media"]): string | null =>
  media?.path ? assetSrc(media.path) : null;

export const DataScene: React.FC<{ scene: SceneData; duration: number }> = ({
  scene,
  duration,
}) => {
  const txt = scene.texts || {};
  const sceneId = `data-${scene.id}`;
  const frame = useCurrentFrame();
  const statLight = useFocusLight("data", "stat", duration);
  const labelLight = useFocusLight("data", "statLabel", duration);
  const circleProgress = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const layout = resolveRenderLayout(scene);
  const chartSrc = chartSrcFor(layout, scene.media);
  const mediaSrc = mediaSrcFor(scene.media);
  const yearSource = layout === "year-source" && Boolean(txt.stat) && Boolean(txt.subtext);

  if (yearSource) {
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <BrandBar />
        <Camera visualType="data" duration={duration}>
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 200,
              top: 260,
              height: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
            }}
          >
            <div
              style={{
                width: 300,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <SlideUp delay={0.2} duration={0.5}>
                <TextGate
                  sceneId={sceneId}
                  slotId="data.year-source.stat"
                  lockFontSize={96}
                  // The year reads as a date stamp, not a stat the circle
                  // annotation owns (the field's default policy is circle for
                  // the hero-center stat).
                  expectAnnotation={false}
                >
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 900,
                        color: COLOR.amber,
                        // 1.2 leaves the 96px glyph ink (107px) inside the
                        // 300px-wide column's line box.
                        lineHeight: 1.2,
                        letterSpacing: "-2px",
                        ...statLight,
                      }}
                    >
                      {txt.stat as string}
                    </div>
                  )}
                </TextGate>
              </SlideUp>
              {txt.label && (
                <SlideUp delay={0.4} duration={0.5}>
                  <TextGate
                    sceneId={sceneId}
                    slotId="data.year-source.label"
                    // One line in the 300px column; the pill shape depends on it.
                    lockFontSize={40}
                  >
                    {(fontSize) => (
                      <div
                        style={{
                          display: "inline-block",
                          padding: "8px 16px",
                          border: "1px solid rgba(77,139,255,0.35)",
                          borderRadius: 999,
                          fontSize,
                          fontWeight: 800,
                          color: COLOR.brand,
                          letterSpacing: "1px",
                          ...labelLight,
                        }}
                      >
                        {txt.label as string}
                      </div>
                    )}
                  </TextGate>
                </SlideUp>
              )}
            </div>

            <SlideUp delay={0.5} duration={0.5}>
              <div
                data-text-container
                style={{
                  width: 440,
                  height: 300,
                  padding: 28,
                  border: "1px solid rgba(223,227,232,0.28)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <div
                  aria-hidden
                  style={{ width: 56, height: 4, borderRadius: 2, background: COLOR.amber }}
                />
                <TextGate
                  sceneId={sceneId}
                  slotId="data.year-source.subtext"
                  slotWidth={382}
                  // The 300px card is 244px tall after padding; five 40px
                  // lines overflowed it. 36px keeps five lines inside.
                  lockFontSize={36}
                >
                  {(fontSize) => (
                    <div style={{ fontSize, fontWeight: 700, color: COLOR.text, lineHeight: 1.35 }}>
                      {txt.subtext as string}
                    </div>
                  )}
                </TextGate>
              </div>
            </SlideUp>
          </div>

          {txt.source && (
            <div
              style={{
                position: "absolute",
                left: 60,
                right: 200,
                bottom: 210,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <FadeIn delay={1.0} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="data.year-source.source">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 600,
                        color: COLOR.textDim,
                        letterSpacing: "1px",
                        textAlign: "center",
                      }}
                    >
                      {txt.source as string}
                    </div>
                  )}
                </TextGate>
              </FadeIn>
            </div>
          )}
        </Camera>
      </div>
    );
  }

  if (layout === "chart") {
    if (!scene.info) {
      throw new Error(
        `Scene ${scene.id}: layout "chart" requires scene.info — run verify-video --pre before rendering`,
      );
    }
    const info = normalizeInfoSpec(scene.info) as InfoSpec;
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <BrandBar />
        <Camera visualType="data" duration={duration}>
          <div
            data-native-chart={info.chart}
            style={{
              position: "absolute",
              left: 60,
              right: 200,
              top: 300,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            {txt.label && (
              <TextGate sceneId={sceneId} slotId="data.chart.label" slotWidth={820}>
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 800,
                      color: COLOR.brand,
                      letterSpacing: "1px",
                      lineHeight: 1.15,
                      textAlign: "center",
                    }}
                  >
                    {txt.label as string}
                  </div>
                )}
              </TextGate>
            )}

            <FadeIn delay={0.25} duration={0.5}>
              <ChartPanel variant={info.panelVariant}>
                <ChartRenderer info={info} />
              </ChartPanel>
            </FadeIn>

            {txt.subtext && (
              <TextGate sceneId={sceneId} slotId="data.chart.subtext" slotWidth={820}>
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 600,
                      color: COLOR.textMuted,
                      lineHeight: 1.3,
                      textAlign: "center",
                    }}
                  >
                    {txt.subtext as string}
                  </div>
                )}
              </TextGate>
            )}
          </div>

          {txt.source && (
            <div
              style={{
                position: "absolute",
                left: 60,
                right: 200,
                bottom: 714,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <FadeIn delay={1.0} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="data.chart.source">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 600,
                        color: COLOR.textDim,
                        letterSpacing: "1px",
                        textAlign: "center",
                      }}
                    >
                      {txt.source as string}
                    </div>
                  )}
                </TextGate>
              </FadeIn>
            </div>
          )}
        </Camera>
      </div>
    );
  }

  if (chartSrc) {
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <BrandBar />
        <Camera visualType="data" duration={duration}>
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 200,
              // Below BrandBar (top 236).
              top: 320,
              height: 760,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
            }}
          >
            {txt.label && (
              <TextGate
                sceneId={sceneId}
                slotId="data.chart-card.label"
                // One line; the pill looks like a pill only when it does.
                lockFontSize={40}
              >
                {(fontSize) => (
                  <div
                    style={{
                      display: "inline-block",
                      padding: "8px 18px",
                      border: "1px solid rgba(77,139,255,0.35)",
                      borderRadius: 999,
                      fontSize,
                      fontWeight: 800,
                      color: COLOR.brand,
                      letterSpacing: "1px",
                      ...labelLight,
                    }}
                  >
                    {txt.label as string}
                  </div>
                )}
              </TextGate>
            )}

            <FadeIn delay={0.3} duration={0.5}>
              <ChartFrame>
                <Img
                  src={chartSrc}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </ChartFrame>
            </FadeIn>

            {txt.subtext && (
              <TextGate sceneId={sceneId} slotId="data.chart-card.subtext" slotWidth={440}>
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 700,
                      color: COLOR.text,
                      textAlign: "center",
                    }}
                  >
                    {txt.subtext as string}
                  </div>
                )}
              </TextGate>
            )}
          </div>

          {txt.source && (
            <div
              style={{
                position: "absolute",
                left: 60,
                right: 200,
                bottom: 210,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <FadeIn delay={1.0} duration={0.5}>
                <TextGate sceneId={sceneId} slotId="data.chart-card.source">
                  {(fontSize) => (
                    <div
                      style={{
                        fontSize,
                        fontWeight: 600,
                        color: COLOR.textDim,
                        letterSpacing: "1px",
                        textAlign: "center",
                      }}
                    >
                      {txt.source as string}
                    </div>
                  )}
                </TextGate>
              </FadeIn>
            </div>
          )}
        </Camera>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {mediaSrc && (
        <>
          <Img
            src={mediaSrc}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              filter: "blur(2px)",
              transform: "scale(1.04)",
            }}
          />
        </>
      )}
      <BrandBar />

      <Camera visualType="data" duration={duration}>
        <Slot variant="hero">
          {txt.stat && (
            <StampIn delay={0.2} duration={0.5}>
              <TextGate
                sceneId={sceneId}
                slotId="data.hero-center.stat"
                // Five-character stats (e.g. "66.03") fill the 820px band at
                // the 240px preferred size and leave the gate 13px above its
                // container. Lock them to 216px — still above the 180px floor
                // and inside the same visual weight — so the stat cannot
                // vertical-overflow after the entrance settles.
                lockFontSize={String(txt.stat).length >= 5 ? 216 : undefined}
              >
                {(fontSize) => (
                  <Interactive.Div
                    name="stat"
                    style={{
                      fontSize,
                      fontWeight: 900,
                      color: COLOR.amber,
                      // The gate box is a fixed-width block; pre-gate this div
                      // was a shrink-to-fit flex item that Slot centered. Keep
                      // the text centered so the Circle ellipse stays centered
                      // in the band (T5).
                      textAlign: "center",
                      // ≥ the font's natural ascent+descent (~1.1em): tighter
                      // line-height makes the inline text rects poke above the
                      // gate box and false-fail Fit (T5).
                      lineHeight: 1.2,
                      // #738: protagonist light, white flash on landing.
                      ...statLight,
                    }}
                  >
                    <Circle
                      color={COLOR.amber}
                      strokeWidth={ANNOTATION.circle.strokeWidth}
                      padding={ANNOTATION.circle.padding}
                      progress={circleProgress}
                      box="inside"
                    >
                      {txt.stat as string}
                    </Circle>
                  </Interactive.Div>
                )}
              </TextGate>
            </StampIn>
          )}
          {txt.statLabel && (
            <SlideUp delay={0.5} duration={0.5} style={{ marginTop: SPACING.lg }}>
              <TextGate sceneId={sceneId} slotId="data.hero-center.label">
                {(fontSize) => (
                  <Interactive.Div
                    name="statLabel"
                    style={{
                      fontSize,
                      fontWeight: 800,
                      color: COLOR.text,
                      letterSpacing: "4px",
                      // #738: the focus moves here after the number lands.
                      ...labelLight,
                    }}
                  >
                    {txt.statLabel as string}
                  </Interactive.Div>
                )}
              </TextGate>
            </SlideUp>
          )}
          {txt.subtext && (
            <FadeIn delay={0.8} duration={0.5} style={{ marginTop: SPACING.xl }}>
              <TextGate sceneId={sceneId} slotId="data.hero-center.subtext">
                {(fontSize) => (
                  <div style={{ fontSize, fontWeight: 600, color: COLOR.textMuted }}>
                    {txt.subtext as string}
                  </div>
                )}
              </TextGate>
            </FadeIn>
          )}
        </Slot>

        <Slot variant="support">
          {txt.source && (
            <FadeIn delay={1.0} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="data.hero-center.source">
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 600,
                      color: COLOR.textDim,
                      letterSpacing: "1px",
                    }}
                  >
                    {txt.source as string}
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
