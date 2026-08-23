import { describe, it, expect } from "vitest";
import { tokenize, computeIDF, bm25Score, bm25PreFilter } from "../lib/bm25.mjs";

describe("tokenize", () => {
  it("splits English by whitespace, lowercases", () => {
    expect(tokenize("DeepSeek FUNDING Round")).toEqual(["deepseek", "funding", "round"]);
  });
  it("splits by punctuation", () => {
    expect(tokenize("DeepSeek, funding; round.")).toEqual(["deepseek", "funding", "round"]);
  });
  it("keeps numbers as whole tokens", () => {
    const t = tokenize("raised 10 billion");
    expect(t).toContain("10");
    expect(t).toContain("billion");
  });
  it("splits Chinese per-character", () => {
    const t = tokenize("DeepSeek 融资");
    expect(t).toContain("deepseek");
    expect(t).toContain("融");
    expect(t).toContain("资");
  });
  it("handles mixed CN-EN", () => {
    const t = tokenize("DeepSeek获得10亿美元融资");
    expect(t).toContain("deepseek");
    expect(t).toContain("10");
    expect(t).toContain("融");
    expect(t).toContain("资");
  });
  it("empty string -> []", () => {
    expect(tokenize("")).toEqual([]);
  });
  it("null -> []", () => {
    expect(tokenize(null)).toEqual([]);
  });
  it("undefined -> []", () => {
    expect(tokenize(undefined)).toEqual([]);
  });
});

describe("computeIDF", () => {
  it("rare term > common term", () => {
    const df = new Map([
      ["deepseek", 1],
      ["the", 10],
    ]);
    expect(computeIDF("deepseek", df, 10)).toBeGreaterThan(computeIDF("the", df, 10));
  });
  it("all docs -> >= 0", () => {
    expect(computeIDF("the", new Map([["the", 10]]), 10)).toBeGreaterThanOrEqual(0);
  });
  it("no docs -> > 0", () => {
    expect(computeIDF("x", new Map(), 10)).toBeGreaterThan(0);
  });
});

describe("bm25Score", () => {
  const df = new Map([
    ["deepseek", 1],
    ["funding", 2],
    ["the", 8],
  ]);
  it("more matches > fewer", () => {
    expect(
      bm25Score(["deepseek", "funding"], ["deepseek", "funding", "the", "round"], df, 10, 10),
    ).toBeGreaterThan(bm25Score(["deepseek", "funding"], ["deepseek", "the", "round"], df, 10, 10));
  });
  it("no match -> 0", () => {
    expect(bm25Score(["deepseek"], ["baidu", "driving"], df, 10, 10)).toBe(0);
  });
  it("empty query -> 0", () => {
    expect(bm25Score([], ["deepseek", "funding"], df, 10, 10)).toBe(0);
  });
});

describe("bm25PreFilter", () => {
  it("truncates to top-K, keyword matches rank higher", () => {
    const r = [
      { chunk_text: "Baidu autonomous driving", similarity: 0.55 },
      { chunk_text: "DeepSeek funding round 10 billion", similarity: 0.65 },
      { chunk_text: "DeepSeek model release", similarity: 0.6 },
      { chunk_text: "Alibaba cloud computing", similarity: 0.52 },
    ];
    const f = bm25PreFilter("DeepSeek funding", r, 2);
    expect(f).toHaveLength(2);
    const t = f.map((x) => x.chunk_text);
    expect(t).toContain("DeepSeek funding round 10 billion");
    expect(t).toContain("DeepSeek model release");
  });
  it("returns all when count<topK", () => {
    expect(
      bm25PreFilter(
        "x",
        [
          { chunk_text: "a", similarity: 0.6 },
          { chunk_text: "b", similarity: 0.5 },
        ],
        10,
      ),
    ).toHaveLength(2);
  });
  it("empty results -> []", () => {
    expect(bm25PreFilter("t", [], 10)).toEqual([]);
  });
  it("empty query preserves order", () => {
    const r = [
      { chunk_text: "A", similarity: 0.65 },
      { chunk_text: "B", similarity: 0.55 },
      { chunk_text: "C", similarity: 0.6 },
    ];
    const f = bm25PreFilter("", r, 2);
    expect(f).toHaveLength(2);
    expect(f[0].chunk_text).toBe("A");
    expect(f[1].chunk_text).toBe("B");
  });
  it("null chunk_text no crash", () => {
    const r = [
      { chunk_text: null, similarity: 0.65 },
      { chunk_text: "DeepSeek funding", similarity: 0.55 },
    ];
    const f = bm25PreFilter("DeepSeek", r, 2);
    expect(f).toHaveLength(2);
    expect(f[0].chunk_text).toBe("DeepSeek funding");
  });
  it("topK=0 -> []", () => {
    expect(bm25PreFilter("t", [{ chunk_text: "t", similarity: 0.65 }], 0)).toEqual([]);
  });
  it("topK>count returns all", () => {
    expect(
      bm25PreFilter(
        "a",
        [
          { chunk_text: "a", similarity: 0.6 },
          { chunk_text: "b", similarity: 0.5 },
        ],
        20,
      ),
    ).toHaveLength(2);
  });
  it("preserves all fields", () => {
    const r = [
      {
        chunk_text: "DeepSeek",
        similarity: 0.65,
        content_type: "article",
        source_id: "s1",
        metadata: { topics: ["ai"] },
      },
    ];
    const f = bm25PreFilter("DeepSeek", r, 10);
    expect(f[0]).toHaveProperty("content_type", "article");
    expect(f[0]).toHaveProperty("source_id", "s1");
    expect(f[0].metadata.topics).toEqual(["ai"]);
  });
  it("mixed CN-EN query", () => {
    const r = [
      { chunk_text: "DeepSeek获得10亿美元融资", similarity: 0.65 },
      { chunk_text: "百度自动驾驶", similarity: 0.55 },
    ];
    const f = bm25PreFilter("DeepSeek 融资", r, 1);
    expect(f).toHaveLength(1);
    expect(f[0].chunk_text).toContain("DeepSeek");
  });
  it("stable sort equal scores", () => {
    const r = [
      { chunk_text: "aaa", similarity: 0.65 },
      { chunk_text: "bbb", similarity: 0.55 },
      { chunk_text: "ccc", similarity: 0.6 },
    ];
    const f = bm25PreFilter("xyz", r, 3);
    expect(f[0].chunk_text).toBe("aaa");
    expect(f[1].chunk_text).toBe("bbb");
    expect(f[2].chunk_text).toBe("ccc");
  });
  it("single result", () => {
    expect(
      bm25PreFilter("DeepSeek", [{ chunk_text: "DeepSeek", similarity: 0.65 }], 10),
    ).toHaveLength(1);
  });
});
