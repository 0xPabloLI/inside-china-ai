/**
 * Tests for the evidence capture contract (#758).
 *
 * Pure geometry only — nothing here needs a browser.
 */
import { describe, it, expect } from "vitest";
import {
  CAPTURE_DEFAULTS,
  normalizeCaptureRecipe,
  buildClip,
  buildProvenance,
  compareMeasuredProvenance,
  formatProvenanceBlock,
} from "../lib/evidence-capture.mjs";

const recipe = (over = {}) => ({
  url: "https://example.com/model-card",
  selector: "table",
  ...over,
});

describe("CAPTURE_DEFAULTS", () => {
  it("pins the shared capture defaults", () => {
    expect(CAPTURE_DEFAULTS).toEqual({
      padding: 16,
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 900 },
      waitUntil: "load",
      timeoutMs: 30000,
    });
    expect(Object.isFrozen(CAPTURE_DEFAULTS)).toBe(true);
  });
});

describe("normalizeCaptureRecipe", () => {
  it("fills every default from a minimal entry", () => {
    expect(normalizeCaptureRecipe(recipe(), 7)).toEqual({
      url: "https://example.com/model-card",
      selector: "table",
      padding: 16,
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 900 },
      waitUntil: "load",
      timeoutMs: 30000,
    });
  });

  it("keeps explicit values, including a zero padding", () => {
    const normalized = normalizeCaptureRecipe(
      recipe({
        padding: 0,
        deviceScaleFactor: 3,
        viewport: { width: 1600, height: 1200 },
        waitUntil: "networkidle",
        timeoutMs: 5000,
      }),
      1,
    );
    expect(normalized).toMatchObject({
      padding: 0,
      deviceScaleFactor: 3,
      viewport: { width: 1600, height: 1200 },
      waitUntil: "networkidle",
      timeoutMs: 5000,
    });
  });

  it("returns its own viewport object, so mutating a recipe cannot move the defaults", () => {
    const normalized = normalizeCaptureRecipe(recipe(), 1);
    normalized.viewport.width = 100;
    expect(CAPTURE_DEFAULTS.viewport.width).toBe(1280);
  });

  it("rejects unknown keys instead of silently dropping them", () => {
    // A typo like `selectors` used to be dropped, then the required `selector`
    // check blamed the operator for a field they never wrote.
    expect(() => normalizeCaptureRecipe(recipe({ output: "screenshots/x.png" }), 1)).toThrow(
      /unknown field\(s\): output/,
    );
  });

  it("normalizes a root URL so the redirect guard compares hrefs", () => {
    expect(normalizeCaptureRecipe({ url: "https://example.com", selector: "table" }, 1).url).toBe(
      "https://example.com/",
    );
  });

  it.each([
    ["a non-object entry", null, /must be an object/],
    ["a missing url", { selector: "table" }, /url/],
    ["a non-string url", { url: 42, selector: "table" }, /url/],
    ["a non-http url", { url: "ftp://example.com/x", selector: "table" }, /http\(s\)/],
    ["an unparseable url", { url: "not a url", selector: "table" }, /not a valid URL/],
    ["a blank selector", recipe({ selector: "   " }), /selector/],
    ["a negative padding", recipe({ padding: -1 }), /padding/],
    ["a string padding", recipe({ padding: "16" }), /padding/],
    ["an infinite padding", recipe({ padding: Infinity }), /padding/],
    ["a zero deviceScaleFactor", recipe({ deviceScaleFactor: 0 }), /deviceScaleFactor/],
    ["an infinite deviceScaleFactor", recipe({ deviceScaleFactor: Infinity }), /deviceScaleFactor/],
    ["a zero viewport width", recipe({ viewport: { width: 0, height: 900 } }), /viewport\.width/],
    [
      "a fractional viewport height",
      recipe({ viewport: { width: 1280, height: 900.5 } }),
      /viewport\.height/,
    ],
    ["a viewport without height", recipe({ viewport: { width: 1280 } }), /viewport\.height/],
    ["an unknown waitUntil", recipe({ waitUntil: "soon" }), /waitUntil/],
    ["a zero timeoutMs", recipe({ timeoutMs: 0 }), /timeoutMs/],
    ["a NaN timeoutMs", recipe({ timeoutMs: Number.NaN }), /timeoutMs/],
  ])("rejects %s with a descriptive error", (_label, entry, pattern) => {
    expect(() => normalizeCaptureRecipe(entry, 3)).toThrow(pattern);
  });

  it("names the scene in the error, so a long manifest points at the broken entry", () => {
    expect(() => normalizeCaptureRecipe({ selector: "table" }, 7)).toThrow(/scene 7/);
  });
});

describe("buildClip", () => {
  it("grows the rect by the padding on every edge", () => {
    expect(buildClip({ x: 104, y: 923, w: 681, h: 507 }, 16)).toEqual({
      x: 88,
      y: 907,
      w: 713,
      h: 539,
    });
  });

  it("clamps the origin at the page edge and still contains the rect", () => {
    const rect = { x: 4, y: 8, w: 100, h: 50 };
    const clip = buildClip(rect, 16);
    expect(clip).toEqual({ x: 0, y: 0, w: 132, h: 82 });
    expect(clip.x).toBeLessThanOrEqual(rect.x);
    expect(clip.y).toBeLessThanOrEqual(rect.y);
    expect(clip.x + clip.w).toBeGreaterThanOrEqual(rect.x + rect.w);
    expect(clip.y + clip.h).toBeGreaterThanOrEqual(rect.y + rect.h);
  });

  it("is an identity with zero padding", () => {
    const rect = { x: 10, y: 20, w: 30, h: 40 };
    expect(buildClip(rect, 0)).toEqual(rect);
  });

  it("contains the rect for every offset, including ones the origin clamp touches", () => {
    for (const x of [0, 1, 15, 16, 17, 100]) {
      for (const y of [0, 5, 16, 16.5, 250]) {
        const rect = { x, y, w: 40, h: 30 };
        const clip = buildClip(rect, 16);
        expect(clip.x).toBeLessThanOrEqual(rect.x);
        expect(clip.y).toBeLessThanOrEqual(rect.y);
        expect(clip.x + clip.w).toBeGreaterThanOrEqual(rect.x + rect.w);
        expect(clip.y + clip.h).toBeGreaterThanOrEqual(rect.y + rect.h);
      }
    }
  });

  it("rejects malformed input instead of emitting NaN geometry", () => {
    expect(() => buildClip(null, 16)).toThrow(/rect/);
    expect(() => buildClip({ x: Number.NaN, y: 0, w: 1, h: 1 }, 16)).toThrow(/rect\.x/);
    expect(() => buildClip({ x: 0, y: 0, w: 0, h: 1 }, 16)).toThrow(/w and rect\.h/);
    expect(() => buildClip({ x: 0, y: 0, w: 1, h: 1 }, -1)).toThrow(/padding/);
    expect(() => buildClip({ x: 0, y: 0, w: 1, h: 1 }, Number.NaN)).toThrow(/padding/);
  });
});

describe("buildProvenance", () => {
  const input = () => ({
    sourceUrl: "https://example.com/model-card",
    selector: "table",
    rect: { x: 104, y: 923, w: 681, h: 507 },
    clip: { x: 88, y: 907, w: 713, h: 539 },
    scale: 2,
  });

  it("returns a plain object with exactly the contract keys", () => {
    const provenance = buildProvenance(input());
    expect(provenance).toEqual(input());
    expect(Object.keys(provenance)).toEqual(["sourceUrl", "selector", "rect", "clip", "scale"]);
    expect(Object.getPrototypeOf(provenance)).toBe(Object.prototype);
  });

  it("copies the boxes, so the caller cannot drift the recorded geometry", () => {
    const source = input();
    const provenance = buildProvenance(source);
    source.rect.x = 1;
    source.clip.w = 2;
    expect(provenance.rect.x).toBe(104);
    expect(provenance.clip.w).toBe(713);
  });

  it("rejects a bad scale and a non-finite box", () => {
    expect(() => buildProvenance(null)).toThrow(/sourceUrl/);
    expect(() => buildProvenance({ ...input(), scale: 0 })).toThrow(/scale/);
    expect(() => buildProvenance({ ...input(), scale: Number.NaN })).toThrow(/scale/);
    expect(() =>
      buildProvenance({ ...input(), rect: { x: 0, y: 0, w: Number.NaN, h: 1 } }),
    ).toThrow(/rect\.w/);
    expect(() => buildProvenance({ ...input(), clip: null })).toThrow(/clip/);
    expect(() => buildProvenance({ ...input(), selector: " " })).toThrow(/selector/);
  });
});

describe("compareMeasuredProvenance", () => {
  const base = () => ({
    sourceUrl: "https://example.com/model-card",
    selector: "table",
    rect: { x: 100, y: 200, w: 300, h: 150 },
    clip: { x: 90, y: 190, w: 320, h: 170 },
    scale: 2,
  });

  it("passes identical geometry with no errors", () => {
    expect(compareMeasuredProvenance(base(), base())).toEqual({ ok: true, errors: [] });
  });

  it("absorbs sub-pixel noise inside the tolerance", () => {
    const measured = base();
    measured.rect.x += 0.005;
    measured.clip.w -= 0.009;
    expect(compareMeasuredProvenance(base(), measured)).toEqual({ ok: true, errors: [] });
  });

  it("reports a drift beyond the tolerance, naming declared and measured values", () => {
    const measured = base();
    measured.rect.x = 100.5;
    const result = compareMeasuredProvenance(base(), measured);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("provenance.rect.x");
    expect(result.errors[0]).toContain("100");
    expect(result.errors[0]).toContain("100.5");
  });

  it.each([
    ["sourceUrl", (m) => (m.sourceUrl = "https://other.example/x")],
    ["selector", (m) => (m.selector = "table:nth-of-type(2)")],
    ["rect.x", (m) => (m.rect.x += 5)],
    ["rect.y", (m) => (m.rect.y -= 5)],
    ["rect.w", (m) => (m.rect.w += 5)],
    ["rect.h", (m) => (m.rect.h -= 5)],
    ["clip.x", (m) => (m.clip.x += 5)],
    ["clip.y", (m) => (m.clip.y -= 5)],
    ["clip.w", (m) => (m.clip.w += 5)],
    ["clip.h", (m) => (m.clip.h -= 5)],
    ["scale", (m) => (m.scale = 3)],
  ])("names the drifted %s field", (field, mutate) => {
    const measured = base();
    mutate(measured);
    const result = compareMeasuredProvenance(base(), measured);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes(`provenance.${field}`))).toBe(true);
  });

  it("names every drifted field, not just the first", () => {
    const measured = base();
    measured.rect.x += 5;
    measured.clip.w += 5;
    measured.scale = 3;
    const result = compareMeasuredProvenance(base(), measured);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.join(" ")).toContain("provenance.rect.x");
    expect(result.errors.join(" ")).toContain("provenance.clip.w");
    expect(result.errors.join(" ")).toContain("provenance.scale");
  });

  it("rejects a missing side instead of throwing", () => {
    expect(compareMeasuredProvenance(base(), null)).toEqual({
      ok: false,
      errors: ["measured provenance must be an object, got null"],
    });
    const partial = base();
    delete partial.clip;
    const result = compareMeasuredProvenance(base(), partial);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("provenance.clip.x");
  });
});

describe("formatProvenanceBlock", () => {
  const provenance = () => ({
    sourceUrl: "https://example.com/model-card",
    selector: "table",
    rect: { x: 104, y: 923, w: 681, h: 507 },
    clip: { x: 88, y: 907, w: 713, h: 539 },
    scale: 2,
  });

  it("emits the stable, paste-ready block at the default indent", () => {
    expect(formatProvenanceBlock(provenance())).toBe(
      [
        "      provenance: {",
        '        sourceUrl: "https://example.com/model-card",',
        '        selector: "table",',
        "        rect: { x: 104, y: 923, w: 681, h: 507 },",
        "        clip: { x: 88, y: 907, w: 713, h: 539 },",
        "        scale: 2,",
        "      },",
      ].join("\n"),
    );
  });

  it("uses the caller's indent for the block and nests content two spaces deeper", () => {
    const lines = formatProvenanceBlock(provenance(), "    ").split("\n");
    expect(lines[0]).toBe("    provenance: {");
    expect(lines[1]).toBe('      sourceUrl: "https://example.com/model-card",');
    expect(lines.at(-1)).toBe("    },");
  });

  it("keeps integers as integers and caps float noise at 3 decimals", () => {
    const block = formatProvenanceBlock({
      ...provenance(),
      rect: { x: 104.123456, y: 923, w: 681.0004, h: 507.5 },
      scale: 1.3333333333,
    });
    expect(block).toContain("rect: { x: 104.123, y: 923, w: 681, h: 507.5 },");
    expect(block).toContain("scale: 1.333,");
  });

  it("includes composed only when it is true", () => {
    expect(formatProvenanceBlock(provenance())).not.toContain("composed");
    expect(formatProvenanceBlock({ ...provenance(), composed: false })).not.toContain("composed");
    expect(formatProvenanceBlock({ ...provenance(), composed: true })).toContain(
      "        scale: 2,\n        composed: true,\n      },",
    );
  });

  it.each([
    ["sourceUrl", (p) => delete p.sourceUrl],
    ["selector", (p) => delete p.selector],
    ["scale", (p) => delete p.scale],
    ["rect", (p) => delete p.rect],
    ["clip", (p) => delete p.clip],
    ["a clip that cuts the rect", (p) => (p.clip = { ...p.clip, w: 10 })],
  ])("refuses a provenance with %s instead of printing undefined", (_label, mutate) => {
    const broken = provenance();
    mutate(broken);
    expect(() => formatProvenanceBlock(broken)).toThrow(/provenance is invalid:/);
  });

  it("formats a valid block", () => {
    expect(formatProvenanceBlock(provenance())).toContain(
      'sourceUrl: "https://example.com/model-card"',
    );
    expect(() => formatProvenanceBlock(null)).toThrow(/provenance/);
  });
});
