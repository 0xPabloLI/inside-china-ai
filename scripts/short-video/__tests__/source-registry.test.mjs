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
  SOURCE_ATTRIBUTIONS,
  AUTOGEN_EXCLUDED_SOURCES,
} from "../lib/source-registry.mjs";
import { isPoolEligible } from "../lib/search-pool.mjs";

// ─── Source structure validation ───

describe("Source structure", () => {
  it("NEWS_SOURCES has 12 sources (google_news merged #140 P4; xinzhiyuan/baidu_news removed as dead upstream, #140 P5)", () => {
    expect(NEWS_SOURCES).toHaveLength(12);
  });

  it("SELF_MEDIA_SOURCES has 8 sources", () => {
    expect(SELF_MEDIA_SOURCES).toHaveLength(8);
  });

  it("ALL_SOURCES has 62 sources", () => {
    // 64 − xinzhiyuan/baidu_news (dead upstream, removed #140 P5)
    expect(ALL_SOURCES).toHaveLength(62);
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
      // Issue #97: tracked WeChat context role for evidence-group separation
      expect(source.sourceRole).toBe("tracked-feed-context");
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
      // Sources without a CDP page (mcp_grok_search: Bigsong API only, #307)
      // may have a minimal articleScript
      if (!src.url()) continue;
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
  it("INTERNATIONAL_SOURCES has 10 sources (8 + currents + noozra_search #64)", () => {
    expect(INTERNATIONAL_SOURCES).toHaveLength(10);
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

  it("youtube, arxiv, github, threads have NO Grok web_search fallback (#309 retired 2026-09-19)", () => {
    // #309 grilling ruling 5 + 2026-09-19 verdict: material/research sources
    // are platform-faithful end to end — the Grok web_search bridge (and the
    // pool it gated) returned web articles, a contract violation. Retired;
    // datacube_ai, openalex_search, gnews, core_search remain API-only.
    for (const name of ["youtube_search", "arxiv_search", "github_search", "threads_search"]) {
      const src = INTERNATIONAL_SOURCES.find((s) => s.name === name);
      expect(src.mcpFallback, `${name} mcpFallback retired`).toBeUndefined();
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
  it("GENERAL_SEARCH_SOURCES has 5 sources (currents/noozra moved to INTERNATIONAL_SOURCES #64, +searxng_search #92)", () => {
    expect(GENERAL_SEARCH_SOURCES).toHaveLength(5);
  });

  it("includes google_search (news vertical, #140 P4)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "google_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Google Search (News)");
    expect(src.category).toBe("general");
    expect(src.supportsKeyword).toBe(true);
  });

  it("google_search points at the Google news vertical (tbm=nws, qdr:w, #140 P4)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "google_search");
    const url = src.url("test");
    expect(url).toContain("tbm=nws");
    expect(url).toContain("tbs=qdr:w");
    expect(url).toContain(encodeURIComponent("test"));
    // Bare keyword — no "China AI" suffix (merged from google_news)
    expect(url).not.toContain(encodeURIComponent(" China AI"));
  });

  it("includes baidu_search", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "baidu_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("百度搜索");
    expect(src.category).toBe("general");
    expect(src.supportsKeyword).toBe(true);
  });

  it("includes mcp_grok_search (Bigsong direct, #307: MCP bridge hop retired)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "mcp_grok_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("Grok Web Search");
    expect(src.category).toBe("general");
    expect(src.supportsKeyword).toBe(true);
    expect(src.accessMethod.primary).toBe("api");
    expect(src.mcpFallback).toBeUndefined();
    expect(src.apiFallback).toBeDefined();
  });

  it("baidu_search does NOT have mcpFallback (CDP-only)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "baidu_search");
    expect(src.mcpFallback).toBeUndefined();
  });

  it("includes duckduckgo_search on the non-JS HTML endpoint (#91)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "duckduckgo_search");
    expect(src).toBeDefined();
    expect(src.label).toBe("DuckDuckGo Search");
    expect(src.category).toBe("general");
    expect(src.supportsKeyword).toBe(true);
    expect(src.needsAuth).toBe(false);
    // html.duckduckgo.com — non-JS endpoint, no rendering required
    expect(src.url("qwen").toString()).toContain("html.duckduckgo.com/html/?q=");
    expect(src.url("qwen").toString()).toContain("China%20AI");
    expect(src.accessMethod.primary).toBe("cdp");
    expect(src.articleScript.length).toBeGreaterThan(50);
    // HTML endpoint selectors
    expect(src.articleScript).toContain("result__a");
    expect(src.articleScript).toContain("result__snippet");
    // DDG wraps result URLs in /l/?uddg= — extractScript must unwrap them
    expect(src.articleScript).toContain("uddg=");
    expect(src.articleScript).toContain("decodeURIComponent");
    // CDP-only like baidu: no MCP fallback
    expect(src.mcpFallback).toBeUndefined();
  });

  it("duckduckgo_search is excluded from googleSiteFallback auto-gen (search engine)", () => {
    const src = GENERAL_SEARCH_SOURCES.find((s) => s.name === "duckduckgo_search");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });
});

// ─── Issue #64: Currents/Noozra reclassification ───
// (The "#64 — baidu_news CDP source" describe was removed with the source
// itself — dead upstream, 2026-09-07, #140 P5. See
// docs/research/zh-source-recovery-research-2026-09.md — do not re-research.)

describe("#64 — Currents/Noozra reclassified as news aggregation APIs", () => {
  it("GENERAL_SEARCH_SOURCES no longer contains currents or noozra_search", () => {
    const names = GENERAL_SEARCH_SOURCES.map((s) => s.name);
    expect(names).not.toContain("currents");
    expect(names).not.toContain("noozra_search");
  });

  it("INTERNATIONAL_SOURCES contains currents and noozra_search with category 'international'", () => {
    for (const name of ["currents", "noozra_search"]) {
      const src = INTERNATIONAL_SOURCES.find((s) => s.name === name);
      expect(src, `${name} must be in INTERNATIONAL_SOURCES`).toBeDefined();
      expect(src.category).toBe("international");
      expect(src.accessMethod.primary).toBe("api");
      expect(src.apiSearch).toBeDefined();
    }
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
    // 20 + telegram_aipost fixed-feed channel (#204)
    expect(homepageSources.length).toBe(21);
  });

  it("keyword-capable sources have supportsKeyword=true", () => {
    const keywordSources = ALL_SOURCES.filter((s) => s.supportsKeyword);
    // google, baidu, mcp_grok, noozra, currents,
    // reddit, hackernews, polymarket, digg, techmeme,
    // tiktok_creator (via ScrapeCreators API)
    // + ithome, jiqizhixin (now search-page based)
    // + 6 stock_media sources (pexels, pexels-video, unsplash, wikimedia, coverr, pixabay)
    // + duckduckgo_search (#91) + baidu_news (#64) + searxng_search (#92)
    // − google_news (merged #140 P4) − xinzhiyuan/baidu_news (dead upstream, #140 P5)
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
  it("xhs is single-channel CDP — dots-chat apiFallback retired (#213 方案 A)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "xhs");
    expect(src.apiFallback).toBeUndefined();
    expect(src.mcpFallback).toBeUndefined();
    expect(src.accessMethod.notes).toContain("#213");
  });

  // #307 (2026-09-19): mcp_grok_search joins as the second Bigsong carrier —
  // same upstream (grok-chat-fast via searchX), query shaped by promptTemplate
  // instead of the raw platform keyword. The invariant still pins every
  // apiFallback source OUTSIDE the pool by construction: a carrier is either
  // a platform bridge (x_search) or an independent single-source chain
  // (mcp_grok_search) — never pool-eligible.
  it("only Bigsong-backed sources carry apiFallback across the whole registry (#292/#307 invariant)", () => {
    const carriers = ALL_SOURCES.filter((s) => s.apiFallback).map((s) => s.name);
    expect(carriers).toEqual(["x_search", "mcp_grok_search"]);
    for (const name of ["xhs", "sogou_weixin", "weibo_hot", "bilibili", "douyin"]) {
      expect(ALL_SOURCES.find((s) => s.name === name)?.apiFallback).toBeUndefined();
    }
  });

  // #316 (2026-09-19): all three dedicated MCP fallbacks retired — live test
  // showed every one dead (two python modules never installed → instant spawn
  // death; sogou uvx server times out on MCP initialize, reproducible warm).
  // All three produced the silent-zero class (#305) when their layer was
  // reached; the primary layers (CDP/site:/API) are verified working.
  it("sogou_weixin has NO mcpFallback (#316: uvx server init timeout, retired)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "sogou_weixin");
    expect(src.mcpFallback).toBeUndefined();
  });

  it("weibo_hot has NO mcpFallback (#316: python module never installed, retired)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    expect(src.mcpFallback).toBeUndefined();
    expect(src.apiSearch).toBeDefined();
  });

  it("bilibili has NO mcpFallback (#316: python module never installed, retired)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "bilibili");
    expect(src.mcpFallback).toBeUndefined();
  });

  it("douyin does NOT have mcpFallback (douyin_mcp never installed, iesdouyin CDP download verified 2026-09-03)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "douyin");
    expect(src.mcpFallback).toBeUndefined();
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

  it("apiFallback resultMapper normalizes Bigsong list text (x_search, parser shared with retired xhs fallback)", () => {
    const xSearch = ALL_SOURCES.find((s) => s.name === "x_search");
    const text =
      '1. **Full text**: "DeepSeek新模型发布" **Author**: demo\n   **URL**: https://xhs.com/1\n2. **Full text**: "AI芯片突破" **Author**: demo\n   **URL**: https://xhs.com/2';
    const mapped = xSearch.apiFallback.resultMapper(text);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].title).toContain("DeepSeek新模型");
    expect(mapped[0].url).toBe("https://xhs.com/1");
    expect(mapped[1].title).toContain("AI芯片突破");
    expect(mapped[1].url).toBe("https://xhs.com/2");
  });

  it("weibo_hot API parser stamps fetch time as publishedAt (hot-list semantics, mcpFallback retired #316)", () => {
    const weibo = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    expect(weibo.mcpFallback).toBeUndefined();
    const before = Date.now();
    const articles = weibo.apiSearch.parser(
      JSON.stringify({ data: [{ title: "AI热搜", link: "https://s.weibo.com/x", hot_value: 9 }] }),
    );
    expect(articles[0].title).toBe("AI热搜");
    expect(new Date(articles[0].publishedAt).getTime()).toBeGreaterThanOrEqual(before - 5000);
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

  it("explicit googleSiteFallback carriers in SELF_MEDIA/NEWS are exactly the promoted + x_search set (#309)", () => {
    // #309 (2026-09-19, 用户裁决"全部补齐")：bilibili/sogou_weixin/tiktok_creator
    // 加入 x_search 成为显式 site: 载体；其余 SELF_MEDIA（weibo_hot/douyin/zhihu）
    // 与 NEWS 全族不变——douyin/zhihu 的 site: 来自 #88 autogen（落在
    // capabilities.articles，非源字面量），不在此列。
    const explicitCarriers = [...SELF_MEDIA_SOURCES, ...NEWS_SOURCES]
      .filter((s) => s.googleSiteFallback)
      .map((s) => s.name);
    expect(explicitCarriers.sort()).toEqual(
      ["bilibili", "sogou_weixin", "tiktok_creator", "x_search"].sort(),
    );
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
    // zhidx: WordPress REST apiSearch added (#140 P5 research)
    for (const src of NEWS_SOURCES) {
      if (src.name === "zhidx") continue;
      expect(src.apiSearch).toBeUndefined();
    }
    // Self-media sources: tiktok_creator + weibo_hot (60s API, #140 P5) have apiSearch
    for (const src of SELF_MEDIA_SOURCES) {
      if (src.name === "tiktok_creator" || src.name === "weibo_hot") continue;
      expect(src.apiSearch).toBeUndefined();
    }
    // General search sources: only searxng_search has apiSearch (#92);
    // currents/noozra_search were moved to INTERNATIONAL_SOURCES in #64
    for (const src of GENERAL_SEARCH_SOURCES) {
      if (src.name === "searxng_search") continue;
      expect(src.apiSearch).toBeUndefined();
    }
    // youtube and threads don't have apiSearch
    const yt = INTERNATIONAL_SOURCES.find((s) => s.name === "youtube_search");
    expect(yt.apiSearch).toBeUndefined();
    const threads = INTERNATIONAL_SOURCES.find((s) => s.name === "threads_search");
    expect(threads.apiSearch).toBeUndefined();
  });

  it("includes the 12 existing API sources, 12 public Wechat RSS sources, 1 Telegram channel, and zhidx/weibo_hot API layers (#140 P5)", () => {
    const withApi = ALL_SOURCES.filter((s) => s.apiSearch);
    expect(withApi).toHaveLength(27);
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
        "searxng_search",
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

  it("returns false for source with apiFallback (x_search, #90)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "x_search");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("returns false for search engine (google_search, #140 P4 — was google_news)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "google_search");
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

describe("CDP video capabilities (#183)", () => {
  it("exposes capabilities.videos (method cdp) for Chinese news CDP sources", async () => {
    const { ALL_SOURCES } = await import("../lib/source-registry.mjs");
    const ithome = ALL_SOURCES.find((s) => s.name === "ithome");
    expect(ithome.capabilities.videos).toBeDefined();
    expect(ithome.capabilities.videos.method).toBe("cdp");
    expect(ithome.capabilities.videos.videoScript).toContain("iframe");
    const qbitai = ALL_SOURCES.find((s) => s.name === "qbitai");
    expect(qbitai.capabilities.videos.method).toBe("cdp");
  });
});

// ─── #309 publishedAt parser mappings (news contract fail-closed) ───
//
// Ruling (2026-09-15): API/RSS/pool-family sources must carry publishedAt —
// the audit found three parsers dropping fields their APIs already provide
// (github `pushed_at`, tiktok `create_time`), and weibo_hot whose hot-list
// semantics make fetch time the item's validity time.

describe("#309 publishedAt parser mappings", () => {
  it("github_search maps pushed_at to publishedAt", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    const articles = src.apiSearch.parser(
      JSON.stringify({
        items: [
          {
            full_name: "a/b",
            html_url: "https://github.com/a/b",
            description: "d",
            pushed_at: "2026-09-14T10:00:00Z",
          },
        ],
      }),
    );
    expect(articles[0].publishedAt).toBe("2026-09-14T10:00:00Z");
  });

  it("github_search leaves publishedAt empty when pushed_at is missing", () => {
    const src = INTERNATIONAL_SOURCES.find((s) => s.name === "github_search");
    const articles = src.apiSearch.parser(
      JSON.stringify({ items: [{ full_name: "a/b", html_url: "https://github.com/a/b" }] }),
    );
    expect(articles[0].publishedAt).toBe("");
  });

  it("tiktok_creator maps aweme create_time (unix seconds) to ISO publishedAt", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const articles = src.apiSearch.parser(
      JSON.stringify({
        search_item_list: [
          {
            aweme_info: {
              aweme_id: "v1",
              desc: "clip",
              create_time: 1757836800,
              author: { unique_id: "u" },
            },
          },
        ],
      }),
    );
    expect(articles[0].publishedAt).toBe(new Date(1757836800 * 1000).toISOString());
  });

  it("tiktok_creator leaves publishedAt empty when create_time is missing", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "tiktok_creator");
    const articles = src.apiSearch.parser(
      JSON.stringify({
        search_item_list: [
          { aweme_info: { aweme_id: "v1", desc: "clip", author: { unique_id: "u" } } },
        ],
      }),
    );
    expect(articles[0].publishedAt).toBe("");
  });

  it("weibo_hot stamps fetch time as publishedAt (hot-list semantics)", () => {
    const src = SELF_MEDIA_SOURCES.find((s) => s.name === "weibo_hot");
    const before = Date.now();
    const articles = src.apiSearch.parser(
      JSON.stringify({
        data: [{ title: "热词", link: "https://s.weibo.com/weibo?q=x", hot_value: 123 }],
      }),
    );
    const ts = new Date(articles[0].publishedAt).getTime();
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before - 5000);
    expect(ts).toBeLessThanOrEqual(Date.now() + 5000);
  });
});

// ─── #309 site: promotion (2026-09-19 verdicts) ───
//
// 用户裁决链：#292 grilling 定两条契约 → 素材/研究源退出通用 pool，推广
// x_search 式 site: 保真链（默认窗 tbs=qdr:y 一年窗）；2026-09-19 追加裁决：
// ① 可选补源全部补齐（bilibili / sogou_weixin / tiktok_creator）；
// ② threads 无 Google 索引，且对本源 CDP 的 fallback 到其他搜索引擎没有
//    意义——摘 mcpFallback（pool 退出 + Grok 退役），链止于 CDP。

describe("site: promotion — material/research sources exit the pool (#309)", () => {
  const PROMOTED = [
    { name: "youtube_search", domain: "youtube.com" },
    { name: "arxiv_search", domain: "arxiv.org" },
    { name: "github_search", domain: "github.com" },
    { name: "bilibili", domain: "bilibili.com" },
    // 微信文章实体在 mp.weixin.qq.com（Google 索引域）；site:sogou.com 只会
    // 返回搜狗自己的搜索页——平台保真取文章域。
    { name: "sogou_weixin", domain: "mp.weixin.qq.com" },
    // tiktok_creator 的 CDP 层是忽略关键词的 Creator Center 首页（审计 §D9），
    // site:tiktok.com 首次给它一个真的关键词层。
    { name: "tiktok_creator", domain: "tiktok.com" },
  ];

  it("pool-eligible sources are exactly [google_search] — declared via explicit poolEligible (#307: 2→1, decoupled from the Grok bridge)", () => {
    const eligible = ALL_SOURCES.filter((s) => isPoolEligible(s)).map((s) => s.name);
    expect(eligible).toEqual(["google_search"]);
    const google = ALL_SOURCES.find((s) => s.name === "google_search");
    expect(google.poolEligible).toBe(true);
    expect(ALL_SOURCES.find((s) => s.name === "mcp_grok_search")?.poolEligible).toBeUndefined();
  });

  it("promoted sources carry an explicit googleSiteFallback (site: domain + qdr:y year window)", () => {
    for (const { name, domain } of PROMOTED) {
      const src = ALL_SOURCES.find((s) => s.name === name);
      expect(src, `${name} exists`).toBeDefined();
      expect(src.googleSiteFallback, `${name} explicit fallback`).toBeDefined();
      expect(
        src.googleSiteFallback._autoGenerated,
        `${name} is explicit, not autogen`,
      ).toBeUndefined();
      const url = src.googleSiteFallback.url("kw");
      expect(url, `${name} site: constraint`).toContain(encodeURIComponent(`site:${domain} `));
      expect(url, `${name} qdr:y window`).toContain("tbs=qdr:y");
      expect(src.googleSiteFallback.articleScript, `${name} h3 extractor`).toContain(
        "return results",
      );
    }
  });

  it("Grok web_search fallback is retired from youtube/arxiv/github/threads (grilling ruling 5)", () => {
    // #316 (2026-09-19): the last dedicated MCP fallbacks (bilibili/sogou_weixin)
    // are retired too — live-tested dead (modules never installed / init
    // timeout). tiktok_creator stays API+CDP only. The registry now carries
    // ZERO mcpFallback configs.
    for (const name of ["youtube_search", "arxiv_search", "github_search", "threads_search"]) {
      const src = ALL_SOURCES.find((s) => s.name === name);
      expect(src.mcpFallback, `${name} mcpFallback removed`).toBeUndefined();
    }
    for (const name of ["bilibili", "sogou_weixin", "weibo_hot"]) {
      const src = ALL_SOURCES.find((s) => s.name === name);
      expect(src.mcpFallback, `${name} dedicated MCP retired (#316)`).toBeUndefined();
    }
    expect(ALL_SOURCES.filter((s) => s.mcpFallback)).toHaveLength(0);
  });

  it("threads_search is excluded from site: autogen — no Google index, the layer would be dead (douyin precedent #77)", () => {
    expect(AUTOGEN_EXCLUDED_SOURCES.has("threads_search")).toBe(true);
    const src = ALL_SOURCES.find((s) => s.name === "threads_search");
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("threads_search CDP articleScript extracts permalink and datetime (live probe 2026-09-19: no login wall, structure verified)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "threads_search");
    expect(src.mcpFallback).toBeUndefined();
    expect(src.articleScript).toContain("/post/");
    expect(src.articleScript).toContain("datetime");
  });

  it("google_search keeps pool as its last layer and enters AUTOGEN_EXCLUDED (it IS search — no own domain to site:)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "google_search");
    expect(src.mcpFallback, "Grok bridge retired (grilling ruling 5, #307)").toBeUndefined();
    expect(src.googleSiteFallback).toBeUndefined();
    expect(AUTOGEN_EXCLUDED_SOURCES.has("google_search")).toBe(true);
    expect(shouldAutoGenGoogleSiteFallback(src)).toBe(false);
  });

  it("mcp_grok_search is the second Bigsong carrier — apiFallback, never pool-eligible (#307)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "mcp_grok_search");
    expect(src.apiFallback).toBeDefined();
    expect(src.apiFallback.resultMapper).toBeTypeOf("function");
    expect(src.apiFallback.promptTemplate).toBeDefined();
    expect(src.poolEligible).toBeUndefined();
    expect(isPoolEligible(src)).toBe(false);
  });
});

// ─── #307 promptTemplate (2026-09-19 grilling verdicts) ───
//
// 裁决 3：Grok 查询模板入 registry per-source 字段——显式 7 天窗 + 强制
// 日期输出 + 排除 wiki/评测站 + 去掉 China-AI 限定（旧 bridge toolArgs 查询
// 为基型）。插值发生在 collectFromBigsong（search-sources.mjs），registry 只
// 锁模板契约；x_search 保持裸关键词（平台查询即关键词本身）。

describe("#307 mcp_grok_search promptTemplate", () => {
  const src = ALL_SOURCES.find((s) => s.name === "mcp_grok_search");

  it("exists only on mcp_grok_search — x_search keeps the raw-keyword query", () => {
    expect(src.apiFallback.promptTemplate).toBeDefined();
    const xSearch = ALL_SOURCES.find((s) => s.name === "x_search");
    expect(xSearch.apiFallback.promptTemplate).toBeUndefined();
  });

  it("buildQuery pins an explicit 7-day window and injects today's date", () => {
    const q = src.apiFallback.promptTemplate.buildQuery("DeepSeek", {
      today: "2026-09-19",
    });
    expect(q).toContain("last 7 days");
    expect(q).toContain("2026-09-19");
  });

  it("buildQuery forces dated results and excludes wiki/review pages", () => {
    const q = src.apiFallback.promptTemplate.buildQuery("DeepSeek", { today: "2026-09-19" });
    expect(q.toLowerCase()).toContain("date");
    expect(q).toContain("Wikipedia");
  });

  it("buildQuery drops the China-AI focus qualifier (generic web search, #307)", () => {
    const q = src.apiFallback.promptTemplate.buildQuery("DeepSeek", { today: "2026-09-19" });
    expect(q).not.toMatch(/chinese ai|china ai/i);
  });

  it("buildQuery tolerates a missing today arg (defensive default)", () => {
    expect(() => src.apiFallback.promptTemplate.buildQuery("DeepSeek")).not.toThrow();
  });

  it("buildQuery pins a machine-parseable output contract (mapper depends on it)", () => {
    const q = src.apiFallback.promptTemplate.buildQuery("DeepSeek", { today: "2026-09-19" });
    // The strict per-line format the mapper parses (title — URL — date)
    expect(q).toContain("**");
    expect(q).toMatch(/YYYY-MM-DD/);
    expect(q).toContain("NO_RESULTS");
  });

  // Live smoke 2026-09-19 (recovered upstream): the model returns PROSE +
  // citations when unconstrained — parseGrokListResult (numbered-list format)
  // extracts 0 items from it. The web mapper parses the contract format and
  // maps the trailing date to publishedAt (news contract).
  it("resultMapper parses the contract line format with publishedAt", () => {
    const text = [
      "1. **DeepSeek V4.1 Flash Launches with Multimodal Capabilities** — https://emergent.sh/deepseek — 2026-09-10",
      "2. **DeepSeek ships V4.1 Flash** — https://example.com/v4 — 2026-09-12",
      "",
      "NO_RESULTS is returned when nothing qualifies.",
    ].join("\n");
    const mapped = src.apiFallback.resultMapper(text);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].title).toBe("DeepSeek V4.1 Flash Launches with Multimodal Capabilities");
    expect(mapped[0].url).toBe("https://emergent.sh/deepseek");
    expect(mapped[0].publishedAt).toBe("2026-09-10");
    expect(mapped[1].url).toBe("https://example.com/v4");
  });

  it("resultMapper keeps a lenient numbered-bold path (URL found, date optional)", () => {
    const text = "1. **Some headline** — https://example.com/a";
    const mapped = src.apiFallback.resultMapper(text);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].url).toBe("https://example.com/a");
    expect(mapped[0].publishedAt).toBeUndefined();
  });

  it("resultMapper returns empty for prose responses (fail-closed, no invention)", () => {
    const prose =
      '**No news articles or results published in the last 7 days were found for "DeepSeek".**[[1]](https://designforonline.com/x)\n\nAll web search results in this timeframe were either:\n- Pages with publication dates from earlier, or\n- Review/comparison aggregator pages.';
    expect(src.apiFallback.resultMapper(prose)).toEqual([]);
  });
});
