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
 *   content (≤ y=1206, x∈[60,880]) → gap → subtitle lane (y=1336-1520, 184px,
 *   x∈[110,830]) → clean margin → TikTok caption UI (y≈1676 measured)
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
   * Content bottom edge = 1920 − 714 = 1206 — ABOVE the subtitle lane.
   *
   * 770 → 710 → 611 → 622. The 2026-10-29 second pass took it to 611 because
   * the first (710 → content bottom 1210) moved the stack 60px, which is 3% of
   * the frame — the user's report was "我感觉不到你内容有多少下移", and they were
   * right: 60px is below the threshold where a composition shift reads.
   *
   * 611 is the HARD CEILING, not a taste call. The text bar is bottom-anchored
   * here, so this edge also fixes the contained picture's bottom edge (see
   * CONTAIN_MEDIA_BOTTOM): a 16:9 source at 1080 wide is 608px tall, so pushing
   * this value lower walks the picture's top down until the bar's own height
   * starts eating it. 1206 puts a compact two-row media page's text bar at
   * 1005-1206 (the legacy four-row shape at 894-1206), with a 16:9 contain
   * picture above it and 130px clear of the lane at 1336.
   *
   * 611 → 622 (#1228, 2026-11-11): raising the cue to 68px grew its reserved
   * lane 81 → 92px. The cue's bottom edge is fixed at marginV 500, so the lane
   * only grows upward; the 11px comes out of the content band rather than out
   * of the gap or the platform's caption zone.
   *
   * 622 → 714 (#230, 2026-11-20): the lane reserves two lines again (92 →
   * 184px) so a cue that cannot hold 0.8s on one line can merge with its
   * neighbour instead of flashing. The extra 92px comes out of the content
   * band, same as the 11px above, and the 30px gap is kept unchanged.
   *
   * 2026-11-25 user review: the lane moved from 1236–1420 to 1336–1520. The
   * cue bottom moves 1420 → 1520 (marginV 500 → 400); the content edge and the
   * 714 total are unchanged. The 100px comes out of the gap, not the picture:
   * the old 30px gap became 130px, which is the breathing room the user asked
   * for between copy and burned subtitles. The measured TikTok caption top is
   * still y≈1676, leaving 156px under the new lane.
   *
   * Everything below this line is reservation, not picture:
   *  130px  declared content → lane gap        (1206 → 1336)
   *  184px  the lane's full reservation         (1336 → 1520)
   *  400px  the lane's bottom offset, marginV    (1520 → 1920)
   * 130 + 184 + 400 = 714.
   */
  bottom: 714,
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
  /** Text bar top edge on the canvas (y = 1206 − 312 = 894). */
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
 * `media-first` geometry (#1524, 2026-11-24).
 *
 * The picture is the protagonist and the copy gives up its reserved band:
 * media runs the whole content band (0 → MEDIA_BAND.bottom, 1080×1206) and the
 * text block is a compact overlay anchored to the content bottom instead of a
 * 312px bar that the picture has to stop above. Only three fields are legal
 * (company / result / source — see REMOTION_SLOT_MAP), because the ticket's
 * clarification is "fewer words, shorter copy", never "same words, smaller
 * box": a scene that needs action + context + badge belongs on media-bottom-bar.
 *
 * Height is still derived per scene from the rows actually declared, using the
 * same measured row heights as MEDIA_BOTTOM_BAR so the two layouts cannot
 * disagree about what a line costs. The ceiling is the three-row stack
 * (company 69 + result 74 + source 47 + 2 gaps 16 + chrome 34 + safety 16 =
 * 256), which leaves the picture 950px of the 1206px band — 4.8× the old
 * 1080×820 bed's usable height above the bar.
 *
 * The block is drawn on a hard-edged flat plate below the picture, not on a
 * gradient scrim; it does not push the media up, which is the whole point.
 */
export const MEDIA_FIRST = {
  /** Rows this layout may draw, in reading order. */
  fields: ["company", "result", "source"],
  /** Ceiling for the three-row stack. */
  textBarHeight: 69 + 74 + 47 + 2 * 8 + 34 + 16, // 256
  rowHeights: { company: 69, result: 74, source: 47 },
  rowGap: 8,
  chrome: 34,
  rowSafety: 16,
  /**
   * The picture bed is the whole canvas, not the 1206 content band: a 16:9
   * source at full width is only 608px tall, so a 1206 bed leaves both the
   * picture and the copy in the top two thirds while the bottom stays empty.
   * The blur fill covers 0 → 1920; the contained picture sits at `pictureTop`
   * so its lower edge clears the copy block.
   */
  mediaHeight: CANVAS.height,
  /** Top edge of the contained 16:9 picture inside the full-canvas bed. */
  pictureTop: 300,
  /** Rendered height of a 1080-wide 16:9 picture (1080 × 9 / 16 ≈ 608). */
  pictureHeight: 608,
  /**
   * Flat alpha of the copy bed. It is a solid 256px band, not a gradient:
   * the user's standing rule is "no shadow on media", so contrast comes from
   * a hard-edged plate rather than a vignette behind the picture.
   */
  textBedAlpha: 0.62,
};

/** Height of the media-first copy plate for a scene's declared rows. */
export function mediaFirstBarHeightFor(texts = {}) {
  const present = MEDIA_FIRST.fields.filter((key) => texts[key]);
  if (present.length === 0) return 0;
  const glyphs = present.reduce((sum, key) => sum + MEDIA_FIRST.rowHeights[key], 0);
  const gaps = (present.length - 1) * MEDIA_FIRST.rowGap;
  const height = glyphs + gaps + MEDIA_FIRST.chrome + MEDIA_FIRST.rowSafety;
  return Math.min(height, MEDIA_FIRST.textBarHeight);
}

/** Top edge of the media-first text block for a scene's declared rows. */
export function mediaFirstBarTopFor(texts = {}) {
  return CANVAS.height - SAFE_ZONES.bottom - mediaFirstBarHeightFor(texts);
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
  height: MEDIA_BOTTOM_BAR.textBarTop - EVIDENCE_CARD_TOP, // 686
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
 * reach the rail. Our karaoke cues can be up to 720px wide (≈4 words at 68px),
 * which would be occluded if centered.
 *
 * marginV places the cue BOTTOM edge at 1920 − 400 = 1520; the lane reserves
 * height for two lines of 68px text (184px, with 1.35 line-height safety).
 *
 * Recalibrated 2026-10-24 from a measured TikTok Studio preview. The old
 * marginV 570 put the lane at y 1188-1350 and cleared the caption UI by 150px
 * against TIKTOK_CAPTION_TOP = 1500 — but 1500 was itself a conservative
 * screenshot estimate. Measuring the real preview DOM with this pack's own
 * 1166-character caption in place (`.meta-data` inside `.video-overlay-container`,
 * the element that carries the username and the first caption lines) puts the
 * caption block's top edge at canvas y ≈ 1676. The lane now sits at 1336-1520
 * (2026-11-25 moved marginV 500 → 400):
 * still 156px clear of the measured caption top, and 130px clear of the
 * content band, while the cue reads noticeably lower in frame.
 *
 * The 60-70% "best readability" band from the vSubtitle/Blitzcut research is
 * deliberately exceeded (1520/1920 = 79.2%): that band is a guideline for
 * canvas-centred native captions, and this lane is left-shifted to the content
 * band's centre, where the action rail no longer crowds it. The binding
 * constraint is the caption UI, and the measurement says there is room.
 */
export const SUBTITLE_LANE = {
  /**
   * ASS MarginV — subtitle bottom edge distance from the canvas bottom.
   *
   * 500 → 400 on 2026-11-25. The user review asked for the cue to sit lower,
   * under a picture that already carries little copy; the 100px comes out of
   * the content-to-lane gap (30 → 130), not the content band or the picture.
   * The measured TikTok caption top is y≈1676, so 1520 still leaves 156px.
   *
   * Before this, 500 was held after testing 608 on 2026-10-28 — moving the cue
   * UP closed the text-bar gap by spending the "noticeably lower in frame"
   * decision. The 2026-11-25 move goes the other way and keeps the same
   * 714px content bottom, so the picture does not give up height.
   */
  marginV: 400,
  /**
   * ASS font size (Helvetica Neue Bold).
   *
   * 60 → 68 on 2026-11-11 (#1228). 60 matched TikTok's own auto-captions, but
   * the competitor sample behind #300/#748 reads visibly larger while sharing
   * our words-per-cue, accent and outline (#1224). 72px was measured and
   * rejected: even at ≤3 words per cue the longest lines still reached
   * 812-820px against this lane's 720px.
   */
  fontSize: 68,
  /**
   * Reserved line count.
   *
   * 2 → 1 on 2026-10-29; 1 → 2 on 2026-11-20 (#230).
   *
   * The 2026-10-29 pass dropped the reservation because no pack had ever
   * rendered a `\N` and the 81px went back to the content band. #230 then
   * measured six real packs: 12–23 cues per pack sit under the 0.8s readable
   * floor, and every one of those pairs is a *crowded* pair — the next cue
   * arrives before this one can hold 0.8s. No such pair fits one 720px line
   * (0 of 6 packs), while every one of them fits two. So the second line is
   * spent where it was never spent before: on rescue merges.
   *
   * The switch is not just a style constant: SUBTITLE_LANE_TOP moves with it
   * (1328 → 1236 on #230; 1236 → 1336 on 2026-11-25) while SAFE_ZONES.bottom
   * stays 714, so the content band gives back exactly the lane's 92px and the
   * lower 100px comes out of the gap. The gate reads this value via
   * `maxLines`, so a cue that wraps to a third line still fails the run.
   */
  maxLines: 2,
  /** Per-line height factor (font ascent/descent + safety) */
  lineHeight: 1.35,
  /** Max single-line cue width in px */
  maxWidth: 720,
  /**
   * ASS Alignment — 2 = bottom-centre. The cue is anchored to its bottom edge
   * at `marginV`, which is what makes the derived lane top a worst-case
   * reservation rather than the actual line position. Part of this lane's
   * position contract, not of the look tokens (`lib/subtitles/style-tokens.mjs`).
   */
  alignment: 2,
  /**
   * ASS MarginL — left margin, sized to left-shift the cue so its right edge
   * (marginL + maxWidth) clears the action rail (x≈880) by ≥50px.
   * marginL + maxWidth + marginR = CANVAS.width → 110 + 720 + 250 = 1080.
   */
  marginL: 110,
  /** ASS MarginR — right margin (asymmetric, see marginL above). */
  marginR: 250,
};

/** Subtitle lane bottom edge on the canvas, in px (y = 1520). */
export const SUBTITLE_LANE_BOTTOM = CANVAS.height - SUBTITLE_LANE.marginV;

/** Subtitle lane top edge, in px (y = 1336) — two lines, ceiling-rounded so
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
 * The band now runs to the content band's bottom edge (y=1206), so the picture
 * occupies 62.8% of the frame instead of 43-53%. 2026-11-25: the text is drawn
 * on its own opaque panel below the picture, not on a gradient scrim over it.
 * Media is never dimmed — the old right vignette and bottom scrim are deleted,
 * and `MediaTextPanel` covers exactly the text bar from its top edge down.
 *
 * The band deliberately stops at 1206 rather than at the subtitle lane top
 * (1336): see the `bottom` note below for the measured reason (the source's own
 * bottom-corner captions would land in the FAIL-only subtitle gap).
 */
export const MEDIA_BAND = {
  /**
   * Media bottom edge — the content band's own bottom limit, NOT the subtitle
   * lane top.
   *
   * A 16:9 source cover-cropped into a 1080xH band shows its full height, so a
   * caption burned into the source's bottom-left corner lands at source y
   * 1005-1050 → canvas y 0.93H-0.97H. At H=1206 that is y 1122-1170 — inside
   * the content band, above the FAIL-only subtitle gap (now 1206-1336), and
   * outside the action rail (x 51-858 vs the rail's x≥880) — so it survives as
   * evidence, with 36px of headroom before the gap begins. A taller band, H
   * ≥1336, would push the same caption into the gap and the frame gate would
   * read it as content; that ceiling is what fixes this value.
   *
   * H tracks SAFE_ZONES.bottom. The current 714 (content bottom 1206) comes
   * from the 2026-11-25 lane move: 130px gap + 184px lane + 400px marginV.
   *
   * 2026-11-25: there are no scrim/vignette fields left. Media is never
   * dimmed; a text bar gets its own opaque panel (`MediaTextPanel`).
   */
  bottom: CANVAS.height - SAFE_ZONES.bottom,
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
 * 1026 = the three-row text bar's top edge (1298 − 264) minus the 8px gap. A
 * four-row scene's bar reaches 40px higher (top 986) and so overlaps the
 * picture's bottom edge — the same overlap cover mode has always had, where the
 * bar draws over the footage. Deliberate: anchoring to the four-row bar instead
 * would pull every picture 48px higher to protect a row set most scenes do not
 * declare, and the user's complaint is that the picture is too high already.
 *
 * Net effect for a 16:9 source at full width (608px tall): picture y 418-1026,
 * up from y 301-909 under the old centre-anchored band. +117px.
 */
export const CONTAIN_MEDIA_BOTTOM = mediaBottomBarTopFor({ company: 1, action: 1, result: 1 }) - 8;

/**
 * Media-led hook geometry (2026-11-15): the PICTURE is the protagonist and the
 * text yields. The hook's hero-center layout draws the number over the media —
 * right for a composed cover shot, wrong for a deterministic K-line whose June
 * peak is exactly what the number covered (user ruling: "背后的图片视频更加
 * 重要一些"). Media-led instead gives the picture its own band and pushes every
 * text row into the zones the picture does not own:
 *
 *   y 220-298   kicker badge pill
 *   y 306-402   subject row (64px name — no logo: media-led is chart/photo-led
 *               and the slot contract does not register `subjectLogo`)
 *   y 410-1029  MEDIA BAND (contain) — 820 wide (x 60-880), 619 tall. A 4:3
 *               chart source (800x600) contains to 820x615 — essentially the
 *               full band; a 16:9 source letterboxes 79px top/bottom inside it.
 *               Cover renders full-frame instead and only the text rows sit on
 *               the picture, over scrims.
 *   y 1037-1298 text strip — number (locked 110px), numberLabel, source.
 *               Bottom edge = the content safe-zone bottom (1920-622).
 *
 * Budget audit (worst case, all rows present). The stack has THREE 8px gaps,
 * not two (kicker→subject, subject→media, media→strip):
 *   78 + 8 + 96 + 8 + 619 + 8 + 261 = 1078 — the rows consume the content band
 *   exactly, ZERO slack. Adding a row or growing a constant above pushes the
 *   strip past the safe-zone bottom; shrink something else in the same change.
 * The strip's own worst case (number 110 × 1.2 = 132, numberLabel marginTop
 * SPACING.md = 12 + 48 × the font's default line height ≈ 58, source marginTop
 * SPACING.sm = 8 + 40 × 1.2 = 48) totals ≈ 258 of 261 — 3px, not the 23 the
 * earlier audit implied. A numberLabel line height past ~1.55 overflows; the
 * per-slot TextGate budget, not this comment, is what catches that.
 *
 * numberSize is 110, not 112: 112 sits inside type-scale.mjs's deliberate
 * 111-149 gap ("no fourth size"), 110 is that scale's 60-110 supporting band
 * ceiling. Locking is the one place a size can be chosen freely, so it must
 * still land inside a band.
 */
export const MEDIA_LED = Object.freeze({
  kicker: Object.freeze({ top: 220, height: 78 }),
  subject: Object.freeze({ top: 306, height: 96 }),
  mediaTop: 410,
  // 2026-11-25: the strip starts at the measured top of the 110px number's
  // line box (994) and ends above the content safe bottom. The picture band
  // stops 8px above it, so text never sits on the picture; longer copy is
  // trimmed rather than pushed into the subtitle lane.
  strip: Object.freeze({ top: 994, height: 169 }),
  /** The locked bigNumber size in the strip (bypasses the 150px floor). */
  numberSize: 110,
});

/**
 * Full-width media-led hook (#1559). A 16:9 evidence picture at 820 wide
 * fills only 76% of the frame; the user's report is "视频没有放大、没有撑满
 * 宽度". This band is the canvas width (1080), the contained 16:9 picture is
 * 608 tall and starts at `pictureTop` — 16px below the brand/badge header,
 * the same anchor EVIDENCE_CARD uses — and ends at 908. The copy moves into
 * the plate BELOW the picture instead of sharing the narrow band: badge stays
 * in the header, subject and number sit in `strip`.
 *
 * Only a contained picture gets this variant. `cover` already fills the frame,
 * and the native candle chart keeps its own 820 band.
 */
const FULL_PICTURE_TOP = 300;
const FULL_PICTURE_HEIGHT = 608; // 1080 × 9 / 16 = 607.5
export const HOOK_MEDIA_LED_FULL = Object.freeze({
  /** Top edge of the full-width picture band (clears header by 16px). */
  pictureTop: FULL_PICTURE_TOP,
  /** Height of a 1080-wide 16:9 picture. */
  pictureHeight: FULL_PICTURE_HEIGHT,
  /** Gap between the picture's bottom edge and the copy plate. */
  gap: 8,
  /**
   * Copy plate top/bottom. Bottom is the content-band edge (y=1206), so the
   * plate never reaches the burned subtitle lane at 1336.
   */
  stripTop: FULL_PICTURE_TOP + FULL_PICTURE_HEIGHT + 8, // 916
  stripBottom: CANVAS.height - SAFE_ZONES.bottom, // 1206
  /** Flat alpha of the copy plate over the blurred fill. */
  textBedAlpha: 0.62,
});

/**
 * Header mutual-exclusion slots (#1561).
 *
 * The top band carries three fixed elements that used to be drawn independently
 * and could therefore cover each other: the BrandBar lockup (channel identity),
 * the per-scene kicker badge pill, and the right-aligned BRIEFING chip. In the
 * ABot-World 0.5 hook the red badge pill started at x = SAFE_ZONES.left and ran
 * under BOTH the wordmark and the chip.
 *
 * The rule now: `brand` and `badge` are the SAME left slot, mutually exclusive
 * (a scene that declares a badge yields the brand lockup for that scene —
 * `BrandBar showBrand={!badge}`), while `briefing` keeps a reserved right box
 * and the badge box stops a 16px gap before it. The badge is gated to this box
 * (663px), so a long kicker shrinks inside it instead of growing into the chip.
 *
 * Boxes are measured in real Chrome (Times stack) on 2026-11-26:
 *   - the lockup plate (48px mark + wordmark + padding) is 313.7 × 60;
 *   - the BRIEFING chip is 140.9 × 35, centred on the 60px lockup.
 * `badge` is the hook kicker band from MEDIA_LED — both hook layouts draw their
 * badge there, so the slot is shared rather than duplicated per template.
 * Runtime reality is policed by `FixedCollisionAssert`; this table is the
 * declared contract and is test-locked in __tests__/header-slots.test.mjs.
 */
const HEADER_RIGHT = CANVAS.width - SAFE_ZONES.right; // 880
const HEADER_BRIEFING_WIDTH = 141;
export const HEADER_SLOTS = Object.freeze({
  left: SAFE_ZONES.left,
  right: HEADER_RIGHT,
  /** Gap every header neighbour pair must keep. */
  gap: 16,
  brand: Object.freeze({
    left: SAFE_ZONES.left,
    top: BRAND_BAR.top,
    width: 314,
    height: 60,
  }),
  briefing: Object.freeze({
    left: HEADER_RIGHT - HEADER_BRIEFING_WIDTH,
    // (60px lockup − 35px chip) / 2, centred on the brand plate.
    top: BRAND_BAR.top + 12.5,
    width: HEADER_BRIEFING_WIDTH,
    height: 35,
  }),
  badge: Object.freeze({
    left: SAFE_ZONES.left,
    top: MEDIA_LED.kicker.top,
    height: MEDIA_LED.kicker.height,
    // left slot minus the reserved right box and the mandatory gap.
    width: HEADER_RIGHT - SAFE_ZONES.left - HEADER_BRIEFING_WIDTH - 16,
    right: HEADER_RIGHT - HEADER_BRIEFING_WIDTH - 16,
    // The pill's horizontal chrome is OUTSIDE the text the TextGate fits:
    // 48px padding × 2 + 12px dot + 10px gap. Fit solves the text against
    // `textWidth`, and the padded pill then lands exactly inside `width`.
    // Without this split the gate's 663px content box let the 685px pill
    // overflow into the BRIEFING chip by 6px (observed on the ABot hook).
    chromeWidth: 118,
    textWidth: HEADER_RIGHT - SAFE_ZONES.left - HEADER_BRIEFING_WIDTH - 16 - 118,
  }),
});

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
 *
 * #1466: CJK families are appended AFTER the Latin ones. English text keeps
 * resolving to Times New Roman exactly as before; Chinese text now names a
 * face instead of falling through to whatever the platform picks, so the Node
 * width gate and headless Chrome measure the same glyphs.
 */
export const BRAND_FONT_STACK =
  "'Times New Roman', Times, serif, 'PingFang SC', 'Hiragino Sans GB', 'Heiti SC', 'Noto Sans CJK SC', sans-serif";

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
 *   - Bottom edge at y = SUBTITLE_LANE_TOP − subtitleGap = 1288, i.e. ABOVE
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

/** Default card rectangle on the canvas, in px: {x:460, y:738, w:420, h:550}. */
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
