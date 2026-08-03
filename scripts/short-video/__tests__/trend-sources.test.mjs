import { describe, it, expect } from "vitest";
import {
  NEWS_SOURCES,
  SELF_MEDIA_SOURCES,
  ALL_SOURCES,
  DEFAULT_KEYWORDS,
} from "../lib/trend-sources.mjs";

// ─── Source structure validation ───

describe("Source structure", () => {
  it("NEWS_SOURCES has 5 sources", () => {
    expect(NEWS_SOURCES).toHaveLength(5);
  });

  it("SELF_MEDIA_SOURCES has 6 sources", () => {
    expect(SELF_MEDIA_SOURCES).toHaveLength(6);
  });

  it("ALL_SOURCES has 11 sources", () => {
    expect(ALL_SOURCES).toHaveLength(11);
  });

  it("each source has required fields", () => {
    for (const source of ALL_SOURCES) {
      expect(source.name).toBeTruthy();
      expect(source.label).toBeTruthy();
      expect(typeof source.needsAuth).toBe("boolean");
      expect(typeof source.url).toBe("function");
      expect(typeof source.extractScript).toBe("string");
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

  it("includes all 5 original sources", () => {
    const names = NEWS_SOURCES.map((s) => s.name);
    expect(names).toContain("qbitai");
    expect(names).toContain("jiqizhixin");
    expect(names).toContain("36kr");
    expect(names).toContain("techcrunch");
    expect(names).toContain("bloomberg");
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
});

// ─── Extract scripts ───

describe("Extract scripts", () => {
  it("all extract scripts are non-empty strings", () => {
    for (const src of ALL_SOURCES) {
      expect(typeof src.extractScript).toBe("string");
      expect(src.extractScript.length).toBeGreaterThan(50);
    }
  });

  it("all extract scripts return results array", () => {
    for (const src of ALL_SOURCES) {
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
});

// ─── Default keywords ───

describe("Default keywords", () => {
  it("has default keywords", () => {
    expect(DEFAULT_KEYWORDS).toHaveLength(2);
    expect(DEFAULT_KEYWORDS).toContain("AI大模型");
    expect(DEFAULT_KEYWORDS).toContain("China AI");
  });
});
