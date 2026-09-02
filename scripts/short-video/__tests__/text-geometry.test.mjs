/**
 * Tests for the pure text-geometry layer (T4).
 *
 * Everything here is browser-independent maths over mocked measurement inputs:
 * ink overhang formulas, annotation coordinate transforms and
 * box containment. The DOM-facing behaviour (fonts.ready,
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
  ANNOTATION_OVERDRAW_BY_TYPE,
  inkOverhangsOfRun,
  cornersFromBBox,
  transformCorner,
  bboxFromCorners,
  toCompositionCoords,
  unionBox,
  boxWithin,
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

describe("ANNOTATION_OVERDRAW_BY_TYPE (decision 70)", () => {
  // The probe measured, under the unified settled-assert口径: circle-around
  // @240 pokes 61.9/59.4px, underline understroke 10.3px, highlight pad 6px.
  // The map must keep covering the measured maxima — tightening below them
  // would fail honest renders, and the probe render test re-measures live.
  it("circle tolerance covers the measured 62px ellipse overdraw with margin", () => {
    expect(ANNOTATION_OVERDRAW_BY_TYPE.circle).toBeGreaterThanOrEqual(62);
    expect(ANNOTATION_OVERDRAW_BY_TYPE.circle).toBeLessThanOrEqual(128);
  });

  it("default tolerance covers underline/highlight without the old global 64", () => {
    expect(ANNOTATION_OVERDRAW_BY_TYPE.default).toBeGreaterThanOrEqual(10.3);
    expect(ANNOTATION_OVERDRAW_BY_TYPE.default).toBeLessThan(ANNOTATION_OVERDRAW_BY_TYPE.circle);
  });

  it("unknown policy falls back through the gate's lookup, never undefined", () => {
    // Mirrors annotationOverdrawOf in text-gate.tsx.
    const overdrawOf = (policy) =>
      ANNOTATION_OVERDRAW_BY_TYPE[policy] ?? ANNOTATION_OVERDRAW_BY_TYPE.default;
    expect(overdrawOf("circle")).toBe(ANNOTATION_OVERDRAW_BY_TYPE.circle);
    expect(overdrawOf("underline")).toBe(ANNOTATION_OVERDRAW_BY_TYPE.default);
    expect(overdrawOf("highlight")).toBe(ANNOTATION_OVERDRAW_BY_TYPE.default);
    expect(overdrawOf("none")).toBe(ANNOTATION_OVERDRAW_BY_TYPE.default);
  });
});
