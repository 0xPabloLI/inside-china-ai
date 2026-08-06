/**
 * TikTok Safe Zones — single source of truth for on-screen layout limits.
 * Canvas: 1080×1920 (9:16 vertical video).
 *
 * TikTok FYP overlay layout (2026):
 *  - Right action rail (profile / like / comment / bookmark / share) ≈ right
 *    140px, mid-lower band of the screen
 *  - Left rail (username + caption box) ≈ bottom 450px + left edge
 *  - Top tabs ("Following | For You") ≈ top 100px band
 *  - Burned subtitles sit at bottom margin 450px (see docs/brand-system.md)
 *
 * SAFE_ZONES: critical on-screen content must stay within this box —
 * anything outside risks being covered by the platform UI or burned subtitles.
 * WATERMARK_POS: channel watermark corner (top-left, clear of every rail).
 */

export const SAFE_ZONES = {
  /** Content must start below this many px from the top edge */
  top: 220,
  /** Content must stay at least this many px from the right edge */
  right: 160,
  /** Content must stay at least this many px from the bottom edge */
  bottom: 450,
  /** Content must stay at least this many px from the left edge */
  left: 60,
};

/** Channel watermark position (top-left corner, outside the content band). */
export const WATERMARK_POS = { top: 60, left: 60 };
