/**
 * HookMediaLed — the media-led hook layout (`layout: "media-led"`).
 *
 * 2026-11-15 user ruling: the hero-center hook draws the number OVER the
 * media — right for a composed cover shot, wrong for a deterministic asset
 * whose focal content is exactly what the number covered (the zhipu K-line's
 * June peak sat under the "-80%"). Media-led inverts the hierarchy: the
 * picture is the protagonist and every text row renders where the picture is
 * not.
 *
 * Geometry (MEDIA_LED in lib/safe-zones.mjs, content band y 220-1298):
 *   y 220-298   kicker badge pill
 *   y 306-402   subject row (optional logo + 64px name)
 *   y 410-1029  media band — `fit: "contain"` gives the picture a 820×619
 *               box (x 60-880); `cover` fills the frame and only the text
 *               rows sit on it, over scrims
 *   y 1037-1298 text strip — number (locked 110px, no circle annotation: the
 *               annotation belongs to the hero-center protagonist, and here
 *               the picture is the protagonist), numberLabel, source
 *
 * The dim follows the FIT (lib/media-overlay.mjs → MEDIA_LED_DIM): 0.15 for the
 * contain band, where no text is drawn on the picture, and hook's 0.5 for
 * cover, where the badge and subject rows sit on the footage. The renderer
 * applies it as a fallback because only the sourcing seams write `overlay`.
 *
 * The number is deliberately `lockFontSize`d below the bigNumber contract's
 * 150px floor: the strip's vertical budget cannot hold a 150px line plus the
 * label and source rows, and in this layout the number is supporting cast.
 * The gate still runs its settled-frame asserts at the locked size — locking
 * skips Fit, not the geometry contract.
 *
 * ScanSweep and the hero-center focus choreography are intentionally absent:
 * the sweep is a glow for a text protagonist, and over a deterministic chart
 * it reads as noise. The picture carries the scene.
 */
import React from "react";
import type { SceneData } from "../types";
import { BrandBar, BadgePill, Slot } from "../components/visuals";
import { useFocusLight } from "../components/focus-light";
import { SlideUp, StampIn } from "../components/animations/entrance";
import { SPACING, CANVAS, COLOR, accentColorFor } from "../components/shared";
import { MediaBackground } from "../components/MediaBackground";
import { MediaScrims } from "../components/MediaScrims";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";
import { hookSubjectTextWidth } from "../../../lib/text-slots.mjs";
import { mediaLedDimFor } from "../../../lib/media-overlay.mjs";
import { MEDIA_LED, SAFE_ZONES } from "../../../lib/safe-zones.mjs";

/** Content-box width of the contain media band (SAFE_ZONES left/right). */
const MEDIA_LED_BAND_WIDTH = CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right; // 820

export const HookMediaLed: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir?: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const sceneId = `hook-media-led-${scene.id}`;
  const contain = scene.media?.fit === "contain";
  const numberLight = useFocusLight("hook", "bigNumber", duration);
  // The subject row is text-only: `subjectLogo` is NOT registered by the
  // media-led slot contract (assertKnownTextFields rejects it), so reserving
  // the logo's width here would be dead code that silently narrows the row.
  const subjectWidth = hookSubjectTextWidth();
  // `texts.color` steers the number here: media-led registers no claim text
  // for hero-center's accent to paint, and the strip's number is the only
  // coloured copy. Default amber; an unknown key falls back instead of
  // rendering undefined (#1375 review — accepted-but-ignored steering).
  const numberColor = accentColorFor(txt.color, COLOR.amber);

  // The dim belongs to the FIT, not to whichever seam wrote the media object
  // (#1305, 2026-11-15): sourcing writes it, but a hand-bound file and a
  // generated frame reach this renderer without that write. `overlay` written
  // by an author still wins.
  const media = scene.media
    ? { ...scene.media, overlay: scene.media.overlay ?? mediaLedDimFor(scene.media) }
    : null;

  // Contain: the picture owns [mediaTop .. strip.top - 8]; the 8px gap keeps
  // the picture's bottom edge clear of the strip's first text row.
  const mediaBand = {
    top: MEDIA_LED.mediaTop,
    height: MEDIA_LED.strip.top - 8 - MEDIA_LED.mediaTop,
  };

  return (
    <Camera visualType="hook" duration={duration}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {/* `mode:"card"` has no branch here on purpose: the evidence card spans
          y 300-986, straight through the badge and subject rows. The contract
          rejects it (checkHookMediaQuality → "Hook media mode"), so the
          renderer must not quietly accept what the gate refuses. */}
        {media &&
          (contain ? (
            <div
              style={{
                position: "absolute",
                top: mediaBand.top,
                left: SAFE_ZONES.left,
                width: MEDIA_LED_BAND_WIDTH,
                height: mediaBand.height,
                overflow: "hidden",
              }}
            >
              {/* scrimScope "element": the lane stop and rail vignette are
                canvas-relative and re-scale inside this 820×619 box — they
                would darken the picture's own bottom third and right edge,
                i.e. the focal content this layout exists to show. Neither
                region is inside the band. */}
              <MediaBackground
                media={media}
                duration={duration}
                contentDir={contentDir}
                scrimScope="element"
              />
            </div>
          ) : (
            <>
              <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                <MediaBackground media={media} duration={duration} contentDir={contentDir} />
              </div>
              {/* Cover: the badge and subject rows sit ON the footage, so the
                scrim bed (top band + bottom ramp) is what holds them — the
                same contract as hero-center's cover band, whose 0.5 dim
                `cover` inherits from MEDIA_LED_DIM. */}
              <MediaScrims mediaBottom={CANVAS.height} />
            </>
          ))}
        <BrandBar />

        {/* Kicker — badge pill in its own row ABOVE the picture. */}
        {txt.badge && (
          <Slot variant="kicker" top={MEDIA_LED.kicker.top} height={MEDIA_LED.kicker.height}>
            <StampIn delay={0.2} duration={0.4}>
              <TextGate sceneId={sceneId} slotId="hook.media-led.badge">
                {(fontSize) => <BadgePill text={txt.badge as string} fontSize={fontSize} />}
              </TextGate>
            </StampIn>
          </Slot>
        )}

        {/* Subject row — the same 820 band hero-center measures; no logo
          support in v1 (media-led is chart/photo-led, logo lockups keep
          hero-center). */}
        {txt.subject && (
          <div
            data-text-container
            style={{
              position: "absolute",
              left: SAFE_ZONES.left,
              right: SAFE_ZONES.right,
              top: MEDIA_LED.subject.top,
              height: MEDIA_LED.subject.height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{ minWidth: 0, maxWidth: subjectWidth, flexShrink: 1, textAlign: "center" }}
            >
              <TextGate sceneId={sceneId} slotId="hook.media-led.subject" slotWidth={subjectWidth}>
                {(fontSize) => (
                  <span
                    style={{
                      fontSize,
                      fontWeight: 900,
                      color: COLOR.text,
                      letterSpacing: "4px",
                    }}
                  >
                    {txt.subject as string}
                  </span>
                )}
              </TextGate>
            </div>
          </div>
        )}

        {/* Text strip — number (supporting cast, locked), label, source. */}
        <div
          data-text-container
          style={{
            position: "absolute",
            left: SAFE_ZONES.left,
            right: SAFE_ZONES.right,
            top: MEDIA_LED.strip.top,
            height: MEDIA_LED.strip.height,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {txt.bigNumber && (
            <TextGate
              sceneId={sceneId}
              slotId="hook.media-led.bigNumber"
              lockFontSize={MEDIA_LED.numberSize}
              expectAnnotation={false}
            >
              {(fontSize) => (
                <div
                  style={{
                    fontSize,
                    fontWeight: 900,
                    color: numberColor,
                    letterSpacing: "-4px",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    // The gate's content box is the full 820 band; without
                    // this the number hugs its left edge while the label and
                    // source below centre (measured on the first fixture
                    // render).
                    textAlign: "center",
                    ...numberLight,
                  }}
                >
                  {txt.bigNumber as string}
                </div>
              )}
            </TextGate>
          )}
          {txt.numberLabel && (
            <SlideUp delay={0.6} duration={0.5}>
              <TextGate sceneId={sceneId} slotId="hook.media-led.numberLabel">
                {(fontSize) => (
                  <div
                    style={{
                      fontSize,
                      fontWeight: 800,
                      color: COLOR.text,
                      letterSpacing: "3px",
                      marginTop: SPACING.md,
                      textAlign: "center",
                    }}
                  >
                    {(txt.numberLabel as string).replace((txt.numberHighlight as string) ?? "", "")}
                    {txt.numberHighlight && (
                      <span style={{ color: COLOR.red }}>{txt.numberHighlight as string}</span>
                    )}
                  </div>
                )}
              </TextGate>
            </SlideUp>
          )}
          {txt.source && (
            <TextGate sceneId={sceneId} slotId="hook.media-led.source">
              {(fontSize) => (
                <div
                  style={{
                    fontSize,
                    fontWeight: 700,
                    color: COLOR.textMuted,
                    letterSpacing: "3px",
                    textAlign: "center",
                    lineHeight: 1.2,
                    marginTop: SPACING.sm,
                  }}
                >
                  {txt.source as string}
                </div>
              )}
            </TextGate>
          )}
        </div>
      </div>
    </Camera>
  );
};
