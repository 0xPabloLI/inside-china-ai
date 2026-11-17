/**
 * Tests for the deterministic resample path in lib/upscale.mjs (#1399).
 *
 * Background: the pipeline's only upscaler used to be Real-ESRGAN, a photo SR
 * model. On line-art charts it rewrites glyphs and — with `-t 256` tiling —
 * silently drops tiles (2026-11-16 zhipu run: mid-run candles and half the
 * title blanked). `resampleImage()` is the deterministic alternative: same
 * pixels in, a bigger grid out, nothing invented and nothing dropped.
 *
 * The integration cases run real ffmpeg/ffprobe against a synthetic
 * chart-shaped PNG. The fixture is deliberately inked as a checkerboard so a
 * dropped tile (the failure this function exists to avoid) shows up as an
 * ink-free band rather than as a subjective "looks blurry" judgement.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PNG } from "pngjs";

import {
  RESAMPLE_FILTERS,
  autoUpscaleIfNeeded,
  buildResampledPath,
  buildUpscaledPath,
  resampleImage,
  FFMPEG_PATH,
  FFPROBE_PATH,
} from "../lib/upscale.mjs";

function binWorks(bin) {
  try {
    return spawnSync(bin, ["-version"], { encoding: "utf8", timeout: 10000 }).status === 0;
  } catch {
    return false;
  }
}

const hasFfmpegTools = binWorks(FFPROBE_PATH) && binWorks(FFMPEG_PATH);

/** Checkerboard ink: a flat field would hide a dropped tile. */
function writeChartLikePng(path, width = 800, height = 600) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2;
      const ink = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      png.data[i] = ink ? 16 : 250;
      png.data[i + 1] = ink ? 16 : 250;
      png.data[i + 2] = ink ? 16 : 250;
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(path, PNG.sync.write(png));
  return path;
}

/** Inked pixel count per equal-width vertical segment. */
function inkPerSegment(path, segments = 12) {
  const png = PNG.sync.read(readFileSync(path));
  const counts = new Array(segments).fill(0);
  const segWidth = Math.ceil(png.width / segments);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      const luma = 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
      if (luma < 128) counts[Math.min(segments - 1, Math.floor(x / segWidth))]++;
    }
  }
  return counts;
}

describe("resampleImage — deterministic kernel", () => {
  it("rejects an unknown filter instead of guessing one", () => {
    expect(RESAMPLE_FILTERS.has("lanczos")).toBe(true);
    const result = resampleImage("/nonexistent.png", { filter: "magic" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported resample filter/);
  });

  it("keeps -resampled distinct from -upscaled", () => {
    const input = "/tmp/chart-img-zhipu-s1.png";
    expect(buildResampledPath(input)).toBe("/tmp/chart-img-zhipu-s1-resampled.png");
    expect(buildUpscaledPath(input)).toBe("/tmp/chart-img-zhipu-s1-upscaled.png");
  });

  it("builds the sibling path without a path.join sink (Semgrep taint rule)", () => {
    // Relative input must work too: the asset registry hands over paths that
    // are sometimes repo-relative, and `path.join` here was the one construct
    // the scanner flagged on this file.
    expect(buildResampledPath("content/x/assets/chart.png")).toBe(
      "content/x/assets/chart-resampled.png",
    );
    expect(buildResampledPath("assets/no-ext")).toBe("assets/no-ext-resampled");
  });

  it("refuses an unknown strategy instead of degrading to the SR model", () => {
    // Both render seams spell the dispatch as a ternary, so a typo would take
    // the destructive path silently — that is the one outcome this function
    // must never produce (#1399 review).
    expect(() => autoUpscaleIfNeeded("/tmp/whatever.png", 720, { strategy: "resampl" })).toThrow(
      /unknown strategy/,
    );
  });
});

describe.skipIf(!hasFfmpegTools)("resampleImage — real ffmpeg", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "resample-test-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("upscales 800×600 → 960×720 and keeps every segment inked", () => {
    const input = writeChartLikePng(join(dir, "chart.png"));

    const result = resampleImage(input);

    expect(result.success).toBe(true);
    expect(result.from).toEqual({ width: 800, height: 600 });
    expect(result.to).toEqual({ width: 960, height: 720 });
    expect(result.scale).toBeCloseTo(1.2, 5);
    expect(result.path).toBe(buildResampledPath(input));
    expect(existsSync(result.path)).toBe(true);

    // The failure mode this replaces: a dropped tile leaves a whole band blank.
    const counts = inkPerSegment(result.path);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    for (const [i, c] of counts.entries()) {
      expect(c, `segment ${i} lost its ink`).toBeGreaterThan(mean * 0.5);
    }
  });

  it("refuses an image that is already at or above the target", () => {
    const input = join(dir, "big.png");
    // 900px short side ≥ the 720 default target.
    const png = new PNG({ width: 1200, height: 900 });
    png.data.fill(255);
    writeFileSync(input, PNG.sync.write(png));

    const result = resampleImage(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already 900px/);
  });

  it("autoUpscaleIfNeeded honors {strategy: 'resample'} and never falls back to SR", () => {
    const input = writeChartLikePng(join(dir, "chart-strategy.png"));

    const result = autoUpscaleIfNeeded(input, undefined, { strategy: "resample" });

    expect(result.upscaled).toBe(true);
    expect(result.strategy).toBe("resample");
    expect(result.path).toBe(buildResampledPath(input));
    // The SR output would live at -upscaled; proving it is absent proves the
    // chart never touched Real-ESRGAN.
    expect(existsSync(buildUpscaledPath(input))).toBe(false);
  });
});
