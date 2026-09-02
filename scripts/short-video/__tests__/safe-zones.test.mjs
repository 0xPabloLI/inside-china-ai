import { describe, it, expect } from "vitest";
import {
  CANVAS,
  SAFE_ZONES,
  SUBTITLE_LANE,
  SUBTITLE_LANE_TOP,
  SUBTITLE_LANE_BOTTOM,
  WATERMARK_POS,
} from "../lib/safe-zones.mjs";

/**
 * Region-separation invariants (spec: docs/specs/spec-video-layout-safe-zones.md, D1).
 *
 * Recalibrated against a real FYP playback screenshot (see spec "Screenshot
 * Calibration"), scaled ×1.875 from a 576-wide capture to 1080×1920:
 *   - Right action rail (avatar→like→comment→save→share→music): x≈880-1080,
 *     y≈655-1775  → content & subtitle right edge must clear x880.
 *   - Bottom caption/username (worst case, long caption + safety label):
 *     climbs to y≈1500; bottom nav bar y≈1790-1905.
 *   - TikTok native auto-caption measured ~60px em (≈3.1% of frame height),
 *     centered around 62-70% of frame height — our subtitles match it.
 *
 * The 1080×1920 canvas is split into non-overlapping bands:
 *   content (down to y=1150) → gap → subtitle lane (y≈1188-1350, 60px, 62-70%)
 *   → clean margin → TikTok caption UI (y≥1500 worst case).
 *
 * These tests lock the chain so the consumers — scene content
 * (SAFE_ZONES), burned subtitles (SUBTITLE_LANE), and the render-time
 * geometry gates — can never drift into the same band again.
 */

const contentBottomEdge = CANVAS.height - SAFE_ZONES.bottom;
const laneTop = SUBTITLE_LANE_TOP;
const laneBottom = SUBTITLE_LANE_BOTTOM;
/** Worst-case TikTok caption/username zone top (measured from screenshot). */
const TIKTOK_CAPTION_TOP = 1500;

describe("region separation (single source of truth)", () => {
  it("content band, subtitle lane and TikTok UI are strictly ordered", () => {
    expect(contentBottomEdge).toBe(1150);
    expect(laneTop).toBe(1188);
    expect(laneBottom).toBe(1350);
    // strict ordering: content < lane top < lane bottom < TikTok caption UI
    expect(contentBottomEdge).toBeLessThan(laneTop);
    expect(laneTop).toBeLessThan(laneBottom);
    expect(laneBottom).toBeLessThan(TIKTOK_CAPTION_TOP);
  });

  it("positions the subtitle lane in the 60-70% best-readability band", () => {
    // vSubtitle/Blitzcut 2026: vertical captions sit at 60-70% of frame height.
    expect(laneTop / CANVAS.height).toBeGreaterThanOrEqual(0.6);
    expect(laneBottom / CANVAS.height).toBeLessThanOrEqual(0.71);
  });

  it("leaves a gap between content and the subtitle lane", () => {
    // Smaller than the pre-recalibration 60px because the larger 60px lane
    // moved up into the best-readability band; the safety margin now lives
    // BELOW the lane (150px+ to the caption zone), not above it.
    expect(laneTop - contentBottomEdge).toBeGreaterThanOrEqual(30);
  });

  it("reserves at least two lines of subtitle height inside the lane", () => {
    const twoLines = SUBTITLE_LANE.fontSize * SUBTITLE_LANE.lineHeight * SUBTITLE_LANE.maxLines;
    expect(laneBottom - laneTop).toBeGreaterThanOrEqual(twoLines);
  });

  it("keeps subtitles clear of the worst-case TikTok caption zone", () => {
    // Measured caption top y≈1500 (long caption + safety label); lane bottom
    // 1350 clears it by 150px. Short captions sit even lower.
    expect(TIKTOK_CAPTION_TOP - laneBottom).toBeGreaterThanOrEqual(150);
  });

  it("matches TikTok native caption size (~60px, ≈3.1% of frame height)", () => {
    expect(SUBTITLE_LANE.fontSize).toBe(60);
    expect(SUBTITLE_LANE.fontSize / CANVAS.height).toBeGreaterThanOrEqual(0.03);
  });

  it("uses left-shifted asymmetric margins to clear the action rail", () => {
    expect(SUBTITLE_LANE.marginL).toBe(110);
    expect(SUBTITLE_LANE.marginR).toBe(250);
    expect(SUBTITLE_LANE.marginV).toBe(570);
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
