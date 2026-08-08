import { describe, it, expect } from "vitest";
import { measureWidth, DEFAULT_WIDTH_UNITS } from "../lib/subtitles/measure.mjs";
import { SUBTITLE_LANE } from "../lib/safe-zones.mjs";

/**
 * Pixel width measurement for subtitle chunking (spec D2).
 *
 * Approximates Helvetica Neue Bold advance widths with the Adobe
 * Helvetica-Bold AFM table; widths are per-1000-em units scaled by the
 * subtitle font size (60px). The guarantee this provides is "single line in
 * the normal case" — the two-line reserved lane (T1) is the safety net for
 * any mismatch between the approximation and the rendering device.
 */

const F = SUBTITLE_LANE.fontSize;

describe("measureWidth (Helvetica Neue Bold, 60px)", () => {
  it("scales per-1000-em advances by the style font size", () => {
    // "W" advance = 944 per 1000 em → 10 × 0.944 × 60 = 566.4px
    expect(measureWidth("WWWWWWWWWW")).toBeCloseTo(566.4, 2);
    // "i" advance = 278 → 10 × 0.278 × 60 = 166.8px
    expect(measureWidth("iiiiiiiiii")).toBeCloseTo(166.8, 2);
  });

  it("counts spaces with the space advance", () => {
    // "A A" = 722 + 278 + 722 (per 1000 em)
    expect(measureWidth("A A")).toBeCloseTo(((722 + 278 + 722) / 1000) * F, 2);
  });

  it("returns 0 for an empty string", () => {
    expect(measureWidth("")).toBe(0);
  });

  it("falls back to a default advance for unknown characters", () => {
    // "A€" uses the fallback width for the unknown € glyph
    expect(measureWidth("A€")).toBeCloseTo(((722 + DEFAULT_WIDTH_UNITS) / 1000) * F, 2);
  });

  it("uppercase-heavy lines exceed the hard limit long before 49 chars", () => {
    // "WWWW WWWW WWWW WWWW WWWW WWWW" = 24 W + 5 spaces ≈ 1443px > 720
    expect(measureWidth("WWWW WWWW WWWW WWWW WWWW WWWW")).toBeGreaterThan(SUBTITLE_LANE.maxWidth);
  });
});
