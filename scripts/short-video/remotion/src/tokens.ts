/**
 * Design + motion tokens — the single source of truth for the video surface.
 *
 * `shared.ts` re-exports this module; components import from either path, but
 * the values are declared only here. Keep this file free of `remotion` imports
 * so the token contract can be tested in plain Node (vitest), without the
 * workspace-only Remotion dependency.
 *
 * Colour values mirror the values already shipped on the video surface; the
 * brand accent is DESIGN.md's Dispatch Blue. The video canvas is intentionally
 * darker than the web surface — it is the ground the clips composite onto.
 */
import { BRAND_FONT_STACK } from "../../lib/safe-zones.mjs";

/** Brand + semantic palette (DESIGN.md §2, video/dark surface). */
export const COLOR = {
  /** Dispatch Blue — the one brand accent, shared with the web surface. */
  brand: "#4d8bff",
  /** Video canvas (the dark ground every scene sits on). */
  canvas: "#0a0a14",
  /** Primary on-canvas text. */
  text: "#f5f5f5",
  /** Secondary text (explanations, taglines). */
  textMuted: "#cbd5e1",
  /** Tertiary text (source lines, attribution). */
  textDim: "#94a3b8",
  amber: "#f59e0b",
  red: "#ef4444",
  green: "#34d399",
  purple: "#6d4eff",
  cyan: "#22d3ee",
} as const;

/** Typography tokens. Sizes stay contract-driven (TextGate Fit owns them). */
export const TYPE = {
  /** Brand sans stack — the only family on the video surface. */
  family: BRAND_FONT_STACK,
} as const;

export type SpringPreset = {
  damping: number;
  stiffness: number;
  mass?: number;
};

/**
 * Motion tokens.
 *
 * spring presets follow locomotion's three tiers (B-tier structure only —
 * no code copied): titles settle slower and heavier, per-item elements are
 * snappier, emphasis overshoots least. Stagger units follow the iart-ai
 * kinetic-typography table (line 60–100ms / word 40–70ms / char 20–40ms), with
 * the middle of each band chosen so the pace reads deliberate, not rushed.
 */
export const MOTION = {
  spring: {
    /** Titles, focal blocks: slow and heavy, no bounce. */
    heading: { damping: 200, stiffness: 20 } as SpringPreset,
    /** Per-item / per-line / per-word: snappier. */
    item: { damping: 180, stiffness: 15 } as SpringPreset,
    /** Emphasis (stamps, scale reveals): the stiffest, no overshoot. */
    accent: { damping: 250, stiffness: 12 } as SpringPreset,
  },
  /** Delay between successive units, seconds. */
  stagger: {
    line: 0.08,
    word: 0.055,
  },
} as const;

/**
 * Hold (rest) budget — the still window after the last beat lands.
 *
 * anything2explainer (§C, issue #731) judges both "enters and freezes
 * immediately" and "lands and cuts immediately" as defects: the last beat
 * must rest 30–45 frames at 30fps before the scene leaves. The camera is what
 * enforces it structurally — its push ends `settleByFrame()` before the scene
 * ends, so the closing frames are provably static for the composition layer.
 * Frame-level detection of violations is #735's job, not this module's.
 */
export const HOLD = {
  /** Allowed still window after the last beat, frames (inclusive). */
  window: { min: 30, max: 45 },
  /** Frames every scene reserves by default (the top of the window). */
  default: 45,
  /** Per-visualType overrides; unlisted types use `default`. */
  byVisualType: {
    /** Hook is a 0–1s punch: shorter rest, the cut carries the momentum. */
    hook: 30,
    /** Reading a number needs the longer rest. */
    data: 45,
    "stat-reveal": 45,
    cta: 45,
  } as Record<string, number>,
} as const;

type CameraSpec = {
  scaleFrom: number;
  scaleTo: number;
  /** Vertical offset at frame 0, px (negative = starts above; ramps to 0). */
  driftY: number;
  transformOrigin: string;
};

/**
 * Camera tokens — one very slow pull per scene (talkcraft's anti-PPT rule:
 * "a structurally static frame must be impossible").
 *
 * The composition starts 0.6% larger and rests exactly at 1, so settled text
 * sits on its authored, safe-zone-checked coordinates. The camera wraps only
 * the composition/text layers. Media keeps its own bezier-driven motion (#357),
 * so a bound clip never gets two competing moves. Hook and CTA stay locked:
 * the hook IS the cover frame (already fully composed at frame 0) and the CTA
 * is the brand close.
 */
export const CAMERA = {
  default: {
    scaleFrom: 1.006,
    scaleTo: 1,
    driftY: 3,
    transformOrigin: "50% 50%",
  } as CameraSpec,
  /** visualTypes whose composition layer never moves. */
  disabled: ["hook", "cta"] as readonly string[],
} as const;

/** Frames a scene reserves as its closing still window. */
export function holdFramesFor(visualType: string): number {
  return HOLD.byVisualType[visualType] ?? HOLD.default;
}

/**
 * Last frame on which composition motion may still change.
 *
 * Entrance delays are authored in seconds and are independent of scene
 * duration; this is the boundary the camera (and future entrance budget
 * checks) must respect so the hold window stays still.
 */
export function settleByFrame(durationFrames: number, visualType: string): number {
  return Math.max(1, durationFrames - holdFramesFor(visualType));
}

/** Camera spec for a visualType, or null when the camera stays locked. */
export function cameraSpecFor(visualType: string): CameraSpec | null {
  return CAMERA.disabled.includes(visualType) ? null : CAMERA.default;
}

/**
 * Fit an entrance into the hold boundary.
 *
 * Normal case: unchanged. If the authored window would end inside the hold
 * window, shift it earlier (never before frame 0) and, when even a full-length
 * entrance cannot fit, shorten it to end exactly on the boundary.
 */
export function fitEntranceWindow(
  start: number,
  duration: number,
  settleAt: number | null,
): { start: number; end: number } {
  const dur = Math.max(1, duration);
  if (settleAt == null || start + dur <= settleAt) {
    return { start, end: start + dur };
  }
  const fittedDuration = Math.min(dur, settleAt);
  return { start: Math.max(0, settleAt - fittedDuration), end: Math.max(1, settleAt) };
}

/**
 * Camera transform at `frame` for a scene of `durationFrames`.
 *
 * Linear by design: the pull is constant-speed and settles exactly on
 * `settleByFrame`, at the authored resting transform (scale 1, no offset),
 * then holds identity — a pure function of the frame, no wall-clock, no CSS
 * transition.
 */
export function cameraStateAt(
  frame: number,
  durationFrames: number,
  visualType: string,
): { scale: number; translateY: number; transformOrigin: string } | null {
  const spec = cameraSpecFor(visualType);
  if (!spec) return null;
  const settleAt = settleByFrame(durationFrames, visualType);
  const progress = Math.max(0, Math.min(1, frame / settleAt));
  const scale = spec.scaleFrom + (spec.scaleTo - spec.scaleFrom) * progress;
  return {
    scale,
    translateY: spec.driftY * (1 - progress),
    transformOrigin: spec.transformOrigin,
  };
}
