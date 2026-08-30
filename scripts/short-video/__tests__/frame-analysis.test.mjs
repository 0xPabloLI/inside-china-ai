import { describe, it, expect } from "vitest";
import {
  luminance,
  getPixel,
  sampleRegion,
  countBrightPixels,
  checkSafeZoneTop,
  checkSafeZoneRight,
  checkSafeZoneBottom,
  checkContentPresence,
  checkNotAllBlack,
  checkTextOverflow,
  checkClippedText,
  checkFinalFrameHasContent,
  runFrameAnalysis,
  BRIGHT_THRESHOLD,
  BRIGHT_RATIO_FAIL,
  SAMPLE_STEP,
  BLACK_THRESHOLD,
} from "../lib/frame-analysis.mjs";
import { SAFE_ZONES, CANVAS } from "../lib/safe-zones.mjs";

// ─── Helpers: construct synthetic PixelBuffers ───

/** Create a PixelBuffer filled with a single color. */
function solidBuffer(width, height, r, g, b, a = 255) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width, height };
}

/** Create a PixelBuffer with background color (#0a0a14) and draw a rectangle of bright pixels. */
function bufferWithRect(width, height, rect, r = 200, g = 200, b = 200) {
  const buf = solidBuffer(width, height, 10, 10, 20); // #0a0a14
  for (let y = rect.yStart; y < rect.yEnd && y < height; y++) {
    for (let x = rect.xStart; x < rect.xEnd && x < width; x++) {
      const idx = (width * y + x) * 4;
      buf.data[idx] = r;
      buf.data[idx + 1] = g;
      buf.data[idx + 2] = b;
      buf.data[idx + 3] = 255;
    }
  }
  return buf;
}

/** Background-only buffer (no content). */
const bgBuffer = () => solidBuffer(CANVAS.width, CANVAS.height, 10, 10, 20);

/** Buffer with content in the safe content area. */
const contentBuffer = () =>
  bufferWithRect(CANVAS.width, CANVAS.height, {
    xStart: 60,
    xEnd: 800,
    yStart: 300,
    yEnd: 1000,
  });

// ─── luminance ───

describe("luminance", () => {
  it("returns 0 for black", () => {
    expect(luminance(0, 0, 0)).toBe(0);
  });

  it("returns 255 for white", () => {
    expect(luminance(255, 255, 255)).toBe(255);
  });

  it("returns ~10 for #0a0a14 (background)", () => {
    expect(luminance(10, 10, 20)).toBeCloseTo(11.14, 1);
  });

  it("weights green more than red and blue (BT.601)", () => {
    const lum = luminance(100, 200, 50);
    // 0.299*100 + 0.587*200 + 0.114*50 = 29.9 + 117.4 + 5.7 = 153
    expect(lum).toBeCloseTo(153, 0);
  });
});

// ─── getPixel ───

describe("getPixel", () => {
  it("reads correct RGBA values at (x, y)", () => {
    const buf = solidBuffer(10, 10, 100, 150, 200);
    const px = getPixel(buf, 3, 4);
    expect(px).toEqual({ r: 100, g: 150, b: 200, a: 255 });
  });

  it("reads pixel at origin (0, 0)", () => {
    const buf = solidBuffer(5, 5, 255, 0, 0);
    const px = getPixel(buf, 0, 0);
    expect(px.r).toBe(255);
    expect(px.g).toBe(0);
    expect(px.b).toBe(0);
  });

  it("reads last pixel at (width-1, height-1)", () => {
    const buf = solidBuffer(5, 5, 0, 255, 0);
    const px = getPixel(buf, 4, 4);
    expect(px.g).toBe(255);
  });
});

// ─── sampleRegion ───

describe("sampleRegion", () => {
  it("samples pixels at the specified step interval", () => {
    const buf = solidBuffer(100, 100, 50, 50, 50);
    const region = { xStart: 0, xEnd: 100, yStart: 0, yEnd: 100 };
    const samples = sampleRegion(buf, region, 10);
    // 10x10 grid = 100 samples
    expect(samples.length).toBe(100);
  });

  it("handles regions smaller than step", () => {
    const buf = solidBuffer(20, 20, 50, 50, 50);
    const region = { xStart: 0, xEnd: 5, yStart: 0, yEnd: 5 };
    const samples = sampleRegion(buf, region, 10);
    // Should still sample at least one point (0,0)
    expect(samples.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── countBrightPixels ───

describe("countBrightPixels", () => {
  it("counts zero bright pixels in dark buffer", () => {
    const buf = bgBuffer();
    const region = { xStart: 0, xEnd: CANVAS.width, yStart: 0, yEnd: 220 };
    const result = countBrightPixels(buf, region, BRIGHT_THRESHOLD, SAMPLE_STEP);
    expect(result.bright).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it("counts bright pixels when content present", () => {
    // Draw bright content in the top zone (y=0 to 220)
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 100,
      xEnd: 500,
      yStart: 50,
      yEnd: 200,
    });
    const region = { xStart: 0, xEnd: CANVAS.width, yStart: 0, yEnd: 220 };
    const result = countBrightPixels(buf, region, BRIGHT_THRESHOLD, SAMPLE_STEP);
    expect(result.bright).toBeGreaterThan(0);
    expect(result.ratio).toBeGreaterThan(0);
  });

  it("returns correct total count", () => {
    const buf = bgBuffer();
    const region = { xStart: 0, xEnd: 100, yStart: 0, yEnd: 100 };
    const result = countBrightPixels(buf, region, BRIGHT_THRESHOLD, 10);
    // 10x10 = 100 samples
    expect(result.total).toBe(100);
  });
});

// ─── checkSafeZoneTop ───

describe("checkSafeZoneTop", () => {
  it("passes when top zone is clear (background only)", () => {
    const buf = contentBuffer(); // content only in safe area
    const result = checkSafeZoneTop(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("warns when content present in top zone (y < 220, outside exempt regions)", () => {
    // Draw bright content at y=50-180, x=300-700 (outside brand bar exempt region)
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 300,
      xEnd: 700,
      yStart: 40,
      yEnd: 120,
    });
    const result = checkSafeZoneTop(buf, SAFE_ZONES);
    expect(result.level).toBe("warn");
    expect(result.metrics.brightRatio).toBeGreaterThan(BRIGHT_RATIO_FAIL);
  });

  it("passes when only subtle background layers present (luminance < 80)", () => {
    // GridBg: rgba(77,139,255,0.04) → effective luminance ~8
    const buf = solidBuffer(CANVAS.width, CANVAS.height, 10, 10, 20);
    // Add subtle grid pattern (very dim)
    for (let y = 0; y < 220; y += 60) {
      for (let x = 0; x < CANVAS.width; x++) {
        const idx = (CANVAS.width * y + x) * 4;
        buf.data[idx] = 12;
        buf.data[idx + 1] = 12;
        buf.data[idx + 2] = 22;
      }
    }
    const result = checkSafeZoneTop(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });
});

// ─── checkSafeZoneRight ───

describe("checkSafeZoneRight", () => {
  it("passes when right rail is clear", () => {
    const buf = contentBuffer();
    const result = checkSafeZoneRight(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("fails when content present in right rail (x > 880, y 640-1775)", () => {
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 900,
      xEnd: 1050,
      yStart: 700,
      yEnd: 1200,
    });
    const result = checkSafeZoneRight(buf, SAFE_ZONES);
    expect(result.level).toBe("fail");
  });

  it("passes when content is above the rail (y < 640)", () => {
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 900,
      xEnd: 1050,
      yStart: 300,
      yEnd: 500,
    });
    const result = checkSafeZoneRight(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });
});

// ─── checkSafeZoneBottom ───

describe("checkSafeZoneBottom", () => {
  it("passes when bottom gap is clear", () => {
    const buf = contentBuffer();
    const result = checkSafeZoneBottom(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("fails when content present in bottom gap (y 1150-1188)", () => {
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 100,
      xEnd: 800,
      yStart: 1155,
      yEnd: 1185,
    });
    const result = checkSafeZoneBottom(buf, SAFE_ZONES);
    expect(result.level).toBe("fail");
  });
});

// ─── checkContentPresence ───

describe("checkContentPresence", () => {
  it("passes when content area has variation", () => {
    const buf = contentBuffer();
    const result = checkContentPresence(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("warns when content area is empty (all background)", () => {
    const buf = bgBuffer();
    const result = checkContentPresence(buf, SAFE_ZONES);
    expect(result.level).toBe("warn");
  });
});

// ─── checkNotAllBlack ───

describe("checkNotAllBlack", () => {
  it("passes for a normal frame with content", () => {
    const buf = contentBuffer();
    const result = checkNotAllBlack(buf);
    expect(result.level).toBe("pass");
  });

  it("fails for an all-black frame", () => {
    const buf = solidBuffer(CANVAS.width, CANVAS.height, 0, 0, 0);
    const result = checkNotAllBlack(buf);
    expect(result.level).toBe("fail");
  });

  it("passes for dark background (#0a0a14, luminance ~13)", () => {
    const buf = bgBuffer();
    const result = checkNotAllBlack(buf);
    expect(result.level).toBe("pass");
  });
});

// ─── runFrameAnalysis ───

describe("runFrameAnalysis", () => {
  it("returns array of AnalysisResult objects", () => {
    const buf = contentBuffer();
    const results = runFrameAnalysis(buf, SAFE_ZONES);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty("level");
      expect(r).toHaveProperty("check");
      expect(r).toHaveProperty("detail");
      expect(["pass", "warn", "fail"]).toContain(r.level);
    }
  });

  it("all pass for a well-formed frame", () => {
    const buf = contentBuffer();
    const results = runFrameAnalysis(buf, SAFE_ZONES);
    const fails = results.filter((r) => r.level === "fail");
    expect(fails).toHaveLength(0);
  });

  it("detects safe zone violations", () => {
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 100,
      xEnd: 900,
      yStart: 50,
      yEnd: 180, // top zone violation (now warn, not fail)
    });
    const results = runFrameAnalysis(buf, SAFE_ZONES);
    const topResult = results.find((r) => r.check.toLowerCase().includes("top"));
    expect(topResult.level).toBe("warn");
  });

  it("detects all-black frame", () => {
    const buf = solidBuffer(CANVAS.width, CANVAS.height, 0, 0, 0);
    const results = runFrameAnalysis(buf, SAFE_ZONES);
    const blackResult = results.find((r) => r.check.toLowerCase().includes("black"));
    expect(blackResult.level).toBe("fail");
  });
});

// ─── checkTextOverflow ───

describe("checkTextOverflow", () => {
  it("passes when content area is empty (no bright pixels)", () => {
    const buf = bgBuffer();
    const result = checkTextOverflow(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("passes when text fits within content width", () => {
    // Content width = 1080 - 60 - 200 = 820px
    // Draw bright pixels within [60, 880] → span = 820 (exactly max)
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 100,
      xEnd: 800,
      yStart: 300,
      yEnd: 1000,
    });
    const result = checkTextOverflow(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("passes when text spans exactly the full content width", () => {
    // span = 880 - 60 = 820 = content width → boundary case
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: SAFE_ZONES.left,
      xEnd: CANVAS.width - SAFE_ZONES.right,
      yStart: 400,
      yEnd: 900,
    });
    const result = checkTextOverflow(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("warns when text overflows content width by 8px (one sample step)", () => {
    // Use SAMPLE_STEP-aligned coordinates so sampling is predictable.
    // contentLeft = 60, contentRight = 880, contentWidth = 820
    // Sampled leftmost = 64 (first multiple of 8 >= 60)
    // Rect xEnd = 896 → sampled bright includes x=888 (> 880) → overflow detected
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: SAFE_ZONES.left,
      xEnd: CANVAS.width - SAFE_ZONES.right + 2 * SAMPLE_STEP,
      yStart: 400,
      yEnd: 900,
    });
    const result = checkTextOverflow(buf, SAFE_ZONES);
    expect(result.level).toBe("warn");
    expect(result.metrics.maxOverflow).toBeGreaterThan(0);
  });

  it("warns when text overflows content width significantly (64px)", () => {
    // span = 944 - 64 = 880 > 820 → overflow = 60px (at sample granularity)
    // Both 64 and 944 are multiples of SAMPLE_STEP (8)
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: SAFE_ZONES.left,
      xEnd: CANVAS.width - SAFE_ZONES.right + 64,
      yStart: 400,
      yEnd: 900,
    });
    const result = checkTextOverflow(buf, SAFE_ZONES);
    expect(result.level).toBe("warn");
    expect(result.metrics.maxOverflow).toBeGreaterThan(0);
  });

  it("ignores bright pixels in brand bar exempt region", () => {
    // Brand bar at x[60,880], y[130,200] — within safe zone top (y<220)
    // But checkTextOverflow scans y >= safeZones.top (220), so brand bar is above scan range
    // Draw content that overflows at y=300 + brand bar pixels at y=150
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 100,
      xEnd: 800,
      yStart: 300,
      yEnd: 1000,
    });
    // Add brand bar pixels (won't be scanned — y < 220)
    for (let y = 130; y < 200; y++) {
      for (let x = 60; x < 880; x++) {
        const idx = (CANVAS.width * y + x) * 4;
        buf.data[idx] = 200;
        buf.data[idx + 1] = 200;
        buf.data[idx + 2] = 200;
      }
    }
    const result = checkTextOverflow(buf, SAFE_ZONES);
    expect(result.level).toBe("pass"); // content is within width, brand bar not scanned
  });

  it("ignores frame glow border pixels", () => {
    // Draw bright pixels in the outer 15px (frame glow) but within content y-range
    const buf = bgBuffer();
    // Left glow band x[0,15] at y=300
    for (let y = 300; y < 1000; y += SAMPLE_STEP) {
      for (let x = 0; x < 15; x += SAMPLE_STEP) {
        const idx = (CANVAS.width * y + x) * 4;
        buf.data[idx] = 200;
        buf.data[idx + 1] = 200;
        buf.data[idx + 2] = 200;
      }
    }
    // Right glow band x[1065,1080] at y=300
    for (let y = 300; y < 1000; y += SAMPLE_STEP) {
      for (let x = CANVAS.width - 15; x < CANVAS.width; x += SAMPLE_STEP) {
        const idx = (CANVAS.width * y + x) * 4;
        buf.data[idx] = 200;
        buf.data[idx + 1] = 200;
        buf.data[idx + 2] = 200;
      }
    }
    const result = checkTextOverflow(buf, SAFE_ZONES);
    // Glow pixels are in exempt regions → no overflow detected
    expect(result.level).toBe("pass");
  });

  it("is included in runFrameAnalysis results", () => {
    const buf = contentBuffer();
    const results = runFrameAnalysis(buf, SAFE_ZONES);
    const overflowResult = results.find((r) =>
      r.check.toLowerCase().includes("overflow"),
    );
    expect(overflowResult).toBeDefined();
    expect(["pass", "warn", "fail"]).toContain(overflowResult.level);
  });
});

describe("checkClippedText", () => {
  it("passes when no bright pixels touch the right boundary", () => {
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 600,
      xEnd: 800,
      yStart: 400,
      yEnd: 700,
    });
    const result = checkClippedText(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });

  it("warns when bright pixels are cut hard at the boundary across a text-height band", () => {
    // Bright rect flush against content right edge (x=880), nothing beyond —
    // the overflow-hidden clipping signature. 200px tall = 25 sampled rows.
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 830,
      xEnd: 880,
      yStart: 400,
      yEnd: 600,
    });
    const result = checkClippedText(buf, SAFE_ZONES);
    expect(result.level).toBe("warn");
  });

  it("passes when brightness continues past the boundary (not a cut)", () => {
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 830,
      xEnd: 950,
      yStart: 400,
      yEnd: 600,
    });
    const result = checkClippedText(buf, SAFE_ZONES);
    expect(result.level).toBe("pass");
  });
});

describe("checkFinalFrameHasContent", () => {
  it("FAILS on a background-only last frame (black tail after the CTA)", () => {
    // qwen4-preview v1: the composition ran 3s past the last scene, so the
    // final frames were #0a0a14 background with subtitles still burning in.
    // checkNotAllBlack passes those (background luminance ≈ 13 > threshold 5),
    // and checkContentPresence only warns — the tail must FAIL instead.
    const result = checkFinalFrameHasContent(bgBuffer(), SAFE_ZONES);
    expect(result.level).toBe("fail");
  });

  it("FAILS when only the subtitle lane has content (tail with captions)", () => {
    // Subtitles live at y 1188-1350, outside the content area.
    const buf = bufferWithRect(CANVAS.width, CANVAS.height, {
      xStart: 200,
      xEnd: 880,
      yStart: 1200,
      yEnd: 1250,
    });
    const result = checkFinalFrameHasContent(buf, SAFE_ZONES);
    expect(result.level).toBe("fail");
  });

  it("passes when the CTA is still on screen on the last frame", () => {
    const result = checkFinalFrameHasContent(contentBuffer(), SAFE_ZONES);
    expect(result.level).toBe("pass");
  });
});
