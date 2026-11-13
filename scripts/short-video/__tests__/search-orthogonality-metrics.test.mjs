import { describe, expect, it } from "vitest";

import {
  canonicalUrl,
  registrableDomain,
  uniqueCount,
  greedySelection,
  overlapMatrix,
  relevanceCoverage,
  estimateTokens,
  latencyStats,
} from "../bench/search-orthogonality/metrics.mjs";
import {
  buildReport,
  rawFileName,
  CURRENT_FAMILIES,
} from "../bench/search-orthogonality/report.mjs";

const article = (url, title = "", snippet = "") => ({ url, title, snippet });
const byUrl = (a) => canonicalUrl(a.url);
const byDomain = (a) => registrableDomain(a.url);

describe("canonicalUrl", () => {
  // #457: the query string is load-bearing. cached-search's normArticleUrl
  // dropped it, so two different videos collapsed into one "duplicate" before
  // any measurement could run.
  it("keeps meaningful query parameters", () => {
    expect(canonicalUrl("https://www.youtube.com/watch?v=A")).not.toBe(
      canonicalUrl("https://www.youtube.com/watch?v=B"),
    );
    expect(canonicalUrl("https://news.ycombinator.com/item?id=1")).not.toBe(
      canonicalUrl("https://news.ycombinator.com/item?id=2"),
    );
  });

  it("strips tracking parameters, www, fragments and trailing slashes", () => {
    expect(canonicalUrl("https://www.example.com/path/?utm_source=x&b=2&a=1#frag")).toBe(
      "example.com/path?a=1&b=2",
    );
  });
});

describe("registrableDomain", () => {
  it("collapses subdomains to eTLD+1", () => {
    expect(registrableDomain("https://news.ycombinator.com/item?id=1")).toBe("ycombinator.com");
    expect(registrableDomain("https://m.weibo.cn/status/1")).toBe("weibo.cn");
  });

  it("handles multi-part public suffixes", () => {
    expect(registrableDomain("https://www.bbc.co.uk/news")).toBe("bbc.co.uk");
    expect(registrableDomain("https://ai.36kr.com/p/1")).toBe("36kr.com");
  });

  it("keeps hosts it cannot split", () => {
    expect(registrableDomain("http://127.0.0.1:8888/x")).toBe("127.0.0.1");
  });
});

describe("marginal gain", () => {
  it("counts only keys not already seen", () => {
    const seen = new Set([registrableDomain("https://a.com/1")]);
    expect(
      uniqueCount([article("https://a.com/2"), article("https://b.com/1")], byDomain, seen),
    ).toBe(1);
  });

  it("ranks free channels first and drops mirrors that add nothing", () => {
    const groups = [
      {
        id: "pool:serper",
        articles: [article("https://a.com/1"), article("https://b.com/1")],
        cost: 1 / 2500,
      },
      {
        id: "searxng:google",
        articles: [article("https://a.com/1")],
        cost: 0,
        latencyP95: 200,
      },
      {
        id: "vertical:hn",
        articles: [article("https://c.com/1")],
        cost: 0,
        latencyP95: 100,
      },
      {
        id: "pool:jina",
        articles: [article("https://a.com/1"), article("https://b.com/1")],
        cost: 0.0589,
      },
    ];
    const { order, totalUnique } = greedySelection(groups, { keyOf: byDomain });
    // Both free channels rank before any paid one; hn (faster) first.
    expect(order.slice(0, 2).map((step) => step.id)).toEqual(["vertical:hn", "searxng:google"]);
    // A pure mirror contributes 0 new domains and is never selected.
    expect(order.map((step) => step.id)).not.toContain("pool:jina");
    expect(totalUnique).toBe(3);
  });
});

describe("overlapMatrix", () => {
  it("reports containment 1 for identical result sets", () => {
    const groups = [
      { id: "a", articles: [article("https://a.com/1"), article("https://b.com/1")] },
      { id: "b", articles: [article("https://a.com/1"), article("https://b.com/1")] },
    ];
    const [pair] = overlapMatrix(groups, { keyOf: byUrl });
    expect(pair.containment).toBe(1);
    expect(pair.jaccard).toBe(1);
  });
});

describe("relevanceCoverage", () => {
  it("matches Latin terms on word boundaries", () => {
    const hit = relevanceCoverage("mixture of experts inference latency", {
      title: "Reducing inference latency in mixture-of-experts models",
      snippet: "",
    });
    expect(hit.coverage).toBeGreaterThan(0.5);
  });

  it("matches Chinese queries via bigrams", () => {
    const hit = relevanceCoverage("国产大模型 推理成本", {
      title: "国产大模型推理成本大幅下降",
      snippet: "",
    });
    expect(hit.coverage).toBeGreaterThan(0.5);
  });

  it("scores an unrelated result near zero", () => {
    const miss = relevanceCoverage("国产大模型 推理成本", {
      title: "Best sourdough recipes",
      snippet: "Bread baking tips",
    });
    expect(miss.coverage).toBe(0);
  });
});

describe("estimateTokens", () => {
  it("counts CJK characters as roughly one token each", () => {
    expect(estimateTokens("推理成本")).toBe(4);
  });

  it("approximates Latin text at four characters per token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});

describe("latencyStats", () => {
  it("returns nearest-rank p50/p95", () => {
    expect(latencyStats([100, 200, 300, 400, 500])).toEqual({ n: 5, p50: 300, p95: 500 });
  });
});

describe("buildReport", () => {
  const run = {
    runId: "test-run",
    startedAt: "2026-11-13T00:00:00.000Z",
    baseline: "deadbeef",
    versions: {},
    channelMeta: Object.fromEntries(
      ["pool:serper", "pool:brave", "pool:tavily", "vertical:hn"].map((id) => [
        id,
        { metered: id.startsWith("pool:"), allowanceShare: id === "vertical:hn" ? 0 : 0.001 },
      ]),
    ),
    meta: { maxResults: 10 },
    queries: [{ id: "q1", intent: "news", text: "ai chips" }],
    channels: ["pool:serper", "pool:brave", "pool:tavily", "vertical:hn"],
    results: [
      {
        queryId: "q1",
        channel: "pool:serper",
        ms: 100,
        articles: [article("https://a.com/1", "ai chips"), article("https://b.com/1", "chips")],
      },
      {
        queryId: "q1",
        channel: "pool:brave",
        ms: 120,
        articles: [article("https://a.com/1", "ai chips")],
      },
      { queryId: "q1", channel: "pool:tavily", ms: 150, articles: [] },
      {
        queryId: "q1",
        channel: "vertical:hn",
        ms: 80,
        articles: [article("https://c.com/1", "ai chips discussion")],
      },
    ],
  };

  it("names each score row after the raw artifact it came from", () => {
    const report = buildReport(run);
    expect(report.perQuery[0].channels[0].file).toBe(rawFileName("q1", "pool:serper"));
    expect(report.perQuery[0].channels[0].file).toBe("q1__pool-serper.json");
  });

  it("measures marginal gain on top of the current FAMILIES trio", () => {
    const report = buildReport(run);
    const marginal = report.perQuery[0].marginalGivenFamilies.find(
      (row) => row.channel === "vertical:hn",
    );
    expect(CURRENT_FAMILIES).toEqual(["pool:serper", "pool:brave", "pool:tavily"]);
    expect(marginal).toEqual({ channel: "vertical:hn", domains: 1, urls: 1 });
  });

  it("is deterministic for a stored run (replay equals first build)", () => {
    expect(JSON.stringify(buildReport(run))).toBe(JSON.stringify(buildReport(run)));
  });
});
