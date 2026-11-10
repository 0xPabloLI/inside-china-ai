/**
 * Three-tier information type scale + empty-field contract (#739).
 *
 * Independent expectations: the bands are the source survey's rules
 * recalculated for 1080×1920 (see lib/type-scale.mjs for the derivation), not
 * values read back from the module under test. The contract invariant
 * ("no fourth size") is checked against every declared design size.
 */
import { describe, it, expect } from "vitest";
import { EMPTY_FIELD, TYPE_TIERS, isEmptyField, tierForSize } from "../lib/type-scale.mjs";
import { READABILITY_TIERS, SLOT_FIELDS } from "../lib/text-slots.mjs";
import { TYPE } from "../remotion/src/tokens.ts";

describe("three-tier type scale", () => {
  it("pins the portrait bands", () => {
    expect(TYPE_TIERS.label).toEqual({ min: 40, max: 48 });
    expect(TYPE_TIERS.supporting).toEqual({ min: 60, max: 110 });
    expect(TYPE_TIERS.hero).toEqual({ min: 150, max: null });
  });

  it("keeps the label band on the #688 readability floors", () => {
    expect(TYPE_TIERS.label.min).toBe(READABILITY_TIERS.metadata);
    expect(TYPE_TIERS.label.max).toBe(READABILITY_TIERS.copy);
  });

  it("anchors the hero floor on the contract's big-number floor", () => {
    expect(TYPE_TIERS.hero.min).toBe(SLOT_FIELDS.bigNumber.minSize);
    // 170 source px × 1080/1280 = 143.4; the contract floor is the rounded-up
    // value, so a hero is never smaller than the source ratio allows.
    expect(TYPE_TIERS.hero.min).toBeGreaterThanOrEqual(Math.ceil((170 * 1080) / 1280));
  });

  it("orders the bands with deliberate gaps between them", () => {
    expect(TYPE_TIERS.label.max).toBeLessThan(TYPE_TIERS.supporting.min);
    expect(TYPE_TIERS.supporting.max).toBeLessThan(TYPE_TIERS.hero.min);
  });

  it("classifies band edges exactly and returns null inside the gaps", () => {
    const cases = [
      [39, null],
      [40, "label"],
      [44, "label"],
      [48, "label"],
      [49, null],
      [59, null],
      [60, "supporting"],
      [80, "supporting"],
      [110, "supporting"],
      [111, null],
      [149, null],
      [150, "hero"],
      [240, "hero"],
      [400, "hero"],
    ];
    for (const [px, tier] of cases) {
      expect(tierForSize(px), `${px}px`).toBe(tier);
    }
  });
});

describe("no fourth size", () => {
  it("every declared design size lands in exactly one band", () => {
    const offenders = [];
    for (const [field, spec] of Object.entries(SLOT_FIELDS)) {
      if (typeof spec.preferredSize !== "number") continue;
      if (tierForSize(spec.preferredSize) === null) {
        offenders.push(`${field}=${spec.preferredSize}`);
      }
    }
    expect(offenders, "declared sizes outside the three tiers").toEqual([]);
  });

  it("covers all three bands with real fields", () => {
    const tiers = new Set(
      Object.values(SLOT_FIELDS)
        .map((spec) => tierForSize(spec.preferredSize))
        .filter(Boolean),
    );
    expect([...tiers].sort()).toEqual(["hero", "label", "supporting"]);
  });
});

describe("empty-field rule", () => {
  it("pins the source threshold as the supporting band's upper bound", () => {
    expect(EMPTY_FIELD.maxObjectPx).toBe(110);
    expect(EMPTY_FIELD.maxObjectPx).toBe(TYPE_TIERS.supporting.max);
    expect(EMPTY_FIELD.minFrames).toBe(45);
  });

  it("governs the five information templates and nothing else", () => {
    expect([...EMPTY_FIELD.visualTypes].sort()).toEqual([
      "context",
      "contrast",
      "data",
      "info-card",
      "stat-reveal",
    ]);
  });

  it("fires only for objects below the threshold that persist past the window", () => {
    expect(isEmptyField({ largestObjectPx: 96, frames: 46 })).toBe(true);
    expect(isEmptyField({ largestObjectPx: 96, frames: 90 })).toBe(true);
    // Persistence must be MORE than 45 frames.
    expect(isEmptyField({ largestObjectPx: 96, frames: 45 })).toBe(false);
    expect(isEmptyField({ largestObjectPx: 96, frames: 30 })).toBe(false);
    // Preflight has no frame count: the whole shot is the window.
    expect(isEmptyField({ largestObjectPx: 96 })).toBe(true);
    expect(isEmptyField({ largestObjectPx: 96, frames: null })).toBe(true);
    // 110 is not "below", and a hero object never fires.
    expect(isEmptyField({ largestObjectPx: 110, frames: 90 })).toBe(false);
    expect(isEmptyField({ largestObjectPx: 120, frames: 90 })).toBe(false);
    expect(isEmptyField({ largestObjectPx: 240, frames: 90 })).toBe(false);
    // Unmeasurable scenes are not defects here.
    expect(isEmptyField({ largestObjectPx: 0, frames: 90 })).toBe(false);
    expect(isEmptyField({ largestObjectPx: null, frames: 90 })).toBe(false);
    expect(isEmptyField({ largestObjectPx: Number.NaN, frames: 90 })).toBe(false);
  });
});

describe("renderer token wiring", () => {
  it("exposes the same objects the Node gate reads (no second copy)", () => {
    expect(TYPE.tiers).toBe(TYPE_TIERS);
    expect(TYPE.emptyField).toBe(EMPTY_FIELD);
  });
});
