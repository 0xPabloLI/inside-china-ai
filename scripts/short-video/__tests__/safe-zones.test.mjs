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
 * The 1080×1920 canvas is split into non-overlapping bands:
 *   content (down to y=1340) → breathing gap → subtitle lane (y≈1417-1530)
 *   → TikTok caption UI (y≥1600).
 *
 * These tests lock the chain so the three consumers — scene content
 * (SAFE_ZONES), burned subtitles (SUBTITLE_LANE), DOM verification
 * (verify-scene-dom.mjs) — can never drift into the same band again.
 */

const contentBottomEdge = CANVAS.height - SAFE_ZONES.bottom;
const laneTop = SUBTITLE_LANE_TOP;
const laneBottom = SUBTITLE_LANE_BOTTOM;
/** Conservative TikTok caption/CTA zone start (~250-320px from bottom, 2026 research). */
const TIKTOK_UI_TOP = CANVAS.height - 320;

describe("region separation (single source of truth)", () => {
  it("content band, subtitle lane and TikTok UI are strictly ordered", () => {
    expect(contentBottomEdge).toBe(1340);
    expect(laneTop).toBe(1416);
    expect(laneBottom).toBe(1530);
    // strict ordering: content < lane top < lane bottom < TikTok UI
    expect(contentBottomEdge).toBeLessThan(laneTop);
    expect(laneTop).toBeLessThan(laneBottom);
    expect(laneBottom).toBeLessThan(TIKTOK_UI_TOP);
  });

  it("leaves a breathing gap between content and the subtitle lane", () => {
    expect(laneTop - contentBottomEdge).toBeGreaterThanOrEqual(60);
  });

  it("reserves at least two lines of subtitle height inside the lane", () => {
    const twoLines = SUBTITLE_LANE.fontSize * SUBTITLE_LANE.lineHeight * SUBTITLE_LANE.maxLines;
    expect(laneBottom - laneTop).toBeGreaterThanOrEqual(twoLines);
  });

  it("keeps subtitles above the TikTok bottom UI on every platform", () => {
    // Reels caption UI starts ~350px from bottom (y≈1570) — lane bottom 1530
    // still clears it. TikTok is stricter (1600+).
    expect(laneBottom).toBeLessThan(CANVAS.height - 350);
  });

  it("derives ASS margins from the lane max width (950px → 65px)", () => {
    const marginEach = (CANVAS.width - SUBTITLE_LANE.maxWidth) / 2;
    expect(marginEach).toBe(65);
    expect(SUBTITLE_LANE.marginV).toBe(390);
  });

  it("keeps horizontal safe zones with the action rail (right wider than left)", () => {
    expect(SAFE_ZONES.left).toBe(60);
    expect(SAFE_ZONES.right).toBe(160);
    expect(SAFE_ZONES.right).toBeGreaterThan(SAFE_ZONES.left);
    // content grid: x ∈ [60, 920], width 860
    expect(CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right).toBe(860);
  });

  it("keeps the watermark corner inside the top band", () => {
    expect(WATERMARK_POS.top).toBeLessThan(SAFE_ZONES.top);
    expect(WATERMARK_POS.left).toBeLessThan(SAFE_ZONES.right);
  });
});
