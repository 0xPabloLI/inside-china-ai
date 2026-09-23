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
  detectBlockPage,
  detectLoginWall,
  detectZeroResults,
  EXTRACTION_EMPTY_LABEL,
  HEALTHY_VERDICTS,
  homeCandidates,
  isFailureVerdict,
  loginRedirectTarget,
  looksLikeResults,
  needsCdpSecondOpinion,
  needsSearchBoxDrive,
  PROBE_UNAUTHORITATIVE_VERDICTS,
  buildFindSearchBoxScript,
  buildSubmitSearchScript,
  templateFromLandedUrl,
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

  it("matches short latin keywords on word boundaries, not substrings", () => {
    // 2026-09-22: a Reddit 403 block page scored 237 hits for "AI" — every one
    // of them inside email/certain/domain. A phantom hit count is the worst
    // kind of wrong: it turns a blocked source into a "healthy" one.
    expect(countKeywordHits("Email certain domain available", "AI")).toBe(0);
    expect(countKeywordHits("Email: AI certain domain", "AI")).toBe(1);
    expect(countKeywordHits("AI-powered and AIs", "AI")).toBe(1);
  });
});

describe("detectLoginWall", () => {
  it("recognises a login destination", () => {
    expect(
      detectLoginWall({
        finalUrl: "https://www.ithome.com/user-login/index.htm?url=x&tip=登录以查看搜索结果",
      }),
    ).toBe(true);
    expect(
      detectLoginWall({ finalUrl: "https://passport.weibo.com/visitor/visitor?a=enter" }),
    ).toBe(true);
  });

  it("recognises an in-place gate that never leaves the URL", () => {
    // zhihu search: HTTP 200 on the search URL, but the anonymous visitor gets
    // "未搜索到相关内容" and a login call-to-action instead of results.
    expect(
      detectLoginWall({
        finalUrl: "https://www.zhihu.com/search?q=x",
        html: "未搜索到相关内容 登录/注册",
      }),
    ).toBe(false);
    expect(
      detectLoginWall({ finalUrl: "https://www.zhihu.com/search?q=x", html: "登录以查看搜索结果" }),
    ).toBe(true);
  });

  it("does not fire on an ordinary page that merely links a login", () => {
    expect(
      detectLoginWall({
        finalUrl: "https://www.qbitai.com/a/b",
        html: "<a href='/login'>登录</a>",
      }),
    ).toBe(false);
  });
});

describe("detectBlockPage", () => {
  it("treats an edge-WAF 403 as not-authoritative, not as a dead URL", () => {
    // xinhua so.news.cn: 403 + 159 bytes from openresty, 200 + JSON in a browser.
    expect(
      detectBlockPage({
        status: 403,
        html: "<html><head><title>403 Forbidden</title></head></html>",
      }),
    ).toBe(true);
  });

  it("does not rescue a real 404", () => {
    expect(detectBlockPage({ status: 404, html: "<html>Not Found</html>" })).toBe(false);
  });

  it("treats 429/503 as rate limiting whatever the body says", () => {
    expect(detectBlockPage({ status: 429, html: "" })).toBe(true);
  });
});

describe("detectZeroResults", () => {
  it("reads the page's own result count", () => {
    // thepaper's search page: HTTP 200, term echoed in the chrome, and the
    // page itself saying 找到约0个结果.
    expect(detectZeroResults("正在搜索 找到约0个结果 1中共中央政治局召开会议")).toBe(true);
    expect(detectZeroResults("没有找到相关内容")).toBe(true);
    expect(detectZeroResults("did not match any documents")).toBe(true);
  });

  it("does not fire on a page that has results", () => {
    expect(detectZeroResults("找到约 1,284 个结果")).toBe(false);
    expect(detectZeroResults("About 12,300 results")).toBe(false);
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

  it("marks a login-wall bounce as login-wall, not as a dead URL", () => {
    // Updated 2026-09-22: this used to assert `redirected-off-site`, which lumped
    // a login gate in with "the proxy sent us somewhere strange". The verdict now
    // names the actual cause, because the two need opposite follow-ups: a login
    // gate is a needsAuth finding, an off-site bounce is a probe bug.
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://passport.weibo.com/visitor/visitor?a=enter",
        homeUrl: "https://s.weibo.com/",
      }),
    ).toBe("login-wall");
  });

  it("calls an edge-WAF 403 probe-not-authoritative", () => {
    expect(
      classifyProbe({
        status: 403,
        finalUrl: "https://so.news.cn/getNews?keyword=AI",
        homeUrl: "https://so.news.cn/",
        html: "<html><head><title>403 Forbidden</title></head></html>",
      }),
    ).toBe("probe-not-authoritative");
  });

  it("calls a cross-host hop that still carries the term alive-off-site", () => {
    // google.com → google.com.hk and threads.net → threads.com are canonical
    // hops; reporting them as failures put four healthy sources in the repair
    // queue (three with 28–148 keyword hits).
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.google.com.hk/search?q=AI&tbm=nws",
        homeUrl: "https://www.google.com/",
        keywordHits: 39,
      }),
    ).toBe("alive-off-site");
  });

  it("still flags a cross-host hop that lost the term", () => {
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.google.com.hk/",
        homeUrl: "https://www.google.com/",
        keywordHits: 0,
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

  it("lets the page's own result count outweigh an echoed keyword", () => {
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.thepaper.cn/searchResult?keyword=AI",
        homeUrl: "https://www.thepaper.cn/",
        keywordHits: 1,
        html: "正在搜索 找到约0个结果",
      }),
    ).toBe("alive-zero-results");
  });

  it("still calls a page with both a keyword and results alive", () => {
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.thepaper.cn/searchResult?keyword=AI",
        homeUrl: "https://www.thepaper.cn/",
        keywordHits: 40,
        html: "找到约 1,204 个结果",
      }),
    ).toBe("alive");
  });

  it("does not call a listing source redirected-home when its URL IS the homepage", () => {
    // qbitai/36kr/guancha carry the site root as their url — home is where
    // they were sent, so "bounced back to home" is meaningless for them.
    // keywordHits is positive here so the only thing under test is the guard.
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://www.qbitai.com/",
        homeUrl: "https://www.qbitai.com/",
        keywordHits: 5,
        requestedUrl: "https://www.qbitai.com/",
      }),
    ).toBe("alive");
  });

  it("skips the relevance gate when no keyword is in play", () => {
    // keywordHits === null = listing/feed source (no query term to echo).
    expect(
      classifyProbe({
        status: 200,
        finalUrl: "https://36kr.com/",
        homeUrl: "https://36kr.com/",
        keywordHits: null,
        requestedUrl: "https://36kr.com/",
      }),
    ).toBe("alive");
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
    expect(found[0].url).toBe(
      "https://www.ithome.com/search?word=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD",
    );
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

describe("verdict sets", () => {
  it("keeps probe-side answers out of the failure ledger", () => {
    // The whole point of the 2026-09-22 accuracy pass: a WAF 403 and a login
    // gate say nothing about whether the source is dead.
    expect(isFailureVerdict("probe-not-authoritative")).toBe(false);
    expect(isFailureVerdict("login-wall")).toBe(false);
    expect(isFailureVerdict("alive")).toBe(false);
    expect(isFailureVerdict("alive-off-site")).toBe(false);
    for (const v of [
      "http-dead",
      "redirected-home",
      "redirected-off-site",
      "alive-no-keyword",
      "network-error",
    ]) {
      expect(isFailureVerdict(v)).toBe(true);
    }
  });

  it("asks for a browser second opinion on everything that is not healthy", () => {
    for (const v of [...HEALTHY_VERDICTS]) expect(needsCdpSecondOpinion(v)).toBe(false);
    for (const v of [...PROBE_UNAUTHORITATIVE_VERDICTS, "http-dead", "redirected-home"]) {
      expect(needsCdpSecondOpinion(v)).toBe(true);
    }
  });
});

describe("templateFromLandedUrl", () => {
  it("recovers a path-shaped search URL (ithome's real shape)", () => {
    // The registry carried `/search?word=…` (404); driving the site's own search
    // box lands on `/search/{kw}.html` — no query parameter at all.
    expect(
      templateFromLandedUrl(
        "https://www.ithome.com/search/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD.html",
        "人工智能",
      ),
    ).toMatchObject({
      template: "https://www.ithome.com/search/{kw}.html",
      shape: "path",
    });
  });

  it("recovers a hash-route search URL (xinhua's so.news.cn)", () => {
    expect(
      templateFromLandedUrl(
        "https://so.news.cn/#search/0/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD/1/",
        "人工智能",
      ),
    ).toMatchObject({
      template: "https://so.news.cn/#search/0/{kw}/1/",
      shape: "hash",
    });
  });

  it("recovers a query-parameter search URL and names the parameter", () => {
    expect(templateFromLandedUrl("https://www.google.com/search?q=AI&tbm=nws", "AI")).toMatchObject(
      {
        template: "https://www.google.com/search?q={kw}&tbm=nws",
        param: "q",
        shape: "query",
      },
    );
  });

  it("refuses to invent a template from a page that cannot carry the term", () => {
    expect(templateFromLandedUrl("https://www.ithome.com/", "人工智能")).toBeNull();
    expect(
      templateFromLandedUrl("https://www.ithome.com/user-login/index.htm?url=x", "人工智能"),
    ).toBeNull();
  });
});

describe("loginRedirectTarget", () => {
  it("reads the destination out of a double-encoded login redirect", () => {
    // The gated site still tells us which URL it would have served. The result
    // keeps percent-encoding (URL.toString() normalises rather than decodes),
    // which is what templateFromLandedUrl expects.
    const redirect =
      "https://www.ithome.com/user-login/index.htm?url=https%3a%2f%2fwww.ithome.com%2fsearch%2f%25e4%25ba%25ba%25e5%25b7%25a5%25e6%2599%25ba%25e8%2583%25bd.html&_id=redirect&tip=x";
    const target = loginRedirectTarget(redirect);
    expect(target).toBe("https://www.ithome.com/search/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD.html");
    // …and the recovered URL round-trips into the template the registry needs.
    expect(templateFromLandedUrl(target, "人工智能").template).toBe(
      "https://www.ithome.com/search/{kw}.html",
    );
  });

  it("returns null when the redirect carries no destination", () => {
    expect(loginRedirectTarget("https://passport.weibo.com/visitor/visitor?a=enter")).toBeNull();
  });
});

describe("homeCandidates", () => {
  it("adds the sibling search subdomains the registry URL does not reveal", () => {
    // xinhua's registry URL lives on www.news.cn while the real search page is
    // so.news.cn — the origin alone would never find it.
    const candidates = homeCandidates("https://www.news.cn/search/news.htm?keyword=AI");
    expect(candidates[0]).toBe("https://www.news.cn/");
    expect(candidates).toContain("https://so.news.cn/");
  });
});

describe("search-box driving scripts", () => {
  it("penalises component-library combobox inputs", () => {
    // An Ant-Design <Select>'s hidden filter input carries type="search" and
    // would otherwise win the naive selector walk; submitting it does nothing.
    const script = buildFindSearchBoxScript();
    expect(script).toContain("ant-select");
    expect(script).toContain("aria-autocomplete");
  });

  it("drives React/Vue controlled inputs through the native value setter", () => {
    const script = buildSubmitSearchScript("人工智能", 0);
    expect(script).toContain("HTMLInputElement.prototype");
    expect(script).toContain("人工智能");
    expect(script).toContain("ranked[0]");
  });

  it("prefers a clickable search button and falls back to form then Enter", () => {
    const script = buildSubmitSearchScript("AI", 1);
    expect(script).toContain("button:");
    expect(script).toContain("form-submit");
    expect(script).toContain("synthetic-enter");
    expect(script).toContain("ranked[1]");
  });
});

describe("needsSearchBoxDrive — the third axis", () => {
  // 2026-09-23, douyin: axis 1 said `alive-no-keyword`, axis 2 said `alive` with
  // 20 real result cards on screen, and the source still produced 0 rows. The
  // old gate ("drive the search box only when the URL is unhealthy") therefore
  // left a dead source sitting in the healthy column forever.
  it("drives the box when the URL is healthy but the extraction is empty", () => {
    expect(needsSearchBoxDrive({ verdict: "alive", extracted: 0, keyword: "人工智能" })).toBe(true);
  });

  it("leaves a healthy URL that really extracts alone", () => {
    expect(needsSearchBoxDrive({ verdict: "alive", extracted: 20, keyword: "人工智能" })).toBe(
      false,
    );
  });

  it("treats 'not measured' as unknown, not as empty", () => {
    // `null` = no articleScript, or the script threw. Absence of a measurement
    // must never be read as evidence of a broken extraction, or every api
    // source without a script would get driven through a search box.
    expect(needsSearchBoxDrive({ verdict: "alive", extracted: null, keyword: "AI" })).toBe(false);
  });

  it("still drives the box for an unhealthy URL, measured or not", () => {
    expect(needsSearchBoxDrive({ verdict: "http-dead", extracted: null, keyword: "AI" })).toBe(
      true,
    );
    expect(
      needsSearchBoxDrive({ verdict: "probe-not-authoritative", extracted: null, keyword: "AI" }),
    ).toBe(true);
  });

  it("never drives anything without a keyword in play", () => {
    expect(needsSearchBoxDrive({ verdict: "http-dead", extracted: 0, keyword: null })).toBe(false);
    expect(needsSearchBoxDrive({ verdict: "http-dead", extracted: 0, keyword: "" })).toBe(false);
  });

  it("names the third-axis label distinctly from the other outcomes", () => {
    expect(EXTRACTION_EMPTY_LABEL).toBe("url-alive-but-extraction-empty");
    expect(HEALTHY_VERDICTS.has(EXTRACTION_EMPTY_LABEL)).toBe(false);
  });
});
