import { describe, it, expect } from "vitest";
import {
  resolveObjectPosition,
  evaluateCropSafety,
  selectBestCrop,
} from "../lib/crop-decision.mjs";

// ─── resolveObjectPosition ───

describe("resolveObjectPosition", () => {
  const TARGET_RATIO = 9 / 16; // 0.5625

  it("VC-18: center focus on 16:9 source → 50% 50%", () => {
    const result = resolveObjectPosition({
      sourceAspect: 16 / 9,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [0.5, 0.5],
    });
    expect(result).toBe("50% 50%");
  });

  it("VC-18: subject left of center (focus x=0.25) → left-shifted position", () => {
    const result = resolveObjectPosition({
      sourceAspect: 16 / 9,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [0.25, 0.5],
    });
    // p = (0.5 - 0.25 * r + 0.5) / (1 - r)
    // r = (16/9) / (9/16) = 256/81 ≈ 3.1605
    // p = (1.0 - 0.25 * 3.1605) / (1 - 3.1605) = (1.0 - 0.7901) / (-2.1605)
    // p = 0.2099 / -2.1605 ≈ -0.0971 → clamp to 0
    // Wait — let me recalculate. The formula from the spec:
    // p = clamp((0.5 - f × r + 0.5) / (1 - r), 0, 1)
    // p = clamp((0.5 - 0.25 * 3.1605 + 0.5) / (1 - 3.1605), 0, 1)
    // p = clamp((1.0 - 0.7901) / (-2.1605), 0, 1)
    // p = clamp(0.2099 / -2.1605, 0, 1)
    // p = clamp(-0.0971, 0, 1) = 0
    // Hmm that doesn't seem right. Let me re-derive.
    // Actually the formula should keep the focus point visible.
    // When source is wider (r > 1), the visible window is 1/r of the source.
    // To keep focus f visible at CSS position p:
    // The source window shown is [p - 0.5/r, p + 0.5/r] (in source space, mapped from CSS)
    // Actually, CSS object-position p means: the point at p in the container corresponds
    // to the point at f in the source. The relationship is:
    // f = (p * (1 - 1/r)) + (1/(2r))
    // Solving for p: p = (f - 1/(2r)) / (1 - 1/r)
    // With r = 3.1605, 1/r = 0.3164
    // p = (0.25 - 0.1582) / (1 - 0.3164) = 0.0918 / 0.6836 = 0.1343
    // So p ≈ 0.1343 → 13%
    expect(result).toMatch(/^\d+% \d+%$/);
    // Parse x percentage
    const xPct = parseFloat(result.split("%")[0]);
    // Should be shifted left (< 50%) but > 0 (subject still visible)
    expect(xPct).toBeLessThan(50);
    expect(xPct).toBeGreaterThan(0);
  });

  it("VC-18: subject right of center (focus x=0.75) → right-shifted position", () => {
    const result = resolveObjectPosition({
      sourceAspect: 16 / 9,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [0.75, 0.5],
    });
    const xPct = parseFloat(result.split("%")[0]);
    expect(xPct).toBeGreaterThan(50);
  });

  it("VC-19: same aspect ratio (9:16 → 9:16) → center", () => {
    const result = resolveObjectPosition({
      sourceAspect: 9 / 16,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [0.3, 0.7],
    });
    expect(result).toBe("center");
  });

  it("VC-19: source narrower than target (portrait in 9:16) → center (no horizontal crop)", () => {
    // Source 3:4 (0.75), target 9:16 (0.5625) — source is wider, actually.
    // Let's use source 1:2 (0.5) which is narrower than 9:16 (0.5625)
    const result = resolveObjectPosition({
      sourceAspect: 0.5,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [0.5, 0.3],
    });
    // Source narrower → vertical crop applies, not horizontal
    // Horizontal position should be center (no horizontal crop needed)
    expect(result).toContain("50%");
  });

  it("VC-20: source taller than target → vertical crop applies", () => {
    // Source 9:20 (0.45), target 9:16 (0.5625)
    // Source is narrower AND taller → vertical crop
    const result = resolveObjectPosition({
      sourceAspect: 0.45,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [0.5, 0.3],
    });
    const yPct = parseFloat(result.split("%")[1]);
    // Subject at y=0.3 → should shift up (yPct < 50)
    expect(yPct).toBeLessThan(50);
  });

  it("clamps to 0% when focus is at extreme left edge", () => {
    const result = resolveObjectPosition({
      sourceAspect: 16 / 9,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [0.0, 0.5],
    });
    expect(result).toMatch(/^0% \d+%$/);
  });

  it("clamps to 100% when focus is at extreme right edge", () => {
    const result = resolveObjectPosition({
      sourceAspect: 16 / 9,
      targetAspect: TARGET_RATIO,
      normalizedFocus: [1.0, 0.5],
    });
    const xPct = parseFloat(result.split("%")[0]);
    expect(xPct).toBe(100);
  });
});

// ─── evaluateCropSafety ───

describe("evaluateCropSafety", () => {
  it("VC-01: no protected regions → safe", () => {
    const result = evaluateCropSafety({
      protectedRegions: [],
      cropRect: [0.3, 0, 0.3375, 1], // center 9:16 crop of 16:9
    });
    expect(result.safe).toBe(true);
    expect(result.violatedRegions).toHaveLength(0);
  });

  it("VC-02: face inside crop rect → safe", () => {
    const face = { rect: [0.4, 0.3, 0.15, 0.3], kind: "face" };
    const result = evaluateCropSafety({
      protectedRegions: [face],
      cropRect: [0.3, 0, 0.3375, 1], // crop from 0.3 to 0.6375
    });
    expect(result.safe).toBe(true);
    expect(result.violatedRegions).toHaveLength(0);
  });

  it("VC-02: face outside crop rect (left) → unsafe", () => {
    const face = { rect: [0.1, 0.4, 0.15, 0.3], kind: "face" };
    const result = evaluateCropSafety({
      protectedRegions: [face],
      cropRect: [0.3, 0, 0.3375, 1], // crop from 0.3 to 0.6375, face starts at 0.1
    });
    expect(result.safe).toBe(false);
    expect(result.violatedRegions).toHaveLength(1);
    expect(result.violatedRegions[0].kind).toBe("face");
  });

  it("face partially overlapping crop edge → unsafe", () => {
    const face = { rect: [0.25, 0.3, 0.15, 0.3], kind: "face" };
    // crop starts at 0.3, face starts at 0.25 → face extends from 0.25 to 0.40, crop starts at 0.3
    const result = evaluateCropSafety({
      protectedRegions: [face],
      cropRect: [0.3, 0, 0.3375, 1],
    });
    expect(result.safe).toBe(false);
  });

  it("multiple faces, one inside one outside → unsafe", () => {
    const face1 = { rect: [0.4, 0.3, 0.15, 0.3], kind: "face" };
    const face2 = { rect: [0.1, 0.3, 0.15, 0.3], kind: "face" };
    const result = evaluateCropSafety({
      protectedRegions: [face1, face2],
      cropRect: [0.3, 0, 0.3375, 1],
    });
    expect(result.safe).toBe(false);
    expect(result.violatedRegions).toHaveLength(1);
  });

  it("empty crop rect → safe (no regions can be violated)", () => {
    const result = evaluateCropSafety({
      protectedRegions: [],
      cropRect: [0, 0, 0.3375, 1],
    });
    expect(result.safe).toBe(true);
  });
});

// ─── selectBestCrop ───

describe("selectBestCrop", () => {
  const SOURCE_ASPECT_16_9 = 16 / 9;
  const TARGET_ASPECT = 9 / 16;

  it("VC-01: center crop safe, no protected regions → safe, cover, center focus", () => {
    const result = selectBestCrop({
      sourceAspect: SOURCE_ASPECT_16_9,
      targetAspect: TARGET_ASPECT,
      protectedRegions: [],
      saliency: { available: true, dispersion: 0.5, centroid: [0.5, 0.5] },
      frame: { width: 1920, height: 1080 },
    });
    expect(result.status).toBe("safe");
    expect(result.policy).toBe("cover");
    expect(result.cropFocus).toEqual({ x: 0.5, y: 0.5 });
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("VC-02: center crop violates face, saliency-anchored crop safe → safe, cover, shifted focus", () => {
    const face = { rect: [0.1, 0.4, 0.15, 0.3], kind: "face" };
    const result = selectBestCrop({
      sourceAspect: SOURCE_ASPECT_16_9,
      targetAspect: TARGET_ASPECT,
      protectedRegions: [face],
      saliency: { available: true, dispersion: 0.5, centroid: [0.2, 0.5] },
      frame: { width: 1920, height: 1080 },
    });
    expect(result.status).toBe("safe");
    expect(result.policy).toBe("cover");
    expect(result.cropFocus).not.toBeNull();
    // cropFocus should be shifted toward the face/saliency (left of center)
    expect(result.cropFocus.x).toBeLessThan(0.5);
  });

  it("VC-03: wide content, all crops unsafe → unsafe, contain, null focus", () => {
    // Two faces at extreme left and right — no single 9:16 crop can contain both
    const face1 = { rect: [0.0, 0.4, 0.1, 0.3], kind: "face" };
    const face2 = { rect: [0.9, 0.4, 0.1, 0.3], kind: "face" };
    const result = selectBestCrop({
      sourceAspect: SOURCE_ASPECT_16_9,
      targetAspect: TARGET_ASPECT,
      protectedRegions: [face1, face2],
      saliency: { available: true, dispersion: 0.3, centroid: [0.5, 0.5] },
      frame: { width: 1920, height: 1080 },
    });
    expect(result.status).toBe("unsafe");
    expect(result.policy).toBe("contain");
    expect(result.cropFocus).toBeNull();
  });

  it("VC-04: degraded focus detection (no saliency, no protected regions) → indeterminate", () => {
    const result = selectBestCrop({
      sourceAspect: SOURCE_ASPECT_16_9,
      targetAspect: TARGET_ASPECT,
      protectedRegions: [],
      saliency: { available: false, dispersion: 0.0, centroid: [0.5, 0.5] },
      frame: { width: 1920, height: 1080 },
    });
    expect(result.status).toBe("indeterminate");
    expect(result.cropFocus).toBeNull();
  });

  it("VC-04: low_information status → indeterminate", () => {
    const result = selectBestCrop({
      sourceAspect: SOURCE_ASPECT_16_9,
      targetAspect: TARGET_ASPECT,
      protectedRegions: [],
      saliency: { available: true, dispersion: 0.005, centroid: [0.5, 0.5] },
      frame: { width: 1920, height: 1080 },
    });
    expect(result.status).toBe("indeterminate");
  });

  it("candidates include center, saliency-anchored, and protected-region-anchored", () => {
    const face = { rect: [0.15, 0.4, 0.15, 0.3], kind: "face" };
    const result = selectBestCrop({
      sourceAspect: SOURCE_ASPECT_16_9,
      targetAspect: TARGET_ASPECT,
      protectedRegions: [face],
      saliency: { available: true, dispersion: 0.5, centroid: [0.2, 0.5] },
      frame: { width: 1920, height: 1080 },
    });
    const anchors = result.candidates.map((c) => c.anchor);
    expect(anchors).toContain("center");
    expect(anchors).toContain("saliency");
    expect(anchors).toContain("protected-0");
  });

  it("portrait source (aspect < target) → indeterminate (no horizontal crop needed)", () => {
    const result = selectBestCrop({
      sourceAspect: 9 / 16, // portrait
      targetAspect: TARGET_ASPECT,
      protectedRegions: [],
      saliency: { available: true, dispersion: 0.5, centroid: [0.5, 0.5] },
      frame: { width: 1080, height: 1920 },
    });
    // Portrait source in 9:16 → no horizontal crop → indeterminate (crop decision not needed)
    expect(result.status).toBe("indeterminate");
  });
});
