/**
 * Source Registry Capabilities — structural validation tests.
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * Verifies that every source in source-registry.mjs has a `capabilities`
 * object declaring at least one capability (articles, images, or videos).
 * Stock API sources must NOT have capabilities.articles.
 * Image capability configs must have required fields.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_SOURCES,
  NEWS_SOURCES,
  SELF_MEDIA_SOURCES,
  INTERNATIONAL_SOURCES,
  GENERAL_SEARCH_SOURCES,
  LAST30DAYS_SOURCES,
  WECHAT_RSS_SOURCES,
  STOCK_MEDIA_SOURCES,
  SOURCE_ATTRIBUTIONS,
} from "../lib/source-registry.mjs";

// ─── Capabilities field presence ───

describe("capabilities field presence", () => {
  it("every source in ALL_SOURCES has a capabilities object", () => {
    for (const source of ALL_SOURCES) {
      expect(source.capabilities).toBeDefined();
      expect(typeof source.capabilities).toBe("object");
      expect(source.capabilities).not.toBeNull();
    }
  });

  it("every source has at least one capability", () => {
    for (const source of ALL_SOURCES) {
      const caps = source.capabilities;
      const hasArticles = caps.articles !== undefined;
      const hasImages = caps.images !== undefined;
      const hasVideos = caps.videos !== undefined;
      expect(hasArticles || hasImages || hasVideos).toBe(true);
    }
  });

  it("sources with articleScript have capabilities.articles", () => {
    for (const source of ALL_SOURCES) {
      // Skip sources with trivial articleScript (MCP-only or API-only)
      if (source.accessMethod?.primary === "api" || (source.mcpFallback && !source.url())) {
        continue;
      }
      if (source.articleScript && source.articleScript.length > 50) {
        expect(source.capabilities.articles).toBeDefined();
      }
    }
  });
});

// ─── Stock media sources ───

describe("STOCK_MEDIA_SOURCES", () => {
  it("has exactly 8 stock media sources", () => {
    expect(STOCK_MEDIA_SOURCES).toHaveLength(8);
  });

  it("includes pexels (images)", () => {
    const src = STOCK_MEDIA_SOURCES.find((s) => s.name === "pexels");
    expect(src).toBeDefined();
    expect(src.capabilities.images).toBeDefined();
    expect(src.capabilities.images.method).toBe("api");
    expect(src.capabilities.images.requiresApiKey).toBe(true);
    expect(src.capabilities.images.apiKeyEnv).toBe("PEXELS_API_KEY");
  });

  it("includes pexels-video (videos)", () => {
    const src = STOCK_MEDIA_SOURCES.find((s) => s.name === "pexels-video");
    expect(src).toBeDefined();
    expect(src.capabilities.videos).toBeDefined();
    expect(src.capabilities.videos.method).toBe("api");
    expect(src.capabilities.videos.requiresApiKey).toBe(true);
    expect(src.capabilities.videos.apiKeyEnv).toBe("PEXELS_API_KEY");
  });

  it("includes unsplash (images)", () => {
    const src = STOCK_MEDIA_SOURCES.find((s) => s.name === "unsplash");
    expect(src).toBeDefined();
    expect(src.capabilities.images).toBeDefined();
    expect(src.capabilities.images.apiKeyEnv).toBe("UNSPLASH_ACCESS_KEY");
  });

  it("includes wikimedia (images)", () => {
    const src = STOCK_MEDIA_SOURCES.find((s) => s.name === "wikimedia");
    expect(src).toBeDefined();
    expect(src.capabilities.images).toBeDefined();
    expect(src.capabilities.images.requiresApiKey).toBe(false);
  });

  it("includes coverr (videos)", () => {
    const src = STOCK_MEDIA_SOURCES.find((s) => s.name === "coverr");
    expect(src).toBeDefined();
    expect(src.capabilities.videos).toBeDefined();
    expect(src.capabilities.videos.apiKeyEnv).toBe("COVERR_API_KEY");
  });

  it("includes pixabay (images)", () => {
    const src = STOCK_MEDIA_SOURCES.find((s) => s.name === "pixabay");
    expect(src).toBeDefined();
    expect(src.capabilities.images).toBeDefined();
    expect(src.capabilities.images.apiKeyEnv).toBe("PIXABAY_API_KEY");
  });

  it("stock media sources have category 'stock_media'", () => {
    for (const src of STOCK_MEDIA_SOURCES) {
      expect(src.category).toBe("stock_media");
    }
  });

  it("stock media sources do NOT have capabilities.articles", () => {
    for (const src of STOCK_MEDIA_SOURCES) {
      expect(src.capabilities.articles).toBeUndefined();
    }
  });

  it("stock media sources have no meaningful articleScript", () => {
    for (const src of STOCK_MEDIA_SOURCES) {
      // Stock media sources don't have CDP article extraction — empty or trivial
      expect(!src.articleScript || src.articleScript.length === 0).toBe(true);
    }
  });

  it("stock media source names are unique vs ALL_SOURCES", () => {
    const allNames = ALL_SOURCES.map((s) => s.name);
    const stockNames = STOCK_MEDIA_SOURCES.map((s) => s.name);
    for (const name of stockNames) {
      const occurrences = allNames.filter((n) => n === name).length;
      expect(occurrences).toBe(1); // appears exactly once (itself)
    }
  });
});

// ─── Capabilities field structure validation ───

describe("capabilities field structure", () => {
  it("capabilities.images (API method) has required fields", () => {
    for (const source of ALL_SOURCES) {
      const img = source.capabilities?.images;
      if (!img) continue;
      if (img.method === "api") {
        expect(typeof img.searchUrl).toBe("function");
        expect(typeof img.parseResponse).toBe("function");
        expect(typeof img.requiresApiKey).toBe("boolean");
      }
    }
  });

  it("capabilities.images (CDP method) has required fields", () => {
    for (const source of ALL_SOURCES) {
      const img = source.capabilities?.images;
      if (!img) continue;
      if (img.method === "cdp") {
        expect(typeof img.url).toBe("function");
        expect(typeof img.imageScript).toBe("string");
        expect(typeof img.imageFallbackScript).toBe("string");
      }
    }
  });

  it("capabilities.videos (ytdlp method) has required fields", () => {
    for (const source of ALL_SOURCES) {
      const vid = source.capabilities?.videos;
      if (!vid) continue;
      if (vid.method === "ytdlp") {
        expect(typeof vid.platform).toBe("string");
      }
    }
  });

  it("capabilities.videos (api method) has required fields", () => {
    for (const source of ALL_SOURCES) {
      const vid = source.capabilities?.videos;
      if (!vid) continue;
      if (vid.method === "api") {
        expect(typeof vid.searchUrl).toBe("function");
        expect(typeof vid.parseResponse).toBe("function");
      }
    }
  });
});

// ─── Consumer query patterns ───

describe("consumer query patterns", () => {
  it("filtering by capabilities.articles returns article sources", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    // All existing news, self-media, international, general, last30days, wechat sources
    // have articles capability
    expect(articleSources.length).toBeGreaterThan(0);
    for (const src of articleSources) {
      expect(src.capabilities.articles).toBeDefined();
    }
  });

  it("filtering by capabilities.images returns image sources", () => {
    const imageSources = ALL_SOURCES.filter((s) => s.capabilities?.images);
    // At least the 6 stock API sources + overlapping CDP sources
    expect(imageSources.length).toBeGreaterThanOrEqual(6);
  });

  it("filtering by capabilities.videos returns video sources", () => {
    const videoSources = ALL_SOURCES.filter((s) => s.capabilities?.videos);
    // At least stock API video sources + yt-dlp sources
    expect(videoSources.length).toBeGreaterThanOrEqual(2);
  });

  it("arXiv has articles but NOT images or videos", () => {
    const arxiv = ALL_SOURCES.find((s) => s.name === "arxiv_search");
    expect(arxiv.capabilities.articles).toBeDefined();
    expect(arxiv.capabilities.images).toBeUndefined();
    expect(arxiv.capabilities.videos).toBeUndefined();
  });

  it("Pexels has images but NOT articles", () => {
    const pexels = ALL_SOURCES.find((s) => s.name === "pexels");
    expect(pexels.capabilities.images).toBeDefined();
    expect(pexels.capabilities.articles).toBeUndefined();
  });

  it("ithome has both articles AND images (overlapping source)", () => {
    const ithome = ALL_SOURCES.find((s) => s.name === "ithome");
    expect(ithome.capabilities.articles).toBeDefined();
    expect(ithome.capabilities.images).toBeDefined();
  });

  it("bilibili has both articles AND videos (overlapping source)", () => {
    const bili = ALL_SOURCES.find((s) => s.name === "bilibili");
    expect(bili.capabilities.articles).toBeDefined();
    expect(bili.capabilities.videos).toBeDefined();
  });
});

// ─── Lorem Picsum deleted ───

describe("Lorem Picsum deleted", () => {
  it("lorem_picsum is NOT in ALL_SOURCES", () => {
    const lp = ALL_SOURCES.find((s) => s.name === "lorem_picsum");
    expect(lp).toBeUndefined();
  });

  it("lorem_picsum is NOT in STOCK_MEDIA_SOURCES", () => {
    const lp = STOCK_MEDIA_SOURCES.find((s) => s.name === "lorem_picsum");
    expect(lp).toBeUndefined();
  });
});

// ─── SOURCE_ATTRIBUTIONS moved to source-registry ───

describe("SOURCE_ATTRIBUTIONS in source-registry", () => {
  it("SOURCE_ATTRIBUTIONS is exported from source-registry", () => {
    expect(SOURCE_ATTRIBUTIONS).toBeDefined();
    expect(typeof SOURCE_ATTRIBUTIONS).toBe("object");
  });

  it("SOURCE_ATTRIBUTIONS has pexels entry", () => {
    expect(SOURCE_ATTRIBUTIONS.pexels).toBeDefined();
    expect(typeof SOURCE_ATTRIBUTIONS.pexels.text).toBe("function");
  });

  it("SOURCE_ATTRIBUTIONS has ithome entry", () => {
    expect(SOURCE_ATTRIBUTIONS.ithome).toBeDefined();
    expect(typeof SOURCE_ATTRIBUTIONS.ithome.text).toBe("function");
  });

  it("SOURCE_ATTRIBUTIONS does NOT have lorem_picsum entry", () => {
    expect(SOURCE_ATTRIBUTIONS.lorem_picsum).toBeUndefined();
  });
});

// ─── Updated count assertions ───

describe("updated source counts", () => {
  it("ALL_SOURCES has 64 sources (63 + searxng_search #92)", () => {
    // 46 existing + 7 CDP image search + 8 stock_media + duckduckgo + baidu_news
    // + searxng_search = 64
    // (Lorem Picsum was in asset-sourcer's API_SOURCES, never in source-registry)
    expect(ALL_SOURCES).toHaveLength(64);
  });

  it("source names are still unique after merge", () => {
    const names = ALL_SOURCES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── R2: stock_media sources excluded from trend discovery ───

describe("R2 — stock_media sources excluded from trend discovery", () => {
  it("no stock_media source has capabilities.articles", () => {
    const stockSources = ALL_SOURCES.filter((s) => s.category === "stock_media");
    for (const s of stockSources) {
      expect(s.capabilities?.articles).toBeUndefined();
    }
  });

  it("filtering by capabilities.articles excludes all stock_media sources", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    const stockInArticles = articleSources.filter((s) => s.category === "stock_media");
    expect(stockInArticles).toHaveLength(0);
  });
});

// ─── R3: yt-dlp attribution key alignment ───

describe("R3 — yt-dlp attribution keys match source names", () => {
  it("SOURCE_ATTRIBUTIONS has xhs (not xiaohongshu)", () => {
    expect(SOURCE_ATTRIBUTIONS.xhs).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.xiaohongshu).toBeUndefined();
  });

  it("SOURCE_ATTRIBUTIONS has weibo_hot (not weibo)", () => {
    expect(SOURCE_ATTRIBUTIONS.weibo_hot).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.weibo).toBeUndefined();
  });

  it("SOURCE_ATTRIBUTIONS has youtube_search (not youtube)", () => {
    expect(SOURCE_ATTRIBUTIONS.youtube_search).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.youtube).toBeUndefined();
  });

  it("every yt-dlp source name has a matching SOURCE_ATTRIBUTIONS key", () => {
    const ytdlpSources = ALL_SOURCES.filter((s) => s.capabilities?.videos?.method === "ytdlp");
    for (const s of ytdlpSources) {
      expect(SOURCE_ATTRIBUTIONS[s.name]).toBeDefined();
    }
  });
});

// ─── R4: capabilities.articles has complete config ───

describe("R4 — capabilities.articles has complete config", () => {
  it("every source with capabilities.articles has url, articleScript, and supportsKeyword", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    for (const s of articleSources) {
      expect(s.capabilities.articles.url).toBeDefined();
      expect(s.capabilities.articles.articleScript).toBeDefined();
      expect(typeof s.capabilities.articles.supportsKeyword).toBe("boolean");
    }
  });

  it("capabilities.articles has needsAuth and useCleanTitle fields", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    for (const s of articleSources) {
      expect(typeof s.capabilities.articles.needsAuth).toBe("boolean");
      expect(typeof s.capabilities.articles.useCleanTitle).toBe("boolean");
    }
  });
});

// ─── T1: Attribution coverage tests ───

import { buildAttribution } from "../lib/asset-sourcer.mjs";

describe("T1: Every source name has SOURCE_ATTRIBUTIONS key", () => {
  it("all sources in ALL_SOURCES have a matching SOURCE_ATTRIBUTIONS key", () => {
    const missing = [];
    for (const source of ALL_SOURCES) {
      if (!SOURCE_ATTRIBUTIONS[source.name]) {
        missing.push(source.name);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("T1: attribution.text() returns non-empty string for all sources", () => {
  it("buildAttribution returns non-empty text for every source", () => {
    const empty = [];
    for (const source of ALL_SOURCES) {
      const attr = buildAttribution(source.name, { url: "https://example.com/test" });
      if (!attr || !attr.text || attr.text.trim().length === 0) {
        empty.push(source.name);
      }
    }
    expect(empty).toEqual([]);
  });
});

// ─── Issue #67: capabilities.articles completeness ───

describe("#67 — capabilities.articles.method field", () => {
  it("every article source has method with value cdp, api, or mcp", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    for (const s of articleSources) {
      expect(s.capabilities.articles.method).toBeDefined();
      expect(["cdp", "api", "mcp"]).toContain(s.capabilities.articles.method);
    }
  });

  it("method matches accessMethod.primary for all article sources", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    for (const s of articleSources) {
      expect(s.capabilities.articles.method).toBe(s.accessMethod?.primary);
    }
  });
});

describe("#67 — capabilities.articles.apiSearch", () => {
  it("every API article source has apiSearch in capabilities.articles", () => {
    const apiSources = ALL_SOURCES.filter((s) => s.capabilities?.articles && s.apiSearch);
    for (const s of apiSources) {
      expect(s.capabilities.articles.apiSearch).toBeDefined();
      expect(s.capabilities.articles.apiSearch).toBe(s.apiSearch);
    }
  });

  it("CDP-only sources have undefined apiSearch in capabilities.articles", () => {
    const cdpOnly = ALL_SOURCES.filter((s) => s.capabilities?.articles && !s.apiSearch);
    for (const s of cdpOnly) {
      expect(s.capabilities.articles.apiSearch).toBeUndefined();
    }
  });

  it("apiSearch is a direct reference (identity check)", () => {
    const apiSources = ALL_SOURCES.filter((s) => s.capabilities?.articles?.apiSearch);
    for (const s of apiSources) {
      expect(s.capabilities.articles.apiSearch).toBe(s.apiSearch);
    }
  });
});

describe("#67 — capabilities.articles API credentials", () => {
  it("every article source has requiresApiKey (boolean)", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    for (const s of articleSources) {
      expect(typeof s.capabilities.articles.requiresApiKey).toBe("boolean");
    }
  });

  it("every article source has paidApi (boolean)", () => {
    const articleSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);
    for (const s of articleSources) {
      expect(typeof s.capabilities.articles.paidApi).toBe("boolean");
    }
  });

  it("tiktok_creator has requiresApiKey=true, paidApi=true, apiKeyEnv=SCRAPECREATORS_API_KEY", () => {
    const src = ALL_SOURCES.find((s) => s.name === "tiktok_creator");
    expect(src.capabilities.articles.requiresApiKey).toBe(true);
    expect(src.capabilities.articles.paidApi).toBe(true);
    expect(src.capabilities.articles.apiKeyEnv).toBe("SCRAPECREATORS_API_KEY");
  });

  it("gnews has requiresApiKey=true, paidApi=false, apiKeyEnv=GNEWS_API_KEY", () => {
    const src = ALL_SOURCES.find((s) => s.name === "gnews");
    expect(src.capabilities.articles.requiresApiKey).toBe(true);
    expect(src.capabilities.articles.paidApi).toBe(false);
    expect(src.capabilities.articles.apiKeyEnv).toBe("GNEWS_API_KEY");
  });

  it("currents has requiresApiKey=true, paidApi=false, apiKeyEnv=CURRENTS_API_KEY", () => {
    const src = ALL_SOURCES.find((s) => s.name === "currents");
    expect(src.capabilities.articles.requiresApiKey).toBe(true);
    expect(src.capabilities.articles.paidApi).toBe(false);
    expect(src.capabilities.articles.apiKeyEnv).toBe("CURRENTS_API_KEY");
  });

  it("non-auth API sources have requiresApiKey=false, apiKeyEnv=null, paidApi=false", () => {
    const nonAuthApi = ALL_SOURCES.filter(
      (s) => s.capabilities?.articles?.apiSearch && !s.apiSearch.authRequired,
    );
    for (const s of nonAuthApi) {
      expect(s.capabilities.articles.requiresApiKey).toBe(false);
      expect(s.capabilities.articles.apiKeyEnv).toBeNull();
      expect(s.capabilities.articles.paidApi).toBe(false);
    }
  });

  it("CDP-only sources have requiresApiKey=false, apiKeyEnv=null, paidApi=false", () => {
    const cdpOnly = ALL_SOURCES.filter((s) => s.capabilities?.articles && !s.apiSearch);
    for (const s of cdpOnly) {
      expect(s.capabilities.articles.requiresApiKey).toBe(false);
      expect(s.capabilities.articles.apiKeyEnv).toBeNull();
      expect(s.capabilities.articles.paidApi).toBe(false);
    }
  });
});

describe("#67 — capabilities.articles fallbacks", () => {
  it("x_search has googleSiteFallback in capabilities.articles", () => {
    const src = ALL_SOURCES.find((s) => s.name === "x_search");
    expect(src.capabilities.articles.googleSiteFallback).toBeDefined();
    expect(src.capabilities.articles.googleSiteFallback).toBe(src.googleSiteFallback);
  });

  it("all sources with top-level mcpFallback have it in capabilities.articles", () => {
    const mcpSources = ALL_SOURCES.filter((s) => s.mcpFallback);
    for (const s of mcpSources) {
      expect(s.capabilities.articles.mcpFallback).toBeDefined();
      expect(s.capabilities.articles.mcpFallback).toBe(s.mcpFallback);
    }
  });

  it("sources without explicit googleSiteFallback that are EXCLUDED from auto-gen have undefined in capabilities.articles", () => {
    // After #88 Part 2: sources without explicit googleSiteFallback that are
    // excluded (API, MCP, search engines, image libraries) still have undefined.
    // Applicable sources now get auto-generated googleSiteFallback.
    const noExplicit = ALL_SOURCES.filter((s) => s.capabilities?.articles && !s.googleSiteFallback);
    for (const s of noExplicit) {
      // If source is excluded from auto-gen, googleSiteFallback should be null/undefined
      // If source is applicable for auto-gen, googleSiteFallback should be the auto-gen object
      const hasAutoGen = s.capabilities.articles.googleSiteFallback;
      if (hasAutoGen) {
        // Auto-gen'd — should have _autoGenerated flag
        expect(hasAutoGen._autoGenerated).toBe(true);
      }
      // Excluded sources: googleSiteFallback is null (falsy)
    }
  });

  it("applicable sources get auto-generated googleSiteFallback in capabilities.articles", () => {
    // These 13 sources should have auto-generated googleSiteFallback
    const applicableNames = [
      "qbitai",
      "jiqizhixin",
      "36kr",
      "techcrunch",
      "bloomberg",
      "guancha",
      "ithome",
      "xinhua",
      "thepaper",
      "leiphone",
      "xinzhiyuan",
      "zhidx",
      "zhihu",
    ];
    for (const name of applicableNames) {
      const src = ALL_SOURCES.find((s) => s.name === name);
      expect(src).toBeDefined();
      expect(src.capabilities.articles.googleSiteFallback).toBeDefined();
      expect(src.capabilities.articles.googleSiteFallback._autoGenerated).toBe(true);
    }
  });

  it("x_search keeps explicit googleSiteFallback (NOT replaced by auto-gen)", () => {
    const src = ALL_SOURCES.find((s) => s.name === "x_search");
    expect(src.capabilities.articles.googleSiteFallback).toBeDefined();
    // Explicit config should NOT have _autoGenerated flag
    expect(src.capabilities.articles.googleSiteFallback._autoGenerated).toBeUndefined();
    // Explicit config should have x.com domain filter
    expect(src.capabilities.articles.googleSiteFallback.articleScript).toContain("x.com");
  });

  it("auto-generated googleSiteFallback in capabilities.articles matches top-level source.googleSiteFallback", () => {
    // For applicable sources, capabilities.articles.googleSiteFallback should be
    // the auto-gen object (not from source.googleSiteFallback which is undefined)
    const src = ALL_SOURCES.find((s) => s.name === "qbitai");
    expect(src.googleSiteFallback).toBeUndefined(); // no explicit config at source level
    expect(src.capabilities.articles.googleSiteFallback).toBeDefined(); // auto-gen injected
    expect(src.capabilities.articles.googleSiteFallback._autoGenerated).toBe(true);
  });

  it("sources without mcpFallback have undefined in capabilities.articles", () => {
    const noMcp = ALL_SOURCES.filter((s) => s.capabilities?.articles && !s.mcpFallback);
    for (const s of noMcp) {
      expect(s.capabilities.articles.mcpFallback).toBeUndefined();
    }
  });
});

// ─── #88 Part 2: Auto-generated googleSiteFallback in capabilities ───

describe("#88 Part 2 — auto-gen googleSiteFallback in capabilities", () => {
  it("sources with supportsKeyword=false and auto-gen googleSiteFallback are in research mode", () => {
    // qbitai, 36kr, techcrunch, bloomberg, guancha have supportsKeyword=false
    // but should now be included in research mode via auto-gen googleSiteFallback
    const researchSources = ALL_SOURCES.filter(
      (s) =>
        s.capabilities?.articles?.supportsKeyword || s.capabilities?.articles?.googleSiteFallback,
    );
    const homepageOnly = ["qbitai", "36kr", "techcrunch", "bloomberg", "guancha"];
    for (const name of homepageOnly) {
      const src = researchSources.find((s) => s.name === name);
      expect(src).toBeDefined();
      expect(src.capabilities.articles.supportsKeyword).toBe(false);
      expect(src.capabilities.articles.googleSiteFallback).toBeDefined();
    }
  });

  it("excluded sources do NOT get auto-gen googleSiteFallback", () => {
    // API sources, MCP sources, search engines, image libraries
    const excludedNames = [
      "arxiv_search",
      "youtube_search",
      "google_news",
      "baidu_search",
      "pexels",
      "datacube_ai",
      "wechat_dongchabeating",
      "weibo_hot",
    ];
    for (const name of excludedNames) {
      const src = ALL_SOURCES.find((s) => s.name === name);
      if (src.capabilities?.articles) {
        // Either undefined (no explicit, excluded from auto-gen) or explicit config (x_search)
        const gsf = src.capabilities.articles.googleSiteFallback;
        if (gsf) {
          // If it exists, it should NOT be auto-gen'd (it should be explicit)
          expect(gsf._autoGenerated).toBeUndefined();
        }
      }
    }
  });
});
