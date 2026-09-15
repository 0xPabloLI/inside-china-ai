/**
 * Tests for #200 source health log.
 *
 * A CDP selector rotting into silent zero-results was indistinguishable from
 * "no news today": collectFromSource only surfaced thrown failures. Now each
 * layer's outcome (result count + reason) is recorded as a trajectory,
 * buildDiscoveryOutput carries a zero-result source list, and a persistent
 * source-health.json tracks consecutive zero-result runs for manual selector
 * review.
 */
import { describe, it, expect } from "vitest";
import {
  updateSourceHealth,
  deriveZeroResultSources,
  REVIEW_THRESHOLD,
} from "../lib/source-health.mjs";
import { collectFromSource } from "../search-sources.mjs";
import { buildDiscoveryOutput } from "../search-sources.mjs";

describe("updateSourceHealth", () => {
  it("increments consecutiveZeroRuns on zero-result runs", () => {
    let log = updateSourceHealth(null, [{ name: "36kr_search", count: 0 }], { now: 1000 });
    log = updateSourceHealth(log, [{ name: "36kr_search", count: 0 }], { now: 2000 });
    expect(log.sources["36kr_search"].consecutiveZeroRuns).toBe(2);
    expect(log.sources["36kr_search"].lastZeroAt).toBe(2000);
  });

  it("resets the streak when a source returns results", () => {
    let log = updateSourceHealth(null, [{ name: "36kr_search", count: 0 }], { now: 1000 });
    log = updateSourceHealth(log, [{ name: "36kr_search", count: 5 }], { now: 2000 });
    expect(log.sources["36kr_search"].consecutiveZeroRuns).toBe(0);
    expect(log.sources["36kr_search"].lastOkAt).toBe(2000);
  });

  it("flags sources at or above the review threshold", () => {
    let log = null;
    for (let i = 0; i < REVIEW_THRESHOLD; i++) {
      log = updateSourceHealth(log, [{ name: "36kr_search", count: 0 }], { now: 1000 + i });
    }
    const flagged = Object.entries(log.sources)
      .filter(([, s]) => s.consecutiveZeroRuns >= REVIEW_THRESHOLD)
      .map(([name]) => name);
    expect(flagged).toContain("36kr_search");
    expect(REVIEW_THRESHOLD).toBeGreaterThanOrEqual(2);
  });
});

describe("deriveZeroResultSources", () => {
  it("lists sources whose every layer produced zero results, with layer labels", () => {
    const attempts = [
      { source: "36kr_search", layer: "api", count: 0, reason: "zero-results" },
      { source: "36kr_search", layer: "cdp", count: null, reason: "skipped-same-url-as-api" },
      { source: "qbitai", layer: "api", count: 0, reason: "zero-results" },
      { source: "qbitai", layer: "cdp", count: 4 },
    ];
    const zero = deriveZeroResultSources(attempts);
    expect(zero.map((z) => z.source)).toEqual(["36kr_search"]);
    expect(zero[0].attempts).toHaveLength(2);
    expect(zero[0].attempts[1].reason).toBe("skipped-same-url-as-api");
  });

  it("does not flag sources that returned results in any layer", () => {
    const attempts = [
      { source: "qbitai", layer: "api", count: 0, reason: "zero-results" },
      { source: "qbitai", layer: "cdp", count: 4 },
    ];
    expect(deriveZeroResultSources(attempts)).toEqual([]);
  });
});

describe("collectFromSource layer trajectory (stubbed layers)", () => {
  // apiSearch present so the API layer actually runs (it is opt-in per source);
  // distinct api/cdp urls keep shouldSkipCdpOnApiFail from short-circuiting CDP.
  const source = {
    name: "36kr_search",
    label: "36kr",
    capabilities: { articles: { apiSearch: { url: () => "https://api.example.com/q" } } },
    url: () => "https://search.example.com/q",
  };

  function stubDeps(overrides = {}) {
    return {
      collectApi: async () => [],
      collectCdp: async () => ({ articles: [], status: null }),
      collectBigsong: async () => [],
      collectMcp: async () => [],
      searchPoolFn: async () => ({ attempts: [], articles: [] }),
      isPoolEligibleFn: () => false,
      ...overrides,
    };
  }

  it("records per-layer result counts and zero-result reasons", async () => {
    const events = [];
    await collectFromSource(source, "kw", (e) => events.push(e), stubDeps());
    const layers = events.map((e) => e.layer);
    expect(layers).toContain("api");
    expect(layers).toContain("cdp");
    for (const e of events) {
      expect(e.source).toBe("36kr_search");
      if (e.count === 0) expect(e.reason).toBe("zero-results");
    }
  });

  it("annotates the same-URL CDP skip instead of treating it as a failure", async () => {
    const events = [];
    const src = {
      ...source,
      // empty cap keeps the top-level same-URL pair authoritative
      capabilities: { articles: {} },
      apiSearch: { url: () => "https://same.example.com/x" },
      url: () => "https://same.example.com/x",
    };
    await collectFromSource(src, "kw", (e) => events.push(e), stubDeps());
    const skip = events.find((e) => e.reason === "skipped-same-url-as-api");
    expect(skip).toBeTruthy();
    expect(skip.layer).toBe("cdp");
  });

  it("surfaces need_login / captcha statuses from the CDP layer", async () => {
    for (const status of ["need_login", "captcha"]) {
      const events = [];
      await collectFromSource(
        source,
        "kw",
        (e) => events.push(e),
        stubDeps({ collectCdp: async () => ({ articles: [], status }) }),
      );
      expect(events.some((e) => e.layer === "cdp" && e.reason === status)).toBe(true);
    }
  });

  it("records success counts and skips the fallback chain", async () => {
    const events = [];
    const collected = await collectFromSource(
      source,
      "kw",
      (e) => events.push(e),
      stubDeps({ collectApi: async () => [{ title: "t", url: "u" }] }),
    );
    expect(collected.map((a) => a.title)).toEqual(["t"]);
    expect(events.find((e) => e.layer === "api")?.count).toBe(1);
    expect(events.some((e) => e.layer === "cdp")).toBe(false);
  });
});

describe("buildDiscoveryOutput sourceHealth", () => {
  const sources = [
    { name: "36kr_search", label: "36kr", category: "news", capabilities: { articles: {} } },
    { name: "qbitai", label: "qbitai", category: "news", capabilities: { articles: {} } },
  ];

  it("embeds the zero-result source list when attempts are supplied", () => {
    const discovery = buildDiscoveryOutput([], [], {
      contentId: "c",
      runId: "r",
      keyword: "k",
      sources,
      sourceAttempts: [
        { source: "36kr_search", layer: "api", count: 0, reason: "zero-results" },
        { source: "36kr_search", layer: "cdp", count: 0, reason: "zero-results" },
        { source: "qbitai", layer: "api", count: 3 },
      ],
    });
    expect(discovery.sourceHealth.zeroResultSources.map((z) => z.source)).toEqual(["36kr_search"]);
    expect(discovery.sourceHealth.attempts).toHaveLength(3);
  });

  it("omits sourceHealth when no attempts are supplied (backward compat)", () => {
    const discovery = buildDiscoveryOutput([], [], {
      contentId: "c",
      runId: "r",
      keyword: "k",
      sources,
    });
    expect(discovery.sourceHealth).toBeUndefined();
  });
});
