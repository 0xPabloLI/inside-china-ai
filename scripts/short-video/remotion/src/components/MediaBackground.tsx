/**
 * MediaBackground — image/video background with 5 animation presets.
 *
 * Consumes the `media` field from scene-data.mjs (data contract from
 * lib/media-bg.mjs, commit 0156089). Renders with Remotion <Img>/<Video>
 * + interpolate() instead of CSS keyframes.
 *
 * Presets: fade, ken-burns, slide, zoom, none
 * Rules:
 *   - Hook/CTA scenes ignore media (checked by caller, not here)
 *   - File not found → warn + render nothing (graceful degradation)
 *   - ken-burns + video → auto-degrade to fade
 */
import { useCurrentFrame, staticFile, Img, Video } from "remotion";
import { existsSync } from "fs";
import { resolve } from "path";
import { interpolate, secToFrames, clamp, FPS } from "./shared";
import type { MediaField } from "../types";

// Animation timing (seconds) — matches lib/media-bg.mjs ANIM_TIMING
const TIMING: Record<string, { in: number; out: number }> = {
  fade: { in: 0.8, out: 0.5 },
  "ken-burns": { in: 0.8, out: 0.5 },
  slide: { in: 0.6, out: 0.4 },
  zoom: { in: 0.5, out: 0.5 },
  none: { in: 0, out: 0 },
};

// Scale params — matches lib/media-bg.mjs ANIM_SCALE
const SCALE: Record<string, { start: number; mid: number; end: number }> = {
  "ken-burns": { start: 1.0, mid: 1.04, end: 1.08 },
};

interface Props {
  media: MediaField;
  duration: number; // scene duration in seconds
  contentDir: string; // absolute path to the content directory
}

export const MediaBackground: React.FC<Props> = ({ media, duration, contentDir }) => {
  const frame = useCurrentFrame();

  // Resolve and check file existence
  const absPath = resolve(contentDir, media.path);
  if (!existsSync(absPath)) {
    console.warn(`MediaBackground: file not found: ${absPath}, skipping`);
    return null;
  }

  // Determine preset (ken-burns + video → degrade to fade)
  let preset = media.animation ?? "fade";
  if (preset === "ken-burns" && media.type === "video") {
    preset = "fade";
  }

  const timing = TIMING[preset] ?? TIMING.fade;
  const overlay = media.overlay ?? 0.7;
  const totalFrames = secToFrames(duration);
  const inFrames = secToFrames(Math.min(timing.in, duration / 2));
  const outFrames = secToFrames(Math.min(timing.out, duration / 2));

  // Compute animation values
  const src = staticFile(media.path.startsWith("assets/") ? media.path : `assets/${media.path}`);

  // Opacity for all presets (fade in/out)
  const opacity = preset === "none"
    ? 1
    : interpolate(
        frame,
        [0, inFrames, totalFrames - outFrames, totalFrames],
        [0, 1, 1, 0],
        clamp,
      );

  // Scale for ken-burns (continuous zoom 1.0→1.08)
  const scale = preset === "ken-burns"
    ? interpolate(frame, [0, totalFrames], [SCALE["ken-burns"].start, SCALE["ken-burns"].end], clamp)
    : preset === "zoom"
    ? interpolate(
        frame,
        [0, inFrames, totalFrames - outFrames, totalFrames],
        [1.2, 1.0, 1.0, 1.1],
        clamp,
      )
    : 1;

  // TranslateX for slide
  const translateX = preset === "slide"
    ? interpolate(
        frame,
        [0, inFrames, totalFrames - outFrames, totalFrames],
        ["100%", "0%", "0%", "-100%"],
        clamp,
      )
    : "0%";

  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity,
    scale: `${scale}`,
    transform: translateX !== "0%" ? `translateX(${translateX})` : undefined,
  };

  return (
    <>
      {/* Media layer */}
      {media.type === "image" ? (
        <Img src={src} style={mediaStyle} />
      ) : (
        <Video src={src} style={mediaStyle} />
      )}
      {/* Dark overlay for text readability */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `rgba(10, 10, 20, ${overlay})`,
      }} />
    </>
  );
};
