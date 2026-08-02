import { describe, it, expect } from "vitest";
import {
  filterChinaAI,
  classifyTopic,
  deduplicateTopics,
  buildOutputJson,
} from "../lib/trends-utils.mjs";

// ─── Mock article data ───

const mockArticles = [
  { title: "DeepSeek pauses $1.4B funding round after leaked meeting", source: "qbitai", url: "https://qbitai.com/1" },
  { title: "字节跳动发布最新AI大模型", source: "36kr", url: "https://36kr.com/1" },
  { title: "Baidu announces new chip for AI workloads", source: "jiqizhixin", url: "https://jiqizhixin.com/1" },
  { title: "Best restaurants in New York", source: "techcrunch", url: "https://techcrunch.com/1" },
  { title: "Alibaba's Qwen model tops open-source leaderboard", source: "techcrunch", url: "https://techcrunch.com/2" },
  { title: "Tencent invests $10B in AI infrastructure", source: "bloomberg", url: "https://bloomberg.com/1" },
];

// ─── T5: filterChinaAI ───

describe("filterChinaAI", () => {
  it("filters out non-China-AI articles", () => {
    const result = filterChinaAI(mockArticles);
    expect(result.length).toBe(5);
    expect(result.find((a) => a.title.includes("restaurants"))).toBeUndefined();
  });

  it("keeps articles with China AI keywords", () => {
    const result = filterChinaAI(mockArticles);
    expect(result.find((a) => a.title.includes("DeepSeek"))).toBeDefined();
    expect(result.find((a) => a.title.includes("字节跳动"))).toBeDefined();
    expect(result.find((a) => a.title.includes("Baidu"))).toBeDefined();
    expect(result.find((a) => a.title.includes("Alibaba"))).toBeDefined();
    expect(result.find((a) => a.title.includes("Tencent"))).toBeDefined();
  });

  it("returns empty array when no articles match", () => {
    const nonMatching = [
      { title: "Best pizza in town", source: "36kr", url: "http://x" },
      { title: "Dog training tips", source: "techcrunch", url: "http://y" },
    ];
    const result = filterChinaAI(nonMatching);
    expect(result).toEqual([]);
  });
});

// ─── T7/T10: classifyTopic ───

describe("classifyTopic", () => {
  it("classifies breaking news (Chinese)", () => {
    expect(classifyTopic("DeepSeek突发暂停融资")).toBe("breaking");
  });

  it("classifies breaking news (English)", () => {
    expect(classifyTopic("DeepSeek just announced new model")).toBe("breaking");
    expect(classifyTopic("Leaked meeting reveals DeepSeek strategy")).toBe("breaking");
  });

  it("classifies data/news with numbers", () => {
    expect(classifyTopic("Tencent invests $10B in AI")).toBe("data");
    expect(classifyTopic("DeepSeek估值达到100亿")).toBe("data");
  });

  it("classifies fermenting/analysis", () => {
    expect(classifyTopic("DeepSeek深度解读：背后的战略")).toBe("fermenting");
    expect(classifyTopic("Analysis: DeepSeek's open-source strategy")).toBe("fermenting");
  });

  it("classifies explainer", () => {
    expect(classifyTopic("什么是大模型？AI入门指南")).toBe("explainer");
    expect(classifyTopic("How to use DeepSeek API: A guide")).toBe("explainer");
  });

  it("defaults to fermenting when no keywords match (T10)", () => {
    expect(classifyTopic("DeepSeek releases update")).toBe("fermenting");
  });

  it("prioritizes breaking over data when both match", () => {
    // "突发" = breaking, "$10B" = data → should be breaking
    expect(classifyTopic("突发：Tencent投资$10B")).toBe("breaking");
  });

  it("prioritizes data over fermenting when both match", () => {
    // "$5B" = data, "解读" = fermenting → should be data
    expect(classifyTopic("解读：Tencent $5B 投资")).toBe("data");
  });
});

// ─── T8: deduplicateTopics ───

describe("deduplicateTopics", () => {
  it("merges articles with similar titles (>= 80% similarity)", () => {
    const articles = [
      { title: "DeepSeek pauses $1.4B funding round after leaked meeting", source: "qbitai", url: "https://qbitai.com/1" },
      { title: "DeepSeek pauses $1.4B funding round after leaked meeting", source: "bloomberg", url: "https://bloomberg.com/1" },
      { title: "DeepSeek pauses $1.4B funding round after leaked meeting", source: "techcrunch", url: "https://techcrunch.com/1" },
    ];
    const result = deduplicateTopics(articles);
    expect(result.length).toBe(1);
    expect(result[0].sources).toEqual(["qbitai", "bloomberg", "techcrunch"]);
    expect(result[0].urls).toEqual(["https://qbitai.com/1", "https://bloomberg.com/1", "https://techcrunch.com/1"]);
  });

  it("keeps articles with different titles", () => {
    const articles = [
      { title: "DeepSeek pauses funding", source: "qbitai", url: "http://1" },
      { title: "Baidu announces new chip", source: "36kr", url: "http://2" },
    ];
    const result = deduplicateTopics(articles);
    expect(result.length).toBe(2);
  });

  it("handles slight variations in title", () => {
    const articles = [
      { title: "DeepSeek pauses $1.4B funding round", source: "qbitai", url: "http://1" },
      { title: "DeepSeek pauses 1.4 billion funding round", source: "bloomberg", url: "http://2" },
    ];
    // These have >80% word overlap, should merge
    const result = deduplicateTopics(articles);
    expect(result.length).toBe(1);
  });

  it("preserves longer title when merging", () => {
    const articles = [
      { title: "DeepSeek funding paused", source: "qbitai", url: "http://1" },
      { title: "DeepSeek funding paused after leaked investor meeting", source: "bloomberg", url: "http://2" },
    ];
    const result = deduplicateTopics(articles);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("DeepSeek funding paused after leaked investor meeting");
  });
});

// ─── T13: Special characters ───

describe("Special characters handling", () => {
  it("handles titles with quotes", () => {
    const articles = [
      { title: 'DeepSeek "pauses" funding: report', source: "qbitai", url: "http://1" },
    ];
    const classified = articles.map((a) => ({ ...a, category: classifyTopic(a.title) }));
    expect(classified[0].category).toBeTruthy();
  });

  it("handles Chinese punctuation", () => {
    const result = classifyTopic("突发：DeepSeek暂停融资！");
    expect(result).toBe("breaking");
  });
});

// ─── buildOutputJson ───

describe("buildOutputJson", () => {
  it("builds structured output with metadata", () => {
    const articles = [
      { title: "DeepSeek just announced", source: "qbitai", url: "http://1", category: "breaking" },
      { title: "Baidu $5B investment data", source: "36kr", url: "http://2", category: "data" },
      { title: "What is AI: a guide", source: "techcrunch", url: "http://3", category: "explainer" },
    ];
    const result = buildOutputJson(articles);

    expect(result.scrapedAt).toBeTruthy();
    expect(result.totalTopics).toBe(3);
    expect(result.sourceStats).toEqual({ qbitai: 1, "36kr": 1, techcrunch: 1 });
    expect(result.topics.breaking).toHaveLength(1);
    expect(result.topics.data).toHaveLength(1);
    expect(result.topics.explainer).toHaveLength(1);
    expect(result.topics.fermenting).toHaveLength(0);
  });

  it("groups multiple articles in same category", () => {
    const articles = [
      { title: "Breaking 1", source: "qbitai", url: "http://1", category: "breaking" },
      { title: "Breaking 2 just in", source: "36kr", url: "http://2", category: "breaking" },
      { title: "Analysis deep dive", source: "techcrunch", url: "http:3", category: "fermenting" },
    ];
    const result = buildOutputJson(articles);
    expect(result.topics.breaking).toHaveLength(2);
    expect(result.topics.fermenting).toHaveLength(1);
  });

  it("handles empty articles array (T5)", () => {
    const result = buildOutputJson([]);
    expect(result.totalTopics).toBe(0);
    expect(result.topics.breaking).toEqual([]);
    expect(result.topics.fermenting).toEqual([]);
    expect(result.topics.data).toEqual([]);
    expect(result.topics.explainer).toEqual([]);
  });
});
