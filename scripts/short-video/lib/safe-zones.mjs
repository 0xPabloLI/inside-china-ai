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
 * Region separation (spec: docs/archive/spec-video-layout-safe-zones.md):
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
  /**
   * Content bottom edge = 1920 − 611 = 1309 — ABOVE the subtitle lane.
   *
   * 770 → 710 → 611. The 2026-10-29 second pass took it to 611 because the
   * first (710 → content bottom 1210) moved the stack 60px, which is 3% of the
   * frame — the user's report was "我感觉不到你内容有多少下移", and they were
   * right: 60px is below the threshold where a composition shift reads.
   *
   * 611 is the HARD CEILING, not a taste call. The text bar is bottom-anchored
   * here, so this edge also fixes the contained picture's bottom edge (see
   * CONTAIN_MEDIA_BOTTOM): a 16:9 source at 1080 wide is 608px tall, so pushing
   * this value lower walks the picture's top down until the bar's own height
   * starts eating it. 1309 puts a 3-row scene's picture at y 429-1037 and its
   * caption block at 1041-1309, with 30px still clear of the lane.
   *
   * Everything below this line is reservation, not picture:
   *   30px  declared content → lane gap
   *   81px  the lane's second-line reserve (now disabled, see maxLines)
   *   125px the cue's own offset above its lane bottom (marginV 500)
   */
  bottom: 611,
  /** Content must stay at least this many px from the left edge */
  left: 60,
};

/**
 * media-bottom-bar text bar geometry (NarrativeScene's MediaBottomBar).
 * Exported so the evidence card and the text bar share one boundary instead
 * of two hand-kept-equal constants.
 *
 * The bar height is PER SCENE, derived from the rows the scene actually
 * declares (2026-10-24). A fixed height has to be sized for the worst case
 * (all four rows), so every scene that renders fewer rows paid for rows it
 * did not show: the media band was capped at the four-row height and the bar
 * sat on 86px of empty space. Deriving the height gives those scenes a taller
 * media band instead, and the bar reads as light rather than padded.
 *
 * `textBarHeight` remains the MAXIMUM (the four-row height) and is what
 * EVIDENCE_CARD anchors to, so the card's bottom edge stays put no matter how
 * many rows a given scene renders.
 */
export const MEDIA_BOTTOM_BAR = {
  /** Text bar height ceiling — the four-row stack (company/action/result/source). */
  textBarHeight: 312,
  /** Text bar top edge on the canvas (y = 1150 − 312 = 838). */
  textBarTop: CANVAS.height - SAFE_ZONES.bottom - 312,
  /**
   * Measured rendered height of each row, in px. These are the numbers the
   * render-time container gate reported for real copy (company 69, action 55,
   * result 74 on one line, source 47), not the nominal font sizes.
   */
  rowHeights: { company: 69, action: 55, result: 74, source: 47 },
  /** Flex gap between rows (SPACING.sm). */
  rowGap: 8,
  /** Vertical padding (SPACING.lg × 2) + the 2px top border. */
  chrome: 34,
  /** Safety pad so a slightly longer string cannot tip the bar into overflow. */
  rowSafety: 16,
};

/**
 * Height of the media-bottom-bar text bar for a scene's declared rows.
 *
 * @param {object} texts - the scene's `texts` block
 * @returns {number} bar height in px, never above MEDIA_BOTTOM_BAR.textBarHeight
 */
export function mediaBottomBarHeightFor(texts = {}) {
  const order = ["company", "action", "result", "source"];
  const present = order.filter((key) => texts[key]);
  if (present.length === 0) return MEDIA_BOTTOM_BAR.textBarHeight;
  const glyphs = present.reduce((sum, key) => sum + MEDIA_BOTTOM_BAR.rowHeights[key], 0);
  const gaps = (present.length - 1) * MEDIA_BOTTOM_BAR.rowGap;
  const height = glyphs + gaps + MEDIA_BOTTOM_BAR.chrome + MEDIA_BOTTOM_BAR.rowSafety;
  return Math.min(height, MEDIA_BOTTOM_BAR.textBarHeight);
}

/** Top edge of the media band (and of the bar) for a scene's declared rows. */
export function mediaBottomBarTopFor(texts = {}) {
  return CANVAS.height - SAFE_ZONES.bottom - mediaBottomBarHeightFor(texts);
}

/**
 * BrandBar placement — `visuals.tsx` renders the bar at this top with this
 * height. Declared here because the evidence card has to clear it: the bar's
 * glyphs measure y 252-267, which sits INSIDE the content band (220+), so a card
 * anchored to SAFE_ZONES.top draws underneath the bar.
 *
 * 236 (2026-10-29) puts the glyphs clear of TikTok's top chrome, measured
 * y 69-171, while staying below SAFE_ZONES.top.
 */
export const BRAND_BAR = { top: 236, height: 48 };

/** First y an evidence card may occupy: clear of the brand bar by 16px. */
const EVIDENCE_CARD_TOP = BRAND_BAR.top + BRAND_BAR.height + 16; // 300

/**
 * Evidence card geometry (#663 contract, #848): where `media.mode:"card"`
 * renders a raw page capture. The card fills the content band's width and its
 * bottom edge IS the media-bottom-bar text bar's top edge (derived from
 * MEDIA_BOTTOM_BAR, not restated), so card scenes never push content toward
 * the burned-subtitle lane.
 *
 * `top` is NOT SAFE_ZONES.top. It was until 2026-10-29, when the brand bar moved
 * 140 → 236 to clear TikTok's top chrome: the bar's glyphs now land at y 252-267,
 * inside the content band, so a card starting at 220 would be drawn UNDER the
 * bar. Anchoring to EVIDENCE_CARD_TOP instead keeps the card's bottom edge on
 * the text bar while its top edge clears the bar by 16px.
 */
export const EVIDENCE_CARD = {
  left: SAFE_ZONES.left,
  top: EVIDENCE_CARD_TOP, // 300
  width: CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right, // 820
  height: MEDIA_BOTTOM_BAR.textBarTop - EVIDENCE_CARD_TOP, // 697
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
 * marginV places the cue BOTTOM edge at 1920 − 500 = 1420; the lane reserves
 * height for two lines of 60px text (with 1.35 line-height safety factor).
 *
 * Recalibrated 2026-10-24 from a measured TikTok Studio preview. The old
 * marginV 570 put the lane at y 1188-1350 and cleared the caption UI by 150px
 * against TIKTOK_CAPTION_TOP = 1500 — but 1500 was itself a conservative
 * screenshot estimate. Measuring the real preview DOM with this pack's own
 * 1166-character caption in place (`.meta-data` inside `.video-overlay-container`,
 * the element that carries the username and the first caption lines) puts the
 * caption block's top edge at canvas y ≈ 1676. The lane now sits at 1258-1420:
 * still 256px clear of the measured caption top, and 128px clear of the
 * content band, while the cue reads noticeably lower in frame.
 *
 * The 60-70% "best readability" band from the vSubtitle/Blitzcut research is
 * deliberately exceeded (1420/1920 = 74%): that band is a guideline for
 * canvas-centred native captions, and this lane is left-shifted to the content
 * band's centre, where the action rail no longer crowds it. The binding
 * constraint is the caption UI, and the measurement says there is room.
 */
export const SUBTITLE_LANE = {
  /**
   * ASS MarginV — subtitle bottom edge distance from the canvas bottom.
   *
   * Held at 500 after testing 608 on 2026-10-28. Moving the cue UP does close
   * the measured 267px gap to the text bar, but it does so by spending the one
   * thing the user asked to keep: "this lane reads noticeably lower in frame"
   * (2026-10-24) is a deliberate choice, and 608 also dragged the lane out of
   * the lower third (1420/1920 = 74% → 1312/1920 = 68%) and onto the content
   * band's own edge.
   *
   * The gap is closed from the other end instead — SAFE_ZONES.bottom 770 → 710
   * moves the content stack DOWN 60px, which takes the text-bar-to-cue gap
   * from 267px to 48px without touching the cue's position at all.
   */
  marginV: 500,
  /** ASS font size (Helvetica Neue Bold) — matches TikTok native ~60px */
  fontSize: 60,
  /**
   * Reserved line count.
   *
   * 2 → 1 on 2026-10-29. This is NOT a subtitle change — the cue is
   * bottom-anchored at `marginV`, so `maxLines` moves nothing on screen. What
   * it moves is SUBTITLE_LANE_TOP, and therefore how low the CONTENT band is
   * allowed to reach: 1258 → 1339, i.e. 81px the content stack can claim.
   *
   * The 2-line reservation is a worst-case guard, and it costs every scene that
   * never wraps. This pack has 46 cues and ZERO `\N` breaks — the reserved
   * second line has never rendered once. Dropping to 1 spends a guarantee the
   * video does not use on the composition the user actually asked for.
   *
   * Guarded, not just documented: `enforceSubtitleCompliance` reads this value
   * (via `maxLines: SUBTITLE_LANE.maxLines`) and throws on a `lines` violation
   * in EVERY mode, not only `fail`. So a cue that wraps fails the run instead of
   * silently rendering upward from the bottom anchor to y 1258, inside the
   * content band — ASS does not clip to this box, so the overlap would ship.
   * A pack that genuinely needs two lines moves this to 2 and the gate follows.
   */
  maxLines: 1,
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

/**
 * Full-bleed media band for `media-bottom-bar` scenes (2026-10-25).
 *
 * Before this change the media stopped at the text bar's top edge (838 with
 * four rows, less with fewer) and the bar below it was an opaque
 * `rgba(10,10,20,0.85)` panel. That confined the picture to the top 43-53% of
 * the frame and left everything under it solid background: measured on the
 * 2026-10-24 unitree render the content centroid sat at y≈685 against a frame
 * centre of 960, and the user read the result as "内容整体还是太偏上了".
 *
 * The band now runs to the content band's bottom edge (y=1150), so the picture
 * occupies 60% of the frame instead of 43-53%, and the text is drawn ON the
 * picture over a gradient scrim rather than in an opaque panel below it. The
 * band deliberately stops at 1150 rather than at the subtitle lane: see the
 * `bottom` note below for the measured reason (the source's own bottom-corner
 * captions would land in the FAIL-only subtitle gap).
 *
 * The scrims are not decoration. They are what lets the full-bleed band pass
 * the frame gate: verify-remotion-frames.mjs fails a frame when more than 5% of
 * the pixels in the TikTok action rail (x 880-1080, y 640-1775) are brighter
 * than luminance 80, and for a full-bleed band that region maps to the middle
 * of the source frame, which is bright in every shot of the unitree film.
 * Measured over that film's own acts, the right vignette plus the bottom scrim
 * hold the rail at 0-3% with `overlay` 0.35; without them it sat at 20-100%.
 *
 * Known trade-off: a burned-in caption in the source's bottom-left corner is
 * dimmed by the bottom scrim. It stays above the gate's threshold and inside
 * the content band (measured: y 1070-1118, x 51-858 for the unitree film), so
 * it reads as dimmed evidence rather than disappearing, but it is no longer at
 * full brightness. Top-corner captions are unaffected.
 */
export const MEDIA_BAND = {
  /**
   * Media bottom edge — the content band's own bottom limit, NOT the subtitle
   * lane top.
   *
   * The taller value (SUBTITLE_LANE_TOP, 1258) was measured and rejected: a
   * 16:9 source cover-cropped into a 1080xH band shows its full height, so a
   * caption burned into the source's bottom-left corner lands at source y
   * 1005-1050 → canvas y 0.93H-0.97H. At H=1258 that is y 1171-1223, which is
   * inside the FAIL-only subtitle gap (now 1210-1258): the frame gate would
   * read the caption as content in the gap and fail, and the scrim needed to
   * pass would dim the caption past readability. At H=1210 the same caption
   * lands at y 1125-1174 — inside the content band, above the gap, and outside
   * the action rail (x 51-858 vs the rail's x≥880) — so it survives as
   * evidence, with 36px of headroom before the gap begins.
   *
   * H tracks SAFE_ZONES.bottom, so the 770 → 710 change above grew the band
   * from 1150 to 1210 and the picture from 60% to 63% of the frame.
   */
  bottom: CANVAS.height - SAFE_ZONES.bottom,
  /** Bottom scrim fades in from this canvas y. */
  scrimTop: 820,
  /** Bottom scrim alpha at MEDIA_BAND.bottom. */
  scrimAlpha: 0.75,
  /**
   * Right vignette fades in from this canvas x.
   *
   * 700 → 880 (the action rail's own left edge) on 2026-10-29. At 700 the ramp
   * began 180px inside the picture, so it darkened the right third of the
   * SUBJECT to buy headroom the rail check never measures — the user read it as
   * "右边的内容好像被你遮挡掉一些了", which is exactly what it was. The gate
   * only samples x 880-1080, so starting at 880 spends the whole ramp inside
   * the region that actually needs it.
   */
  vignetteStartX: 880,
  /**
   * Right vignette alpha at the canvas right edge.
   *
   * 0.95 → 0.6. 0.95 made the outer 200px effectively opaque, which is not
   * "dimmed evidence" — it is a removed one. 0.6 holds bright frames under the
   * gate's luminance-80 threshold while leaving rail-adjacent picture legible;
   * re-measure with verify-remotion-frames.mjs if the source gets brighter.
   */
  vignetteAlpha: 0.6,
  /** Top scrim is at full strength at y=0 and gone by this canvas y. */
  topScrimHeight: 200,
  /**
   * Top scrim alpha at y=0. Deliberately lighter than the bottom scrim: the
   * top band only WARNs when it carries content, and the film's own captions
   * sit in the source's top corners ("4 Meter High Platform" at source y
   * 44-144 → canvas y 47-153). At 0.55 those captions still read as evidence,
   * which is the point of keeping them in frame.
   */
  topScrimAlpha: 0.55,
};

/**
 * Bottom edge of a `fit:"contain"` picture (2026-10-29).
 *
 * A contained picture is placed in the band [SAFE_ZONES.top, this] and anchored
 * to its BOTTOM (see MediaBackground — contain anchors bottom, not centre). The
 * picture therefore hangs directly above the text bar and the pair reads as one
 * captioned still, instead of floating in the middle of a band with dead space
 * above AND below it.
 *
 * 1037 = the three-row text bar's top edge (1309 − 264) minus the 8px gap. A
 * four-row scene's bar reaches 40px higher (top 997) and so overlaps the
 * picture's bottom edge — the same overlap cover mode has always had, where the
 * bar draws over the footage. Deliberate: anchoring to the four-row bar instead
 * would pull every picture 48px higher to protect a row set most scenes do not
 * declare, and the user's complaint is that the picture is too high already.
 *
 * Net effect for a 16:9 source at full width (608px tall): picture y 429-1037,
 * up from y 301-909 under the old centre-anchored band. +128px.
 */
export const CONTAIN_MEDIA_BOTTOM = 1037;

/**
 * Normalised stops approximating smoothstep(t) = t²(3-2t).
 *
 * CSS gradients interpolate linearly between stops, so a two-stop gradient
 * reads as a hard ramp and puts visible banding across the picture. Five stops
 * track the curve closely enough that the frame gate's measured ratio does not
 * move versus the smoothstep the calibration used.
 */
const SCRIM_CURVE = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
  offset: t,
  weight: t * t * (3 - 2 * t),
}));

/**
 * Build a scrim's CSS gradient from the curve above.
 *
 * @param {number} alpha - peak alpha, applied at the weighted end
 * @param {"to bottom" | "to right"} direction - CSS gradient direction
 * @param {boolean} [reverse=false] - put the peak at the START instead of the end
 * @returns {string} a CSS `linear-gradient(...)` value
 */
export function scrimGradient(alpha, direction, reverse = false) {
  const stops = SCRIM_CURVE.map(({ offset, weight }) => {
    const a = alpha * (reverse ? 1 - weight : weight);
    return `rgba(10,10,20,${a.toFixed(4)}) ${(offset * 100).toFixed(0)}%`;
  });
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}

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
 * HTML templates read the brand SVG via fs).
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
