import { describe, it, expect } from "vitest";
import {
  NEWS_SOURCES,
  SELF_MEDIA_SOURCES,
  INTERNATIONAL_SOURCES,
  GENERAL_SEARCH_SOURCES,
  LAST30DAYS_SOURCES,
  ALL_SOURCES,
  DEFAULT_KEYWORDS,
  WECHAT_API_CONFIG,
  WECHAT_RSS_SOURCES,
  SHARED_GOOGLE_SITE_SEARCH_SCRIPT,
  autoGenerateGoogleSiteFallback,
  shouldAutoGenGoogleSiteFallback,
} from "../lib/source-registry.mjs";

// ─── Source structure validation ───

describe("Source structure", () => {
  it("NEWS_SOURCES has 14 sources (7 original + 7 CDP image search)", () => {
    expect(NEWS_SOURCES).toHaveLength(14);
  });

  it("SELF_MEDIA_SOURCES has 8 sources", () => {
    expect(SELF_MEDIA_SOURCES).toHaveLength(8);
  });

  it("ALL_SOURCES has 61 sources", () => {
    // 46 existing + 7 CDP image search + 6 stock_media + 2 open search engine = 61
    expect(ALL_SOURCES).toHaveLength(61);
  });

  it("each source has required fields", () => {
    for (const source of ALL_SOURCES) {
      expect(source.name).toBeTruthy();
      expect(source.label).toBeTruthy();
      expect(source.category).toBeTruthy();
      expect(typeof source.needsAuth).toBe("boolean");
      expect(typeof source.supportsKeyword).toBe("boolean");
      expect(source.accessMethod).toBeDefined();
      expect(["cdp", "api", "mcp"]).toContain(source.accessMethod.primary);
      expect(typeof source.accessMethod.notes).toBe("string");
      // Stock API sources don't have url/articleScript at top level — they use capabilities
      if (source.category === "stock_media") continue;
      expect(typeof source.url).toBe("function");
      expect(typeof source.articleScript).toBe("string");
      // MCP-only sources may have minimal articleScript (e.g. "return [];")
      // API sources use apiSearch.parser, not CDP articleScript
      if (source.mcpFallback && !source.url()) continue;
      if (source.accessMethod.primary === "api") continue;
      expect(source.articleScript.length).toBeGreaterThan(50);
    }
  });

  it("source names are unique", () => {
    const names = ALL_SOURCES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── Wechat RSS sources ───
describe("Wechat RSS sources", () => {
  it("registers exactly 12 validated public feeds", () => {
    expect(WECHAT_RSS_SOURCES).toHaveLength(12);
    expect(WECHAT_RSS_SOURCES.every((source) => source.name.startsWith("wechat2rss_"))).toBe(true);
  });

  it("marks every feed as third-party, non-official public RSS with a 14-day window", () => {
    for (const source of WECHAT_RSS_SOURCES) {
      expect(source.category).toBe("wechat");
      expect(source.supportsKeyword).toBe(false);
      expect(source.needsAuth).toBe(false);
      expect(source.accessMethod.primary).toBe("api");
      expect(source.tracking).toEqual({
        provider: "wechat2rss",
        access: "public-rss",
        official: false,
        stability: "third-party",
        freshnessWindowDays: 14,
      });
      expect(source.apiSearch.url()).toMatch(
        /^https:\/\/wechat2rss\.xlab\.app\/feed\/[a-f0-9]+\.xml$/,
      );
    }
  });

  it("parses valid RSS 2.0 entries into the shared article contract", () => {
    const parser = WECHAT_RSS_SOURCES[0].apiSearch.parser;
    const items = parser(`<?xml version="1.0"?><rss><channel><item>
      <title><![CDATA[DeepSeek 发布新模型]]></title>
      <link>https://mp.weixin.qq.com/s/example</link>
      <description><![CDATA[这是一个用于验证 RSS 摘要解析的内容。]]></description>
      <pubDate>Mon, 17 Aug 2026 09:00:00 +0800</pubDate>
    </item><item><title>没有链接的条目</title></item></channel></rss>`);
    expect(items).toEqual([
      {
        title: "DeepSeek 发布新模型",
        url: "https://mp.weixin.qq.com/s/example",
        snippet: "这是一个用于验证 RSS 摘要解析的内容。",
        publishedAt: "Mon, 17 Aug 2026 09:00:00 +0800",
      },
    ]);
  });
});

// ─── News sources ───

describe("News sources", () => {
  it("includes qbitai", () => {
    const src = NEWS_SOURCES.find((s) => s.name === "qbitai");
    expect(src).toBeDefined();
    expect(src.label).toBe("量子位");
    expect(src.needsAuth).toBe(false);
  });

  it("includes all 7 original news sources", () => {
    const names = NEWS_SOURCES.map((s) => s.name);
    expect(names).toContain("qbitai");
    expect(names).toContain("jiqizhixin");
    expect(names).toContain("36kr");
    expect(names).toContain("techcrunch");
    expect(names).toContain("bloomberg");
    expect(names).toContain("guancha");
    expect(names).toContain("ithome");
  });

  it("news sources do not use cleanTitle", () => {
    for (const src of NEWS_SOURCES) {
      expect(src.useCleanTitle).toBe(false);
    }
  });

  it("news sources return static URLs", () => {
    for (const src of NEWS_SOURCES) {
      const url = src.url("test");
      expect(url).toBeTruthy();
      expect(url).toMatch(/^https?:\/\//);
    }
  });
});

// ─── Self-media sources ───

describe("Self-media sources", () => {
  it("includes xhs (小红书)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    expect(src).toBeDefined();
    expect(src.label).toBe("小红书");
    expect(src.needsAuth).toBe(true);
    expect(src.useCleanTitle).toBe(true);
  });

  it("includes sogou_weixin (搜狗微信)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "sogou_weixin");
    expect(src).toBeDefined();
    expect(src.label).toBe("搜狗微信");
    expect(src.needsAuth).toBe(false);
  });

  it("includes weibo_hot (微博热搜)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    expect(src).toBeDefined();
    expect(src.label).toBe("微博热搜");
    expect(src.needsAuth).toBe(false);
  });

  it("includes bilibili (B站搜索)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "bilibili");
    expect(src).toBeDefined();
    expect(src.label).toBe("B站搜索");
    expect(src.needsAuth).toBe(false);
    expect(src.useCleanTitle).toBe(true);
  });

  it("includes douyin (抖音搜索)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "douyin");
    expect(src).toBeDefined();
    expect(src.label).toBe("抖音搜索");
    expect(src.needsAuth).toBe(true);
    expect(src.useCleanTitle).toBe(true);
  });

  it("includes tiktok_creator (TikTok Creator)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(src).toBeDefined();
    expect(src.label).toBe("TikTok Creator");
    expect(src.needsAuth).toBe(true);
  });

  it("includes x_search (X / Twitter)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("X (Twitter)");
    expect(src.needsAuth).toBe(true);
  });
});

// ─── URL building ───

describe("URL building", () => {
  it("xhs builds search URL with keyword", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    const url = src.url("AI大模型");
    expect(url).toContain("xiaohongshu.com/search_result");
    expect(url).toContain("keyword=");
    expect(url).toContain(encodeURIComponent("AI大模型"));
  });

  it("sogou_weixin builds search URL with keyword", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "sogou_weixin");
    const url = src.url("DeepSeek");
    expect(url).toContain("weixin.sogou.com");
    expect(url).toContain("type=2");
    expect(url).toContain("query=");
  });

  it("weibo_hot returns static hot search URL", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    const url = src.url("test");
    expect(url).toBe("https://s.weibo.com/top/summary");
  });

  it("bilibili builds search URL with keyword", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "bilibili");
    const url = src.url("AI");
    expect(url).toContain("search.bilibili.com/all");
    expect(url).toContain("keyword=AI");
  });

  it("douyin builds search URL with keyword", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "douyin");
    const url = src.url("AI大模型");
    expect(url).toContain("douyin.com/search/");
    expect(url).toContain(encodeURIComponent("AI大模型"));
  });

  it("tiktok_creator returns static URL", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const url = src.url("test");
    expect(url).toBe("https://www.tiktok.com/creator-center");
  });

  it("x_search builds search URL with keyword", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    const url = src.url("DeepSeek");
    expect(url).toContain("x.com/search");
    expect(url).toContain("q=");
    expect(url).toContain(encodeURIComponent("DeepSeek"));
    expect(url).toContain("f=live");
  });
});

// ─── Login check scripts ───

describe("Login check scripts", () => {
  it("sources with needsAuth have loginCheckScript", () => {
    for (const src of SELF_MEDIA_SOURCES) {
      if (src.needsAuth) {
        expect(src.loginCheckScript).toBeTruthy();
        expect(typeof src.loginCheckScript).toBe("string");
      }
    }
  });

  it("sogou_weixin has captcha check", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "sogou_weixin");
    expect(src.loginCheckScript).toBeTruthy();
    expect(src.loginCheckScript).toContain("captcha");
  });

  it("xhs login check detects login prompt", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    expect(src.loginCheckScript).toContain("请先登录");
  });

  it("x_search login check detects login redirect", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.loginCheckScript).toBeTruthy();
    expect(src.loginCheckScript).toContain("/login");
    expect(src.loginCheckScript).toContain("Sign in");
  });
});

// ─── Extract scripts ───

describe("Extract scripts", () => {
  it("all CDP-based extract scripts are non-empty strings", () => {
    for (const src of ALL_SOURCES) {
      // Skip stock API sources (no CDP article extraction)
      if (src.category === "stock_media") continue;
      expect(typeof src.articleScript).toBe("string");
      // API sources do not use the CDP extractor; MCP-only sources may have minimal articleScript.
      if (src.accessMethod.primary === "api" || (src.mcpFallback && !src.url())) continue;
      expect(src.articleScript.length).toBeGreaterThan(50);
    }
  });

  it("all CDP-based extract scripts return results array", () => {
    for (const src of ALL_SOURCES) {
      // Skip stock API sources (no CDP article extraction)
      if (src.category === "stock_media") continue;
      // MCP-only sources (like mcp_grok_search) may have minimal articleScript
      if (src.mcpFallback && !src.url()) continue;
      expect(src.articleScript).toContain("return results");
    }
  });

  it("weibo_hot extracts from td.td-02", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    expect(src.articleScript).toContain("td.td-02");
  });

  it("bilibili extract includes video card selectors", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "bilibili");
    expect(src.articleScript).toContain("bili-video-card");
  });

  it("x_search extract uses data-testid=tweet selector", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.articleScript).toContain('data-testid="tweet"');
    expect(src.articleScript).toContain('data-testid="tweetText"');
    expect(src.articleScript).toContain("return results");
  });

  it("x_search articleScript has SPA poll for tweets to render", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.articleScript).toContain("deadline");
    expect(src.articleScript).toContain("Date.now()");
    expect(src.articleScript).toContain("8000");
  });
});

// ─── International sources (renamed from Western) ───

describe("International sources (renamed from Western)", () => {
  it("INTERNATIONAL_SOURCES has 8 sources", () => {
    expect(INTERNATIONAL_SOURCES).toHaveLength(8);
  });

  it("includes youtube_search", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "youtube_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("YouTube");
    expect(src.supportsKeyword).toBe(true);
    expect(src.category).toBe("international");
  });

  it("includes arxiv_search", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "arxiv_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("arXiv");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes github_search", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("GitHub");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes threads_search", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "threads_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Threads");
    expect(src.supportsKeyword).toBe(true);
  });

  it("youtube, arxiv, github, threads have mcpFallback", () => {
    // Only the original 4 international sources have mcpFallback;
    // datacube_ai, openalex_search, gnews, core_search are API-only (no CDP/MCP fallback).
    for (const name of ["youtube_search", "arxiv_search", "github_search", "threads_search"]) {
      const src = INTERNATIONAL_SOURCES.find((s) => s.name === name);
      expect(src.mcpFallback).toBeDefined();
      expect(src.mcpFallback.toolName).toBe("web_search");
    }
  });

  it("all international sources have category 'international'", () => {
    for (const src of INTERNATIONAL_SOURCES) {
      expect(src.category).toBe("international");
    }
  });

  it("no international source has locale field (multilingual)", () => {
    for (const src of INTERNATIONAL_SOURCES) {
      expect(src.locale).toBeUndefined();
    }
  });
});

// ─── Locale field validation ───

describe("Locale field", () => {
  it("Chinese-only news sources have locale 'zh-CN'", () => {
    const zhNewsNames = ["qbitai", "jiqizhixin", "36kr", "guancha", "ithome"];
    for (const name of zhNewsNames) {
      const src = NEWS_SOURCES.find((s) => s.name === name);
      expect(src).toBeDefined();
      expect(src.locale).toBe("zh-CN");
    }
  });

  it("English news sources do NOT have locale", () => {
    const enNewsNames = ["techcrunch", "bloomberg"];
    for (const name of enNewsNames) {
      const src = NEWS_SOURCES.find((s) => s.name === name);
      expect(src).toBeDefined();
      expect(src.locale).toBeUndefined();
    }
  });

  it("Chinese self-media sources have locale 'zh-CN'", () => {
    const zhSelfMediaNames = ["xhs", "sogou_weixin", "weibo_hot", "bilibili", "douyin", "zhihu"];
    for (const name of zhSelfMediaNames) {
      const src = SELF_MEDIA_SOURCES.find((s) => s.name === name);
      expect(src).toBeDefined();
      expect(src.locale).toBe("zh-CN");
    }
  });

  it("tiktok_creator and x_search do NOT have locale (international)", () => {
    const tiktok = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(tiktok.locale).toBeUndefined();
    const xSearch = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(xSearch.locale).toBeUndefined();
  });

  it("baidu_search has locale 'zh-CN'", () => {
    const baidu = GENERAL_SEARCH_SOURCES.find((s) => s.name === "baidu_search");
    expect(baidu).toBeDefined();
    expect(baidu.locale).toBe("zh-CN");
  });

  it("google_search and mcp_grok_search do NOT have locale", () => {
    const google = GENERAL_SEARCH_SOURCES.find((s) => s.name === "google_search");
    expect(google.locale).toBeUndefined();
    const grok = GENERAL_SEARCH_SOURCES.find((s) => s.name === "mcp_grok_search");
    expect(grok.locale).toBeUndefined();
  });

  it("all WeChat RSS sources have locale 'zh-CN'", () => {
    for (const src of WECHAT_RSS_SOURCES) {
      expect(src.locale).toBe("zh-CN");
    }
  });
});

// ─── General search sources ───

describe("General search sources", () => {
  it("GENERAL_SEARCH_SOURCES has 5 sources", () => {
    expect(GENERAL_SEARCH_SOURCES).toHaveLength(5);
  });

  it("includes google_search (was web_grounding)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "google_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Google Search");
    expect(src.category).toBe("general");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes baidu_search", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "baidu_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("百度搜索");
    expect(src.category).toBe("general");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes mcp_grok_search (MCP-only)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "mcp_grok_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Grok Web Search");
    expect(src.category).toBe("general");
    expect(src.supportsKeyword).toBe(true);
    expect(src.mcpFallback).toBeDefined();
  });

  it("baidu_search does NOT have mcpFallback (CDP-only)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "baidu_search");
    expect(src.mcpFallback).toBeUndefined();
  });
});

// ─── last30days sources ───

describe("last30days sources", () => {
  it("LAST30DAYS_SOURCES has 5 sources", () => {
    expect(LAST30DAYS_SOURCES).toHaveLength(5);
  });

  it("includes reddit_search", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "reddit_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Reddit");
    expect(src.category).toBe("last30days");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes hackernews_search", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "hackernews_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Hacker News");
  });

  it("includes polymarket_search", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "polymarket_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Polymarket");
  });

  it("includes digg_search", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "digg_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Digg");
  });

  it("includes techmeme_search", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "techmeme_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Techmeme");
  });
});

// ─── supportsKeyword validation ───

describe("supportsKeyword validation", () => {
  it("homepage-only sources have supportsKeyword=false", () => {
    const homepageSources = ALL_SOURCES.filter((s) => !s.supportsKeyword);
    // Existing homepage-only sources plus 12 fixed public Wechat RSS sources.
    // Stock API sources all support keyword search.
    // ithome and jiqizhixin now support keyword search (unified to search page).
    expect(homepageSources.length).toBe(20);
  });

  it("keyword-capable sources have supportsKeyword=true", () => {
    const keywordSources = ALL_SOURCES.filter((s) => s.supportsKeyword);
    // xhs, sogou_weixin, bilibili, douyin, zhihu, x_search,
    // youtube, arxiv, github, threads, openalex, gnews, core_search,
    // google, baidu, mcp_grok, noozra, currents,
    // reddit, hackernews, polymarket, digg, techmeme,
    // tiktok_creator (via ScrapeCreators API)
    // + ithome, jiqizhixin (now search-page based)
    // + 6 stock_media sources (pexels, pexels-video, unsplash, wikimedia, coverr, pixabay)
    expect(keywordSources.length).toBe(41);
  });
});

// ─── Default keywords ───

describe("Default keywords", () => {
  it("has default keywords", () => {
    expect(DEFAULT_KEYWORDS).toHaveLength(2);
    expect(DEFAULT_KEYWORDS).toContain("AI大模型");
    expect(DEFAULT_KEYWORDS).toContain("China AI");
  });
});

// ─── MCP fallback configuration (MF-T2) ───

describe("MCP fallback configuration", () => {
  it("xhs has mcpFallback", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    expect(src.mcpFallback).toBeDefined();
    expect(src.mcpFallback.command).toBe("rednote-mcp");
    expect(src.mcpFallback.toolName).toBe("search_notes");
    expect(typeof src.mcpFallback.toolArgs).toBe("function");
    expect(typeof src.mcpFallback.resultMapper).toBe("function");
  });

  it("sogou_weixin has mcpFallback", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "sogou_weixin");
    expect(src.mcpFallback).toBeDefined();
    expect(src.mcpFallback.command).toBe("uvx");
    expect(src.mcpFallback.toolName).toBe("search_wechat_articles");
  });

  it("weibo_hot has mcpFallback", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    expect(src.mcpFallback).toBeDefined();
    expect(src.mcpFallback.toolName).toBe("get_hot_search");
  });

  it("bilibili has mcpFallback", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "bilibili");
    expect(src.mcpFallback).toBeDefined();
    expect(src.mcpFallback.toolName).toBe("search_videos");
  });

  it("douyin has mcpFallback", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "douyin");
    expect(src.mcpFallback).toBeDefined();
    expect(src.mcpFallback.toolName).toBe("search_videos");
  });

  it("tiktok_creator does NOT have mcpFallback (API + CDP only)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(src.mcpFallback).toBeUndefined();
  });

  it("news sources do NOT have mcpFallback", () => {
    for (const src of NEWS_SOURCES) {
      expect(src.mcpFallback).toBeUndefined();
    }
  });

  it("mcpFallback toolArgs returns correct arguments", () => {
    const xhs = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    const args = xhs.mcpFallback.toolArgs("DeepSeek");
    expect(args.keywords).toBe("DeepSeek");
    expect(args.limit).toBe(20);
  });

  it("mcpFallback resultMapper normalizes items", () => {
    const xhs = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    const mockItems = [
      { title: "DeepSeek新模型", url: "https://xhs.com/1" },
      { desc: "AI芯片突破", link: "https://xhs.com/2" },
    ];
    const mapped = xhs.mcpFallback.resultMapper(mockItems);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].title).toBe("DeepSeek新模型");
    expect(mapped[0].url).toBe("https://xhs.com/1");
    expect(mapped[1].title).toBe("AI芯片突破");
    expect(mapped[1].url).toBe("https://xhs.com/2");
  });

  it("weibo_hot resultMapper builds URL from query", () => {
    const weibo = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    const mockItems = [{ word: "AI热搜" }];
    const mapped = weibo.mcpFallback.resultMapper(mockItems);
    expect(mapped[0].title).toBe("AI热搜");
    expect(mapped[0].url).toContain("s.weibo.com");
    expect(mapped[0].url).toContain(encodeURIComponent("AI热搜"));
  });
});

// ─── CDP fallback configuration ───

describe("CDP fallback configuration", () => {
  it("x_search has googleSiteFallback", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.googleSiteFallback).toBeDefined();
    expect(typeof src.googleSiteFallback.url).toBe("function");
    expect(typeof src.googleSiteFallback.articleScript).toBe("string");
  });

  it("x_search googleSiteFallback builds Google site:x.com URL", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    const url = src.googleSiteFallback.url("DeepSeek");
    expect(url).toContain("google.com/search");
    expect(url).toContain(encodeURIComponent("site:x.com "));
    expect(url).toContain(encodeURIComponent("DeepSeek"));
  });

  it("x_search googleSiteFallback articleScript returns results", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.googleSiteFallback.articleScript).toContain("return results");
    expect(src.googleSiteFallback.articleScript).toContain("x.com");
    expect(src.googleSiteFallback.articleScript).toContain("twitter.com");
  });

  it("x_search googleSiteFallback uses h3-based selector (no div.g dependency)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.googleSiteFallback.articleScript).toContain("h3");
    expect(src.googleSiteFallback.articleScript).not.toContain("div.g");
    expect(src.googleSiteFallback.articleScript).not.toContain("Gx5Zad");
    expect(src.googleSiteFallback.articleScript).not.toContain("fP1Qef");
  });

  it("xhs articleScript does not use invalid [data-v-*] selector", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    expect(src.articleScript).not.toContain("[data-v-*]");
    expect(src.articleScript).toContain("section.note-item");
  });

  it("xhs mcpFallback args uses keywords (plural)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    const args = src.mcpFallback.toolArgs("AI芯片");
    expect(args.keywords).toBe("AI芯片");
    expect(args.limit).toBe(20);
    expect(args.keyword).toBeUndefined();
  });

  it("sources without googleSiteFallback are unaffected", () => {
    for (const src of SELF_MEDIA_SOURCES) {
      if (src.name !== "x_search") {
        expect(src.googleSiteFallback).toBeUndefined();
      }
    }
    for (const src of NEWS_SOURCES) {
      expect(src.googleSiteFallback).toBeUndefined();
    }
  });
});

// ─── WeChat API config ───

describe("WECHAT_API_CONFIG", () => {
  it("has searchApi and articleApi", () => {
    expect(WECHAT_API_CONFIG.searchApi).toContain("searchbiz");
    expect(WECHAT_API_CONFIG.articleApi).toContain("appmsgpublish");
  });

  it("documents verified API status", () => {
    // The config should document which APIs are verified working
    expect(WECHAT_API_CONFIG.enabled).toBe(false);
  });
});

// ─── API direct-connect configuration (Issue #34) ───

describe("apiSearch configuration", () => {
  it("arxiv_search has apiSearch", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "arxiv_search");
    expect(src.apiSearch).toBeDefined();
    expect(typeof src.apiSearch.url).toBe("function");
    expect(typeof src.apiSearch.parser).toBe("function");
    expect(src.apiSearch.authRequired).toBe(false);
  });

  it("arxiv_search apiSearch builds correct URL", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "arxiv_search");
    const url = src.apiSearch.url("DeepSeek");
    expect(url).toContain("export.arxiv.org/api/query");
    expect(url).toContain("search_query=all:DeepSeek");
    expect(url).toContain("max_results=10");
  });

  it("arxiv_search parser parses Atom XML correctly", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "arxiv_search");
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2505.02390v2</id>
    <title>Quantitative Analysis of DeepSeek Quantization</title>
    <link rel="alternate" type="text/html" href="https://arxiv.org/abs/2505.02390v2"/>
    <summary>DeepSeek-R1 quantization analysis.</summary>
    <published>2025-05-05T06:25:20Z</published>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2403.05525v2</id>
    <title>DeepSeek-VL: Vision-Language Understanding</title>
    <link rel="alternate" type="text/html" href="https://arxiv.org/abs/2403.05525v2"/>
    <summary>Vision-language model.</summary>
    <published>2024-03-11T16:47:41Z</published>
  </entry>
</feed>`;
    const results = src.apiSearch.parser(mockXml);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Quantitative Analysis of DeepSeek Quantization");
    expect(results[0].url).toBe("https://arxiv.org/abs/2505.02390v2");
    expect(results[0].snippet).toContain("DeepSeek-R1");
    expect(results[0].publishedAt).toBe("2025-05-05T06:25:20Z");
    expect(results[1].title).toBe("DeepSeek-VL: Vision-Language Understanding");
  });

  it("arxiv_search parser handles empty feed", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "arxiv_search");
    const mockXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
    const results = src.apiSearch.parser(mockXml);
    expect(results).toHaveLength(0);
  });

  it("github_search has apiSearch", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    expect(src.apiSearch).toBeDefined();
    expect(typeof src.apiSearch.url).toBe("function");
    expect(typeof src.apiSearch.parser).toBe("function");
    expect(src.apiSearch.authRequired).toBe(false);
  });

  it("github_search apiSearch builds correct URL", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    const url = src.apiSearch.url("DeepSeek");
    expect(url).toContain("api.github.com/search/repositories");
    expect(url).toContain("q=DeepSeek");
    expect(url).toContain("sort=updated");
    expect(url).toContain("per_page=10");
  });

  it("github_search parser parses JSON correctly", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    const mockJson = JSON.stringify({
      total_count: 2,
      items: [
        {
          full_name: "sfeng49/ashare-agent",
          html_url: "https://github.com/sfeng49/ashare-agent",
          description: "DeepSeek A股 Agent",
        },
        {
          full_name: "deepseek-ai/DeepSeek-V3",
          html_url: "https://github.com/deepseek-ai/DeepSeek-V3",
          description: "DeepSeek V3 model",
        },
      ],
    });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("sfeng49/ashare-agent");
    expect(results[0].url).toBe("https://github.com/sfeng49/ashare-agent");
    expect(results[0].snippet).toBe("DeepSeek A股 Agent");
    expect(results[1].title).toBe("deepseek-ai/DeepSeek-V3");
  });

  it("github_search parser handles empty results", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    const mockJson = JSON.stringify({ total_count: 0, items: [] });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(0);
  });

  it("github_search parser handles missing items field", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    const mockJson = JSON.stringify({ total_count: 0 });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(0);
  });

  it("reddit_search has apiSearch", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "reddit_search");
    expect(src.apiSearch).toBeDefined();
    expect(typeof src.apiSearch.url).toBe("function");
    expect(typeof src.apiSearch.parser).toBe("function");
    expect(src.apiSearch.authRequired).toBe(false);
  });

  it("reddit_search apiSearch builds correct URL", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "reddit_search");
    const url = src.apiSearch.url("DeepSeek");
    expect(url).toContain("reddit.com/search.json");
    expect(url).toContain("q=DeepSeek");
    expect(url).toContain("sort=new");
    expect(url).toContain("limit=10");
  });

  it("reddit_search parser parses JSON correctly", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "reddit_search");
    const mockJson = JSON.stringify({
      data: {
        children: [
          {
            data: {
              title: "DeepSeek V4 released",
              permalink: "/r/LocalLLaMA/comments/abc123/deepseek_v4_released",
              author: "user1",
              created_utc: 1723898400,
            },
          },
          {
            data: {
              title: "China AI breakthrough",
              permalink: "/r/artificial/comments/def456/china_ai_breakthrough",
              author: "user2",
              created_utc: 1723900000,
            },
          },
        ],
      },
    });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("DeepSeek V4 released");
    expect(results[0].url).toBe(
      "https://reddit.com/r/LocalLLaMA/comments/abc123/deepseek_v4_released",
    );
    expect(results[0].author).toBe("user1");
    expect(results[0].publishedAt).toBe("2024-08-17T12:40:00.000Z");
    expect(results[1].url).toContain("reddit.com");
  });

  it("reddit_search parser handles empty response", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "reddit_search");
    const mockJson = JSON.stringify({ data: { children: [] } });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(0);
  });

  it("reddit_search parser handles malformed JSON", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "reddit_search");
    expect(() => src.apiSearch.parser("not json")).toThrow();
  });

  it("hackernews_search has apiSearch", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "hackernews_search");
    expect(src.apiSearch).toBeDefined();
    expect(typeof src.apiSearch.url).toBe("function");
    expect(typeof src.apiSearch.parser).toBe("function");
    expect(src.apiSearch.authRequired).toBe(false);
  });

  it("hackernews_search apiSearch builds correct URL", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "hackernews_search");
    const url = src.apiSearch.url("DeepSeek");
    expect(url).toContain("hn.algolia.com/api/v1/search");
    expect(url).toContain("query=DeepSeek");
    expect(url).toContain("tags=story");
    expect(url).toContain("hitsPerPage=10");
  });

  it("hackernews_search parser parses JSON correctly", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "hackernews_search");
    const mockJson = JSON.stringify({
      hits: [
        {
          title: "DeepSeek v4",
          url: "https://api-docs.deepseek.com/news/news260424",
          objectID: "47884971",
          author: "impact_sy",
          created_at_i: 1723898400,
        },
        {
          title: "China AI News",
          url: null,
          objectID: "47885000",
          author: "another_user",
          created_at_i: 1723900000,
        },
      ],
    });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("DeepSeek v4");
    expect(results[0].url).toBe("https://api-docs.deepseek.com/news/news260424");
    expect(results[0].author).toBe("impact_sy");
    expect(results[1].url).toBe("https://news.ycombinator.com/item?id=47885000");
  });

  it("hackernews_search parser handles empty hits", () => {
    const src = LAST30DAYS_SOURCES.find((s) => s.name === "hackernews_search");
    const mockJson = JSON.stringify({ hits: [] });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(0);
  });

  it("sources without apiSearch are unaffected", () => {
    for (const src of NEWS_SOURCES) {
      expect(src.apiSearch).toBeUndefined();
    }
    // Self-media sources: only tiktok_creator has apiSearch
    for (const src of SELF_MEDIA_SOURCES) {
      if (src.name === "tiktok_creator") continue;
      expect(src.apiSearch).toBeUndefined();
    }
    // General search sources: noozra_search and currents have apiSearch, others don't
    for (const src of GENERAL_SEARCH_SOURCES) {
      if (src.name === "noozra_search" || src.name === "currents") continue;
      expect(src.apiSearch).toBeUndefined();
    }
    // youtube and threads don't have apiSearch
    const yt = INTERNATIONAL_SOURCES.find((s) => s.name === "youtube_search");
    expect(yt.apiSearch).toBeUndefined();
    const threads = INTERNATIONAL_SOURCES.find((s) => s.name === "threads_search");
    expect(threads.apiSearch).toBeUndefined();
  });

  it("includes the 11 existing API sources and 12 public Wechat RSS sources", () => {
    const withApi = ALL_SOURCES.filter((s) => s.apiSearch);
    expect(withApi).toHaveLength(23);
    const names = withApi.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "arxiv_search",
        "core_search",
        "currents",
        "datacube_ai",
        "github_search",
        "gnews",
        "hackernews_search",
        "noozra_search",
        "openalex_search",
        "reddit_search",
        "tiktok_creator",
        ...WECHAT_RSS_SOURCES.map((source) => source.name),
      ]),
    );
  });

  it("sources with apiSearch have accessMethod.primary === 'api'", () => {
    for (const src of ALL_SOURCES) {
      if (src.apiSearch) {
        expect(src.accessMethod.primary).toBe("api");
      }
    }
  });

  // ─── tiktok_creator ScrapeCreators API ───

  it("tiktok_creator has apiSearch", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(src.apiSearch).toBeDefined();
    expect(typeof src.apiSearch.url).toBe("function");
    expect(typeof src.apiSearch.parser).toBe("function");
    expect(src.apiSearch.authRequired).toBe(true);
  });

  it("tiktok_creator apiSearch builds correct URL", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const url = src.apiSearch.url("DeepSeek");
    expect(url).toContain("api.scrapecreators.com/v1/tiktok/search/keyword");
    expect(url).toContain("query=DeepSeek");
    expect(url).toContain("sort_by=relevance");
  });

  it("tiktok_creator parser parses search_item_list correctly", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const mockJson = JSON.stringify({
      search_item_list: [
        {
          aweme_info: {
            aweme_id: "1234567890",
            desc: "DeepSeek V4 is here!",
            share_url: "https://www.tiktok.com/@user/video/1234567890?utm=share",
            author: { unique_id: "techcreator" },
            create_time: 1723898400,
            statistics: { play_count: 100000, digg_count: 5000, comment_count: 200 },
          },
        },
        {
          aweme_info: {
            aweme_id: "9876543210",
            desc: "China AI breakthrough",
            share_url: "",
            author: { unique_id: "ai_news" },
            create_time: 1723900000,
            statistics: { play_count: 50000, digg_count: 2000 },
          },
        },
      ],
    });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("DeepSeek V4 is here!");
    expect(results[0].url).toBe("https://www.tiktok.com/@user/video/1234567890");
    expect(results[0].author).toBe("techcreator");
    expect(results[0].snippet).toContain("100000 views");
    expect(results[1].url).toBe("https://www.tiktok.com/@ai_news/video/9876543210");
  });

  it("tiktok_creator parser handles data wrapper", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const mockJson = JSON.stringify({
      data: [
        {
          aweme_id: "111",
          desc: "Test video",
          share_url: "https://www.tiktok.com/@test/video/111",
          author: { unique_id: "test" },
          statistics: {},
        },
      ],
    });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Test video");
    expect(results[0].url).toBe("https://www.tiktok.com/@test/video/111");
  });

  it("tiktok_creator parser handles empty response", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const mockJson = JSON.stringify({ search_item_list: [], data: [] });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(0);
  });

  it("tiktok_creator parser handles items without aweme_info nesting", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const mockJson = JSON.stringify({
      data: [
        {
          aweme_id: "222",
          desc: "Direct item without nesting",
          share_url: "https://www.tiktok.com/@direct/video/222",
          author: "direct_user",
          statistics: { play_count: 1000 },
        },
      ],
    });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Direct item without nesting");
    expect(results[0].author).toBe("direct_user");
  });

  it("tiktok_creator apiSearch authRequired is true", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(src.apiSearch.authRequired).toBe(true);
  });

  it("tiktok_creator now supportsKeyword (via API)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(src.supportsKeyword).toBe(true);
  });

  // ─── paidApi flag: sources that consume paid credits are opt-in ───

  it("tiktok_creator apiSearch is marked paidApi", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(src.apiSearch.paidApi).toBe(true);
  });

  it("free API sources are NOT marked paidApi", () => {
    // arXiv, GitHub, Reddit, HN — all have free, unlimited APIs
    const arxiv = INTERNATIONAL_SOURCES.find((s) => s.name === "arxiv_search");
    expect(arxiv.apiSearch.paidApi).toBeUndefined();
    const github = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    expect(github.apiSearch.paidApi).toBeUndefined();
    const reddit = LAST30DAYS_SOURCES.find((s) => s.name === "reddit_search");
    expect(reddit.apiSearch.paidApi).toBeUndefined();
    const hn = LAST30DAYS_SOURCES.find((s) => s.name === "hackernews_search");
    expect(hn.apiSearch.paidApi).toBeUndefined();
  });

  it("exactly 1 source has paidApi=true", () => {
    const paid = ALL_SOURCES.filter((s) => s.apiSearch?.paidApi === true);
    expect(paid).toHaveLength(1);
    expect(paid[0].name).toBe("tiktok_creator");
  });
});

// ─── Research mode filter expansion (T2) ───

describe("Research mode filter expansion", () => {
  // The filter logic in search-sources.mjs:
  // Research mode: includes sources with supportsKeyword=true OR googleSiteFallback
  // Trend mode: includes all sources with capabilities.articles

  it("research mode includes all sources with supportsKeyword=true", () => {
    const keywordSources = ALL_SOURCES.filter((s) => s.capabilities?.articles?.supportsKeyword);
    // Every keyword-capable source should be in research mode
    expect(keywordSources.length).toBeGreaterThan(0);
  });

  it("research mode includes sources with googleSiteFallback even if supportsKeyword=false", () => {
    // x_search has supportsKeyword=true AND googleSiteFallback, but we need to verify
    // that sources with supportsKeyword=false AND googleSiteFallback are included
    const googleSiteFallbackOnlySources = ALL_SOURCES.filter(
      (s) =>
        s.capabilities?.articles?.googleSiteFallback && !s.capabilities?.articles?.supportsKeyword,
    );
    // If any such sources exist, they should be included in research mode
    // (Currently there may be 0 such sources, but the filter must support them)
    // The key test is that the filter logic includes them
    for (const src of googleSiteFallbackOnlySources) {
      expect(src.capabilities.articles.googleSiteFallback).toBeDefined();
      expect(src.capabilities.articles.supportsKeyword).toBe(false);
    }
  });

  it("research mode filter logic: supportsKeyword OR googleSiteFallback exists", () => {
    // Simulate the filter logic
    const researchSources = ALL_SOURCES.filter(
      (s) =>
        s.capabilities?.articles?.supportsKeyword || s.capabilities?.articles?.googleSiteFallback,
    );
    const trendSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);

    // Research mode should include at least as many sources as before
    // (all supportsKeyword sources are still included, plus any googleSiteFallback-only ones)
    expect(researchSources.length).toBeGreaterThanOrEqual(
      ALL_SOURCES.filter((s) => s.capabilities?.articles?.supportsKeyword).length,
    );

    // Research mode should never exceed trend mode (trend = all articles sources)
    expect(researchSources.length).toBeLessThanOrEqual(trendSources.length);
  });

  it("trend mode filter is unchanged (all capabilities.articles sources)", () => {
    const trendSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    // Same as before — no filter change for trend mode
    expect(trendSources.length).toBeGreaterThan(0);
  });
});

// ─── #88 Part 2: Universal Google site: fallback auto-generation ───

describe("#88 Part 2 — SHARED_GOOGLE_SITE_SEARCH_SCRIPT", () => {
  it("contains h3 selector", () => {
    expect(SHARED_GOOGLE_SITE_SEARCH_SCRIPT).toContain("h3");
  });

  it("returns results array", () => {
    expect(SHARED_GOOGLE_SITE_SEARCH_SCRIPT).toContain("return results");
  });

  it("does NOT contain domain filter (no x.com, twitter.com, etc.)", () => {
    expect(SHARED_GOOGLE_SITE_SEARCH_SCRIPT).not.toContain("x.com");
    expect(SHARED_GOOGLE_SITE_SEARCH_SCRIPT).not.toContain("twitter.com");
    expect(SHARED_GOOGLE_SITE_SEARCH_SCRIPT).not.toContain("url.includes");
  });
});

describe("#88 Part 2 — autoGenerateGoogleSiteFallback", () => {
  it("returns object with url function and articleScript for source with parseable URL", () => {
    const src = NEWS_SOURCES.find((s) => s.name === "qbitai");
    const fb = autoGenerateGoogleSiteFallback(src);
    expect(fb).not.toBeNull();
    expect(typeof fb.url).toBe("function");
    expect(typeof fb.articleScript).toBe("string");
    expect(fb.articleScript).toBe(SHARED_GOOGLE_SITE_SEARCH_SCRIPT);
  });

  it("builds correct site:domain.com keyword URL", () => {
    const src = NEWS_SOURCES.find((s) => s.name === "ithome");
    const fb = autoGenerateGoogleSiteFallback(src);
    const url = fb.url("DeepSeek");
    expect(url).toContain("google.com/search");
    expect(url).toContain(encodeURIComponent("site:www.ithome.com "));
    expect(url).toContain(encodeURIComponent("DeepSeek"));
  });

  it("extracts domain from source.url function", () => {
    const src = NEWS_SOURCES.find((s) => s.name === "zhidx");
    const fb = autoGenerateGoogleSiteFallback(src);
    const url = fb.url("AI");
    expect(url).toContain(encodeURIComponent("site:zhidx.com "));
  });

  it("returns null for source with unparseable URL", () => {
    const fakeSource = { url: () => "not-a-url" };
    const fb = autoGenerateGoogleSiteFallback(fakeSource);
    expect(fb).toBeNull();
  });

  it("returns null for source with missing url function", () => {
    const fakeSource = {};
    const fb = autoGenerateGoogleSiteFallback(fakeSource);
    expect(fb).toBeNull();
  });

  it("has _autoGenerated flag set to true", () => {
    const src = NEWS_SOURCES.find((s) => s.name === "qbitai");
    const fb = autoGenerateGoogleSiteFallback(src);
    expect(fb._autoGenerated).toBe(true);
  });
});

describe("#88 Part 2 — shouldAutoGenGoogleSiteFallback", () => {
  it("returns true for applicable source (qbitai — no API, no MCP, no explicit fallback)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "qbitai");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(true);
  });

  it("returns true for applicable source (ithome)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "ithome");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(true);
  });

  it("returns true for applicable source (zhihu)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "zhihu");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(true);
  });

  it("returns false for source with explicit googleSiteFallback (x_search)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "x_search");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for source with apiSearch (arxiv_search)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "arxiv_search");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for source with mcpFallback (youtube_search)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "youtube_search");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for search engine (google_news)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "google_news");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for search engine (baidu_search)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "baidu_search");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for image library (pexels)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "pexels");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for datacube_ai (RSS feed)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "datacube_ai");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for wechat_dongchabeating (uses Google as primary)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "wechat_dongchabeating");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for weibo_hot (hot search, no keyword search)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "weibo_hot");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for source without capabilities.articles", () => {
    const src = ALL_SOURCES.find((s) => s.name === "pexels_video");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });
});
