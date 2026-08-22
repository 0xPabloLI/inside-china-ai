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

// P2: Serial execution enforced by vitest.config.mjs (subprocess project: fileParallelism=false, singleFork=true)
const maybeDescribe = shouldRun ? describe : describe.skip;

maybeDescribe("Focus Detection Smoke Test (real subprocess)", () => {
  let golden;
  let detectFocus;
  let closeFocusDetector;
  let warmupDone = false;

  beforeAll(async () => {
    golden = JSON.parse(await import("fs").then((m) => m.readFileSync(GOLDEN_PATH, "utf8")));
    const mod = await import("../lib/visual-analyzer.mjs");
    detectFocus = mod.detectFocus;
    closeFocusDetector = mod.closeFocusDetector;

    // Warm-up: spawn Python subprocess + load cv2 + Haar Cascade BEFORE timed tests.
    // Cold start can take 5-10s; subsequent calls are <1s.
    // Using the real test image ensures the subprocess is fully initialized.
    console.log("  🔥 Warming up focus detector subprocess...");
    const warmupResult = await detectFocus(TEST_IMAGE);
    warmupDone = warmupResult.status !== undefined;
    console.log(`  🔥 Warm-up done (status: ${warmupResult.status})`);
  }, 30000);

  afterAll(async () => {
    if (closeFocusDetector) {
      await closeFocusDetector();
    }
  });

  test("golden: real-image-ok-no-faces — shanghai-skyline.jpg returns ok with saliency (no real faces)", async () => {
    const testCase = golden.goldenCases.find((c) => c.name === "real-image-ok-no-faces");
    expect(testCase).toBeDefined();

    const t0 = Date.now();
    const result = await detectFocus(TEST_IMAGE);
    const elapsed = Date.now() - t0;

    // Performance: should respond within maxResponseTimeMs (warm-up done, so this is post-cold-start)
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

    // Schema completeness: every protected region has required fields
    // (Haar may produce false positives on building windows/signs — known limitation)
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

    // Create a real (empty) .mp4 file so the extension check works correctly.
    // focus_detector.py checks extension before attempting to read the file.
    const fs = await import("fs");
    if (!fs.existsSync(testCase.input)) {
      fs.writeFileSync(testCase.input, Buffer.alloc(0));
    }

    const result = await detectFocus(testCase.input);

    expect(result.status).toBe(testCase.expectedStatus);
    expect(result.errorCode).toBe(testCase.expectedErrorCode);
  }, 10000);

  test("golden: text-file-unsupported — .txt returns unsupported", async () => {
    const testCase = golden.goldenCases.find((c) => c.name === "text-file-unsupported");
    expect(testCase).toBeDefined();

    // Create a real .txt file so the extension check works correctly.
    const fs = await import("fs");
    if (!fs.existsSync(testCase.input)) {
      fs.writeFileSync(testCase.input, "test text file");
    }

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

  test("performance: real image response time < 5s (post warm-up)", async () => {
    // After warm-up, subsequent calls should be much faster.
    // Target: <1s, but allow up to 5s for CI/loaded machines.
    const t0 = Date.now();
    await detectFocus(TEST_IMAGE);
    const elapsed = Date.now() - t0;

    // Post-warm-up baseline — should be well under cold start time
    console.log(`  ⏱️  Focus detection post-warmup: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  }, 15000);
});
