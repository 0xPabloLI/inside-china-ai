import { describe, it, expect } from "vitest";
import {
  CANVAS,
  SAFE_ZONES,
  SUBTITLE_LANE,
  SUBTITLE_LANE_TOP,
  SUBTITLE_LANE_BOTTOM,
  WATERMARK_POS,
  EVIDENCE_CARD,
  MEDIA_BOTTOM_BAR,
  MEDIA_BAND,
  BRAND_BAR,
  BRAND_FONT_STACK,
} from "../lib/safe-zones.mjs";

/**
 * Region-separation invariants (spec: docs/archive/spec-video-layout-safe-zones.md, D1).
 *
 * Recalibrated against a real FYP playback screenshot (see spec "Screenshot
 * Calibration"), scaled ×1.875 from a 576-wide capture to 1080×1920:
 *   - Right action rail (avatar→like→comment→save→share→music): x≈880-1080,
 *     y≈655-1775  → content & subtitle right edge must clear x880.
 *   - Bottom caption/username (worst case, long caption + safety label):
 *     climbs to y≈1500; bottom nav bar y≈1790-1905.
 *   - TikTok native auto-caption measured ~60px em (≈3.1% of frame height).
 *     Our burned cue was raised to 68px (#1228, 3.5%): larger than native while
 *     still clearing the action rail, which is the whole point of the change.
 *
 * The 1080×1920 canvas is split into non-overlapping bands:
 *   content (down to y=1206) → gap → subtitle lane (y=1336-1520, 184px)
 *   → clean margin → TikTok caption UI (y≥1500 worst case).
 *
 * These tests lock the chain so the consumers — scene content
 * (SAFE_ZONES), burned subtitles (SUBTITLE_LANE), and the render-time
 * geometry gates — can never drift into the same band again.
 */

const contentBottomEdge = CANVAS.height - SAFE_ZONES.bottom;
const laneTop = SUBTITLE_LANE_TOP;
const laneBottom = SUBTITLE_LANE_BOTTOM;
/**
 * Worst-case TikTok caption/username zone top.
 *
 * Originally 1500, a conservative estimate scaled from a 576-wide FYP
 * screenshot. Re-measured 2026-10-24 in TikTok Studio's own preview DOM with a
 * real 1166-character caption attached (`.meta-data` inside
 * `.video-overlay-container`): the caption block's top edge lands at canvas
 * y ≈ 1676. 1620 keeps a 56px margin under that measurement, so this stays a
 * floor rather than the exact figure.
 */
const TIKTOK_CAPTION_TOP = 1620;

describe("region separation (single source of truth)", () => {
  it("content band, subtitle lane and TikTok UI are strictly ordered", () => {
    expect(contentBottomEdge).toBe(1206);
    expect(laneTop).toBe(1336);
    expect(laneBottom).toBe(1520);
    // strict ordering: content < lane top < lane bottom < TikTok caption UI
    expect(contentBottomEdge).toBeLessThan(laneTop);
    expect(laneTop).toBeLessThan(laneBottom);
    expect(laneBottom).toBeLessThan(TIKTOK_CAPTION_TOP);
  });

  it("keeps the lane inside the frame's lower third, below the readability band", () => {
    // The lane is deliberately LOWER than the 60-70% band the
    // vSubtitle/Blitzcut research recommends for canvas-centred native
    // captions (2026-10-24 user decision: push the cue down while it still
    // clears the caption UI). That band's ceiling is 0.71 × 1920 = 1363;
    // this lane bottoms at 1520 = 79.2%. The caption UI is the binding
    // constraint and the measurement above says there is room.
    expect(laneTop / CANVAS.height).toBeGreaterThanOrEqual(0.6);
    expect(laneBottom / CANVAS.height).toBeGreaterThan(0.71);
    expect(laneBottom / CANVAS.height).toBeLessThanOrEqual(0.8);
  });

  it("leaves a gap between content and the subtitle lane", () => {
    // The safety margin lives BELOW the lane (200px+ to the caption zone),
    // not above it, so this only has to keep the two bands from touching.
    expect(laneTop - contentBottomEdge).toBeGreaterThanOrEqual(30);
  });

  it("reserves exactly the lines it permits, pinned with literals", () => {
    // This used to compute its bound from maxLines itself, which made it
    // tautological once maxLines dropped to 1: it asserted 81 >= 81 and could
    // never fail. Pin the inputs and the product instead. The other half of the
    // contract — that a cue exceeding maxLines is refused rather than rendered
    // into the content band — is locked in subtitle-compliance.test.mjs.
    expect(SUBTITLE_LANE.maxLines).toBe(2);
    expect(SUBTITLE_LANE.fontSize).toBe(68);
    expect(SUBTITLE_LANE.lineHeight).toBe(1.35);
    // ceil(68 × 1.35 × 2) = 184 — two lines again since #230 (81 → 92 → 184;
    // #1228 raised the cue to 68px, #230 re-reserved the second line).
    expect(laneBottom - laneTop).toBe(184);
  });

  it("keeps subtitles clear of the worst-case TikTok caption zone", () => {
    // Measured caption top y≈1676 with a long caption; the 1620 floor leaves
    // 100px of clearance below the 1520 lane (156px to the measured top).
    expect(TIKTOK_CAPTION_TOP - laneBottom).toBeGreaterThanOrEqual(100);
  });

  it("sits between TikTok native size and the 72px ceiling (68px, ≈3.5%)", () => {
    // 60 was native parity; #1228 raised it to the largest value the existing
    // 720px lane can carry after re-chunking (72px was measured infeasible).
    expect(SUBTITLE_LANE.fontSize).toBe(68);
    expect(SUBTITLE_LANE.fontSize / CANVAS.height).toBeGreaterThanOrEqual(0.03);
    expect(SUBTITLE_LANE.fontSize).toBeLessThan(72);
  });

  it("uses left-shifted asymmetric margins to clear the action rail", () => {
    expect(SUBTITLE_LANE.marginL).toBe(110);
    expect(SUBTITLE_LANE.marginR).toBe(250);
    expect(SUBTITLE_LANE.marginV).toBe(400);
    // marginL + maxWidth + marginR = canvas width (invariant)
    expect(SUBTITLE_LANE.marginL + SUBTITLE_LANE.maxWidth + SUBTITLE_LANE.marginR).toBe(
      CANVAS.width,
    );
    // subtitle right edge (marginL + maxWidth = 830) clears the action rail (x880)
    expect(SUBTITLE_LANE.marginL + SUBTITLE_LANE.maxWidth).toBe(830);
    expect(SUBTITLE_LANE.marginL + SUBTITLE_LANE.maxWidth).toBeLessThan(880);
    // subtitle center matches content band center (x=470)
    const subtitleCenter = SUBTITLE_LANE.marginL + SUBTITLE_LANE.maxWidth / 2;
    const contentCenter = SAFE_ZONES.left + (CANVAS.width - SAFE_ZONES.right - SAFE_ZONES.left) / 2;
    expect(subtitleCenter).toBe(contentCenter);
  });

  it("keeps horizontal safe zones clear of the action rail (right wider than left)", () => {
    expect(SAFE_ZONES.left).toBe(60);
    expect(SAFE_ZONES.right).toBe(200);
    expect(SAFE_ZONES.right).toBeGreaterThan(SAFE_ZONES.left);
    // content grid: x ∈ [60, 880], width 820 — right edge clears rail (x880)
    expect(CANVAS.width - SAFE_ZONES.right).toBe(880);
    expect(CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right).toBe(820);
  });

  it("keeps the watermark corner inside the top band", () => {
    expect(WATERMARK_POS.top).toBeLessThan(SAFE_ZONES.top);
    expect(WATERMARK_POS.left).toBeLessThan(SAFE_ZONES.right);
  });
});

describe("evidence card (#663, #848)", () => {
  // 618 → 678 → 777 → 697 → 686 → 594. The card's bottom edge IS the four-row
  // text bar's top edge (derived below), and SAFE_ZONES.bottom 770 → 710 → 611
  // → 622 → 714 moved that edge from y=838 to y=894. The 714 step (#230) is
  // the two-line subtitle reservation, taken out of the content band like the
  // earlier steps. `top` is no longer SAFE_ZONES.top: the brand bar moved
  // 140 → 236 and its glyphs now land at y 252-267, inside the content band,
  // so the card anchors below it instead.
  it("locks the card to the #663 contract geometry [60,300,820,594]", () => {
    expect(EVIDENCE_CARD).toEqual({ left: 60, top: 300, width: 820, height: 594 });
  });

  it("keeps the card's bottom edge exactly on the four-row media-bottom-bar text bar top", () => {
    expect(EVIDENCE_CARD.top + EVIDENCE_CARD.height).toBe(MEDIA_BOTTOM_BAR.textBarTop);
    expect(MEDIA_BOTTOM_BAR.textBarTop).toBe(894);
  });

  it("starts below the brand bar, which sits inside the content band", () => {
    // The bar is drawn over the content band, so a card at SAFE_ZONES.top would
    // be occluded by it. This is the regression the review caught.
    expect(EVIDENCE_CARD.top).toBeGreaterThan(BRAND_BAR.top + BRAND_BAR.height);
    expect(EVIDENCE_CARD.top).toBeGreaterThan(SAFE_ZONES.top);
  });

  it("stays inside every protected zone", () => {
    expect(EVIDENCE_CARD.left).toBeGreaterThanOrEqual(SAFE_ZONES.left);
    expect(EVIDENCE_CARD.top).toBeGreaterThanOrEqual(SAFE_ZONES.top);
    expect(EVIDENCE_CARD.left + EVIDENCE_CARD.width).toBeLessThanOrEqual(
      CANVAS.width - SAFE_ZONES.right,
    );
    expect(EVIDENCE_CARD.top + EVIDENCE_CARD.height).toBeLessThanOrEqual(
      CANVAS.height - SAFE_ZONES.bottom,
    );
  });
});

/**
 * Full-bleed media band (2026-10-25, edge re-tuned 2026-10-29, 2026-11-20).
 * These lock the geometry that answers the "内容整体还是太偏上了" note: the picture
 * used to stop at the four-row text bar top (y=838, 43.6% of the frame) with an
 * opaque panel below it, and now runs to the content band's own bottom edge
 * (y=1206, 62.8%) with the text drawn on its own opaque panel below the
 * picture. 2026-11-25: no gradient scrim, no dim layer on the media.
 *
 * The 2026-10-29 change moved that edge 1150 → 1309 by taking SAFE_ZONES.bottom
 * 770 → 611. (An intermediate 710 / y=1210 pass came and went first: 60px is 3%
 * of the frame, under the threshold where a composition shift reads, and the
 * user reported seeing no movement.) The user raised the composition twice —
 * 2026-10-24 and again on 2026-10-29 ("整个内容区没有保证居中，内容区包括视频和文字
 * 部分") — and the residual gap under the text bar was the whole of the second
 * complaint. The cue itself did NOT move: the gap is now spent on both sides.
 */
describe("media band (full-bleed footage)", () => {
  it("stops at the content band's bottom edge, never at the subtitle lane", () => {
    // A 16:9 source cover-cropped into a 1080xH band shows its full height, so
    // a caption burned into the source's bottom-left corner lands at source y
    // 1005-1050 → canvas y 0.93H-0.97H. H=1206 puts it at y 1122-1170 — inside
    // the content band, 36px clear of the FAIL-only gap. A taller band walks it
    // into that gap (SUBTITLE_LANE_TOP, 1336, would put it at 1243-1297 and the
    // band's own edge at the gap's start), where the frame gate reads it as
    // content and fails; media is never dimmed to hide it.
    expect(MEDIA_BAND.bottom).toBe(1206);
    expect(MEDIA_BAND.bottom).toBe(CANVAS.height - SAFE_ZONES.bottom);
    expect(MEDIA_BAND.bottom).toBeLessThan(SUBTITLE_LANE_TOP);
    // the whole FAIL-only gap stays empty, which is what the gate measures
    expect(SUBTITLE_LANE_TOP - MEDIA_BAND.bottom).toBe(130);
  });

  it("grows the picture from the old text bar top to 62.8% of the frame", () => {
    expect(MEDIA_BAND.bottom).toBeGreaterThan(MEDIA_BOTTOM_BAR.textBarTop);
    expect(MEDIA_BOTTOM_BAR.textBarTop / CANVAS.height).toBeLessThan(0.53);
    expect(MEDIA_BAND.bottom / CANVAS.height).toBeCloseTo(0.628, 3);
  });
});

// #1466 — Chinese scene text fell through to the system fallback family, which
// Node canvas (the width gate) and headless Chrome (Remotion) need not resolve
// to the same face. The brand stack now names CJK families explicitly, after
// the Latin ones so English text keeps resolving to Times New Roman first.
describe("brand font stack (CJK)", () => {
  it("keeps the Latin face first and appends CJK families", () => {
    expect(BRAND_FONT_STACK.startsWith("'Times New Roman'")).toBe(true);
    for (const family of ["PingFang SC", "Hiragino Sans GB", "Heiti SC", "Noto Sans CJK SC"]) {
      expect(BRAND_FONT_STACK).toContain(family);
    }
  });
});
