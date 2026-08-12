/**
 * Shared constants and helpers for Remotion components.
 *
 * Re-exports from the existing lib/ (single source of truth) and adds
 * frame conversion utilities.
 */
import { interpolate, Easing } from "remotion";

// Re-export shared constants from the existing pipeline lib/
export { CANVAS, SAFE_ZONES, SUBTITLE_LANE, WATERMARK_POS } from "../../../lib/safe-zones.mjs";
export { FPS, sceneClipFrames, sceneClipDuration } from "../../../lib/timeline.mjs";

/** Seconds → frames conversion (at 30fps). */
export const secToFrames = (s: number): number => Math.round(s * 30);

/** Clamp helper for interpolate extrapolation. */
export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/** Default easing for entrance animations (matches CSS ease-out). */
export const easeOut = Easing.bezier(0, 0, 0.58, 1);

/** Cubic-bezier(0.16, 1, 0.3, 1) — the "ease-out-expo" used by scaleIn/stampIn. */
export const easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1);

export { interpolate, Easing };
