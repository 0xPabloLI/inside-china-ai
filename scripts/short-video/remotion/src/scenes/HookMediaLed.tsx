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
 * Two geometries:
 *
 * 1. Legacy band (default for images, explicit `fullWidth:false`):
 *    Geometry (MEDIA_LED in lib/safe-zones.mjs, content band y 220-1298):
 *      y 220-298   kicker badge pill
 *      y 306-402   subject row (optional logo + 64px name)
 *      y 410-1029  media band — `fit: "contain"` gives the picture a 820×619
 *                  box (x 60-880); `cover` fills the frame. Media is never
 *                  dimmed; text rows sit outside the band or on their own
 *                  opaque surface.
 *      y 1037-1298 text strip — number (locked 110px), numberLabel, source.
 *
 * 2. Full-width band (#1559): the default for a contained VIDEO evidence
 *    picture, and opt-in for images (`media.fullWidth: true`). The 16:9
 *    picture fills the canvas width — 1080×608 at y 300-908 — with a blurred
 *    copy of the same source behind the whole canvas. The badge stays in the
 *    header; subject and number move into the plate at y 916-1206, below the
 *    picture. Nothing overlays the shot, and no 820px bed reappears.
 *
 * 2026-11-25 root rule: `MediaBackground` has no `overlay` / `scrimScope`
 * capability at all. The former MEDIA_LED_DIM table is gone.
 *
 * The number is deliberately `lockFontSize`d below the bigNumber contract's
 * 150px floor: the strip's vertical budget cannot hold a 150px line plus the
 * label and source rows, and in this layout the number is supporting cast.
 * The gate still runs its settled-frame asserts at the locked size — locking
 * skips Fit, not the geometry contract. The full-width plate has the same
 * budget: subject + number only; numberLabel/source fail preflight there.
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
import { MediaTextPanel } from "../components/MediaTextPanel";
import { ChartPanel, ChartRenderer } from "../components/charts";
import { Camera } from "../components/Camera";
import { TextGate } from "../components/text-gate";
import { hookSubjectTextWidth, isMediaLedFullWidth } from "../../../lib/text-slots.mjs";
import {
  HEADER_SLOTS,
  HOOK_MEDIA_LED_FULL,
  MEDIA_LED,
  SAFE_ZONES,
} from "../../../lib/safe-zones.mjs";

/** Content-box width of the contain media band (SAFE_ZONES left/right). */
const MEDIA_LED_BAND_WIDTH = CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right; // 820

export const HookMediaLed: React.FC<{
  scene: SceneData;
  duration: number;
  contentDir?: string;
}> = ({ scene, duration, contentDir }) => {
  const txt = scene.texts || {};
  const sceneId = `hook-media-led-${scene.id}`;
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

  // Media is never dimmed (2026-11-25 root rule). The contain branch puts the
  // picture in its own band; the cover branch fills the frame but carries no
  // contrast scrim. A layout that needs copy over footage must move the copy to
  // its own opaque surface instead of darkening the picture.
  const media = scene.media ?? null;
  const contain = scene.media?.fit === "contain";
  const fullWidth = isMediaLedFullWidth(scene);

  // Contain legacy: the picture owns [mediaTop .. strip.top - 8]; the 8px gap
  // keeps the picture's bottom edge clear of the strip's first text row.
  const mediaBand = {
    top: MEDIA_LED.mediaTop,
    height: MEDIA_LED.strip.top - 8 - MEDIA_LED.mediaTop,
  };

  // ─── Copy rows, shared by both geometries ───
  // TextGate needs a [data-text-container] ancestor for its container-overflow
  // assert; each branch supplies one, these elements stay position-free.
  const subjectNode = txt.subject ? (
    <div style={{ minWidth: 0, maxWidth: subjectWidth, flexShrink: 1, textAlign: "center" }}>
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
  ) : null;

  const numberNode = txt.bigNumber ? (
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
            // The gate's content box is the full 820 band; without this the
            // number hugs its left edge while the label and source below
            // centre (measured on the first fixture render).
            textAlign: "center",
            ...numberLight,
          }}
        >
          {txt.bigNumber as string}
        </div>
      )}
    </TextGate>
  ) : null;

  const labelNode = txt.numberLabel ? (
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
  ) : null;

  const sourceNode = txt.source ? (
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
  ) : null;

  // ─── Full-width media layer (#1559) ───
  // Same-source blur across the entire canvas; the sharp picture renders in a
  // 1080×608 container that a 16:9 source fills edge to edge. The plate below
  // is a flat translucent bed over the blur, not a dim over the picture.
  const fullWidthMediaLayer = media ? (
    <>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <MediaBackground
          media={{ ...media, fill: "blur" as const }}
          duration={duration}
          contentDir={contentDir}
          fillOnly
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: HOOK_MEDIA_LED_FULL.pictureTop,
          left: 0,
          width: CANVAS.width,
          height: HOOK_MEDIA_LED_FULL.pictureHeight,
          overflow: "hidden",
        }}
      >
        <MediaBackground media={media} duration={duration} contentDir={contentDir} />
      </div>
    </>
  ) : null;

  const legacyMediaLayer = media ? (
    <>
      {contain ? (
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
          {/* The picture owns this band and is never dimmed; every text
            row sits outside it. */}
          <MediaBackground media={media} duration={duration} contentDir={contentDir} />
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <MediaBackground media={media} duration={duration} contentDir={contentDir} />
          </div>
          {/* Cover puts the strip ON the footage; give the copy its own
              opaque surface instead of darkening the picture. */}
          <MediaTextPanel
            top={MEDIA_LED.strip.top}
            bottom={MEDIA_LED.strip.top + MEDIA_LED.strip.height}
          />
        </>
      )}
    </>
  ) : null;

  return (
    <Camera visualType="hook" duration={duration}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {/* `mode:"card"` has no branch here on purpose: the evidence card spans
          y 300-986, straight through the badge and subject rows. The contract
          rejects it (checkHookMediaQuality → "Hook media mode"), so the
          renderer must not quietly accept what the gate refuses. */}
        {scene.info?.chart === "candle" ? (
          // Native K-line (#1405): the baked series replaces the chart-img
          // screenshot. Same band, same geometry (820 wide, 619 tall) — the
          // panel letterboxes the 620-unit viewBox by 0.16%, which is why
          // nothing clips at the strip edge.
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
            <ChartPanel height={mediaBand.height}>
              <ChartRenderer info={scene.info} />
            </ChartPanel>
          </div>
        ) : fullWidth ? (
          fullWidthMediaLayer
        ) : (
          legacyMediaLayer
        )}
        <BrandBar showBrand={!txt.badge} />

        {/* Kicker — badge pill in its own row ABOVE the picture. */}
        {txt.badge && (
          <Slot
            variant="kicker"
            alignX="start"
            top={HEADER_SLOTS.badge.top}
            height={HEADER_SLOTS.badge.height}
            left={HEADER_SLOTS.badge.left}
            right={CANVAS.width - (HEADER_SLOTS.badge.left + HEADER_SLOTS.badge.width)}
          >
            <StampIn delay={0.2} duration={0.4}>
              <TextGate
                sceneId={sceneId}
                slotId="hook.media-led.badge"
                slotWidth={HEADER_SLOTS.badge.width}
                fitWidth={HEADER_SLOTS.badge.textWidth}
              >
                {(fontSize) => (
                  <BadgePill
                    text={txt.badge as string}
                    fontSize={fontSize}
                    collisionId="header.badge"
                  />
                )}
              </TextGate>
            </StampIn>
          </Slot>
        )}

        {fullWidth ? (
          <>
            {/* Copy plate below the picture: flat alpha over the blur fill. */}
            <div
              style={{
                position: "absolute",
                top: HOOK_MEDIA_LED_FULL.stripTop,
                left: 0,
                right: 0,
                height: HOOK_MEDIA_LED_FULL.stripBottom - HOOK_MEDIA_LED_FULL.stripTop,
                background: `rgba(10,10,20,${HOOK_MEDIA_LED_FULL.textBedAlpha})`,
              }}
            />
            <div
              data-text-container
              style={{
                position: "absolute",
                left: SAFE_ZONES.left,
                right: SAFE_ZONES.right,
                top: HOOK_MEDIA_LED_FULL.stripTop,
                height: HOOK_MEDIA_LED_FULL.stripBottom - HOOK_MEDIA_LED_FULL.stripTop,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
                overflow: "hidden",
              }}
            >
              {subjectNode}
              {numberNode}
              {labelNode}
              {sourceNode}
            </div>
          </>
        ) : (
          <>
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
                {subjectNode}
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
                justifyContent: "flex-start",
              }}
            >
              {numberNode}
              {labelNode}
              {sourceNode}
            </div>
          </>
        )}
      </div>
    </Camera>
  );
};
