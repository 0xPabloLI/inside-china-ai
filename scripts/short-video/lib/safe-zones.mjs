/**
 * TikTok Safe Zones — single source of truth for on-screen layout limits.
 * Canvas: 1080×1920 (9:16 vertical video).
 *
 * TikTok FYP overlay layout (2026 research, Zeely/Kreatli):
 *  - Top UI ("Following | For You" tabs, username) ≈ top 150-200px band
 *  - Right action rail (profile / like / comment / bookmark / share) ≈ right
 *    120-140px, mid-lower band of the screen
 *  - Left rail (username + caption box) ≈ bottom 250-320px + left edge
 *
 * Region separation (spec: docs/specs/spec-video-layout-safe-zones.md):
 * the canvas is split into NON-OVERLAPPING bands — content must never enter
 * the burned-subtitle lane, and nothing may enter the TikTok UI zones:
 *
 *   content (≤ y=1340) → breathing gap → subtitle lane (y≈1417-1530)
 *   → TikTok caption UI (y≥1600)
 *
 * Invariants are test-locked in __tests__/safe-zones.test.mjs.
 *
 * SAFE_ZONES: critical on-screen content must stay within this box —
 * anything outside risks being covered by the platform UI or burned subtitles.
 * SUBTITLE_LANE: the burned-in subtitle region (ASS margin + reserved height);
 * scene content must never extend into it.
 * WATERMARK_POS: channel watermark corner (top-left, clear of every rail).
 */

/** Canvas dimensions (9:16 vertical). */
export const CANVAS = { width: 1080, height: 1920 };

export const SAFE_ZONES = {
  /** Content must start below this many px from the top edge */
  top: 220,
  /** Content must stay at least this many px from the right edge */
  right: 160,
  /** Content bottom edge = 1920 − 580 = 1340 — ABOVE the subtitle lane */
  bottom: 580,
  /** Content must stay at least this many px from the left edge */
  left: 60,
};

/**
 * Burned-in subtitle lane (ASS style, lib/subtitles/ass.mjs).
 * marginV places the cue BOTTOM edge at 1920 − 390 = 1530; the lane reserves
 * height for two lines of 42px text (with 1.35 line-height safety factor)
 * so even a worst-case libass wrap stays clear of platform UI and of scene
 * content (which ends at y=1340).
 */
export const SUBTITLE_LANE = {
  /** ASS MarginV — subtitle bottom edge distance from the canvas bottom */
  marginV: 390,
  /** ASS font size (Helvetica Neue Bold) */
  fontSize: 42,
  /** Reserved line count (worst-case wrap) */
  maxLines: 2,
  /** Per-line height factor (font ascent/descent + safety) */
  lineHeight: 1.35,
  /** Max single-line cue width in px (margins derive from this: 65px each) */
  maxWidth: 950,
};

/** Subtitle lane bottom edge on the canvas, in px (y = 1530). */
export const SUBTITLE_LANE_BOTTOM =
  CANVAS.height - SUBTITLE_LANE.marginV;

/** Subtitle lane top edge, in px (y = 1416) — two lines, ceiling-rounded so
 *  the reserved height NEVER drops below fontSize × lineHeight × maxLines. */
export const SUBTITLE_LANE_TOP =
  CANVAS.height -
  SUBTITLE_LANE.marginV -
  Math.ceil(SUBTITLE_LANE.fontSize * SUBTITLE_LANE.lineHeight * SUBTITLE_LANE.maxLines);

/** Channel watermark position (top-left corner, outside the content band). */
export const WATERMARK_POS = { top: 60, left: 60 };
