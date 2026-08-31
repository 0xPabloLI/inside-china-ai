/**
 * Tests for the pure text-geometry layer (T4).
 *
 * Everything here is browser-independent maths over mocked measurement inputs:
 * ink overhang formulas, annotation coordinate transforms, box containment and
 * the multi-field shrink orchestration. The DOM-facing behaviour (fonts.ready,
 * annotation mount timing, scroll/client overflow) lives in the render-layer
 * integration tests (text-gate-render.test.mjs).
 *
 * Spec: spec-text-overflow-hardening.md § T4 Implementation Refinement,
 * decisions 19–22, 28–33.
 */
import { describe, it, expect } from "vitest";
import {
  EPS,
  TextFitError,
  inkOverhangsOfRun,
  cornersFromBBox,
  transformCorner,
  bboxFromCorners,
  toCompositionCoords,
  unionBox,
  boxWithin,
  fitGroup,
} from "../lib/text-geometry.mjs";

describe("EPS", () => {
  it("locks the shared sub-pixel tolerance at 0.5px", () => {
    expect(EPS).toBe(0.5);
  });
});

describe("TextFitError", () => {
  it("carries the machine-readable structure on its fields", () => {
    const err = new TextFitError({
      sceneId: "s9",
      slotId: "narrative.media-overlay.result",
      field: "result",
      measured: { width: 900, height: 70 },
      available: { width: 756, height: null },
      fontSize: 40,
      inkPad: { left: 0, right: 3, top: 0, bottom: 0 },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TextFitError");
    expect(err.sceneId).toBe("s9");
    expect(err.slotId).toBe("narrative.media-overlay.result");
    expect(err.field).toBe("result");
    expect(err.measured).toEqual({ width: 900, height: 70 });
    expect(err.available).toEqual({ width: 756, height: null });
    expect(err.fontSize).toBe(40);
    expect(err.inkPad).toEqual({ left: 0, right: 3, top: 0, bottom: 0 });
  });

  it("puts the JSON payload on the first line of the message", () => {
    // Remotion's cancelRender surfaces only the message's first line to the
    // renderStill caller, so the payload must live there, parseable as JSON.
    const err = new TextFitError({
      reason: "fit-bottom",
      sceneId: "s2",
      slotId: "hook.hero-center.bigNumber",
      field: "bigNumber",
      measured: { width: 900, height: 300 },
      available: { width: 820, height: null },
      fontSize: 180,
      inkPad: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    const firstLine = err.message.split("\n")[0];
    const payload = JSON.parse(firstLine.slice("[TextFitError] ".length));
    expect(payload.reason).toBe("fit-bottom");
    expect(payload.slotId).toBe("hook.hero-center.bigNumber");
    expect(payload.fontSize).toBe(180);
  });
});

describe("ink-bound formula A (per direction, per run)", () => {
  // Regression anchor from the handoff: italic serif "f" paints left of its
  // origin. The old `-actualBoundingBoxLeft` formula clamps that to 0 and
  // misses the overhang; `max(0, actualBoundingBoxLeft)` catches it.
  const italicF = {
    width: 20, // advance width
    actualBoundingBoxLeft: 4.2,
    actualBoundingBoxRight: 22.5,
    actualBoundingBoxAscent: 60,
    actualBoundingBoxDescent: 12,
    fontBoundingBoxAscent: 55,
    fontBoundingBoxDescent: 11,
  };

  it("reports left overhang that the old formula misses", () => {
    const overhangs = inkOverhangsOfRun(italicF);
    expect(overhangs.left).toBeCloseTo(4.2, 5);

    // The old formula, kept here only to prove it is wrong on this input:
    const oldFormula = Math.max(0, -italicF.actualBoundingBoxLeft);
    expect(oldFormula).toBe(0); // false green — exactly the F9 regression
  });

  it("reports right overhang beyond the advance width", () => {
    const overhangs = inkOverhangsOfRun(italicF);
    expect(overhangs.right).toBeCloseTo(2.5, 5);
  });

  it("reports top and bottom overhang against the font box", () => {
    const overhangs = inkOverhangsOfRun(italicF);
    expect(overhangs.top).toBeCloseTo(5, 5);
    expect(overhangs.bottom).toBeCloseTo(1, 5);
  });

  it("clamps every direction at zero when ink stays inside", () => {
    const overhangs = inkOverhangsOfRun({
      width: 100,
      actualBoundingBoxLeft: -1, // some engines report a negative left bearing
      actualBoundingBoxRight: 98,
      actualBoundingBoxAscent: 40,
      actualBoundingBoxDescent: 9,
      fontBoundingBoxAscent: 45,
      fontBoundingBoxDescent: 10,
    });
    expect(overhangs).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it("reports zero top/bottom when the font box is unavailable (never NaN)", () => {
    const overhangs = inkOverhangsOfRun({
      width: 50,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 50,
      actualBoundingBoxAscent: 30,
      actualBoundingBoxDescent: 8,
      // fontBoundingBoxAscent/Descent intentionally absent (Firefox)
    });
    expect(overhangs.top).toBe(0);
    expect(overhangs.bottom).toBe(0);
  });
});

describe("annotation coordinate transform", () => {
  it("expands a bbox into its four corners", () => {
    expect(cornersFromBBox({ x: 10, y: 20, width: 100, height: 50 })).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]);
  });

  it("applies a screen CTM (translate + scale) to a corner", () => {
    // ctm = scale(2) translate(5, 7) → x' = 2x + 10, y' = 2y + 14
    const ctm = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 14 };
    expect(transformCorner({ x: 3, y: 4 }, ctm)).toEqual({ x: 16, y: 22 });
  });

  it("handles rotation in the CTM", () => {
    // 90° rotation: (x, y) → (-y, x)
    const ctm = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };
    expect(transformCorner({ x: 5, y: 3 }, ctm)).toEqual({ x: -3, y: 5 });
  });

  it("derives an axis-aligned box from transformed corners", () => {
    const corners = [
      { x: 0, y: 10 },
      { x: 20, y: 0 },
      { x: 30, y: 25 },
      { x: -5, y: 15 },
    ];
    expect(bboxFromCorners(corners)).toEqual({ x: -5, y: 0, width: 35, height: 25 });
  });

  it("divides screen corners by the current scale to reach composition coords", () => {
    const corners = [
      { x: 20, y: 40 },
      { x: 120, y: 40 },
    ];
    expect(toCompositionCoords(corners, 2)).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
    ]);
  });

  it("is identity at scale 1 (headless render viewport = composition)", () => {
    const corners = [{ x: 60, y: 220 }];
    expect(toCompositionCoords(corners, 1)).toEqual([{ x: 60, y: 220 }]);
  });
});

describe("box containment with EPS", () => {
  const outer = { x: 60, y: 220, width: 820, height: 300 };

  it("passes a box strictly inside", () => {
    expect(boxWithin({ x: 100, y: 300, width: 200, height: 50 }, outer)).toBe(true);
  });

  it("absorbs sub-pixel overshoot up to EPS", () => {
    expect(boxWithin({ x: 60 - 0.3, y: 220, width: 820 + 0.4, height: 300 }, outer)).toBe(true);
  });

  it("rejects overshoot beyond EPS", () => {
    expect(boxWithin({ x: 60, y: 220, width: 820 + 0.6, height: 300 }, outer)).toBe(false);
    expect(boxWithin({ x: 59.4, y: 220, width: 100, height: 50 }, outer)).toBe(false);
  });

  it("unions several boxes into one AABB", () => {
    expect(
      unionBox([
        { x: 10, y: 20, width: 30, height: 40 },
        { x: 0, y: 10, width: 10, height: 100 },
      ]),
    ).toEqual({ x: 0, y: 10, width: 40, height: 100 });
  });
});

describe("fitGroup (multi-field shrink orchestration)", () => {
  // Deterministic measure oracle: height = size * 1.2, width proportional to
  // size. `textLen` simulates copy length; width = size * textLen * 0.6.
  const makeField = (slotId, field, { textLen, priority, preferred, min }) => ({
    slotId,
    field,
    preferredSize: preferred,
    minSize: min,
    shrinkPriority: priority,
    measure: (fontSize) => ({ width: fontSize * textLen * 0.6, height: fontSize * 1.2 }),
  });

  it("keeps every field at its preferred size when everything fits", () => {
    const result = fitGroup({
      fields: [
        makeField("narrative.media-overlay.result", "result", {
          textLen: 5,
          priority: 40,
          preferred: 56,
          min: 40,
        }),
      ],
      maxWidth: 756,
      maxHeight: 400,
      sceneId: "s1",
    });
    expect(result.fontSizes["narrative.media-overlay.result"]).toBe(56);
  });

  it("shrinks a single width-overflowing field until it fits", () => {
    // width = size * 20 * 0.6 = 12*size; 756/12 = 63 → needs size ≤ 63;
    // preferred 56 already fits? Use textLen 30 → 18*size, needs ≤ 42.
    const result = fitGroup({
      fields: [
        makeField("narrative.media-overlay.result", "result", {
          textLen: 30,
          priority: 40,
          preferred: 56,
          min: 40,
        }),
      ],
      maxWidth: 756,
      maxHeight: 400,
      sceneId: "s1",
    });
    const size = result.fontSizes["narrative.media-overlay.result"];
    expect(size).toBeLessThanOrEqual(42);
    expect(size).toBeGreaterThanOrEqual(40);
  });

  it("never goes below minSize — a too-long field fails at the floor", () => {
    expect(() =>
      fitGroup({
        fields: [
          makeField("narrative.media-overlay.result", "result", {
            textLen: 40,
            priority: 40,
            preferred: 56,
            min: 40,
          }),
        ],
        maxWidth: 756,
        maxHeight: 400,
        sceneId: "s1",
      }),
    ).toThrow(TextFitError);

    try {
      fitGroup({
        fields: [
          makeField("narrative.media-overlay.result", "result", {
            textLen: 40,
            priority: 40,
            preferred: 56,
            min: 40,
          }),
        ],
        maxWidth: 756,
        maxHeight: 400,
        sceneId: "s1",
      });
    } catch (err) {
      expect(err.reason).toBe("fit-bottom");
      expect(err.slotId).toBe("narrative.media-overlay.result");
      expect(err.fontSize).toBe(40); // the floor, no ×0.9 escape
      expect(err.measured.width).toBeGreaterThan(756);
    }
  });

  it("shrinks by priority when total height overflows: lowest priority first", () => {
    // Two fields, each 100px tall at preferred → 200 > maxHeight 150.
    // context (priority 10) must shrink first; result (40) stays preferred.
    const result = fitGroup({
      fields: [
        makeField("narrative.media-bottom-bar.context", "context", {
          textLen: 2,
          priority: 10,
          preferred: 83,
          min: 18,
        }),
        makeField("narrative.media-bottom-bar.result", "result", {
          textLen: 2,
          priority: 40,
          preferred: 100,
          min: 40,
        }),
      ],
      maxWidth: 756,
      maxHeight: 150,
      sceneId: "s1",
    });
    expect(result.fontSizes["narrative.media-bottom-bar.result"]).toBe(100);
    expect(result.fontSizes["narrative.media-bottom-bar.context"]).toBeLessThan(83);
    // total height now fits: 100*1.2 + size*1.2 ≤ 150 → size ≤ 20.8... but
    // width must also fit; just assert the invariant: total ≤ maxHeight.
    const total =
      result.fontSizes["narrative.media-bottom-bar.result"] * 1.2 +
      result.fontSizes["narrative.media-bottom-bar.context"] * 1.2;
    expect(total).toBeLessThanOrEqual(150 + EPS);
  });

  it("after each field hits minSize, shrinks proportionally — never below floor", () => {
    // Both at floor heights: 40*1.2 + 18*1.2 = 69.6... make maxHeight force
    // proportional phase: preferred heights 300+300=600, floors 240+216=456,
    // maxHeight 300 → proportional below floor on both → hard fail.
    expect(() =>
      fitGroup({
        fields: [
          makeField("a.hero-center.result", "result", {
            textLen: 1,
            priority: 40,
            preferred: 250,
            min: 200,
          }),
          makeField("a.hero-center.context", "context", {
            textLen: 1,
            priority: 10,
            preferred: 250,
            min: 180,
          }),
        ],
        maxWidth: 4000,
        maxHeight: 300,
        sceneId: "s1",
      }),
    ).toThrow(TextFitError);

    // And when the floors themselves suffice, the gate stops as soon as the
    // total fits — sizes between preferred and floor, never below any floor.
    const result = fitGroup({
      fields: [
        makeField("a.hero-center.result", "result", {
          textLen: 1,
          priority: 40,
          preferred: 250,
          min: 200,
        }),
        makeField("a.hero-center.context", "context", {
          textLen: 1,
          priority: 10,
          preferred: 250,
          min: 180,
        }),
      ],
      maxWidth: 4000,
      maxHeight: 460,
      sceneId: "s1",
    });
    expect(result.fontSizes["a.hero-center.result"]).toBeGreaterThanOrEqual(200);
    expect(result.fontSizes["a.hero-center.result"]).toBeLessThanOrEqual(250);
    expect(result.fontSizes["a.hero-center.context"]).toBeGreaterThanOrEqual(180);
    expect(result.fontSizes["a.hero-center.context"]).toBeLessThanOrEqual(250);
    const total =
      result.fontSizes["a.hero-center.result"] * 1.2 +
      result.fontSizes["a.hero-center.context"] * 1.2;
    expect(total).toBeLessThanOrEqual(460 + EPS);
  });

  it("skips empty fields instead of failing on them", () => {
    const result = fitGroup({
      fields: [
        makeField("narrative.media-overlay.source", "source", {
          textLen: 0,
          priority: 5,
          preferred: 20,
          min: 16,
        }),
        makeField("narrative.media-overlay.result", "result", {
          textLen: 5,
          priority: 40,
          preferred: 56,
          min: 40,
        }),
      ],
      maxWidth: 756,
      maxHeight: 400,
      sceneId: "s1",
    });
    expect(result.fontSizes["narrative.media-overlay.source"]).toBe(20);
    expect(result.fontSizes["narrative.media-overlay.result"]).toBe(56);
  });
});
