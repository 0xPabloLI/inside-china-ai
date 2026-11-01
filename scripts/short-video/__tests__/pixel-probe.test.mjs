/**
 * Contract tests for the pixel probes the render suites assert with (#1084).
 *
 * These run in CI — unlike `media-focus-render.test.mjs`, which needs a real
 * `npx remotion still`. That split is the point: the arithmetic that decides
 * WHICH band a still was sampled from is checkable without a renderer, so a
 * broken read is a red CI test instead of a red light only a human who happens
 * to run the render suite will ever see.
 *
 * The regression this file exists for, in one line: a patch centred on
 * `CARD_CENTRE.y` = 648.5 read x 980-1038 instead of 440-498 (the half pixel
 * was swallowed by the `width * y` stride), landed on the frame background, and
 * the ceiling-free classifier called that black "red".
 */
import { describe, it, expect } from "vitest";
import { meanColourInPatch, nearestPaletteColour } from "./pixel-probe.mjs";
import { CANVAS } from "../lib/safe-zones.mjs";

/** PixelBuffer filled with one colour. */
function solidBuffer(width, height, r, g, b) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

/** Frame-shaped buffer at the card background, with one rectangle painted. */
function bufferWithRect(width, height, rect, r, g, b) {
  const buf = solidBuffer(width, height, 10, 10, 20); // #0a0a14
  for (let y = rect.yStart; y < rect.yEnd && y < height; y++) {
    for (let x = rect.xStart; x < rect.xEnd && x < width; x++) {
      const idx = (width * y + x) * 4;
      buf.data[idx] = r;
      buf.data[idx + 1] = g;
      buf.data[idx + 2] = b;
    }
  }
  return buf;
}

// ─── meanColourInPatch ───

describe("meanColourInPatch", () => {
  it("averages the patch at an integer centre", () => {
    const buf = solidBuffer(CANVAS.width, CANVAS.height, 0, 0, 253);
    expect(meanColourInPatch(buf, { x: 470, y: 648 })).toEqual({ r: 0, g: 0, b: 253 });
  });

  it("rounds a fractional centre instead of letting the row stride eat it (#1084)", () => {
    // The evidence-card centre is (470, 648.5) because EVIDENCE_CARD.height is
    // odd. Read as `(width * 648.5 + 470) * 4` the half pixel stays integral
    // and slides the window to x 980-1038; paint that region a different
    // colour and the un-rounded read is unmistakable.
    const buf = bufferWithRect(
      CANVAS.width,
      CANVAS.height,
      { xStart: 980, xEnd: 1039, yStart: 618, yEnd: 677 },
      0,
      255,
      0,
    );
    const fractional = meanColourInPatch(buf, { x: 470, y: 648.5 });
    expect(fractional).toEqual(meanColourInPatch(buf, { x: 470, y: 648 }));
    // …and it reads the card, not the marker: background #0a0a14.
    expect(fractional).toEqual({ r: 10, g: 10, b: 20 });
  });

  it("throws when the patch leaves the frame", () => {
    const buf = solidBuffer(CANVAS.width, CANVAS.height, 1, 2, 3);
    expect(() => meanColourInPatch(buf, { x: 5, y: 500 })).toThrow(/outside the 1080x1920 frame/);
    expect(() => meanColourInPatch(buf, { x: 540, y: 1900 })).toThrow(/outside/);
  });

  it("throws on a non-finite centre", () => {
    const buf = solidBuffer(CANVAS.width, CANVAS.height, 1, 2, 3);
    expect(() => meanColourInPatch(buf, { x: NaN, y: 500 })).toThrow(/centre must be finite/);
    expect(() => meanColourInPatch(buf, { x: 500, y: Infinity })).toThrow(/centre must be finite/);
  });
});

// ─── nearestPaletteColour ───

describe("nearestPaletteColour", () => {
  const palette = {
    red: { r: 255, g: 0, b: 0 },
    lime: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
  };

  it("matches exact entries", () => {
    expect(nearestPaletteColour({ r: 255, g: 0, b: 0 }, palette)).toBe("red");
    expect(nearestPaletteColour({ r: 0, g: 255, b: 0 }, palette)).toBe("lime");
    expect(nearestPaletteColour({ r: 0, g: 0, b: 255 }, palette)).toBe("blue");
  });

  it("tolerates the h264 / canvas round-trip", () => {
    expect(nearestPaletteColour({ r: 252, g: 0, b: 0 }, palette)).toBe("red");
    expect(nearestPaletteColour({ r: 0, g: 0, b: 253 }, palette)).toBe("blue");
  });

  it("returns null for an unrendered frame rather than a band name (#1084)", () => {
    // Black is 65025 (squared) from all three primaries — an exact tie. A
    // closest-wins classifier without a ceiling answers "red" and turns
    // "nothing was drawn" into a confident band report.
    expect(nearestPaletteColour({ r: 0, g: 0, b: 0 }, palette)).toBeNull();
    expect(nearestPaletteColour({ r: 10, g: 10, b: 20 }, palette)).toBeNull(); // #0a0a14 card bg
  });

  it("returns null for a blend between two bands", () => {
    expect(nearestPaletteColour({ r: 128, g: 128, b: 0 }, palette)).toBeNull();
  });

  it("pins the ceiling: 90 away from an entry matches, 96 does not", () => {
    // Deliberate change-detector. The ceiling is what decides whether an
    // unrendered frame can masquerade as a band, so moving it must move this.
    expect(nearestPaletteColour({ r: 165, g: 0, b: 0 }, palette)).toBe("red");
    expect(nearestPaletteColour({ r: 159, g: 0, b: 0 }, palette)).toBeNull(); // exactly 96
  });

  it("refuses an unreadable sample instead of answering null", () => {
    // Same shape as the bug this helper removes: a NaN sample is not a
    // "no match", it is "the read was broken".
    expect(() => nearestPaletteColour({ r: NaN, g: 0, b: 0 }, palette)).toThrow(/r must be finite/);
    expect(() => nearestPaletteColour({ r: 0, g: undefined, b: 0 }, palette)).toThrow(
      /g must be finite/,
    );
  });

  it("refuses a palette entry in the retired tuple shape", () => {
    // [255,0,0] used to be the fixture's shape; silently answering null for it
    // would look exactly like "nothing was rendered".
    expect(() => nearestPaletteColour({ r: 255, g: 0, b: 0 }, { red: [255, 0, 0] })).toThrow(
      /palette\.red\.r must be finite/,
    );
  });
});
