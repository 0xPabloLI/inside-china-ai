import { describe, it, expect } from "vitest";

import {
  groupSourcesByEvidenceRole,
  deriveCollectionMethod,
  buildDiscoveryOutput,
} from "../search-sources.mjs";
import { ALL_SOURCES, WECHAT_RSS_SOURCES, TELEGRAM_SOURCES } from "../lib/source-registry.mjs";
import { validateDiscovery } from "../lib/research/validate.mjs";

// Articles-capable sources are the universe for evidence grouping
// (stock_media sources only provide images/videos, not articles).
const articlesCapableSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);

describe("groupSourcesByEvidenceRole", () => {
  it("routes the 12 wechat2rss feeds + telegram_aipost (#204) to trackedFeedContext", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    expect(groups.trackedFeedContext.map((s) => s.name).sort()).toEqual(
      [...WECHAT_RSS_SOURCES, ...TELEGRAM_SOURCES].map((s) => s.name).sort(),
    );
  });

  it("keeps keyword-capable sources in directEvidence", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    const directNames = groups.directEvidence.map((s) => s.name);
    expect(directNames).toContain("qbitai");
    expect(directNames).not.toContain("wechat2rss_qbitai");
  });

  it("produces three mutually exclusive groups covering the full input", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    const all = [
      ...groups.directEvidence,
      ...groups.trackedFeedContext,
      ...groups.environmentalSignals,
    ];
    const names = all.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(articlesCapableSources.map((s) => s.name).sort());
  });

  it("classifies a non-keyword non-tracked source as environmental signal", () => {
    const mockSources = [
      { name: "kw_source", supportsKeyword: true },
      { name: "rss_source", sourceRole: "tracked-feed-context" },
      { name: "homepage_source", supportsKeyword: false },
    ];
    const groups = groupSourcesByEvidenceRole(mockSources);
    expect(groups.directEvidence.map((s) => s.name)).toEqual(["kw_source"]);
    expect(groups.trackedFeedContext.map((s) => s.name)).toEqual(["rss_source"]);
    expect(groups.environmentalSignals.map((s) => s.name)).toEqual(["homepage_source"]);
  });

  it("respects capabilities.articles overrides over top-level fields", () => {
    const mockSources = [
      {
        name: "enriched",
        supportsKeyword: false,
        capabilities: { articles: { supportsKeyword: true } },
      },
    ];
    const groups = groupSourcesByEvidenceRole(mockSources);
    expect(groups.directEvidence.map((s) => s.name)).toEqual(["enriched"]);
  });
});

describe("deriveCollectionMethod", () => {
  it("uses tracking.access for tracked public feeds (issue #97)", () => {
    expect(deriveCollectionMethod(WECHAT_RSS_SOURCES[0])).toBe("public-rss");
  });

  it("falls back to accessMethod.primary for api/cdp/mcp sources", () => {
    expect(deriveCollectionMethod({ accessMethod: { primary: "cdp" } })).toBe("cdp");
    expect(deriveCollectionMethod({ accessMethod: { primary: "api" } })).toBe("api");
    expect(deriveCollectionMethod({ accessMethod: { primary: "mcp" } })).toBe("mcp");
  });

  it("defaults to cdp when no method information exists (backward compatible)", () => {
    expect(deriveCollectionMethod({})).toBe("cdp");
    expect(deriveCollectionMethod(null)).toBe("cdp");
  });
});

describe("buildDiscoveryOutput", () => {
  const sources = [
    articlesCapableSources.find((s) => s.name === "qbitai"),
    WECHAT_RSS_SOURCES.find((s) => s.name === "wechat2rss_qbitai"),
  ];
  const articles = [
    {
      url: "https://qbitai.com/a",
      title: "Direct evidence article",
      snippet: "s",
      source: "qbitai",
      publishedAt: "2026-09-01",
    },
    {
      url: "https://mp.weixin.qq.com/s/rss-a",
      title: "Tracked feed article",
      snippet: "s",
      source: "wechat2rss_qbitai",
      publishedAt: "Mon, 01 Sep 2026 09:00:00 +0800",
    },
  ];
  const failed = [
    { name: "bloomberg", reason: "CDP tab failed: timeout" },
    { name: "wechat2rss_geekpark", reason: "fetch failed: 503" },
  ];

  function build() {
    return buildDiscoveryOutput(articles, failed, {
      contentId: "test-content",
      runId: "run-test-001",
      keyword: "DeepSeek",
      sources,
    });
  }

  it("writes schema-valid discovery.json", () => {
    const discovery = build();
    const result = validateDiscovery(discovery);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("includes evidenceGroups covering this run's sources", () => {
    const discovery = build();
    expect(discovery.evidenceGroups.directEvidence).toEqual(["qbitai"]);
    expect(discovery.evidenceGroups.trackedFeedContext).toEqual(["wechat2rss_qbitai"]);
    expect(discovery.evidenceGroups.environmentalSignals).toEqual([]);
  });

  it("tags each article item with sourceRole and real collectionMethod", () => {
    const discovery = build();
    const direct = discovery.sources.find((s) => s.sourceName === "qbitai");
    const tracked = discovery.sources.find((s) => s.sourceName === "wechat2rss_qbitai");

    expect(direct.sourceRole).toBe("direct-evidence");
    expect(direct.collectionMethod).toBe("cdp");

    expect(tracked.sourceRole).toBe("tracked-feed-context");
    expect(tracked.collectionMethod).toBe("public-rss");
  });

  it("records failed sources with their real reasons", () => {
    const discovery = build();
    expect(discovery.failedSources).toEqual([
      { name: "bloomberg", reason: "CDP tab failed: timeout" },
      { name: "wechat2rss_geekpark", reason: "fetch failed: 503" },
    ]);
  });

  it("preserves per-article metadata passthrough", () => {
    const discovery = build();
    expect(discovery.contentId).toBe("test-content");
    expect(discovery.researchRunId).toBe("run-test-001");
    expect(discovery.sourceCount).toBe(2);
    expect(discovery.runMetadata.keyword).toBe("DeepSeek");
    expect(discovery.runMetadata.mode).toBe("research");
  });
});
