import { describe, it, expect } from "vitest";
import { relaxGapParams } from "../lib/verify-retry.mjs";

// Spec: relaxGapParams(attempt) → { GAP_THRESHOLD, CHAIN_GAP_FRAMES } or null
// attempt 0 = defaults (0.5, 2)
// attempt 1 = (0.6, 2)
// attempt 2 = (0.7, 1)
// attempt 3+ = null (exhausted)

describe("relaxGapParams — progression", () => {
  it("returns default params at attempt 0", () => {
    const params = relaxGapParams(0);
    expect(params).toEqual({ GAP_THRESHOLD: 0.5, CHAIN_GAP_FRAMES: 2 });
  });

  it("increases GAP_THRESHOLD by 0.1 at attempt 1", () => {
    const params = relaxGapParams(1);
    expect(params).toEqual({ GAP_THRESHOLD: 0.6, CHAIN_GAP_FRAMES: 2 });
  });

  it("reduces CHAIN_GAP_FRAMES to 1 at attempt 2", () => {
    const params = relaxGapParams(2);
    expect(params).toEqual({ GAP_THRESHOLD: 0.7, CHAIN_GAP_FRAMES: 1 });
  });

  it("returns null at attempt 3 (exhausted)", () => {
    expect(relaxGapParams(3)).toBeNull();
  });

  it("returns null for negative attempts", () => {
    expect(relaxGapParams(-1)).toBeNull();
  });
});

describe("relaxGapParams — purity", () => {
  it("is a pure function (same input → same output)", () => {
    const a = relaxGapParams(0);
    const b = relaxGapParams(0);
    expect(a).toEqual(b);
  });
});
