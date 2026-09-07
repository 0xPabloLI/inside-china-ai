/**
 * TikTok Safe Zones — single source of truth for on-screen layout limits.
 * Canvas: 1080×1920 (9:16 vertical video).
 *
 * Calibrated against a real FYP playback screenshot (scaled ×1.875 from a
 * 576-wide capture) and cross-checked with 2026 research (quso/Moda 170K-post
 * analysis, Kreatli, vSubtitle, Blitzcut):
 *  - Top UI ("Community | Following | For You" tabs, search) ≈ top 0-165px
 *  - Right action rail (avatar / like / comment / save / share / music disc)
 *    measured at x≈880-1080, y≈655-1775 — the heaviest occluder
 *  - Bottom caption/username climbs to y≈1500 worst case (long caption +
 *    safety label); bottom nav bar y≈1790-1905
 *  - TikTok native auto-captions measured ~60px em (≈3.1% of frame height),
 *    centered at ~62-70% of frame height
 *
 * Region separation (spec: docs/specs/spec-video-layout-safe-zones.md):
 * the canvas is split into NON-OVERLAPPING bands — content must never enter
 * the burned-subtitle lane, and nothing may enter the TikTok UI zones:
 *
 *   content (≤ y=1150, x∈[60,880]) → gap → subtitle lane (y≈1188-1350, 60px,
 *   x∈[110,830]) → clean margin → TikTok caption UI (y≥1500 worst case)
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
  /** Content must start below this many px from the top edge (clears top nav) */
  top: 220,
  /** Right margin = 200 → content right edge x=880, clearing the action rail */
  right: 200,
  /** Content bottom edge = 1920 − 770 = 1150 — ABOVE the subtitle lane */
  bottom: 770,
  /** Content must stay at least this many px from the left edge */
  left: 60,
};

/**
 * Burned-in subtitle lane (ASS style, lib/subtitles/ass.mjs).
 *
 * The subtitle lane is LEFT-SHIFTED to match the content band's center, not
 * the canvas center. Content occupies x∈[60,880] (center x=470); TikTok's
 * right action rail (avatar/like/comment/save/share/music, x≈880-1080,
 * y≈655-1775) overlaps the subtitle band (y≈1188-1350). A canvas-centered
 * cue (margins 180/180 → right edge x=900) extends into the rail. By making
 * the margins asymmetric (110/250) the cue area shifts to x∈[110,830],
 * clearing the rail by 50px while keeping the same maxWidth.
 *
 * TikTok's own native auto-captions are canvas-centered — but they're
 * auto-generated 3-5 word snippets that are naturally narrow, so they never
 * reach the rail. Our karaoke cues can be up to 720px wide (6 words at 60px),
 * which would be occluded if centered.
 *
 * marginV places the cue BOTTOM edge at 1920 − 570 = 1350; the lane reserves
 * height for two lines of 60px text (with 1.35 line-height safety factor),
 * sitting at ~62-70% of frame height (TikTok native-caption band) and clearing
 * both scene content (ends y=1150) and the bottom caption UI (y≥1500).
 */
export const SUBTITLE_LANE = {
  /** ASS MarginV — subtitle bottom edge distance from the canvas bottom */
  marginV: 570,
  /** ASS font size (Helvetica Neue Bold) — matches TikTok native ~60px */
  fontSize: 60,
  /** Reserved line count (worst-case wrap) */
  maxLines: 2,
  /** Per-line height factor (font ascent/descent + safety) */
  lineHeight: 1.35,
  /** Max single-line cue width in px */
  maxWidth: 720,
  /**
   * ASS MarginL — left margin, sized to left-shift the cue so its right edge
   * (marginL + maxWidth) clears the action rail (x≈880) by ≥50px.
   * marginL + maxWidth + marginR = CANVAS.width → 110 + 720 + 250 = 1080.
   */
  marginL: 110,
  /** ASS MarginR — right margin (asymmetric, see marginL above). */
  marginR: 250,
};

/** Subtitle lane bottom edge on the canvas, in px (y = 1350). */
export const SUBTITLE_LANE_BOTTOM = CANVAS.height - SUBTITLE_LANE.marginV;

/** Subtitle lane top edge, in px (y = 1188) — two lines, ceiling-rounded so
 *  the reserved height NEVER drops below fontSize × lineHeight × maxLines. */
export const SUBTITLE_LANE_TOP =
  CANVAS.height -
  SUBTITLE_LANE.marginV -
  Math.ceil(SUBTITLE_LANE.fontSize * SUBTITLE_LANE.lineHeight * SUBTITLE_LANE.maxLines);

/** Channel watermark position (top-left corner, outside the content band). */
export const WATERMARK_POS = { top: 60, left: 60 };

/**
 * Brand font stack — serif rendering baseline (spec #130 D9).
 *
 * The render environment lacks Helvetica Neue, so every published video has
 * actually rendered in the browser's default serif (Times). That shipped look
 * passed HITL repeatedly; declare it explicitly so font availability can
 * never silently change the video's appearance. Lives in this dependency-free
 * module because the render root and the gate verifiers both consume it,
 * and the Remotion bundler must not pull in node-only modules (the retired
 * HTML templates read the brand SVG via fs — see retired-html-path/).
 */
export const BRAND_FONT_STACK = "'Times New Roman', Times, serif";

// ─── Avatar foreground card (#214, spec Implementation Decision 2) ───

/**
 * Digital-human foreground card geometry (variant 1′ "right-card", the only
 * rendered position — see lib/scene-rules.mjs AVATAR_POSITIONS).
 *
 * Layout evidence: docs/research/dh-avatar-layout-best-practices.md (13
 * sources) + the approved prototype (worktree prototype/dh-layout-templates
 * variant 1′). The card is a PiP inset INSIDE the existing safe bands — it
 * must clear the same platform dead zones everything else clears:
 *
 *   - Right edge at x = CANVAS.width − SAFE_ZONES.right = 880. The research
 *     floor for the action rail is 180px; SAFE_ZONES.right (200) is the repo's
 *     calibrated (stricter) value, so the card clears the rail with margin.
 *   - Bottom edge at y = SUBTITLE_LANE_TOP − subtitleGap = 1148, i.e. ABOVE
 *     the burned-subtitle lane with a declared gap. This constraint implies
 *     the research bottom dead zone (≈400px → y ≤ 1520): any rect ending at
 *     or above the lane top also ends far above 1520, so no separate constant
 *     is needed and none is invented here (derive from existing zones only).
 *   - Top/left edges stay inside the content band (SAFE_ZONES.top/left).
 *
 * Only additive: existing SAFE_ZONES / SUBTITLE_LANE consumers are unaffected.
 */
export const AVATAR_CARD = {
  /** Card size @1080×1920 — matches the 624×816 → 2x-upscaled EchoMimicV3 output ratio. */
  width: 420,
  height: 550,
  /** Right margin from the canvas edge (reuses SAFE_ZONES.right — rail clearance). */
  rightMargin: SAFE_ZONES.right,
  /** Declared gap between the card's bottom edge and the subtitle lane top. */
  subtitleGap: 40,
  /** Position id — mirrors AVATAR_POSITIONS[0] in lib/scene-rules.mjs. */
  position: "right-card",
};

/** Default card rectangle on the canvas, in px: {x:460, y:598, w:420, h:550}. */
export const AVATAR_CARD_RECT = {
  x: CANVAS.width - SAFE_ZONES.right - AVATAR_CARD.width,
  y: SUBTITLE_LANE_TOP - AVATAR_CARD.subtitleGap - AVATAR_CARD.height,
  width: AVATAR_CARD.width,
  height: AVATAR_CARD.height,
};

/**
 * Assert that an avatar card rectangle does not intrude into any protected
 * zone. Throws naming the intruded zone (spec Behavioral Scenario 6: the frame
 * audit must name the zone, not just fail); returns the rect on success.
 *
 * @param {{x: number, y: number, width: number, height: number}} [rect]
 *   Defaults to AVATAR_CARD_RECT. Future templates/positions pass their own
 *   rect here (e.g. a scaled card — scale grows toward the bottom-right anchor,
 *   so the rail/lane edges stay fixed).
 */
export function assertAvatarCardSafe(rect = AVATAR_CARD_RECT) {
  const label = (edge) => `[AvatarCard safe-zone] card ${edge} intrudes`;
  if (rect.x < SAFE_ZONES.left) {
    throw new Error(`${label("left edge")} the left margin (SAFE_ZONES.left = ${SAFE_ZONES.left})`);
  }
  if (rect.y < SAFE_ZONES.top) {
    throw new Error(`${label("top edge")} the top nav band (SAFE_ZONES.top = ${SAFE_ZONES.top})`);
  }
  if (rect.x + rect.width > CANVAS.width - SAFE_ZONES.right) {
    throw new Error(
      `${label("right edge")} the TikTok right action rail (SAFE_ZONES.right = ${SAFE_ZONES.right})`,
    );
  }
  const laneLimit = SUBTITLE_LANE_TOP - AVATAR_CARD.subtitleGap;
  if (rect.y + rect.height > laneLimit) {
    throw new Error(
      `${label("bottom edge")} the burned-subtitle lane (SUBTITLE_LANE_TOP = ${SUBTITLE_LANE_TOP}, declared gap ${AVATAR_CARD.subtitleGap}px)`,
    );
  }
  if (rect.y + rect.height > CANVAS.height || rect.x + rect.width > CANVAS.width) {
    throw new Error(`${label("edge")} the canvas bounds (${CANVAS.width}×${CANVAS.height})`);
  }
  return rect;
}
