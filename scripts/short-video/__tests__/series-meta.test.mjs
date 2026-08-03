import { describe, it, expect } from "vitest";
import { validateSeriesMeta, getSeriesHashtag } from "../lib/series-meta.mjs";

describe("validateSeriesMeta", () => {
  const validMeta = {
    seriesId: "deepseek-distillation",
    partNumber: 1,
    totalParts: 3,
  };

  it("accepts a valid minimal seriesMeta", () => {
    const result = validateSeriesMeta(validMeta);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a valid full seriesMeta", () => {
    const result = validateSeriesMeta({
      ...validMeta,
      prevPartSlug: null,
      nextPartSlug: "deepseek-distillation-pt2",
      hookType: "standalone",
      rewatchElement: "hidden-detail",
      compilationSlug: "deepseek-distillation-full",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing seriesId", () => {
    const { seriesId, ...rest } = validMeta;
    const result = validateSeriesMeta(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("seriesId is required");
  });

  it("rejects non-kebab-case seriesId", () => {
    const result = validateSeriesMeta({ ...validMeta, seriesId: "DeepSeek_Distillation" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("kebab-case"))).toBe(true);
  });

  it("rejects missing partNumber", () => {
    const { partNumber, ...rest } = validMeta;
    const result = validateSeriesMeta(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("partNumber is required");
  });

  it("rejects partNumber > 5", () => {
    const result = validateSeriesMeta({ ...validMeta, partNumber: 6, totalParts: 6 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("1-5"))).toBe(true);
  });

  it("rejects partNumber > totalParts", () => {
    const result = validateSeriesMeta({ ...validMeta, partNumber: 3, totalParts: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("partNumber must be <= totalParts"))).toBe(true);
  });

  it("rejects missing totalParts", () => {
    const { totalParts, ...rest } = validMeta;
    const result = validateSeriesMeta(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("totalParts is required");
  });

  it("rejects totalParts > 5", () => {
    const result = validateSeriesMeta({ ...validMeta, totalParts: 6 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("1-5"))).toBe(true);
  });

  it("rejects invalid hookType", () => {
    const result = validateSeriesMeta({ ...validMeta, hookType: "invalid" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("hookType"))).toBe(true);
  });

  it("rejects null input", () => {
    const result = validateSeriesMeta(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts hookType standalone, recap, cliffhanger-close", () => {
    for (const hookType of ["standalone", "recap", "cliffhanger-close"]) {
      const result = validateSeriesMeta({ ...validMeta, hookType });
      expect(result.valid).toBe(true);
    }
  });
});

describe("getSeriesHashtag", () => {
  it("generates hashtag from seriesId", () => {
    expect(getSeriesHashtag({ seriesId: "deepseek-distillation" })).toBe("#deepseekdistillation");
  });

  it("works with simple id", () => {
    expect(getSeriesHashtag({ seriesId: "huawei-chips" })).toBe("#huaweichips");
  });
});
