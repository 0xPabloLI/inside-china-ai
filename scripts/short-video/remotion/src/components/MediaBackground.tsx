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
 * (SUBTITLE_LANE_TOP was then 1328, now 1336): the "画面被塞到字幕带下面" report.
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
    // No zIndex here: stacking must stay DOM-order based (backdrop < primary).
    // Media never draws a dim overlay or vignette any more (#1540): every
    // contrast layer is a separate opaque text surface, so a positive zIndex
    // here would only lift the media above those surfaces. The backdrop-branch
    // primary is a regular <Img> for the same reason — CanvasImage would paint
    // below <Video>.
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

  // ─── #156 backdrop layer ───
  // A generated clip rendered BENEATH the primary media (visible where the
  // primary doesn't cover the frame — e.g. contained charts, strips).
  // Muted by contract; opacity held below 1 so the motion layer never
  // competes with the primary media for attention.
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
            background:
              media.matteColor ?? "radial-gradient(circle at 50% 50%, #0a0a14 0%, #050508 100%)",
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
    </>
  );
};
