import { describe, it, expect } from "vitest";
import {
  NEWS_SOURCES,
  SELF_MEDIA_SOURCES,
  WESTERN_SOURCES,
  GENERAL_SEARCH_SOURCES,
  LAST30DAYS_SOURCES,
  ALL_SOURCES,
  DEFAULT_KEYWORDS,
  WECHAT_API_CONFIG,
} from "../lib/source-registry.mjs";

// ─── Source structure validation ───

describe("Source structure", () => {
  it("NEWS_SOURCES has 7 sources", () => {
    expect(NEWS_SOURCES).toHaveLength(7);
  });

  it("SELF_MEDIA_SOURCES has 8 sources", () => {
    expect(SELF_MEDIA_SOURCES).toHaveLength(8);
  });

  it("ALL_SOURCES has 28 sources", () => {
    expect(ALL_SOURCES).toHaveLength(28);
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
      expect(Array.isArray(source.accessMethod.fallbacks)).toBe(true);
      expect(typeof source.accessMethod.notes).toBe("string");
      expect(typeof source.url).toBe("function");
      expect(typeof source.extractScript).toBe("string");
      // MCP-only sources may have minimal extractScript (e.g. "return [];")
      if (source.mcpFallback && !source.url()) continue;
      expect(source.extractScript.length).toBeGreaterThan(10);
    }
  });

  it("source names are unique", () => {
    const names = ALL_SOURCES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
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
      expect(typeof src.extractScript).toBe("string");
      // MCP-only sources (like mcp_grok_search) may have minimal extractScript
      if (src.mcpFallback && !src.url()) continue;
      expect(src.extractScript.length).toBeGreaterThan(50);
    }
  });

  it("all CDP-based extract scripts return results array", () => {
    for (const src of ALL_SOURCES) {
      // MCP-only sources (like mcp_grok_search) may have minimal extractScript
      if (src.mcpFallback && !src.url()) continue;
      expect(src.extractScript).toContain("return results");
    }
  });

  it("weibo_hot extracts from td.td-02", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    expect(src.extractScript).toContain("td.td-02");
  });

  it("bilibili extract includes video card selectors", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "bilibili");
    expect(src.extractScript).toContain("bili-video-card");
  });

  it("x_search extract uses data-testid=tweet selector", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.extractScript).toContain('data-testid="tweet"');
    expect(src.extractScript).toContain('data-testid="tweetText"');
    expect(src.extractScript).toContain("return results");
  });
});

// ─── Western sources ───

describe("Western sources", () => {
  it("WESTERN_SOURCES has 4 sources", () => {
    expect(WESTERN_SOURCES).toHaveLength(4);
  });

  it("includes youtube_search", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "youtube_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("YouTube");
    expect(src.supportsKeyword).toBe(true);
    expect(src.category).toBe("western");
  });

  it("includes arxiv_search", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "arxiv_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("arXiv");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes github_search", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "github_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("GitHub");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes threads_search", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "threads_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Threads");
    expect(src.supportsKeyword).toBe(true);
  });

  it("all western sources have mcpFallback", () => {
    for (const src of WESTERN_SOURCES) {
      expect(src.mcpFallback).toBeDefined();
      expect(src.mcpFallback.toolName).toBe("web_search");
    }
  });
});

// ─── General search sources ───

describe("General search sources", () => {
  it("GENERAL_SEARCH_SOURCES has 3 sources", () => {
    expect(GENERAL_SEARCH_SOURCES).toHaveLength(3);
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
    // qbitai, jiqizhixin, 36kr, techcrunch, bloomberg, guancha, ithome,
    // weibo_hot, tiktok_creator, wechat_dongchabeating
    expect(homepageSources.length).toBe(10);
  });

  it("keyword-capable sources have supportsKeyword=true", () => {
    const keywordSources = ALL_SOURCES.filter((s) => s.supportsKeyword);
    // xhs, sogou_weixin, bilibili, douyin, zhihu, x_search,
    // youtube, arxiv, github, threads,
    // google, baidu, mcp_grok,
    // reddit, hackernews, polymarket, digg, techmeme
    expect(keywordSources.length).toBe(18);
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
    expect(src.mcpFallback.command).toBe("python");
    expect(src.mcpFallback.toolName).toBe("search_feeds");
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

  it("tiktok_creator does NOT have mcpFallback (CDP-only)", () => {
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
    expect(args.keyword).toBe("DeepSeek");
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
  it("x_search has cdpFallback", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.cdpFallback).toBeDefined();
    expect(typeof src.cdpFallback.url).toBe("function");
    expect(typeof src.cdpFallback.extractScript).toBe("string");
  });

  it("x_search cdpFallback builds Google site:x.com URL", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    const url = src.cdpFallback.url("DeepSeek");
    expect(url).toContain("google.com/search");
    expect(url).toContain(encodeURIComponent("site:x.com "));
    expect(url).toContain(encodeURIComponent("DeepSeek"));
  });

  it("x_search cdpFallback extractScript returns results", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "x_search");
    expect(src.cdpFallback.extractScript).toContain("return results");
    expect(src.cdpFallback.extractScript).toContain("x.com");
    expect(src.cdpFallback.extractScript).toContain("twitter.com");
  });

  it("sources without cdpFallback are unaffected", () => {
    for (const src of SELF_MEDIA_SOURCES) {
      if (src.name !== "x_search") {
        expect(src.cdpFallback).toBeUndefined();
      }
    }
    for (const src of NEWS_SOURCES) {
      expect(src.cdpFallback).toBeUndefined();
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
    const src = WESTERN_SOURCES.find((s) => s.name === "arxiv_search");
    expect(src.apiSearch).toBeDefined();
    expect(typeof src.apiSearch.url).toBe("function");
    expect(typeof src.apiSearch.parser).toBe("function");
    expect(src.apiSearch.authRequired).toBe(false);
  });

  it("arxiv_search apiSearch builds correct URL", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "arxiv_search");
    const url = src.apiSearch.url("DeepSeek");
    expect(url).toContain("export.arxiv.org/api/query");
    expect(url).toContain("search_query=all:DeepSeek");
    expect(url).toContain("max_results=10");
  });

  it("arxiv_search parser parses Atom XML correctly", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "arxiv_search");
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
    const src = WESTERN_SOURCES.find((s) => s.name === "arxiv_search");
    const mockXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
    const results = src.apiSearch.parser(mockXml);
    expect(results).toHaveLength(0);
  });

  it("github_search has apiSearch", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "github_search");
    expect(src.apiSearch).toBeDefined();
    expect(typeof src.apiSearch.url).toBe("function");
    expect(typeof src.apiSearch.parser).toBe("function");
    expect(src.apiSearch.authRequired).toBe(false);
  });

  it("github_search apiSearch builds correct URL", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "github_search");
    const url = src.apiSearch.url("DeepSeek");
    expect(url).toContain("api.github.com/search/repositories");
    expect(url).toContain("q=DeepSeek");
    expect(url).toContain("sort=updated");
    expect(url).toContain("per_page=10");
  });

  it("github_search parser parses JSON correctly", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "github_search");
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
    const src = WESTERN_SOURCES.find((s) => s.name === "github_search");
    const mockJson = JSON.stringify({ total_count: 0, items: [] });
    const results = src.apiSearch.parser(mockJson);
    expect(results).toHaveLength(0);
  });

  it("github_search parser handles missing items field", () => {
    const src = WESTERN_SOURCES.find((s) => s.name === "github_search");
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
    // Self-media sources don't have apiSearch
    for (const src of SELF_MEDIA_SOURCES) {
      expect(src.apiSearch).toBeUndefined();
    }
    // General search sources don't have apiSearch
    for (const src of GENERAL_SEARCH_SOURCES) {
      expect(src.apiSearch).toBeUndefined();
    }
    // youtube and threads don't have apiSearch
    const yt = WESTERN_SOURCES.find((s) => s.name === "youtube_search");
    expect(yt.apiSearch).toBeUndefined();
    const threads = WESTERN_SOURCES.find((s) => s.name === "threads_search");
    expect(threads.apiSearch).toBeUndefined();
  });

  it("exactly 4 sources have apiSearch configured", () => {
    const withApi = ALL_SOURCES.filter((s) => s.apiSearch);
    expect(withApi).toHaveLength(4);
    const names = withApi.map((s) => s.name).sort();
    expect(names).toEqual(["arxiv_search", "github_search", "hackernews_search", "reddit_search"]);
  });

  it("sources with apiSearch have accessMethod.primary === 'api'", () => {
    for (const src of ALL_SOURCES) {
      if (src.apiSearch) {
        expect(src.accessMethod.primary).toBe("api");
      }
    }
  });
});
