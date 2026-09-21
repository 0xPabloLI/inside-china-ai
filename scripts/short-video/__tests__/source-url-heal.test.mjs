/**
 * Tests for #269 Phase 2 — URL-pattern discovery primitives.
 *
 * Each case pins a rule that a real sweep got wrong before it was encoded:
 *   · GB2312 bodies decoded as UTF-8 read as "no keyword" (false content
 *     vacuum), so decodeHtml has to honour the declared charset.
 *   · An error template that echoes the query is NOT a results page —
 *     xinhua `www.news.cn/search?q=…` returns 200 + keyword and would
 *     otherwise be reported as a working replacement pattern.
 *   · Anchor text containing 搜索 is not a search endpoint (an article titled
 *     "…AI搜索内容" matched it), so the href itself must look like search.
 */
import { describe, it, expect } from "vitest";
import {
  decodeHtml,
  countKeywordHits,
  classifyProbe,
  looksLikeResults,
  extractSearchForms,
  extractSearchLinks,
  buildTemplateCandidates,
  extractRssLinks,
  inspectFeed,
  deriveCandidates,
} from "../lib/source-url-heal.mjs";

const HOME = "https://www.ithome.com/";

describe("decodeHtml", () => {
  it("honours a GB2312 content-type instead of mangling to UTF-8", () => {
    const bytes = new Uint8Array([0xc8, 0xcb, 0xb9, 0xa4, 0xd6, 0xc7, 0xc4, 0xdc]); // 人工智能 in GBK
    const { text, charset } = decodeHtml(bytes, "text/html; charset=gb2312");
    expect(charset).toBe("gb18030");
    expect(text).toBe("人工智能");
  });

  it("falls back to a meta charset when the header has none", () => {
    const head = '<meta http-equiv="Content-Type" content="text/html; charset=gb2312">';
    const { charset } = decodeHtml(new TextEncoder().encode(head + "人工智能"), "");
    expect(charset).toBe("gb18030");
  });
});

describe("countKeywordHits", () => {
  it("counts CJK occurrences", () => {
    expect(countKeywordHits("人工智能与人工智能", "人工智能")).toBe(2);
  });

  it("is case-insensitive for latin keywords only", () => {
    expect(countKeywordHits("ai AI Ai", "ai")).toBe(3);
    expect(countKeywordHits("人工智能", "AI")).toBe(0);
  });
});

describe("classifyProbe", () => {
  it("marks HTTP >= 400 dead", () => {
    expect(classifyProbe({ status: 404, finalUrl: HOME, homeUrl: HOME })).toBe("http-dead");
  });

  it("marks a bounce back to the homepage as redirected-home", () => {
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.ithome.com/",
        homeUrl: HOME,
        keywordHits: 18,
      }),
    ).toBe("redirected-home");
  });

  it("marks a login-wall bounce as redirected-off-site", () => {
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://passport.weibo.com/visitor/visitor?a=enter",
        homeUrl: "https://s.weibo.com/",
      }),
    ).toBe("redirected-off-site");
  });

  it("flags a 200 with no keyword echo as alive-no-keyword", () => {
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.jiqizhixin.com/search?keywords=x",
        homeUrl: "https://www.jiqizhixin.com/",
        keywordHits: 0,
      }),
    ).toBe("alive-no-keyword");
  });

  it("keeps a real search page alive", () => {
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.leiphone.com/search?word=AI",
        homeUrl: "https://www.leiphone.com/",
        keywordHits: 12,
      }),
    ).toBe("alive");
  });
});

describe("looksLikeResults", () => {
  it("rejects an error template that echoes the query", () => {
    const errorPage = `<!DOCTYPE HTML><html><head><title>404 Not Found</title>
      <link rel="stylesheet" href="ErrorPageTemplate.css"></head><body>AI 人工智能</body></html>`;
    expect(looksLikeResults(errorPage)).toBe(false);
  });

  it("accepts a page carrying result links with real anchor text", () => {
    const page = `<a href="https://x.com/a">人工智能芯片最新进展报道</a>
      <a href="https://x.com/b">大模型推理成本下降分析</a>
      <a href="https://x.com/c">国产GPU生态建设现状</a>`;
    expect(looksLikeResults(page)).toBe(true);
  });

  it("rejects a page whose links are all short or login anchors", () => {
    expect(looksLikeResults(`<a href="/login">登录</a><a href="#">更多</a>`)).toBe(false);
  });
});

describe("extractSearchForms", () => {
  it("derives a keyword URL from a GET form and its named input", () => {
    const html = `<form action="/search" method="get">
        <input type="text" name="word" value="请输入关键词">
        <input type="submit" value="搜索">
      </form>`;
    const found = extractSearchForms(html, HOME, "人工智能");
    expect(found).toHaveLength(1);
    expect(found[0].param).toBe("word");
    expect(found[0].url).toBe("https://www.ithome.com/search?word=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD");
  });

  it("skips POST forms (no URL can carry the keyword)", () => {
    const html = `<form action="/search" method="post"><input name="q"></form>`;
    expect(extractSearchForms(html, HOME, "AI")).toHaveLength(0);
  });
});

describe("extractSearchLinks", () => {
  it("ignores article links whose text merely contains 搜索", () => {
    const html = `<a href="https://www.ithome.com/1/005/465.htm">跨境快消品牌如何做AI搜索内容？</a>`;
    expect(extractSearchLinks(html, HOME)).toHaveLength(0);
  });

  it("keeps a real search endpoint link", () => {
    const html = `<a href="/search?word=x">搜索</a>`;
    expect(extractSearchLinks(html, HOME)[0].url).toBe("https://www.ithome.com/search?word=x");
  });
});

describe("buildTemplateCandidates / extractRssLinks", () => {
  it("substitutes the keyword into every template", () => {
    const all = buildTemplateCandidates(HOME, "AI");
    expect(all).toHaveLength(9);
    expect(all[0].url).toBe("https://www.ithome.com/search?q=AI");
    expect(all.every((c) => c.url.includes("AI"))).toBe(true);
  });

  it("picks up declared RSS alternates and dedupes guesses", () => {
    const html = `<link rel="alternate" type="application/rss+xml" title="RSS 2.0" href="/rss/">`;
    const feeds = extractRssLinks(html, HOME);
    expect(feeds[0]).toMatchObject({ url: "https://www.ithome.com/rss/", source: "rss-link" });
    const urls = feeds.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("inspectFeed", () => {
  it("counts items and reports the newest pubDate", () => {
    const feed = `<?xml version="1.0"?><rss><channel>
      <item><title>A</title><pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate></item>
      <item><title>B</title><pubDate>Sun, 20 Sep 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const info = inspectFeed(feed);
    expect(info.itemCount).toBe(2);
    expect(info.newest).toBe("2026-09-21T10:00:00.000Z");
  });
});

describe("deriveCandidates", () => {
  it("orders evidence cheapest-first: form, then link, then template", () => {
    const html = `<form action="/search" method="get"><input name="word"></form>
      <a href="/search?word=x">搜索</a>`;
    const sources = deriveCandidates(html, HOME, "AI").map((c) => c.source);
    expect(sources[0]).toBe("form");
    expect(sources).toContain("link");
    expect(sources.indexOf("template")).toBeGreaterThan(sources.indexOf("link"));
  });
});
