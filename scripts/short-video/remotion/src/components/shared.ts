/**
 * Shared constants and helpers for Remotion components.
 *
 * Re-exports from the existing lib/ (single source of truth) and adds
 * frame conversion utilities.
 */
import { interpolate, Easing } from "remotion";

// Re-export shared constants from the existing pipeline lib/
export {
  BRAND_BAR,
  HEADER_SLOTS,
  CANVAS,
  SAFE_ZONES,
  SUBTITLE_LANE,
  WATERMARK_POS,
  MEDIA_BOTTOM_BAR,
  EVIDENCE_CARD,
} from "../../../lib/safe-zones.mjs";
export {
  FPS,
  sceneClipFrames,
  sceneClipDuration,
  sceneTimeline,
  scheduleTotalFrames,
  TRANSITION_FRAMES,
} from "../../../lib/timeline.mjs";

/**
 * Design + motion tokens (#731). Declared in
 * scripts/short-video/remotion/src/tokens.ts (kept remotion-free so the contract
 * is testable in plain Node); re-exported here so components have one shared
 * import surface.
 */
export {
  COLOR,
  ACCENT_COLORS,
  accentColorFor,
  TYPE,
  MOTION,
  HOLD,
  ANNOTATION,
  CAMERA,
  holdFramesFor,
  settleByFrame,
  cameraSpecFor,
  cameraStateAt,
} from "../tokens";
export type { SpringPreset } from "../tokens";

/** Seconds → frames conversion (at 30fps). */
export const secToFrames = (s: number): number => Math.round(s * 30);

/** Clamp helper for interpolate extrapolation. */
export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/** Cubic-bezier(0.16, 1, 0.3, 1) — the "ease-out-expo" used by media motion. */
export const easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1);

export { interpolate, Easing };

/**
 * Spacing scale — 4pt base system (impeccable layout.md guidance).
 * Use these tokens for all gaps, margins, and padding.
 * Same-group elements: sm (8px). Between groups: xl (24px) or '2xl' (32px).
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
  "5xl": 96,
} as const;
