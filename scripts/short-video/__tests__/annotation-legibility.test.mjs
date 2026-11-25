import { describe, expect, it } from "vitest";
import {
  ANNOTATION_BACKGROUND,
  ANNOTATION_LEGIBILITY,
  compositeOver,
  contrastRatio,
  evaluateUnderline,
  parseColor,
  relativeLuminance,
  strokeShare,
} from "../lib/annotation-legibility.mjs";
import { ANNOTATION, COLOR } from "../remotion/src/tokens.ts";

describe("parseColor", () => {
  it("parses #rgb, #rrggbb, rgb() and rgba()", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#4d8bff")).toEqual({ r: 77, g: 139, b: 255, a: 1 });
    expect(parseColor("rgb(10, 10, 20)")).toEqual({ r: 10, g: 10, b: 20, a: 1 });
    expect(parseColor("rgba(245, 158, 11, 0.15)")).toEqual({ r: 245, g: 158, b: 11, a: 0.15 });
  });

  it("rejects unsupported or out-of-range values instead of defaulting to black", () => {
    expect(() => parseColor("blue")).toThrow(/unsupported colour/);
    expect(() => parseColor("rgb(300, 0, 0)")).toThrow(/out of range/);
    expect(() => parseColor("rgba(0, 0, 0, 2)")).toThrow(/alpha out of range/);
    expect(() => parseColor(123)).toThrow(/must be a string/);
  });
});

describe("contrastRatio", () => {
  it("reproduces the WCAG anchors", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("scores the shipped Dispatch Blue against the video canvas", () => {
    expect(contrastRatio("#4d8bff", ANNOTATION_BACKGROUND)).toBeCloseTo(6.05, 1);
  });

  it("composites translucent colours over the background before measuring", () => {
    const marker = parseColor("rgba(245, 158, 11, 0.15)");
    const solid = compositeOver(marker, parseColor(ANNOTATION_BACKGROUND));
    expect(solid.r).toBeCloseTo(45.25, 2);
    expect(solid.g).toBeCloseTo(32.2, 2);
    expect(solid.b).toBeCloseTo(18.65, 2);
    expect(relativeLuminance(marker, ANNOTATION_BACKGROUND)).toBeGreaterThan(
      relativeLuminance(parseColor(ANNOTATION_BACKGROUND)),
    );
  });

  it("accepts parsed colours as well as strings", () => {
    expect(contrastRatio(parseColor("#ffffff"), parseColor("#000000"))).toBeCloseTo(21, 0);
  });
});

describe("strokeShare", () => {
  it("turns pixels into a share of canvas height", () => {
    expect(strokeShare(3, 1920)).toBeCloseTo(0.0015625, 6);
    expect(strokeShare(4, 1920)).toBeCloseTo(0.0020833, 6);
    expect(strokeShare(6, 1080)).toBeCloseTo(0.0055556, 6);
  });

  it("rejects non-positive inputs", () => {
    expect(() => strokeShare(0, 1920)).toThrow(/strokePx/);
    expect(() => strokeShare(3, 0)).toThrow(/canvasHeightPx/);
  });
});

describe("evaluateUnderline", () => {
  it("marks a 3px underline as stroke-only", () => {
    const result = evaluateUnderline({ color: "#4d8bff", strokePx: 3 });
    expect(result.passContrast).toBe(true);
    expect(result.passStroke).toBe(false);
    expect(result.verdict).toBe("stroke");
    expect(result.minStrokePx).toBeCloseTo(3.84, 2);
  });

  it("passes 4px at the floor", () => {
    const result = evaluateUnderline({ color: "#4d8bff", strokePx: 4 });
    expect(result.verdict).toBe("pass");
  });

  it("passes the amber candidate on both floors", () => {
    const result = evaluateUnderline({ color: "#f59e0b", strokePx: 4 });
    expect(result.contrastRatio).toBeGreaterThan(ANNOTATION_LEGIBILITY.minContrast);
    expect(result.verdict).toBe("pass");
  });

  it("fails a low-contrast colour even when the stroke is thick", () => {
    const result = evaluateUnderline({ color: "#1a1a24", strokePx: 8 });
    expect(result.passStroke).toBe(true);
    expect(result.passContrast).toBe(false);
    expect(result.verdict).toBe("contrast");
  });

  it("fails both floors when nothing is legible", () => {
    const result = evaluateUnderline({ color: "#0f0f18", strokePx: 2 });
    expect(result.verdict).toBe("contrast+stroke");
  });
});

describe("shipped underline token", () => {
  it("uses amber at 4px, clearing both legibility floors", () => {
    expect(ANNOTATION.underline.strokeWidth).toBe(4);
    expect(COLOR.amber).toBe("#f59e0b");
    const result = evaluateUnderline({
      color: COLOR.amber,
      strokePx: ANNOTATION.underline.strokeWidth,
    });
    expect(result.verdict).toBe("pass");
    expect(result.strokeShare).toBeGreaterThan(ANNOTATION_LEGIBILITY.minStrokeShare);
    expect(result.contrastRatio).toBeGreaterThan(ANNOTATION_LEGIBILITY.minContrast);
  });
});
