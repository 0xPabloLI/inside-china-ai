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
 *   - ken-burns + video → auto-degrade to fade
 *   - File not found → render nothing (pre-validated by render-remotion.mjs)
 */
import { AbsoluteFill, useCurrentFrame, staticFile, CanvasImage } from "remotion";
import type { EffectsProp } from "remotion";
import { Video } from "@remotion/media";
import { interpolate, secToFrames, clamp, easeOut, easeOutExpo } from "./shared";
import type { MediaField } from "../types";

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
}

/** Maps focus field to CSS object-position value. */
const FOCUS_MAP: Record<string, string> = {
  top: "center top",
  center: "center",
  bottom: "center bottom",
};

export const MediaBackground: React.FC<Props> = ({ media, duration, effects }) => {
  const frame = useCurrentFrame();

  // Determine preset (ken-burns + video → degrade to fade)
  let preset = media.animation ?? "fade";
  if (preset === "ken-burns" && media.type === "video") {
    preset = "fade";
  }
  if (!TIMING[preset]) preset = "fade";

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

  let scale = 1;
  let translateX = "0px";
  let translateY = "0px";
  let filter = "none";

  if (preset === "fade") {
    // Gentle scale-up throughout + slight drift up on exit
    scale = interpolate(frame, [0, totalFrames], [1.0, 1.05], clamp);
    translateY = interpolate(frame, [outStart, totalFrames], [0, -30], clamp) + "px";
  } else if (preset === "ken-burns") {
    // Slow continuous zoom + pan
    scale = interpolate(frame, [0, totalFrames], [1.0, 1.12], clamp);
    translateX = interpolate(frame, [0, totalFrames], [-20, 20], clamp) + "px";
    translateY = interpolate(frame, [0, totalFrames], [10, -10], clamp) + "px";
  } else if (preset === "slide") {
    // Slide in from right + slide out to left
    const xPercent = interpolate(
      frame,
      [0, inFrames, outStart, totalFrames],
      [100, 0, 0, -100],
      clamp,
    );
    translateX = `${xPercent}%`;
    // Blur during entrance, sharp when settled
    const blurAmount = interpolate(frame, [0, inFrames], [8, 0], clamp);
    filter = `blur(${blurAmount}px)`;
    // Slight scale for depth
    scale = interpolate(frame, [0, inFrames, outStart, totalFrames], [1.1, 1.0, 1.0, 1.05], clamp);
  } else if (preset === "zoom") {
    // Dramatic zoom in (1.3→1.0), then zoom out on exit (1.0→1.15)
    scale = interpolate(frame, [0, inFrames, outStart, totalFrames], [1.3, 1.0, 1.0, 1.15], {
      ...clamp,
      easing: easeOutExpo,
    });
  }

  // ─── Volume (independent exit fade: audio ducks out at scene end) ───
  // Video volume has its own 4-stop envelope so audio still fades out
  // at scene end, even though media opacity no longer has an exit ramp.
  const baseVolume = media.volume ?? 0.08;
  const videoVolume =
    preset === "none"
      ? baseVolume
      : baseVolume * interpolate(frame, [0, inFrames, outStart, totalFrames], [0, 1, 1, 0], clamp);

  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: media.fit ?? "cover",
    objectPosition: media.cropFocus
      ? `${media.cropFocus.x * 100}% ${media.cropFocus.y * 100}%`
      : (FOCUS_MAP[media.focus ?? "center"] ?? "center"),
    opacity,
    transform: `translate(${translateX}, ${translateY}) scale(${scale})`,
    filter: filter !== "none" ? filter : undefined,
  };

  // ─── Branded matte (image + contain only) ───
  // When an image uses fit:"contain" (landscape source that can't survive
  // 9:16 cover crop), render a quiet brand gradient behind the letterboxed
  // image instead of bare #0a0a14. Video contain stays bare — only images
  // get the matte (Issue #119 comment feedback #1).
  const isContain = (media.fit ?? "cover") === "contain";
  const showBrandedMatte = media.type === "image" && isContain;

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

  return (
    <>
      {showBrandedMatte && (
        <AbsoluteFill
          style={{
            background: "radial-gradient(circle at 50% 50%, #0a0a14 0%, #050508 100%)",
            opacity,
          }}
        />
      )}
      {media.type === "image" ? (
        <CanvasImage src={src} style={mediaStyle} />
      ) : (
        // Background video is a texture, not a clip to be watched once: a
        // source shorter than the scene must keep moving (matches the `loop`
        // in lib/media-bg.mjs mediaLayer for the HTML renderer).
        <Video src={src} style={mediaStyle} volume={videoVolume} effects={effects} loop />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(10, 10, 20, ${overlayOpacity})`,
          transition: "background 0.3s",
        }}
      />
    </>
  );
};
