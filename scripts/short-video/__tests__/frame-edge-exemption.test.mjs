/**
 * Frame-edge exemption regression (#1215, 2026-11-15).
 *
 * `frameGlowExemptRegions` used to blank the outer 15px on all four sides so
 * the FrameGlow border and its 40px inset shadow would not trip the bright
 * pixel gate. FrameGlow is gone; the remaining background layers sit at
 * luminance 12-14, far below BRIGHT_THRESHOLD (80), so they cannot trip it.
 * Leaving the exemption in place silently hid real content overflow in that
 * band. This test pins the band as ordinary sampled pixels.
 */
import { describe, it, expect } from "vitest";
import { checkSafeZoneTop } from "../lib/frame-analysis.mjs";
import { SAFE_ZONES, CANVAS } from "../lib/safe-zones.mjs";

function solidBuffer(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 10;
    data[i * 4 + 1] = 10;
    data[i * 4 + 2] = 20;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function paintBrightRect(buf, rect) {
  for (let y = rect.yStart; y < rect.yEnd; y += 1) {
    for (let x = rect.xStart; x < rect.xEnd; x += 1) {
      const i = (y * buf.width + x) * 4;
      buf.data[i] = 220;
      buf.data[i + 1] = 220;
      buf.data[i + 2] = 220;
    }
  }
}

describe("frame edge exemption", () => {
  it("counts bright content sitting inside the retired outer 15px band", () => {
    const buf = solidBuffer(CANVAS.width, CANVAS.height);
    // y=8 is on the SAMPLE_STEP=8 grid; x=300..700 is clear of both the
    // BRAND_BAR_REGION (x60-880, y130-200) and WATERMARK_REGION (x55-125, y55-125).
    paintBrightRect(buf, { xStart: 300, xEnd: 700, yStart: 8, yEnd: 16 });
    const result = checkSafeZoneTop(buf, SAFE_ZONES);
    expect(result.metrics.bright).toBeGreaterThan(0);
  });

  it("still exempts the brand bar and watermark regions", () => {
    const buf = solidBuffer(CANVAS.width, CANVAS.height);
    paintBrightRect(buf, { xStart: 60, xEnd: 880, yStart: 130, yEnd: 200 });
    const result = checkSafeZoneTop(buf, SAFE_ZONES);
    expect(result.metrics.bright).toBe(0);
  });
});
