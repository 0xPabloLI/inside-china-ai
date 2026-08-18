/**
 * Smoke test — end-to-end focus detection with real image.
 *
 * This test uses the REAL Python subprocess (not mocked) to verify:
 *   1. focus_detector.py spawns and responds correctly
 *   2. detectFocus() from visual-analyzer.mjs works end-to-end
 *   3. Schema matches golden fixture expectations
 *   4. Response time is within acceptable bounds
 *
 * Golden fixture: __tests__/fixtures/focus-golden.json
 *
 * Skipped if Python/OpenCV not available.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const GOLDEN_PATH = join(__dirname, "fixtures", "focus-golden.json");
// Use process.cwd() as base — vitest runs from project root
const TEST_IMAGE = join(process.cwd(), "scripts/short-video/assets/shanghai-skyline.jpg");

const PYTHON_BIN = join(process.env.HOME || "/Users/pabloli", ".video-tts-env/bin/python3");
const FOCUS_SCRIPT = join(process.cwd(), "scripts/short-video/lib/focus_detector.py");

// Skip entire suite if Python or OpenCV not available
const shouldRun = existsSync(PYTHON_BIN) && existsSync(FOCUS_SCRIPT) && existsSync(TEST_IMAGE);

const maybeDescribe = shouldRun ? describe : describe.skip;

maybeDescribe("Focus Detection Smoke Test (real subprocess)", () => {
  let golden;
  let detectFocus;
  let closeFocusDetector;

  beforeAll(async () => {
    golden = JSON.parse(await import("fs").then((m) => m.readFileSync(GOLDEN_PATH, "utf8")));
    const mod = await import("../lib/visual-analyzer.mjs");
    detectFocus = mod.detectFocus;
    closeFocusDetector = mod.closeFocusDetector;
  });

  afterAll(async () => {
    if (closeFocusDetector) {
      await closeFocusDetector();
    }
  });

  test("golden: real-image-ok — shanghai-skyline.jpg returns ok with faces + saliency", async () => {
    const testCase = golden.goldenCases.find((c) => c.name === "real-image-ok");
    expect(testCase).toBeDefined();

    const t0 = Date.now();
    const result = await detectFocus(TEST_IMAGE);
    const elapsed = Date.now() - t0;

    // Performance: should respond within maxResponseTimeMs
    expect(elapsed).toBeLessThan(testCase.maxResponseTimeMs);

    // Status
    expect(result.status).toBe(testCase.expectedStatus);
    expect(result.errorCode).toBe(testCase.expectedErrorCode);

    // Frame
    expect(result.frame).toBeDefined();
    expect(result.frame.orientation).toBe(testCase.expectedFrameOrientation);

    // Saliency
    expect(result.saliency.available).toBe(testCase.expectedSaliencyAvailable);
    expect(result.saliency.dispersion).toBeGreaterThan(0);
    expect(result.saliency.centroid).toHaveLength(2);

    // Protected regions (faces detected)
    expect(result.protectedRegions.length).toBeGreaterThanOrEqual(testCase.minProtectedRegions);

    // Schema completeness: every protected region has required fields
    for (const r of result.protectedRegions) {
      expect(r).toHaveProperty("rect");
      expect(r.rect).toHaveLength(4);
      expect(r).toHaveProperty("kind");
      expect(r).toHaveProperty("confidence");
      expect(r).toHaveProperty("confidenceKind");
      // Rect values are normalized 0-1
      for (const v of r.rect) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  }, 15000);

  test("golden: nonexistent-image-degraded — returns degraded with cannot_read_image", async () => {
    const testCase = golden.goldenCases.find((c) => c.name === "nonexistent-image-degraded");
    expect(testCase).toBeDefined();

    const result = await detectFocus(testCase.input);

    expect(result.status).toBe(testCase.expectedStatus);
    expect(result.errorCode).toBe(testCase.expectedErrorCode);
    expect(result.frame).toBeNull();
    expect(result.protectedRegions).toEqual([]);
    expect(result.saliency.available).toBe(false);
  }, 10000);

  test("golden: video-unsupported — .mp4 returns unsupported", async () => {
    const testCase = golden.goldenCases.find((c) => c.name === "video-unsupported");
    expect(testCase).toBeDefined();

    const result = await detectFocus(testCase.input);

    expect(result.status).toBe(testCase.expectedStatus);
    expect(result.errorCode).toBe(testCase.expectedErrorCode);
  }, 10000);

  test("golden: text-file-unsupported — .txt returns unsupported", async () => {
    const testCase = golden.goldenCases.find((c) => c.name === "text-file-unsupported");
    expect(testCase).toBeDefined();

    const result = await detectFocus(testCase.input);

    expect(result.status).toBe(testCase.expectedStatus);
    expect(result.errorCode).toBe(testCase.expectedErrorCode);
  }, 10000);

  test("detectFocus NEVER rejects — always resolves", async () => {
    // Even with a completely bogus path, detectFocus should resolve (not reject)
    const result = await detectFocus("/completely/bogus/path/that/does/not/exist.jpg");
    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.protectedRegions).toBeInstanceOf(Array);
  }, 10000);

  test("performance: real image response time < 2s (baseline observation)", async () => {
    const t0 = Date.now();
    await detectFocus(TEST_IMAGE);
    const elapsed = Date.now() - t0;

    // Baseline observation (not a hard gate) — record for trend tracking
    // Target: <1s, Hard limit: <2s
    console.log(`  ⏱️  Focus detection baseline: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(2000);
  }, 15000);
});
