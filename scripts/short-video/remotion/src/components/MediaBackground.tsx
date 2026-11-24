/**
 * MediaBackground — image/video background with 5 animation presets.
 *
 * Enhanced entrance/exit animations:
 *   - fade: opacity + slight scale-up (1.0→1.03) + slight translateY
 *   - ken-burns: slow continuous zoom (1.0→1.12) + pan + fade in/out
 *   - slide: translateX + blur-to-sharp transition + fade
 *   - zoom: dramatic scale (1.3→1.0 in, 1.0→1.15 out) + fade
 *   - none: static, no animation
 *
 * All presets have:
 *   - Entrance: opacity 0→1 with preset-specific motion
 *   - Sustained: preset-specific continuous motion (or static)
 *   - Exit: no opacity ramp (TransitionSeries handles crossfade);
 *     subtle motion drift retained for some presets
 *   - Video volume: independent exit fade (baseVolume × 4-stop envelope)
 *
 * Rules:
 *   - All scenes can opt in to media via scene.media (hook, narrative, etc.)
 *   - CTA scene remains CSS-only (no media rendering)
 *   - ken-burns / zoom + video → auto-degrade to fade (see resolvePreset)
 *   - File not found → render nothing (pre-validated by render-remotion.mjs)
 */
import { AbsoluteFill, useCurrentFrame, staticFile, Img, useVideoConfig } from "remotion";
import type { EffectsProp } from "remotion";
import { Video } from "@remotion/media";
import { interpolate, secToFrames, clamp, easeOutExpo } from "./shared";
import { resolveMediaAudio, videoVolumeAt } from "../../../lib/audio-envelope.mjs";
import { railVignetteGradient } from "../../../lib/safe-zones.mjs";
import type { MediaField } from "../types";
import { useNarrationActive } from "./narration-context";

// Animation timing (seconds)
const TIMING: Record<string, { in: number; out: number }> = {
  fade: { in: 0.8, out: 0.6 },
  "ken-burns": { in: 1.0, out: 0.6 },
  slide: { in: 0.7, out: 0.5 },
  zoom: { in: 0.6, out: 0.5 },
  none: { in: 0, out: 0 },
};

interface Props {
  media: MediaField;
  duration: number;
  contentDir?: string;
  /** Optional @remotion/effects to apply to video/image (e.g. blur, vignette). */
  effects?: EffectsProp;
  /**
   * Where a `fit: "contain"` picture sits vertically inside its container
   * (#1075). `"bottom"` is only correct for the layouts that own a contain
   * band — HookScene and NarrativeScene's `media-bottom-bar` — where the
   * picture must land on the text bar. Everywhere else (full-frame info-card /
   * context / contrast, evidence cards, fullscreen) the default `"center"`
   * keeps the picture off the burned-subtitle lane.
   */
  containAlign?: ContainAlign;
  /**
   * Which scrims this element draws (#media-led, 2026-11-15).
   *
   * `"frame"` (default) is the full-frame contract: the subtitle-lane stop at
   * 66.8–67.6% and the action-rail vignette, both calibrated in CANVAS
   * percentages because the element spans the canvas.
   *
   * `"element"` is for a picture mounted inside a BAND. Those two gradients
   * re-scale to whatever element they are painted on: in the media-led hook's
   * 820×619 band at (60, 410) the 0.75 lane stop lands at the band's own
   * y 823 (a 0.75 scrim over the picture's bottom third) and the rail ramp
   * crosses the band's right edge — darkening the exact focal content the
   * layout exists to expose. A band therefore gets a flat dim at `overlay`
   * and no lane/rail gradients at all; neither region is inside the band.
   *
   * Bounded surfaces (MediaCard, evidence bands, media-split windows) MUST
   * pass `"element"`. `"frame"` is only for a background that genuinely spans
   * the 1080×1920 canvas. Getting this wrong paints a directional shadow over
   * the picture's right and bottom edge; the source + pixel gates live in
   * `__tests__/media-card-scrim-contract.test.mjs` and
   * `__tests__/media-focus-render.test.mjs`.
   */
  scrimScope?: "frame" | "element";
  /**
   * Force the action-rail vignette on a band-mounted picture (#1524).
   *
   * `scrimScope:"element"` suppresses both frame gradients, which is right for
   * a band that sits inside the content column — but media-first's band spans
   * the full canvas width all the way down to the content bottom, so the rail
   * region IS inside it. Without this switch a bright 16:9 frame leaves the
   * rail at luminance 88 (gate limit 80).
   */
  railVignette?: boolean;
  /** Peak alpha for the rail vignette; defaults to RAIL_VIGNETTE.alpha. */
  railAlpha?: number;
}

/** Vertical anchor for a contained picture inside its container. */
export type ContainAlign = "bottom" | "center" | "upper";

/** Maps focus field to CSS object-position value. */
const FOCUS_MAP: Record<string, string> = {
  top: "center top",
  center: "center",
  bottom: "center bottom",
};

/**
 * #360 videoStartOffsetMs (ms ≥ 0, absent = 0) → @remotion/media Video
 * `trimBefore` in FRAMES (the installed 4.0.517 getTimeInSeconds divides
 * trimBefore by fps). Absent/0 → undefined: the <Video> element receives
 * exactly the pre-#360 prop set (no regression).
 */
const offsetMsToTrimBefore = (offsetMs: number | undefined, fps: number) =>
  offsetMs ? Math.round((offsetMs / 1000) * fps) : undefined;

/**
 * Which preset actually renders.
 *
 * A container scale is a still-asset effect: it belongs on a picture that has
 * no motion of its own. On video it stacks a second motion on the asset's
 * camera move and crops the frame a second time on top of fit:cover, while
 * drifting the crop window away from the VLM cropFocus that was solved for a
 * STATIC crop — `zoom` by up to 30% (1.3 → 1.0 → 1.15, #357), `ken-burns` by
 * 12% plus a pan. Both degrade to `fade`, whose own 1.05 push drifts 5% —
 * reduced, not removed; `none` is the only motionless preset.
 *
 * Kept in step with `VIDEO_ANIMATION` in lib/asset-sourcer.mjs — the allocator
 * must not hand out a preset this function is going to override.
 */
const resolvePreset = (
  requested: MediaField["animation"],
  type: MediaField["type"],
): NonNullable<MediaField["animation"]> => {
  const preset = requested ?? "fade";
  if (type === "video" && (preset === "ken-burns" || preset === "zoom")) return "fade";
  return TIMING[preset] ? preset : "fade";
};

/**
 * The dim layer's background for a scrim scope (#media-led, 2026-11-15).
 *
 * `"frame"` keeps the two-stop gradient whose bottom stop protects the subtitle
 * lane; `"element"` (a picture mounted in a band) gets the flat dim only, since
 * those stops are canvas-relative and would land inside the band.
 */
const dimBackgroundFor = (
  scope: "frame" | "element",
  overlay: number,
  overlayOpacity: number,
): string =>
  scope === "element"
    ? `rgba(10, 10, 20, ${overlayOpacity})`
    : `linear-gradient(to bottom,
            rgba(10, 10, 20, ${overlayOpacity}) 0%,
            rgba(10, 10, 20, ${overlayOpacity}) 66.8%,
            rgba(10, 10, 20, ${overlay > 0 ? Math.max(0.75, overlay) : 0}) 67.6%,
            rgba(10, 10, 20, ${overlay > 0 ? Math.max(0.75, overlay) : 0}) 100%)`;

/** Whether the frame-level action-rail vignette applies to this element. */
const drawsRailVignette = (scope: "frame" | "element", overlay: number): boolean =>
  scope === "frame" && overlay > 0;

/**
 * CSS `object-position` for the media element.
 *
 * #1040: `cropFocus.{x,y}` is already a normalized CSS object-position ratio,
 * not a source-space point — hence the direct `${x * 100}%` mapping below.
 * crop-decision.mjs `sourceFocusToObjectPosition` is the producer-side
 * conversion. The producer and this consumer must not be "fixed" independently.
 *
 * VERTICAL for fit:"contain" is NOT read from cropFocus.y. cropFocus.y is a
 * CROP-framing value — it chooses which slice of a cover-cropped source
 * survives — and a contained picture keeps the whole source, so there is
 * nothing left to frame. The vertical therefore comes from `containAlign`,
 * which describes the CONTAINER: only the layouts that give the picture a band
 * want it dropped onto the text bar (`"bottom"`, see CONTAIN_MEDIA_BOTTOM in
 * lib/safe-zones.mjs). Everything else — a full-frame info-card / context /
 * contrast background, an evidence card, fullscreen — centres it (#1075).
 * Before #1075 every container bottom-anchored, so a contain picture in a
 * full-frame scene landed at y 1312–1920, under the burned subtitles
 * (SUBTITLE_LANE_TOP 1328): the "画面被塞到字幕带下面" report.
 *
 * Extracted from the component body: inlining this pushed `MediaBackground`
 * past the complexity ceiling the incremental lint enforces on changed files.
 *
 * @param {MediaField} media - the scene's media field
 * @param {ContainAlign} containAlign - vertical anchor for a contained picture
 * @returns {string} a CSS `object-position` value
 */
const objectPositionFor = (media: MediaField, containAlign: ContainAlign): string => {
  const focusX = media.cropFocus?.x ?? 0.5;
  if ((media.fit ?? "cover") === "contain") {
    // "upper" drops a 16:9 frame into the top third of a full-canvas
    // media-first bed, leaving the lower half for the copy and its subtitle
    // lane without putting either on top of the picture.
    const vertical = containAlign === "bottom" ? "100%" : containAlign === "upper" ? "23%" : "50%";
    return `${focusX * 100}% ${vertical}`;
  }
  if (media.cropFocus) return `${media.cropFocus.x * 100}% ${media.cropFocus.y * 100}%`;
  return FOCUS_MAP[media.focus ?? "center"] ?? "center";
};

const motionFor = (
  preset: ReturnType<typeof resolvePreset>,
  frame: number,
  inFrames: number,
  outStart: number,
  totalFrames: number,
): { scale: number; translateX: string; translateY: string; filter: string } => {
  let scale = 1;
  let translateX = "0px";
  let translateY = "0px";
  let filter = "none";

  if (preset === "fade") {
    scale = interpolate(frame, [0, totalFrames], [1.0, 1.05], clamp);
    translateY = interpolate(frame, [outStart, totalFrames], [0, -30], clamp) + "px";
  } else if (preset === "ken-burns") {
    scale = interpolate(frame, [0, totalFrames], [1.0, 1.12], clamp);
    translateX = interpolate(frame, [0, totalFrames], [-20, 20], clamp) + "px";
    translateY = interpolate(frame, [0, totalFrames], [10, -10], clamp) + "px";
  } else if (preset === "slide") {
    const xPercent = interpolate(
      frame,
      [0, inFrames, outStart, totalFrames],
      [100, 0, 0, -100],
      clamp,
    );
    translateX = `${xPercent}%`;
    const blurAmount = interpolate(frame, [0, inFrames], [8, 0], clamp);
    filter = `blur(${blurAmount}px)`;
    scale = interpolate(frame, [0, inFrames, outStart, totalFrames], [1.1, 1.0, 1.0, 1.05], clamp);
  } else if (preset === "zoom") {
    scale = interpolate(frame, [0, inFrames, outStart, totalFrames], [1.3, 1.0, 1.0, 1.15], {
      ...clamp,
      easing: easeOutExpo,
    });
  }

  return { scale, translateX, translateY, filter };
};

const FillBlur: React.FC<{
  media: MediaField;
  src: string;
  opacity: number;
  trimBefore: number;
}> = ({ media, src, opacity, trimBefore }) => (
  <AbsoluteFill style={{ opacity }}>
    {media.type === "image" ? (
      <Img
        src={src}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(48px) saturate(0.92)",
          transform: "scale(1.12)",
        }}
      />
    ) : (
      <Video
        src={src}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          filter: "blur(48px) saturate(0.92)",
          transform: "scale(1.12)",
        }}
        objectFit="cover"
        volume={0}
        trimBefore={trimBefore}
        loop
      />
    )}
  </AbsoluteFill>
);

export const MediaBackground: React.FC<Props> = ({
  media,
  duration,
  effects,
  containAlign = "center",
  scrimScope = "frame",
  railVignette,
  railAlpha,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // #360: playback starts at the offset into the SOURCE video. Out-of-range
  // offsets (≥ source duration) are the author's responsibility —
  // MediaBackground has no duration knowledge; the render degrades
  // gracefully (no crash, verified by still evidence). Loop semantics:
  // trimBefore + loop wraps the trimmed segment — playback repeats from
  // the offset to the source end, never showing pre-offset frames.
  const trimBefore = offsetMsToTrimBefore(media.videoStartOffsetMs, fps);

  // ken-burns + video → degrade to fade; #357: zoom + video → degrade to fade
  const preset = resolvePreset(media.animation, media.type);

  const timing = TIMING[preset];
  const overlay = media.mode === "fullscreen" ? 0 : (media.overlay ?? 0.7);
  const totalFrames = secToFrames(duration);
  const inFrames = secToFrames(Math.min(timing.in, duration / 2));
  const outFrames = secToFrames(Math.min(timing.out, duration / 2));
  const outStart = totalFrames - outFrames;

  const src = staticFile(media.path.startsWith("assets/") ? media.path : `assets/${media.path}`);

  // ─── Opacity (all presets except none) ───
  // Entrance-only envelope: image fades in, stays at full opacity.
  // No exit fade — TransitionSeries handles the crossfade at scene boundaries.
  // This prevents the "double fade" / "blink to black" flicker.
  const opacity =
    preset === "none" ? 1 : interpolate(frame, [0, inFrames, totalFrames], [0, 1, 1], clamp);

  // ─── Preset-specific transforms ───

  const { scale, translateX, translateY, filter } = motionFor(
    preset,
    frame,
    inFrames,
    outStart,
    totalFrames,
  );

  // ─── Volume (independent exit fade: audio ducks out at scene end) ───
  // Video volume has its own 4-stop envelope so audio still fades out
  // at scene end, even though media opacity no longer has an exit ramp.
  // #1030: the envelope is INDEPENDENT of the visual preset. `none` used to
  // hold a constant baseVolume, hard-cutting a clip's audio at every scene
  // boundary — that coupling is why the allocator could never hand `none` to
  // a talking-head video (#357). TIMING.none is {in:0,out:0}, so it gets a
  // short dedicated audio fade; every other preset keeps its existing timing.
  //
  // The curve lives in lib/audio-envelope.mjs (plain .mjs, no Remotion
  // dependency) so it is behaviourally testable from the root vitest suite and
  // cannot be handed a degenerate interpolate() input range on short scenes.
  const baseVolume = media.volume ?? 0.08;
  const fadeFrames = secToFrames(Math.min(0.25, duration / 2));
  // #1525: source-audio window + narration ducking. Both are optional and
  // resolved in one helper so an untouched clip keeps the pre-#1525 envelope.
  const narrationActive = useNarrationActive();
  const { audioWindow, duck } = resolveMediaAudio({
    media,
    fps,
    totalFrames,
    narrationActive,
  });
  const videoVolume = videoVolumeAt({
    frame,
    baseVolume,
    inFrames,
    outFrames,
    outStart,
    totalFrames,
    fadeFrames,
    audioWindow,
    duck,
  });

  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    // No zIndex here: stacking must stay DOM-order based (backdrop < primary
    // < dim overlay). A positive zIndex lifts the media above the overlay and
    // safe-zone brightness checks fail (#201). The backdrop-branch primary is
    // a regular <Img> for the same reason — CanvasImage would paint below <Video>.
    //
    // NO objectFit HERE — it is a PROP on @remotion/media's <Video>, and the
    // component ignores it in `style` (it logs "Use the `objectFit` prop
    // instead of the `style` prop" once, then renders with its own default of
    // `contain`). Declaring it here looked correct and did nothing: every
    // scene asked for `fit: "cover"` and every scene letterboxed.
    //
    // Measured on the 2026-10-25 unitree render: a 16:9 source sat at canvas
    // y 263-887 inside a 1150px media band — 263px of dead space above and
    // below the picture, in every narrative scene, for the whole video. The
    // MediaBand geometry in lib/safe-zones.mjs was sized assuming cover (its
    // comments compute where the source's burned-in captions land "cover-
    // cropped into a 1080xH band"), so the band was never the problem.
    //
    // objectPosition still belongs here: it is a plain CSS property on the
    // underlying element and does apply. The rule — including why only the
    // band layouts anchor to the bottom — lives in objectPositionFor above.
    objectPosition: objectPositionFor(media, containAlign),
    opacity,
    transform: `translate(${translateX}, ${translateY}) scale(${scale})`,
    filter: filter !== "none" ? filter : undefined,
  };

  /** The resolved fit mode, shared by every media branch below. */
  const fit = media.fit ?? "cover";

  // ─── Branded matte (image + contain only) ───
  // When an image uses fit:"contain" (landscape source that can't survive
  // 9:16 cover crop), render a quiet brand gradient behind the letterboxed
  // image instead of bare #0a0a14. Video contain stays bare — only images
  // get the matte (Issue #119 comment feedback #1).
  const isContain = (media.fit ?? "cover") === "contain";
  const showBrandedMatte = media.type === "image" && isContain;
  // #1524: a blurred, cover-cropped copy of the SAME source fills the space a
  // contained 16:9 picture leaves. The element is still a full-bleed picture —
  // no letterbox, no subject crop — which is what lets the media-first layout
  // spend the whole content band on imagery. An explicit `backdrop` wins: it
  // is already the letterbox filler, and stacking two background layers would
  // pay for a second decode without changing a pixel the viewer can name.
  const showFillBlur = isContain && media.fill === "blur" && !media.backdrop;

  // Overlay also fades in/out slightly for smoother transitions
  const overlayOpacity =
    preset === "none"
      ? overlay
      : interpolate(
          frame,
          [0, inFrames * 0.5, outStart, totalFrames],
          [0, overlay, overlay, overlay * 0.3],
          clamp,
        );

  // ─── #156 backdrop layer ───
  // A generated clip rendered BENEATH the primary media (visible where the
  // primary doesn't cover the frame — e.g. contained charts, strips).
  // Muted by contract; opacity held below 1 so the motion layer never
  // competes with the primary media for attention. The primary media's
  // overlay div (rendered above both) still governs text contrast.
  const BACKDROP_OPACITY = 0.5;
  const backdropPath = media.backdrop
    ? staticFile(
        media.backdrop.path.startsWith("assets/")
          ? media.backdrop.path
          : `assets/${media.backdrop.path}`,
      )
    : null;

  return (
    <>
      {showBrandedMatte && !showFillBlur && (
        <AbsoluteFill
          style={{
            background: "radial-gradient(circle at 50% 50%, #0a0a14 0%, #050508 100%)",
            opacity,
          }}
        />
      )}
      {/* #1524: blurred fill for a contained picture. It is the SAME source at
          cover crop, so the colour and motion belong to the shot instead of a
          flat matte; the sharp contain picture paints on top. Blur 48px hides
          the upscale's softness while keeping the shot readable as atmosphere,
          and scale 1.12 keeps the blur from sampling the element edge. */}
      {showFillBlur && (
        <FillBlur media={media} src={src} opacity={opacity} trimBefore={trimBefore} />
      )}
      {/* Backdrop sits ABOVE the matte (which is bare background) but BELOW
          the primary media — visible in the letterbox/strip area around it. */}
      {backdropPath && (
        <Video
          src={backdropPath}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: BACKDROP_OPACITY,
          }}
          objectFit="cover"
          volume={0}
          loop
        />
      )}
      {media.type === "image" ? (
        // #156: CanvasImage's canvas compositing always paints beneath <Video>
        // elements regardless of DOM order/z-index, which hides the primary
        // image behind a backdrop; #1524's blurred fill is the same problem.
        // <Img> is now unconditionally the faster and correct path: it is
        // composited by the browser, while CanvasImage repainted the
        // full-frame canvas every frame. Measured on a real 57.5s pack
        // (1725 frames): 73s → 55s, SSIM 0.999 vs the CanvasImage render.
        <Img src={src} style={{ ...mediaStyle, objectFit: fit }} />
      ) : (
        // Background video is a texture, not a clip to be watched once: a
        // source shorter than the scene must keep moving (matches the `loop`
        // in lib/media-bg.mjs mediaLayer (the retired HTML renderer).
        //
        // `objectFit` is a PROP on @remotion/media's <Video>, not a style —
        // see the note on mediaStyle. Omitting it silently means `contain`.
        <Video
          src={src}
          style={mediaStyle}
          objectFit={fit}
          volume={videoVolume}
          effects={effects}
          trimBefore={trimBefore}
          loop
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          // #1305 follow-up: a single flat scrim cannot serve both jobs. At the
          // old 0.7 the picture was invisible; at 0.55 the picture reads but the
          // subtitle gap does too — measured 23.3% bright pixels in y 1298–1328
          // against a 5% ceiling (`BRIGHT_RATIO_FAIL`), a hard frame-analysis
          // failure.
          //
          // The stop is tied to the content edge, not a fraction of the frame:
          // 66.8%..67.6% of 1920 is y 1283..1298, i.e. a 15px ramp that lands
          // on the gap's top edge. Anything that starts higher eats into a
          // contained picture's visible box (y 656..1263, `#1075`) and the
          // focus-anchor render contract reads it as a cropped image.
          //
          // The bottom stop reads the configured `overlay`, not the animated
          // `overlayOpacity`, so the exit fade cannot brighten the lane. It
          // tops out at 0.75 (not 0.88): a `bottom`-anchored contained picture
          // sits INSIDE the lane (y 1313..1919, #1075) and the focus-anchor
          // contract still has to classify its colour — past ~0.8 the palette
          // read collapses and the picture audits as absent.
          //
          // `overlay: 0` means "no dim layer" and is honoured literally: the
          // render contracts drive a pure-colour fixture through this component
          // and a floor there would recolour it.
          //
          // scrimScope "element" (a band-mounted picture) keeps only the flat
          // dim: the lane stop below is canvas-relative and would land inside
          // the band at its own 66.8%.
          background: dimBackgroundFor(scrimScope, overlay, overlayOpacity),
          transition: "background 0.3s",
        }}
      />
      {/* Action-rail vignette — the horizontal half of the same fix the bottom
          stop above is the vertical half of.

          #1305 dropped the flat scrim from 0.7 to 0.55 so the picture would
          read again, which handed the TikTok action rail back its brightness:
          measured on minimax-h3-image scene 2 the rail went to 607/3550 =
          17.1% bright pixels against a 5% ceiling (`BRIGHT_RATIO_FAIL`) —
          a hard frame-analysis failure — while the same frame had passed at
          0.7. No single flat alpha serves both jobs, exactly as no single
          bottom stop did.

          Geometry lives in RAIL_VIGNETTE (lib/safe-zones.mjs) with the
          measurements: a plateau from the rail's left edge, not MediaScrims'
          smoothstep, because the smoothstep's ramp is spent inside the region
          the gate samples.

          Static alpha, gated on `overlay > 0`: the animated `overlayOpacity`
          would let the exit fade brighten the rail back up, and `overlay: 0`
          means "no dim layer" — a pure-colour fixture must stay untouched
          (render contracts). */}
      {(railVignette ?? drawsRailVignette(scrimScope, overlay)) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            // Full-frame element on purpose: the gradient's stops are
            // canvas-relative, so a `left: rampStartX` element would scale the
            // ramp into its own 230px width and land it at x≈1031.
            background: railVignetteGradient(railAlpha),
          }}
        />
      )}
    </>
  );
};
