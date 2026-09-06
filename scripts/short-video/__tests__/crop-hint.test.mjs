/**
 * Tests for the Node half of the VLM crop-hint threading (#198 Item 3):
 * saliencyCropHint() derives the hint from Phase 2 focus analysis under the
 * SAME saliency threshold crop-decision.mjs uses, and vlm-cache keys include
 * the hint so a hint change cannot replay center-crop results.
 */
import { describe, it, expect, afterAll } from "vitest";
import { saliencyCropHint } from "../lib/crop-decision.mjs";
import { computeCacheKey } from "../lib/vlm-cache.mjs";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("saliencyCropHint", () => {
  it("returns the saliency centroid when it would anchor the crop", () => {
    const hint = saliencyCropHint({
      saliency: { available: true, dispersion: 0.5, centroid: [0.3, 0.6] },
    });
    expect(hint).toEqual({ x: 0.3, y: 0.6 });
  });

  it("returns null when dispersion is below the anchor threshold", () => {
    expect(
      saliencyCropHint({
        saliency: { available: true, dispersion: 0.001, centroid: [0.3, 0.6] },
      }),
    ).toBeNull();
  });

  it("returns null when saliency is unavailable or malformed", () => {
    expect(saliencyCropHint({ saliency: { available: false, dispersion: 0.5, centroid: [0.3, 0.6] } })).toBeNull();
    expect(saliencyCropHint({ saliency: null })).toBeNull();
    expect(saliencyCropHint(null)).toBeNull();
    expect(saliencyCropHint({ saliency: { available: true, dispersion: 0.5 } })).toBeNull();
  });

  it("clamps centroid components into [0, 1]", () => {
    const hint = saliencyCropHint({
      saliency: { available: true, dispersion: 0.5, centroid: [1.4, -0.2] },
    });
    expect(hint).toEqual({ x: 1, y: 0 });
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
