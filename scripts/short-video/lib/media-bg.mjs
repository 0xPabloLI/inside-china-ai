/**
 * Media Background Support — bgImage + bgVideo for short video scenes.
 *
 * Provides:
 *   - Path resolution: relative → absolute (validateMedia / resolveMediaPath
 *     are consumed by verify-video.mjs preflight and apply-media-patch.mjs)
 *   - Validation: file existence, preset compatibility
 *
 * Legacy (retired HTML/Playwright path, see retired-html-path/README.md):
 *   `animationCss()` and `mediaLayer()` generated the CSS/HTML the Playwright
 *   recorder used. Kept exported as the media-contract CSS reference (zero
 *   production consumers, test-locked); the Remotion renderer uses
 *   remotion/src/components/MediaBackground.tsx instead.
 *
 * Design (Grill Round 1-2, 2026-08-11):
 *   - Animation presets use CSS @keyframes with percentage-based timing
 *     so in/out transitions auto-scale to any scene duration.
 *   - All scene templates (hook, narrative, info-card, quote) can opt in to
 *     media via scene.media. ctaScene remains CSS-only.
 *
 * Remotion compatibility:
 *   The `media` field in scene-data is pure data (Remotion-agnostic).
 *   Remotion migration reads the same schema and renders with React
 *   <Img>/<Video> + interpolate() instead of CSS keyframes.
 *   This module (lib/media-bg.mjs) is the rendering layer that Remotion
 *   replaces; the data contract survives.
 *
 * @module media-bg
 */

import { existsSync } from "fs";
import { resolve } from "path";

// ─── Constants ───

/**
 * Valid animation preset names.
 */
export const VALID_PRESETS = ["fade", "ken-burns", "slide", "zoom", "none"];

/**
 * Valid media mode values.
 */
export const VALID_MODES = ["background", "fullscreen"];

/**
 * Valid fit values for landscape-to-vertical placement.
 */
export const VALID_FITS = ["cover", "contain"];

/**
 * Valid focus values for crop positioning when fit is "cover".
 */
export const VALID_FOCUSES = ["top", "center", "bottom"];

/**
 * Default overlay opacity when `media.overlay` is not specified.
 */
const DEFAULT_OVERLAY = 0.7;

/**
 * Animation timing parameters per preset (seconds).
 * inDuration: entrance animation length
 * outDuration: exit animation length
 */
const ANIM_TIMING = {
  fade: { in: 0.8, out: 0.5 },
  "ken-burns": { in: 0.8, out: 0.5 },
  slide: { in: 0.6, out: 0.4 },
  zoom: { in: 0.5, out: 0.5 },
  none: { in: 0, out: 0 },
};

/**
 * Scale parameters for ken-burns and zoom presets.
 */
const ANIM_SCALE = {
  "ken-burns": { start: 1.0, mid: 1.04, end: 1.08 },
  zoom: { inStart: 1.2, inEnd: 1.0, outStart: 1.0, outEnd: 1.1 },
};

// ─── Path utilities ───

/**
 * Resolve a relative media path to an absolute file:// URL.
 *
 * @param {string} mediaPath - Path relative to the content directory
 * @param {string} contentDir - Absolute content directory path
 * @returns {string} file:// URL usable in HTML (background-image, <video src>)
 */
export function resolveMediaPath(mediaPath, contentDir) {
  const absolute = resolve(contentDir, mediaPath);
  return `file://${absolute}`;
}

/**
 * Check if a media file exists on disk.
 *
 * @param {string} mediaPath - Path relative to the content directory
 * @param {string} contentDir - Absolute content directory path
 * @returns {boolean}
 */
export function mediaExists(mediaPath, contentDir) {
  if (!mediaPath) return false;
  return existsSync(resolve(contentDir, mediaPath));
}

// ─── Animation CSS generation ───

/**
 * Generate CSS @keyframes for a media animation preset.
 *
 * The keyframes span the full scene duration, with opacity ramping up
 * at the start (entrance) and down at the end (exit). If the total
 * transition time exceeds the scene duration, both are scaled
 * proportionally so they fit.
 *
 * @param {string} preset - Animation preset name (fade|ken-burns|slide|zoom|none)
 * @param {number} duration - Scene duration in seconds
 * @param {string} mediaType - "image" or "video"
 * @returns {string} CSS string with @keyframes + .media-bg animation rule.
 *                   Empty string for "none" or zero/negative duration.
 */
export function animationCss(preset, duration, mediaType) {
  // Handle edge cases
  if (duration <= 0) return "";
  if (preset === "none") return "";

  // ken-burns only applies to images; video falls back to fade
  let effectivePreset = preset;
  if (preset === "ken-burns" && mediaType === "video") {
    effectivePreset = "fade";
  }

  // Unknown preset → fade
  if (!ANIM_TIMING[effectivePreset]) {
    effectivePreset = "fade";
  }

  const timing = ANIM_TIMING[effectivePreset];
  let inDur = timing.in;
  let outDur = timing.out;

  // Scale transitions proportionally if they don't fit within duration
  if (inDur + outDur > duration && inDur + outDur > 0) {
    const scaleFactor = duration / (inDur + outDur);
    inDur = inDur * scaleFactor;
    outDur = outDur * scaleFactor;
  }

  // Calculate percentage breakpoints
  const inPct = (inDur / duration) * 100;
  const outStartPct = ((duration - outDur) / duration) * 100;

  // Clamp to valid range
  const inPctClamped = Math.min(inPct, 100);
  const outStartPctClamped = Math.min(Math.max(outStartPct, inPctClamped), 100);

  // Format to 2 decimal places, strip trailing zeros
  const fmt = (n) => parseFloat(n.toFixed(2)).toString();
  const inP = fmt(inPctClamped);
  const outP = fmt(outStartPctClamped);

  // Unique keyframe name per preset
  const animName = `mediaBg${effectivePreset.replace(/-/g, "")}`;

  let keyframes = "";

  switch (effectivePreset) {
    case "fade":
      keyframes = `@keyframes ${animName} {
  0% { opacity: 0; }
  ${inP}% { opacity: 1; }
  ${outP}% { opacity: 1; }
  100% { opacity: 0; }
}`;
      break;

    case "ken-burns": {
      const s = ANIM_SCALE["ken-burns"];
      const midScale = s.mid;
      const endScale = s.end;
      keyframes = `@keyframes ${animName} {
  0% { opacity: 0; transform: scale(${s.start}); }
  ${inP}% { opacity: 1; transform: scale(${midScale}); }
  ${outP}% { opacity: 1; transform: scale(${(parseFloat(midScale) + parseFloat(endScale)) / 2}); }
  100% { opacity: 0; transform: scale(${endScale}); }
}`;
      break;
    }

    case "slide":
      keyframes = `@keyframes ${animName} {
  0% { opacity: 0; transform: translateX(100%); }
  ${inP}% { opacity: 1; transform: translateX(0); }
  ${outP}% { opacity: 1; transform: translateX(0); }
  100% { opacity: 0; transform: translateX(-100%); }
}`;
      break;

    case "zoom": {
      const s = ANIM_SCALE.zoom;
      keyframes = `@keyframes ${animName} {
  0% { opacity: 0; transform: scale(${s.inStart}); }
  ${inP}% { opacity: 1; transform: scale(${s.inEnd}); }
  ${outP}% { opacity: 1; transform: scale(${s.outStart}); }
  100% { opacity: 0; transform: scale(${s.outEnd}); }
}`;
      break;
    }

    default:
      // Should never reach here (handled above)
      return "";
  }

  return `${keyframes}\n.media-bg { animation: ${animName} ${fmt(duration)}s ease-in-out forwards; }`;
}

// ─── Base CSS ───

/**
 * Base CSS for the media background layer.
 *
 * .media-container: full-canvas wrapper, sits behind scene content (z-index: 0)
 * .media-bg: the actual media element (image div or <video>), covers canvas
 * .media-overlay: semi-transparent dark layer between media and text
 *
 * @returns {string} CSS string
 */
function mediaBgBaseCss() {
  return `.media-container { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
.media-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; transform-origin: center; }
.media-overlay { position: absolute; inset: 0; z-index: 1; pointer-events: none; }`;
}

// ─── HTML generation ───

/**
 * Generate the media background layer (CSS + HTML) for a scene.
 *
 * Returns { css, html } where:
 *   css  — all CSS needed for the media layer (base + animation keyframes)
 *   html — the media element + overlay div, wrapped in .media-container
 *
 * When the media file doesn't exist, returns empty strings (fallback to
 * the scene's normal CSS background). When `media` is null/undefined or
 * has no path, also returns empty strings.
 *
 * @param {Object|null} media - Scene's media object
 *   { type: "image"|"video", path: string, source?: string,
 *     animation?: string, overlay?: number }
 * @param {string} contentDir - Absolute content directory path
 * @param {number} duration - Scene duration in seconds
 * @returns {{css: string, html: string}}
 */
export function mediaLayer(media, contentDir, duration) {
  if (!media || !media.path) return { css: "", html: "" };

  // Check file existence — fallback to empty if missing
  if (!mediaExists(media.path, contentDir)) {
    console.warn(`⚠️  Media file not found: ${media.path} — falling back to CSS background`);
    return { css: "", html: "" };
  }

  const fileUrl = resolveMediaPath(media.path, contentDir);
  const preset = media.animation || "fade";
  const overlayOpacity = media.overlay !== undefined ? media.overlay : DEFAULT_OVERLAY;

  // Generate animation CSS
  const animCss = animationCss(preset, duration, media.type);
  const baseCss = mediaBgBaseCss();

  // Build media element
  let mediaElement;
  if (media.type === "video") {
    mediaElement = `<video class="media-bg" src="${fileUrl}" autoplay loop muted playsinline></video>`;
  } else {
    // Default to image
    mediaElement = `<div class="media-bg" style="background-image: url('${fileUrl}');"></div>`;
  }

  // Build overlay (only if opacity > 0)
  const overlayHtml =
    overlayOpacity > 0
      ? `<div class="media-overlay" style="background: rgba(10, 10, 20, ${overlayOpacity});"></div>`
      : "";

  return {
    css: `${baseCss}\n${animCss}`,
    html: `<div class="media-container">${mediaElement}${overlayHtml}</div>`,
  };
}

// ─── Validation ───

/**
 * Validate a media object for pre-render checks.
 *
 * Used by verify-video.mjs --pre to catch issues before rendering.
 *
 * @param {Object|null} media - Scene's media object
 * @param {string} contentDir - Absolute content directory path
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 *   valid is true when there are no errors (warnings don't block).
 */
export function validateMedia(media, contentDir) {
  if (!media) return { valid: true, errors: [], warnings: [] };

  const errors = [];
  const warnings = [];

  // Type check
  if (!media.type || !["image", "video"].includes(media.type)) {
    errors.push(`Invalid media type: "${media.type}". Must be "image" or "video".`);
  }

  // Path check
  if (!media.path) {
    errors.push("Media path is required.");
  }

  // File existence (warning, not error — scene can fall back to CSS)
  if (media.path && !mediaExists(media.path, contentDir)) {
    warnings.push(`Media file not found: ${media.path}. Scene will fall back to CSS background.`);
  }

  // Animation preset validation
  if (media.animation && !VALID_PRESETS.includes(media.animation)) {
    warnings.push(`Unknown animation preset: "${media.animation}". Will use "fade" instead.`);
  }

  // Mode validation
  if (media.mode && !VALID_MODES.includes(media.mode)) {
    warnings.push(`Unknown media mode: "${media.mode}". Will use "background" instead.`);
  }

  // ken-burns on video — not supported, will fall back to fade
  if (media.animation === "ken-burns" && media.type === "video") {
    warnings.push('ken-burns animation is not supported for video. Will use "fade" instead.');
  }

  // Volume range check (0-1, only meaningful for video, but harmless for image)
  if (media.volume !== undefined && (media.volume < 0 || media.volume > 1)) {
    warnings.push(`Volume ${media.volume} is out of range [0, 1]. Will be clamped at render time.`);
  }

  // Fit validation
  if (media.fit && !VALID_FITS.includes(media.fit)) {
    warnings.push(`Unknown fit value: "${media.fit}". Will use "cover" instead.`);
  }

  // Focus validation
  if (media.focus && !VALID_FOCUSES.includes(media.focus)) {
    warnings.push(`Unknown focus value: "${media.focus}". Will use "center" instead.`);
  }

  // cropFocus validation (normalized [0,1] focus point)
  if (media.cropFocus !== undefined && media.cropFocus !== null) {
    if (typeof media.cropFocus !== "object" || media.cropFocus === null) {
      warnings.push(`cropFocus must be an object { x, y }. Got: ${typeof media.cropFocus}.`);
    } else {
      const { x, y } = media.cropFocus;
      if (typeof x !== "number" || typeof y !== "number") {
        warnings.push(
          `cropFocus.x and cropFocus.y must be numbers. Got x: ${typeof x}, y: ${typeof y}.`,
        );
      } else {
        if (x < 0 || x > 1) {
          warnings.push(
            `cropFocus.x = ${x} is out of range [0, 1]. Will be clamped at render time.`,
          );
        }
        if (y < 0 || y > 1) {
          warnings.push(
            `cropFocus.y = ${y} is out of range [0, 1]. Will be clamped at render time.`,
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
