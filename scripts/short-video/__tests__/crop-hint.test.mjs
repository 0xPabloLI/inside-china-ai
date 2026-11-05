/**
 * Tests for the Node half of the VLM crop-hint threading (#198 Item 3):
 * saliencyCropHint() derives the hint from Phase 2 focus analysis under the
 * SAME saliency threshold crop-decision.mjs uses, and vlm-cache keys include
 * the hint so a hint change cannot replay center-crop results.
 *
 * #1040: vlm_analyzer.py:simulate_crop consumes the hint as a CSS
 * object-position ratio, so saliencyCropHint must convert the source-space
 * centroid before handing it over — and must agree with selectBestCrop.
 */
import { describe, it, expect, afterAll } from "vitest";
import { saliencyCropHint, selectBestCrop, TARGET_ASPECT } from "../lib/crop-decision.mjs";
import { computeCacheKey } from "../lib/vlm-cache.mjs";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const FRAME = { width: 1920, height: 1080 }; // 16:9 source
const saliency = (centroid, dispersion = 0.5) => ({ available: true, dispersion, centroid });

describe("saliencyCropHint (#1040)", () => {
  it("owns the 9:16 ratio once and takes no unused targetAspect argument", () => {
    expect(TARGET_ASPECT).toBeCloseTo(0.5625, 10);
    expect(saliencyCropHint.length).toBe(1);
  });

  it("converts the source-space centroid into an object-position ratio", () => {
    const hint = saliencyCropHint({ frame: FRAME, saliency: saliency([0.25, 0.6]) });
    // r = 256/81 ≈ 3.1605 → p = (0.25r - 0.5)/(r - 1) ≈ 0.134
    expect(hint.x).toBeCloseTo(0.134, 3);
    expect(hint.y).toBe(0.5); // landscape source has no vertical crop
  });

  it("returns null when dispersion is below the anchor threshold", () => {
    expect(saliencyCropHint({ frame: FRAME, saliency: saliency([0.3, 0.6], 0.001) })).toBeNull();
  });

  it("returns null when saliency is unavailable or malformed", () => {
    expect(
      saliencyCropHint({
        frame: FRAME,
        saliency: { ...saliency([0.3, 0.6]), available: false },
      }),
    ).toBeNull();
    expect(saliencyCropHint({ frame: FRAME, saliency: null })).toBeNull();
    expect(saliencyCropHint(null)).toBeNull();
    expect(
      saliencyCropHint({ frame: FRAME, saliency: { available: true, dispersion: 0.5 } }),
    ).toBeNull();
  });

  it("returns null when frame geometry cannot support the conversion", () => {
    // Passing the raw centroid would feed a source-space f into a consumer
    // that reads it as p — the exact #1040 defect.
    expect(saliencyCropHint({ saliency: saliency([0.3, 0.6]) })).toBeNull();
    expect(
      saliencyCropHint({ frame: { width: 0, height: 1080 }, saliency: saliency([0.3, 0.6]) }),
    ).toBeNull();
    expect(saliencyCropHint({ frame: { width: 1920 }, saliency: saliency([0.3, 0.6]) })).toBeNull();
  });

  it("clamps out-of-range centroids before conversion", () => {
    expect(saliencyCropHint({ frame: FRAME, saliency: saliency([1.4, -0.2]) })).toEqual({
      x: 1,
      y: 0.5,
    });
  });

  it("produces exactly the cropFocus selectBestCrop writes for the same centroid", () => {
    const focus = { frame: FRAME, saliency: saliency([0.3, 0.5]) };
    const hint = saliencyCropHint(focus);
    const decision = selectBestCrop({
      sourceAspect: FRAME.width / FRAME.height,
      targetAspect: TARGET_ASPECT,
      protectedRegions: [],
      saliency: focus.saliency,
      frame: FRAME,
    });
    expect(decision.status).toBe("safe");
    expect(hint.x).toBe(decision.cropFocus.x);
    expect(hint.y).toBe(decision.cropFocus.y);
  });
});

describe("vlm-cache keys include the crop hint", () => {
  const dir = mkdtempSync(join(tmpdir(), "vlm-hint-cache-"));
  const filePath = join(dir, "asset.jpg");
  writeFileSync(filePath, "stable-bytes");

  const base = { filePath, model: "test-model" };

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("same hint → same key; different hint → different key", async () => {
    const k1 = await computeCacheKey({ ...base, cropFocus: { x: 0.3, y: 0.5 } });
    const k2 = await computeCacheKey({ ...base, cropFocus: { x: 0.3, y: 0.5 } });
    const k3 = await computeCacheKey({ ...base, cropFocus: { x: 0.7, y: 0.5 } });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("absent hint and null hash identically (center-crop baseline)", async () => {
    const k1 = await computeCacheKey(base);
    const k2 = await computeCacheKey({ ...base, cropFocus: null });
    expect(k1).toBe(k2);
  });
});
