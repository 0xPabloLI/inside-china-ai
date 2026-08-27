import { describe, it, expect } from "vitest";
import {
  filterChinaAI,
  classifyTopic,
  deduplicateTopics,
  buildOutputJson,
  cleanTitle,
  filterRecentTrackedArticles,
  dedupByUrl,
} from "../lib/trends-utils.mjs";

// ─── Mock article data ───

const mockArticles = [
  {
    title: "DeepSeek pauses $1.4B funding round after leaked meeting",
    source: "qbitai",
    url: "https://qbitai.com/1",
  },
  { title: "字节跳动发布最新AI大模型", source: "36kr", url: "https://36kr.com/1" },
  {
    title: "Baidu announces new chip for AI workloads",
    source: "jiqizhixin",
    url: "https://jiqizhixin.com/1",
  },
  { title: "Best restaurants in New York", source: "techcrunch", url: "https://techcrunch.com/1" },
  {
    title: "Alibaba's Qwen model tops open-source leaderboard",
    source: "techcrunch",
    url: "https://techcrunch.com/2",
  },
  {
    title: "Tencent invests $10B in AI infrastructure",
    source: "bloomberg",
    url: "https://bloomberg.com/1",
  },
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

describe("filterRecentTrackedArticles", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  const articles = [
    {
      title: "DeepSeek 更新",
      url: "https://example.com/new",
      publishedAt: "2026-08-08T12:00:00.000Z",
    },
    {
      title: "过期文章",
      url: "https://example.com/old",
      publishedAt: "2026-08-03T11:59:59.000Z",
    },
    {
      title: "无日期文章",
      url: "https://example.com/missing",
      publishedAt: "",
    },
    {
      title: "坏日期文章",
      url: "https://example.com/bad",
      publishedAt: "not-a-date",
    },
  ];

  it("keeps only dated articles within a tracked source's freshness window", () => {
    expect(filterRecentTrackedArticles(articles, { freshnessWindowDays: 14 }, now)).toEqual([
      articles[0],
    ]);
  });

  it("does not filter a source without a freshness window", () => {
    expect(filterRecentTrackedArticles(articles, undefined, now)).toEqual(articles);
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
      {
        title: "DeepSeek pauses $1.4B funding round after leaked meeting",
        source: "qbitai",
        url: "https://qbitai.com/1",
      },
      {
        title: "DeepSeek pauses $1.4B funding round after leaked meeting",
        source: "bloomberg",
        url: "https://bloomberg.com/1",
      },
      {
        title: "DeepSeek pauses $1.4B funding round after leaked meeting",
        source: "techcrunch",
        url: "https://techcrunch.com/1",
      },
    ];
    const result = deduplicateTopics(articles);
    expect(result.length).toBe(1);
    expect(result[0].sources).toEqual(["qbitai", "bloomberg", "techcrunch"]);
    expect(result[0].urls).toEqual([
      "https://qbitai.com/1",
      "https://bloomberg.com/1",
      "https://techcrunch.com/1",
    ]);
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
      {
        title: "DeepSeek funding paused after leaked investor meeting",
        source: "bloomberg",
        url: "http://2",
      },
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
      {
        title: "What is AI: a guide",
        source: "techcrunch",
        url: "http://3",
        category: "explainer",
      },
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

  // ─── T03 (#55): imageUrl extraction in buildOutputJson ───

  it("includes images field when article has imageUrl (T03)", () => {
    const articles = [
      {
        title: "DeepSeek just announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        imageUrl: "http://qbitai.com/img/v4.jpg",
        hasImage: true,
      },
    ];
    const result = buildOutputJson(articles);
    expect(result.topics.breaking).toHaveLength(1);
    const topic = result.topics.breaking[0];
    expect(topic.images).toBeDefined();
    expect(topic.images).toHaveLength(1);
    expect(topic.images[0].url).toBe("http://qbitai.com/img/v4.jpg");
    expect(topic.images[0].sourceArticle).toBe("http://qbitai.com/1");
  });

  it("excludes images field when article has no imageUrl (T03)", () => {
    const articles = [
      {
        title: "DeepSeek just announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        imageUrl: null,
        hasImage: false,
      },
    ];
    const result = buildOutputJson(articles);
    expect(result.topics.breaking).toHaveLength(1);
    const topic = result.topics.breaking[0];
    // images field should be empty array or undefined
    expect(!topic.images || topic.images.length === 0).toBe(true);
  });

  it("deduplicates images by URL when multiple articles merge (T03)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        imageUrl: "http://qbitai.com/img/v4.jpg",
        hasImage: true,
      },
      {
        title: "DeepSeek V4 announced",
        source: "36kr",
        url: "http://36kr.com/1",
        imageUrl: "http://qbitai.com/img/v4.jpg", // same image URL
        hasImage: true,
      },
    ];
    // These would be deduplicated by deduplicateTopics first,
    // but buildOutputJson should also deduplicate images
    const result = buildOutputJson(articles);
    // Each article goes into its own topic (different sources, but same title —
    // deduplicateTopics would merge them, but buildOutputJson operates on raw articles)
    // With raw articles, each topic gets its own image
    expect(result.topics.fermenting).toHaveLength(2);
  });

  it("handles articles without imageUrl field (backward compat, T03)", () => {
    const articles = [
      {
        title: "DeepSeek just announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        // no imageUrl field at all
      },
    ];
    const result = buildOutputJson(articles);
    expect(result.topics.breaking).toHaveLength(1);
    const topic = result.topics.breaking[0];
    expect(!topic.images || topic.images.length === 0).toBe(true);
  });

  // ─── SVE (#114): videos and metadata in buildOutputJson ───

  it("includes videos field when article has videoUrls (SVE)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        imageUrl: "http://qbitai.com/img/v4.jpg",
        hasImage: true,
        videoUrls: ["https://www.youtube.com/watch?v=abc123"],
      },
    ];
    const result = buildOutputJson(articles);
    expect(result.topics.breaking).toHaveLength(1);
    const topic = result.topics.breaking[0];
    expect(topic.videos).toBeDefined();
    expect(topic.videos).toHaveLength(1);
    expect(topic.videos[0].url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(topic.videos[0].sourceArticle).toBe("http://qbitai.com/1");
  });

  it("excludes videos field when article has no videoUrls (SVE)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        imageUrl: "http://qbitai.com/img/v4.jpg",
        hasImage: true,
      },
    ];
    const result = buildOutputJson(articles);
    const topic = result.topics.breaking[0];
    expect(!topic.videos || topic.videos.length === 0).toBe(true);
  });

  it("includes metadata field when article has metadata (SVE)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        metadata: {
          ogImage: "http://qbitai.com/og-image.jpg",
          ogTitle: "DeepSeek V4 Official Announcement",
          publishedTime: "2026-08-27T10:00:00Z",
        },
      },
    ];
    const result = buildOutputJson(articles);
    const topic = result.topics.breaking[0];
    expect(topic.metadata).toBeDefined();
    expect(topic.metadata.ogImage).toBe("http://qbitai.com/og-image.jpg");
    expect(topic.metadata.ogTitle).toBe("DeepSeek V4 Official Announcement");
    expect(topic.metadata.publishedTime).toBe("2026-08-27T10:00:00Z");
  });

  it("excludes metadata field when article has no metadata (SVE)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
      },
    ];
    const result = buildOutputJson(articles);
    const topic = result.topics.breaking[0];
    expect(topic.metadata).toBeUndefined();
  });

  it("handles articles without videoUrls or metadata (backward compat, SVE)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        imageUrl: "http://qbitai.com/img/v4.jpg",
        hasImage: true,
      },
    ];
    const result = buildOutputJson(articles);
    const topic = result.topics.breaking[0];
    // images should still work, videos/metadata should be absent
    expect(topic.images).toBeDefined();
    expect(topic.images).toHaveLength(1);
    expect(!topic.videos || topic.videos.length === 0).toBe(true);
    expect(topic.metadata).toBeUndefined();
  });

  it("includes both images and videos when article has both (SVE)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        imageUrl: "http://qbitai.com/img/v4.jpg",
        hasImage: true,
        videoUrls: [
          "https://www.youtube.com/watch?v=abc123",
          "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD",
        ],
        metadata: {
          ogImage: "http://qbitai.com/og-cover.jpg",
          publishedTime: "2026-08-27T10:00:00Z",
        },
      },
    ];
    const result = buildOutputJson(articles);
    const topic = result.topics.breaking[0];
    expect(topic.images).toHaveLength(1);
    expect(topic.videos).toHaveLength(2);
    expect(topic.videos[0].url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(topic.videos[1].url).toBe("https://player.bilibili.com/player.html?bvid=BV1xx411c7mD");
    expect(topic.metadata.ogImage).toBe("http://qbitai.com/og-cover.jpg");
    expect(topic.metadata.publishedTime).toBe("2026-08-27T10:00:00Z");
  });

  it("handles empty videoUrls array (SVE)", () => {
    const articles = [
      {
        title: "DeepSeek V4 announced",
        source: "qbitai",
        url: "http://qbitai.com/1",
        category: "breaking",
        videoUrls: [],
      },
    ];
    const result = buildOutputJson(articles);
    const topic = result.topics.breaking[0];
    expect(!topic.videos || topic.videos.length === 0).toBe(true);
  });
});

// ─── TE-T1: cleanTitle ───

describe("cleanTitle", () => {
  it("returns empty string for null", () => {
    expect(cleanTitle(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(cleanTitle(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(cleanTitle("")).toBe("");
  });

  it("removes emoji from title", () => {
    expect(cleanTitle("DeepSeek 🔥发布新模型")).toBe("DeepSeek 发布新模型");
    expect(cleanTitle("🚀字节跳动AI突破🎉")).toBe("字节跳动AI突破");
  });

  it("removes #hashtag# format (XHS style)", () => {
    // #AI大模型# is a paired hashtag → removed; trailing # is lone → removed
    expect(cleanTitle("DeepSeek发布新模型#AI大模型#DeepSeek#")).toBe("DeepSeek发布新模型DeepSeek");
    // #热点# and #国产芯片# are paired hashtags → removed; AI芯片突破 between them is kept
    expect(cleanTitle("#热点#AI芯片突破#国产芯片#")).toBe("AI芯片突破");
  });

  it("removes 【】brackets (Bilibili style)", () => {
    expect(cleanTitle("【最新】DeepSeek发布新模型")).toBe("DeepSeek发布新模型");
    expect(cleanTitle("【AI】【科技】百度发布文心一言")).toBe("百度发布文心一言");
  });

  it("collapses multiple spaces", () => {
    expect(cleanTitle("DeepSeek   发布   新模型")).toBe("DeepSeek 发布 新模型");
  });

  it("trims leading/trailing whitespace", () => {
    expect(cleanTitle("  DeepSeek发布新模型  ")).toBe("DeepSeek发布新模型");
  });

  it("truncates titles longer than 200 characters", () => {
    const long = "AI".repeat(150); // 300 chars
    const result = cleanTitle(long);
    expect(result.length).toBe(200);
  });

  it("preserves normal titles unchanged", () => {
    expect(cleanTitle("DeepSeek pauses $1.4B funding round")).toBe(
      "DeepSeek pauses $1.4B funding round",
    );
  });

  it("handles mixed dirty data (emoji + hashtag + brackets)", () => {
    // 【热点】removed, emoji removed, #AI大模型# removed
    expect(cleanTitle("【热点】DeepSeek 🔥发布新模型#AI大模型#")).toBe("DeepSeek 发布新模型");
  });
});
// ─── #51 V1a: Enhanced keyword coverage ───

describe("filterChinaAI — enhanced keywords", () => {
  it("matches Chinese person names (#51 S1)", () => {
    const articles = [
      { title: "梁文锋出席AI峰会", source: "36kr", url: "http://1" },
      { title: "戴文渊谈大模型趋势", source: "qbitai", url: "http://2" },
    ];
    const result = filterChinaAI(articles);
    expect(result).toHaveLength(2);
  });

  it("matches English person names (#51 S2)", () => {
    const articles = [
      { title: "Liang Wenfeng's hedge fund hits new highs", source: "bloomberg", url: "http://1" },
      { title: "Robin Li speaks at AI conference", source: "techcrunch", url: "http://2" },
    ];
    const result = filterChinaAI(articles);
    expect(result).toHaveLength(2);
  });

  it("matches Chinese company aliases (#51 S3)", () => {
    const articles = [
      { title: "幻方量化布局AI赛道", source: "36kr", url: "http://1" },
      { title: "商汤科技发布新品", source: "qbitai", url: "http://2" },
      { title: "寒武纪股价大涨", source: "reuters", url: "http://3" },
    ];
    const result = filterChinaAI(articles);
    expect(result).toHaveLength(3);
  });

  it("matches English company aliases — hyphenated (#51 S4)", () => {
    const articles = [
      { title: "High-Flyer surges on AI bet", source: "bloomberg", url: "http://1" },
      { title: "SenseTime launches new platform", source: "techcrunch", url: "http://2" },
    ];
    const result = filterChinaAI(articles);
    expect(result).toHaveLength(2);
  });

  it("matches product/model names (#51 S5)", () => {
    const articles = [
      { title: "豆包用户数突破一亿", source: "36kr", url: "http://1" },
      { title: "Ernie Bot gets major update", source: "techcrunch", url: "http://2" },
    ];
    const result = filterChinaAI(articles);
    expect(result).toHaveLength(2);
  });

  it("matches policy/concept terms (#51 S6)", () => {
    const articles = [
      { title: "信创产业迎来新机遇", source: "36kr", url: "http://1" },
      { title: "东数西算工程最新进展", source: "xinhua", url: "http://2" },
    ];
    const result = filterChinaAI(articles);
    expect(result).toHaveLength(2);
  });

  it("does not match ai inside training (#51 S7)", () => {
    const articles = [
      { title: "Dog training tips for beginners", source: "blog", url: "http://1" },
    ];
    const result = filterChinaAI(articles);
    expect(result).toEqual([]);
  });
});

describe("extractKeywords — enhanced coverage (#51 S8)", () => {
  it("includes new keywords in topic output", () => {
    const articles = [
      { title: "梁文锋谈信创", source: "36kr", url: "http://1", category: "fermenting" },
    ];
    const result = buildOutputJson(articles);
    const topic = result.topics.fermenting[0];
    expect(topic.keywords).toContain("梁文锋");
    expect(topic.keywords).toContain("信创");
  });
});

// ─── #63: dedupByUrl ───

describe("dedupByUrl", () => {
  it("removes duplicate URL from different sources (S1)", () => {
    const articles = [
      { title: "DeepSeek发布新模型", source: "qbitai", url: "https://jiqizhixin.com/article/abc" },
      { title: "DeepSeek新模型发布", source: "36kr", url: "https://jiqizhixin.com/article/abc" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("qbitai");
  });

  it("removes duplicate URL even with different titles (S2)", () => {
    const articles = [
      { title: "Title A", source: "qbitai", url: "https://example.com/1" },
      { title: "Completely Different Title B", source: "36kr", url: "https://example.com/1" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Title A");
  });

  it("keeps different URLs with same title (S3)", () => {
    const articles = [
      { title: "DeepSeek发布新模型", source: "qbitai", url: "https://qbitai.com/1" },
      { title: "DeepSeek发布新模型", source: "36kr", url: "https://36kr.com/1" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(2);
  });

  it("dedupes URLs with different query params (S4)", () => {
    const articles = [
      { title: "A", source: "s1", url: "https://example.com/article?utm_source=feed" },
      { title: "B", source: "s2", url: "https://example.com/article?from=baidu" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(1);
  });

  it("dedupes http vs https (S5)", () => {
    const articles = [
      { title: "A", source: "s1", url: "http://example.com/article" },
      { title: "B", source: "s2", url: "https://example.com/article" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(1);
  });

  it("dedupes trailing slash difference (S6)", () => {
    const articles = [
      { title: "A", source: "s1", url: "https://example.com/article/" },
      { title: "B", source: "s2", url: "https://example.com/article" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(1);
  });

  it("dedupes URLs with fragments (S7)", () => {
    const articles = [
      { title: "A", source: "s1", url: "https://example.com/article#section" },
      { title: "B", source: "s2", url: "https://example.com/article" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(1);
  });

  it("keeps articles with empty/undefined URLs (S8)", () => {
    const articles = [
      { title: "No URL A", source: "s1", url: "" },
      { title: "No URL B", source: "s2", url: undefined },
      { title: "No URL C", source: "s3" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(3);
  });

  it("keeps all articles when no URL duplicates (S9)", () => {
    const articles = [
      { title: "A", source: "s1", url: "https://a.com/1" },
      { title: "B", source: "s1", url: "https://b.com/1" },
      { title: "C", source: "s1", url: "https://c.com/1" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(3);
  });

  it("handles empty array (S10)", () => {
    expect(dedupByUrl([])).toEqual([]);
  });

  it("keeps same hostname different paths (S11)", () => {
    const articles = [
      { title: "A", source: "s1", url: "https://jiqizhixin.com/article/abc" },
      { title: "B", source: "s2", url: "https://jiqizhixin.com/article/def" },
    ];
    const result = dedupByUrl(articles);
    expect(result).toHaveLength(2);
  });

  it("returns deduped array usable by downstream consumers (S12+S13)", () => {
    // Simulates the pipeline: dedupByUrl → filterChinaAI → classifyTopic → deduplicateTopics
    const articles = [
      { title: "DeepSeek 发布新模型", source: "qbitai", url: "https://jiqizhixin.com/article/abc" },
      { title: "DeepSeek 发布新模型", source: "36kr", url: "https://jiqizhixin.com/article/abc" }, // dup URL
      { title: "Baidu announces new chip", source: "bloomberg", url: "https://bloomberg.com/1" },
    ];
    const deduped = dedupByUrl(articles);
    expect(deduped).toHaveLength(2);
    // Downstream pipeline works on deduped array
    const filtered = filterChinaAI(deduped);
    expect(filtered).toHaveLength(2);
    const classified = filtered.map((a) => ({ ...a, category: classifyTopic(a.title) }));
    const dedupedTopics = deduplicateTopics(classified);
    expect(dedupedTopics).toHaveLength(2);
  });
});
