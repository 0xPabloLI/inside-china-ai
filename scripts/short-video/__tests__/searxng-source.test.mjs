import { describe, it, expect } from "vitest";
import { GENERAL_SEARCH_SOURCES, ALL_SOURCES } from "../lib/source-registry.mjs";
import { matchDomain, SITE_RATE_CONFIG } from "../lib/rate-limiter.mjs";

// ─── #92: SearXNG self-hosted metasearch source ───
//
// Deployed instance: Docker `searxng` in colima, port 8888.
// Primary path: JSON API (apiSearch, Layer 0 in collectFromSource).
// Fallback path: CDP against the HTML results page (articleScript).
//
// Real response shape (verified against localhost:8888):
//   { query, results: [{ url, title, content, publishedDate, engine, ... }],
//     unresponsive_engines: [[name, error], ...] }

const source = GENERAL_SEARCH_SOURCES.find((s) => s.name === "searxng_search");

// ─── Registration ───

describe("searxng_search registration", () => {
  it("is registered in GENERAL_SEARCH_SOURCES and ALL_SOURCES", () => {
    expect(source).toBeDefined();
    expect(ALL_SOURCES.some((s) => s.name === "searxng_search")).toBe(true);
  });

  it("is a keyword-supporting, auth-free general API source", () => {
    expect(source.category).toBe("general");
    expect(source.needsAuth).toBe(false);
    expect(source.supportsKeyword).toBe(true);
    expect(source.accessMethod.primary).toBe("api");
    expect(source.useCleanTitle).toBe(false);
  });

  it("does not consume paid API quota", () => {
    expect(source.apiSearch.paidApi).toBeFalsy();
    expect(source.apiSearch.authRequired).toBe(false);
  });
});

// ─── apiSearch (JSON API, primary path) ───

describe("searxng_search apiSearch", () => {
  it("builds a JSON API URL against the local instance with the China AI suffix", () => {
    const url = source.apiSearch.url("DeepSeek R1");
    expect(url).toBe(
      `http://localhost:8888/search?q=${encodeURIComponent("DeepSeek R1 China AI")}&format=json&categories=general&language=en`,
    );
  });

  it("parser maps SearXNG results to the article contract", () => {
    const payload = JSON.stringify({
      query: "deepseek china ai",
      results: [
        {
          title: "DeepSeek explained",
          url: "https://example.com/deepseek",
          content: "DeepSeek is an AI research company focused on frontier models. ".repeat(10),
          publishedDate: "2026-09-01T00:00:00Z",
          engine: "google cse",
        },
        { title: "No date result", url: "https://example.com/b", content: "short snippet" },
      ],
      unresponsive_engines: [],
    });
    const articles = source.apiSearch.parser(payload);
    expect(articles).toHaveLength(2);
    expect(articles[0]).toEqual({
      title: "DeepSeek explained",
      url: "https://example.com/deepseek",
      snippet: expect.stringMatching(/^DeepSeek is an AI research company/),
      publishedAt: "2026-09-01T00:00:00Z",
    });
    expect(articles[0].snippet.length).toBeLessThanOrEqual(200);
    expect(articles[1]).toEqual({
      title: "No date result",
      url: "https://example.com/b",
      snippet: "short snippet",
      publishedAt: "",
    });
  });

  it("parser caps results at 20", () => {
    const results = Array.from({ length: 35 }, (_, i) => ({
      title: `r${i}`,
      url: `https://example.com/${i}`,
      content: "x",
    }));
    const articles = source.apiSearch.parser(JSON.stringify({ results }));
    expect(articles).toHaveLength(20);
  });

  it("parser drops url-less results and returns [] for a result-less payload", () => {
    const withJunk = source.apiSearch.parser(
      JSON.stringify({
        results: [
          { title: "no url", content: "junk" },
          { title: "ok", url: "https://e.com" },
        ],
      }),
    );
    expect(withJunk).toEqual([{ title: "ok", url: "https://e.com", snippet: "", publishedAt: "" }]);
    expect(source.apiSearch.parser(JSON.stringify({ results: [] }))).toEqual([]);
    expect(source.apiSearch.parser(JSON.stringify({}))).toEqual([]);
  });
});

// ─── CDP fallback (HTML results page) ───

describe("searxng_search CDP fallback", () => {
  it("targets the HTML results page on the local instance", () => {
    const url = source.url("DeepSeek R1");
    expect(url).toBe(
      `http://localhost:8888/search?q=${encodeURIComponent("DeepSeek R1 China AI")}`,
    );
    expect(url).not.toContain("format=json");
  });

  it("has a non-trivial articleScript for DOM extraction", () => {
    expect(typeof source.articleScript).toBe("string");
    expect(source.articleScript).toContain("article.result");
    expect(source.articleScript).toContain("h3 a");
  });

  it("articleScript extracts title/url/snippet from the SearXNG result DOM", () => {
    // No DOM library in the node vitest env — hand-rolled stubs mirroring the
    // deployed SearXNG simple theme contract:
    //   article.result → h3 a {href, textContent}, p.content {textContent}
    // HTML parsing itself is verified by the real-data smoke against the
    // live instance (issue #92 comment).
    const text = (s) => ({ textContent: s });
    const link = (href, s) => ({ href, textContent: s });
    const article = ({ h3a, content }) => ({
      querySelector: (sel) => (sel === "h3 a" ? h3a : sel === "p.content" ? content : null),
    });
    const fakeDocument = {
      querySelectorAll: () => [
        article({
          h3a: link("https://www.deepseek.com/", "DeepSeek | Into the Unknown"),
          content: text("DeepSeek is an AI research company."),
        }),
        article({ h3a: link("https://example.com/no-snippet", "Second result"), content: null }),
        article({ h3a: null, content: text("orphan") }),
      ],
    };
    const results = new Function("document", `${source.articleScript}`)(fakeDocument);
    expect(results).toEqual([
      {
        title: "DeepSeek | Into the Unknown",
        url: "https://www.deepseek.com/",
        snippet: "DeepSeek is an AI research company.",
      },
      { title: "Second result", url: "https://example.com/no-snippet", snippet: "" },
    ]);
  });
});

// ─── Capabilities enrichment (source selection gate) ───

describe("searxng_search capabilities", () => {
  it("gets capabilities.articles so collectFromSource selects it", () => {
    const enriched = ALL_SOURCES.find((s) => s.name === "searxng_search");
    expect(enriched.capabilities?.articles).toBeDefined();
    expect(enriched.capabilities.articles.method).toBe("api");
    expect(enriched.capabilities.articles.supportsKeyword).toBe(true);
    expect(enriched.capabilities.articles.requiresApiKey).toBe(false);
    expect(enriched.capabilities.articles.paidApi).toBe(false);
    expect(enriched.capabilities.articles.apiSearch).toBe(source.apiSearch);
  });

  it("does not get an auto-generated googleSiteFallback (API sources skip it, #88)", () => {
    const enriched = ALL_SOURCES.find((s) => s.name === "searxng_search");
    expect(enriched.capabilities.articles.googleSiteFallback).toBeFalsy();
  });
});

// ─── Rate limiter: self-hosted frontend gets no throttle ───

describe("rate limiter localhost entry (#92)", () => {
  it("matches localhost to a dedicated zero-delay, uncapped config", () => {
    expect(matchDomain("http://localhost:8888/search?q=x")).toBe("localhost");
    const cfg = SITE_RATE_CONFIG["localhost"];
    expect(cfg.baseDelay).toBe(0);
    expect(cfg.maxPerHour).toBe(Infinity);
  });
});
