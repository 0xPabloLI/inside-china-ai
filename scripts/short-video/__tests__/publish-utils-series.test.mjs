import { describe, it, expect } from "vitest";
import { buildSeriesCaption, buildSeriesPinnedComment } from "../lib/publish-utils.mjs";

const mockMetadata = {
  title: "DeepSeek Distillation Part 1",
  description: "OpenAI accuses DeepSeek of distillation.\n\n#chinaai #deepseek",
  hashtags: ["#chinaai", "#deepseek"],
};

const validSeriesMeta = {
  seriesId: "deepseek-distillation",
  partNumber: 1,
  totalParts: 3,
  nextPartSlug: "deepseek-distillation-pt2",
};

describe("buildSeriesCaption", () => {
  it("appends part info and series hashtag to caption", () => {
    const result = buildSeriesCaption(mockMetadata, validSeriesMeta);
    expect(result).toContain("Part 1/3");
    expect(result).toContain("#deepseekdistillation");
    expect(result).toContain("DeepSeek Distillation Part 1");
  });

  it("truncates to 2200 chars", () => {
    const longMeta = {
      title: "T",
      description: "x".repeat(2300),
    };
    const result = buildSeriesCaption(longMeta, validSeriesMeta);
    expect(result.length).toBeLessThanOrEqual(2200);
    expect(result).toContain("Part 1/3");
  });

  it("handles Part 2 with prevPartSlug", () => {
    const meta = { ...validSeriesMeta, partNumber: 2, prevPartSlug: "pt1", nextPartSlug: "pt3" };
    const result = buildSeriesCaption(mockMetadata, meta);
    expect(result).toContain("Part 2/3");
    expect(result).toContain("#deepseekdistillation");
  });

  it("handles last part (no nextPartSlug)", () => {
    const meta = { ...validSeriesMeta, partNumber: 3, nextPartSlug: null, prevPartSlug: "pt2" };
    const result = buildSeriesCaption(mockMetadata, meta);
    expect(result).toContain("Part 3/3");
    expect(result).toContain("#deepseekdistillation");
  });
});

describe("buildSeriesPinnedComment", () => {
  it("generates pinned comment with next part coming soon", () => {
    const meta = { ...validSeriesMeta, partNumber: 1, totalParts: 3, nextPartSlug: "pt2-url" };
    const result = buildSeriesPinnedComment(meta);
    expect(result).toContain("Part 1/3");
    expect(result).toContain("coming soon");
  });

  it("generates pinned comment with prev part link for Part 2+", () => {
    const meta = {
      seriesId: "deepseek-distillation",
      partNumber: 2,
      totalParts: 3,
      prevPartSlug: "pt1-url",
      nextPartSlug: "pt3-url",
    };
    const result = buildSeriesPinnedComment(meta);
    expect(result).toContain("Part 1");
    expect(result).toContain("pt1-url");
    expect(result).toContain("coming soon");
  });

  it("handles last part (no next)", () => {
    const meta = {
      seriesId: "deepseek-distillation",
      partNumber: 3,
      totalParts: 3,
      prevPartSlug: "pt2-url",
      nextPartSlug: null,
    };
    const result = buildSeriesPinnedComment(meta);
    expect(result).toContain("Part 3/3");
    expect(result).toContain("pt2-url");
    expect(result).not.toContain("coming soon");
  });

  it("handles Part 1 with no prev and no next", () => {
    const meta = {
      seriesId: "test-series",
      partNumber: 1,
      totalParts: 1,
      prevPartSlug: null,
      nextPartSlug: null,
    };
    const result = buildSeriesPinnedComment(meta);
    expect(result).toContain("Part 1/1");
    expect(result).toContain("test-series");
  });
});
