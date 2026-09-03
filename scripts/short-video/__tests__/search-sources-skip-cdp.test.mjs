// Issue #66: API→CDP fallback reasonableness check in collectFromSource.
//
// When a source's CDP url points at the SAME endpoint as its API url
// (wechat2rss_* RSS feeds, hackernews_search Algolia JSON, reddit_search .json),
// falling back to CDP after an API failure is pure waste: same URL, same result.
// The decision helper `shouldSkipCdpOnApiFail` must return true for those
// sources and false for sources whose CDP url is a distinct site-search page
// (gnews, arxiv_search, github_search, core_search, openalex_search, currents,
// noozra_search) or which have no API at all.

import { describe, it, expect } from "vitest";

import { shouldSkipCdpOnApiFail } from "../search-sources.mjs";
import { ALL_SOURCES, WECHAT_RSS_SOURCES } from "../lib/source-registry.mjs";

const byName = Object.fromEntries(ALL_SOURCES.map((s) => [s.name, s]));

describe("shouldSkipCdpOnApiFail (Issue #66 Step 0.5)", () => {
  it("skips CDP for every wechat2rss source (API url == CDP url, same RSS feed)", () => {
    expect(WECHAT_RSS_SOURCES.length).toBe(12);
    for (const source of WECHAT_RSS_SOURCES) {
      expect(shouldSkipCdpOnApiFail(source, "any"), source.name).toBe(true);
    }
  });

  it("skips CDP for hackernews_search (CDP url is the same Algolia JSON endpoint)", () => {
    expect(shouldSkipCdpOnApiFail(byName["hackernews_search"], "DeepSeek")).toBe(true);
  });

  it("skips CDP for reddit_search (CDP url is the same .json endpoint)", () => {
    expect(shouldSkipCdpOnApiFail(byName["reddit_search"], "DeepSeek")).toBe(true);
  });

  it("keeps CDP fallback for sources with a distinct CDP site-search page", () => {
    const keepFallback = [
      "gnews",
      "arxiv_search",
      "github_search",
      "core_search",
      "openalex_search",
      "currents",
      "noozra_search",
    ];
    for (const name of keepFallback) {
      const source = byName[name];
      expect(source, `${name} must exist in ALL_SOURCES`).toBeDefined();
      expect(source.apiSearch || source.capabilities?.articles?.apiSearch, name).toBeDefined();
      expect(shouldSkipCdpOnApiFail(source, "DeepSeek"), name).toBe(false);
    }
  });

  it("never skips when the source has no API (CDP is the first layer)", () => {
    const cdpOnly = { name: "x", url: () => "https://example.com", apiSearch: null };
    expect(shouldSkipCdpOnApiFail(cdpOnly, "kw")).toBe(false);
  });

  it("supports the capabilities.articles schema (#67) as well as top-level fields", () => {
    const kw = "AI";
    const same = {
      name: "synthetic_same",
      capabilities: {
        articles: {
          apiSearch: { url: (k) => `https://api.example.com/search?q=${k}` },
          url: (k) => `https://api.example.com/search?q=${k}`,
        },
      },
    };
    const distinct = {
      name: "synthetic_distinct",
      capabilities: {
        articles: {
          apiSearch: { url: (k) => `https://api.example.com/search?q=${k}` },
          url: (k) => `https://www.example.com/search?q=${k}`,
        },
      },
    };
    expect(shouldSkipCdpOnApiFail(same, kw)).toBe(true);
    expect(shouldSkipCdpOnApiFail(distinct, kw)).toBe(false);
  });
});
