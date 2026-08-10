import { describe, it, expect } from "vitest";
import { evaluateQuery, calculateHitRate, categorizeByType, formatReport } from "../eval.mjs";

// ─── evaluateQuery ───

describe("evaluateQuery", () => {
  it("returns hit when expected source is in top-5 results (cross-language)", () => {
    const queryEntry = {
      query: "What did Liang Wenfeng say about AGI?",
      expected_sources: [
        { content_type: "article", source_id: "deepseek-art-of-restraint" },
        { content_type: "source-material", source_id: "deepseek-liang-investor-meeting-research" },
      ],
      notes: "Cross-language",
    };
    const topResults = [
      { content_type: "article", source_id: "deepseek-art-of-restraint", similarity: 0.85 },
      { content_type: "scene-data", source_id: "some-scene", similarity: 0.6 },
    ];
    const result = evaluateQuery(queryEntry, topResults);
    expect(result.hit).toBe(true);
    expect(result.matchedSources).toContain("article:deepseek-art-of-restraint");
  });

  it("returns hit when second expected source matches (entity alias)", () => {
    const queryEntry = {
      query: "梁文锋的融资策略是什么？",
      expected_sources: [{ content_type: "article", source_id: "deepseek-art-of-restraint" }],
      notes: "Entity alias",
    };
    const topResults = [
      { content_type: "scene-data", source_id: "other", similarity: 0.5 },
      { content_type: "article", source_id: "deepseek-art-of-restraint", similarity: 0.7 },
      { content_type: "source-material", source_id: "other2", similarity: 0.4 },
    ];
    const result = evaluateQuery(queryEntry, topResults);
    expect(result.hit).toBe(true);
  });

  it("returns miss when no expected source in top-5 (data point)", () => {
    const queryEntry = {
      query: "DeepSeek funding $45 billion",
      expected_sources: [{ content_type: "article", source_id: "deepseek-art-of-restraint" }],
      notes: "Data point",
    };
    const topResults = [
      { content_type: "scene-data", source_id: "wrong-scene", similarity: 0.6 },
      { content_type: "research", source_id: "wrong-research", similarity: 0.5 },
    ];
    const result = evaluateQuery(queryEntry, topResults);
    expect(result.hit).toBe(false);
    expect(result.matchedSources).toEqual([]);
    expect(result.missedSources).toContain("article:deepseek-art-of-restraint");
  });

  it("returns hit for negative query when results are empty (correct behavior)", () => {
    const queryEntry = {
      query: "How to bake sourdough bread",
      expected_sources: [],
      notes: "Negative: cooking topic not in knowledge base",
    };
    const topResults = [];
    const result = evaluateQuery(queryEntry, topResults);
    expect(result.hit).toBe(true);
    expect(result.matchedSources).toEqual([]);
  });

  it("returns hit for negative query when results have low similarity (< 0.5)", () => {
    const queryEntry = {
      query: "How to bake sourdough bread",
      expected_sources: [],
      notes: "Negative: cooking topic",
    };
    const topResults = [
      { content_type: "tiktok-ref", source_id: "some-tiktok", similarity: 0.43 },
      { content_type: "tiktok-ref", source_id: "another", similarity: 0.4 },
    ];
    const result = evaluateQuery(queryEntry, topResults);
    expect(result.hit).toBe(true); // low similarity = not relevant = correct behavior
  });

  it("returns miss for negative query when false positives with high similarity returned", () => {
    const queryEntry = {
      query: "Best practices for Kubernetes",
      expected_sources: [],
      notes: "Negative: DevOps topic",
    };
    const topResults = [{ content_type: "article", source_id: "some-ai-article", similarity: 0.8 }];
    const result = evaluateQuery(queryEntry, topResults);
    expect(result.hit).toBe(false);
  });

  it("limits matching to top-5 results only", () => {
    const queryEntry = {
      query: "test",
      expected_sources: [{ content_type: "article", source_id: "target" }],
    };
    const topResults = [
      { content_type: "article", source_id: "other1" },
      { content_type: "article", source_id: "other2" },
      { content_type: "article", source_id: "other3" },
      { content_type: "article", source_id: "other4" },
      { content_type: "article", source_id: "other5" },
      // This is result #6 — should not be considered
      { content_type: "article", source_id: "target" },
    ];
    const result = evaluateQuery(queryEntry, topResults);
    expect(result.hit).toBe(false);
  });
});

// ─── calculateHitRate ───

describe("calculateHitRate", () => {
  it("calculates correct hit rate percentage", () => {
    const results = [{ hit: true }, { hit: true }, { hit: false }, { hit: true }, { hit: false }];
    const rate = calculateHitRate(results);
    expect(rate.total).toBe(5);
    expect(rate.hits).toBe(3);
    expect(rate.misses).toBe(2);
    expect(rate.percentage).toBe(60);
  });

  it("returns 100% when all queries hit", () => {
    const results = [{ hit: true }, { hit: true }];
    const rate = calculateHitRate(results);
    expect(rate.percentage).toBe(100);
    expect(rate.passesThreshold).toBe(true);
  });

  it("returns 0% when all queries miss", () => {
    const results = [{ hit: false }, { hit: false }];
    const rate = calculateHitRate(results);
    expect(rate.percentage).toBe(0);
    expect(rate.passesThreshold).toBe(false);
  });

  it("handles empty results gracefully", () => {
    const rate = calculateHitRate([]);
    expect(rate.total).toBe(0);
    expect(rate.percentage).toBe(0);
  });

  it("passes threshold at 80%", () => {
    const results = Array.from({ length: 10 }, (_, i) => ({ hit: i < 8 }));
    const rate = calculateHitRate(results);
    expect(rate.percentage).toBe(80);
    expect(rate.passesThreshold).toBe(true);
  });

  it("fails below 80% threshold", () => {
    const results = Array.from({ length: 10 }, (_, i) => ({ hit: i < 7 }));
    const rate = calculateHitRate(results);
    expect(rate.percentage).toBe(70);
    expect(rate.passesThreshold).toBe(false);
  });
});

// ─── categorizeByType ───

describe("categorizeByType", () => {
  it("groups results by query category", () => {
    const evalResults = [
      { hit: true, category: "cross-language", notes: "English query" },
      { hit: false, category: "cross-language", notes: "Chinese query" },
      { hit: true, category: "entity-alias", notes: "梁文锋" },
      { hit: true, category: "data-point", notes: "$45B" },
      { hit: false, category: "negative", notes: "cooking" },
    ];

    const categories = categorizeByType(evalResults);
    expect(categories).toHaveProperty("cross-language");
    expect(categories).toHaveProperty("entity-alias");
    expect(categories).toHaveProperty("data-point");
    expect(categories).toHaveProperty("negative");
    expect(categories["cross-language"]).toHaveLength(2);
    expect(categories["entity-alias"]).toHaveLength(1);
    expect(categories["data-point"]).toHaveLength(1);
    expect(categories["negative"]).toHaveLength(1);
  });

  it("handles TikTok/methodology category", () => {
    const evalResults = [
      { hit: true, category: "tiktok", notes: "Hook formula" },
      { hit: true, category: "research", notes: "Deep research report" },
    ];
    const categories = categorizeByType(evalResults);
    expect(categories).toHaveProperty("tiktok");
    expect(categories).toHaveProperty("research");
  });

  it("handles uncategorized results", () => {
    const evalResults = [{ hit: true, category: undefined, notes: "Some random notes" }];
    const categories = categorizeByType(evalResults);
    expect(categories).toHaveProperty("other");
    expect(categories.other).toHaveLength(1);
  });
});

// ─── formatReport ───

describe("formatReport", () => {
  it("includes all required sections in the report", () => {
    const evalResults = [
      {
        query: "test query 1",
        hit: true,
        matchedSources: ["article:src1"],
        missedSources: [],
        topSourceIds: ["article:src1"],
        notes: "Cross-language",
      },
      {
        query: "test query 2",
        hit: false,
        matchedSources: [],
        missedSources: ["article:src2"],
        topSourceIds: ["article:wrong"],
        notes: "Data point",
      },
    ];
    const categories = categorizeByType(evalResults);
    const rate = calculateHitRate(evalResults);

    const report = formatReport(evalResults, categories, rate);

    expect(report).toContain("Total queries");
    expect(report).toContain("Hits");
    expect(report).toContain("Misses");
    expect(report).toContain("Hit Rate");
    expect(report).toContain("test query 2"); // missed query listed
    expect(report).toContain("article:src2"); // missed source listed
  });

  it("includes pass/fail status", () => {
    const evalResults = [
      {
        query: "q",
        hit: true,
        matchedSources: [],
        missedSources: [],
        topSourceIds: [],
        notes: "x",
      },
    ];
    const categories = categorizeByType(evalResults);
    const rate = calculateHitRate(evalResults);

    const report = formatReport(evalResults, categories, rate);
    expect(report).toMatch(/PASS|FAIL/);
  });
});
