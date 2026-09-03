/**
 * Tests for the official layout-utils fit-seed kernel (T12).
 *
 * Everything here is browser-independent maths: the browser-side measurement
 * (official measureText / fitText / fitTextOnNLines) is exercised by the
 * render-layer integration tests via the real Chromium runtime; this file
 * locks the seed→candidate decision logic that must never change the gate's
 * outcome.
 *
 * Spec: docs/archive/spec-text-overflow-hardening.md decisions 57/63; tickets §T12
 * (official output only seeds the walk — terminal validation stays the gate).
 */
import { describe, it, expect } from "vitest";
import {
  fitCandidatesFromSeed,
  minContainerSeed,
  officialSeedSize,
  solveSingleLinePxLetterSpacing,
} from "../lib/official-fit-kernel.mjs";
import { fitCandidates } from "../lib/text-slots.mjs";

describe("officialSeedSize (prediction → seed)", () => {
  const band = { minSize: 40, preferredSize: 56 };

  it("falls back to preferredSize for degenerate predictions", () => {
    // fitText returns Infinity on empty text (width 0); NaN from a degenerate
    // measurement; fitTextOnNLines' "nothing fits" sentinel is 0.1.
    expect(officialSeedSize(Number.POSITIVE_INFINITY, band)).toBe(56);
    expect(officialSeedSize(Number.NaN, band)).toBe(56);
    expect(officialSeedSize(0, band)).toBe(56);
    expect(officialSeedSize(-3, band)).toBe(56);
    expect(officialSeedSize(0.1, band)).toBe(40); // finite positive clamps, not falls back
  });

  it("clamps into the contract band (official has no min/max of its own)", () => {
    expect(officialSeedSize(200, band)).toBe(56);
    expect(officialSeedSize(10, band)).toBe(40);
  });

  it("rounds onto the ladder's step grid in both directions", () => {
    // Rounding (not flooring) is deliberate: a seed one step above the true
    // boundary is merely rejected by terminal validation, while a seed below
    // could permanently miss a size the old ladder would have chosen.
    expect(officialSeedSize(52.4, band)).toBe(52);
    expect(officialSeedSize(51.6, band)).toBe(52);
    expect(officialSeedSize(41, band)).toBe(42);
    expect(officialSeedSize(45, band)).toBe(46);
    expect(officialSeedSize(40.1, band)).toBe(40);
  });

  it("honours a non-default step", () => {
    expect(officialSeedSize(45, { minSize: 40, preferredSize: 56, step: 5 })).toBe(45);
  });
});

describe("fitCandidatesFromSeed (reordered lattice)", () => {
  const slots = [
    { preferredSize: 56, minSize: 40 }, // result
    { preferredSize: 240, minSize: 180 }, // bigNumber — the 31-step ladder
    { preferredSize: 22, minSize: 16 }, // badge
  ];

  it("is exactly the old ladder when the seed equals preferredSize", () => {
    for (const slot of slots) {
      expect(fitCandidatesFromSeed(slot)).toEqual(fitCandidates(slot));
    }
  });

  it("keeps every lattice size exactly once for ANY seed (outcome equivalence)", () => {
    // The walk starts at the seed but the candidate SET is unchanged, so the
    // first-fitting-candidate loop still finds the largest fitting lattice
    // size — the official seed can only save probes, never change the choice.
    for (const slot of slots) {
      const full = [...fitCandidates(slot)].sort((a, b) => a - b);
      for (const seed of [slot.preferredSize, slot.preferredSize - 1, 47.3, slot.minSize, 1]) {
        const seeded = [...fitCandidatesFromSeed(slot, seed)].sort((a, b) => a - b);
        expect(seeded).toEqual(full);
      }
    }
  });

  it("orders the region above the seed first, then the seed down to the floor", () => {
    const slot = { preferredSize: 56, minSize: 40 };
    expect(fitCandidatesFromSeed(slot, 50)).toEqual([56, 54, 52, 50, 48, 46, 44, 42, 40]);
    expect(fitCandidatesFromSeed(slot, slot.minSize)).toEqual(fitCandidates(slot));
  });

  it("clamps out-of-band and degenerate seeds to the full ladder", () => {
    const slot = { preferredSize: 56, minSize: 40 };
    expect(fitCandidatesFromSeed(slot, Number.NaN)).toEqual(fitCandidates(slot));
    expect(fitCandidatesFromSeed(slot, 1000)).toEqual(fitCandidates(slot));
  });
});

describe("minContainerSeed (most constraining block wins)", () => {
  it("returns the minimum finite positive seed", () => {
    expect(minContainerSeed([95.2, 30, 120])).toBe(30);
  });

  it("ignores non-finite and non-positive predictions", () => {
    expect(minContainerSeed([Number.POSITIVE_INFINITY, Number.NaN, 0, -1, 48])).toBe(48);
  });

  it("returns null when no container produced a usable prediction", () => {
    expect(minContainerSeed([])).toBeNull();
    expect(minContainerSeed([Number.NaN, 0])).toBeNull();
  });
});

describe("solveSingleLinePxLetterSpacing (fixed-px spacing correction)", () => {
  it("reproduces the official linear formula when spacing is zero", () => {
    // fitText: withinWidth / width@100 * 100
    expect(
      solveSingleLinePxLetterSpacing({ adv100: 50, letterSpacingTotal: 0, maxWidth: 400 }),
    ).toBe(800);
  });

  it("subtracts the font-size-independent spacing contribution", () => {
    // advance scales with size; 12px total spacing does not:
    // width(size) = 50·size/100 + 12 = 400 → size = 776
    expect(
      solveSingleLinePxLetterSpacing({ adv100: 50, letterSpacingTotal: 12, maxWidth: 400 }),
    ).toBeCloseTo(776, 6);
  });

  it("returns null for degenerate inputs", () => {
    expect(
      solveSingleLinePxLetterSpacing({ adv100: 0, letterSpacingTotal: 0, maxWidth: 400 }),
    ).toBeNull();
    expect(
      solveSingleLinePxLetterSpacing({ adv100: 50, letterSpacingTotal: 500, maxWidth: 400 }),
    ).toBeNull(); // spacing alone fills the box
    expect(
      solveSingleLinePxLetterSpacing({ adv100: 50, letterSpacingTotal: Number.NaN, maxWidth: 400 }),
    ).toBeNull();
  });
});
