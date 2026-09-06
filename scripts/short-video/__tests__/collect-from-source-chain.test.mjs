/**
 * Integration tests for collectFromSource's six-layer fallback chain
 * (test gap #3 of the #77 audit, implemented on the #200 deps seam).
 *
 * Chain order (source-registry header contract):
 *   apiSearch → CDP (same-URL short-circuit) → googleSiteFallback
 *     → apiFallback(Bigsong) → search pool (pool-eligible only) → mcpFallback
 *
 * Each layer runs only when the previous one produced zero results; the
 * googleSiteFallback step synthesizes a `{name}_fallback` source; pool runs
 * before the Grok bridge only for pool-eligible sources; useCleanTitle is
 * applied after collection. These are characterization tests — the layer
 * behaviors exist; the seam makes the ORDER finally assertable.
 */
import { describe, it, expect } from "vitest";
import { collectFromSource } from "../search-sources.mjs";

function baseSource(overrides = {}) {
  return {
    name: "test_src",
    label: "Test Source",
    category: "news",
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: { primary: "cdp" },
    needsAuth: false,
    useCleanTitle: false,
    capabilities: { articles: {} },
    ...overrides,
  };
}

/** Recorder that also captures which layers produced what. */
function harness(depsOverrides = {}, sourceOverrides = {}) {
  const events = [];
  const calls = [];
  // Wrap ALL six layers (defaults merged with overrides) so every layer call
  // is recorded — unwrapped layers would silently run the real network path.
  const merged = {
    collectApi: async () => [],
    collectCdp: async () => ({ articles: [], status: null }),
    collectBigsong: async () => [],
    collectMcp: async () => [],
    searchPoolFn: async () => ({ attempts: [], articles: [] }),
    isPoolEligibleFn: () => false,
    ...depsOverrides,
  };
  const deps = Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [
      k,
      (...args) => {
        calls.push({ fn: k, args });
        return v(...args);
      },
    ]),
  );
  const promise = collectFromSource(baseSource(sourceOverrides), "kw", (e) => events.push(e), deps);
  return { promise, events, calls };
}

describe("collectFromSource fallback chain order", () => {
  it("runs api first and stops when it returns results", async () => {
    const { promise, calls } = harness(
      { collectApi: async () => [{ title: "t", url: "u" }] },
      { apiSearch: { url: () => "https://api.test/q" } },
    );
    const articles = await promise;
    expect(articles.map((a) => a.title)).toEqual(["t"]);
    expect(calls.map((c) => c.fn)).toEqual(["collectApi"]);
  });

  it("falls through api → cdp → googleSiteFallback in order, synthesizing the fallback source", async () => {
    const { promise, calls } = harness(
      { collectCdp: async () => ({ articles: [], status: null }) },
      {
        apiSearch: { url: () => "https://api.test/q" },
        url: () => "https://search.test/q",
        googleSiteFallback: {
          url: (kw) => `https://www.google.com/search?q=site:test.test+${kw}`,
          articleScript: "return [];",
        },
      },
    );
    await promise;
    expect(calls.map((c) => c.fn)).toEqual(["collectApi", "collectCdp", "collectCdp"]);
    // The second CDP call is the synthesized fallback source
    const fallbackSource = calls[2].args[0];
    expect(fallbackSource.name).toBe("test_src_fallback");
    expect(fallbackSource.url("kw")).toContain("site:test.test");
  });

  it("hits apiFallback (Bigsong) before MCP when configured", async () => {
    const { promise, calls } = harness(
      {
        collectBigsong: async () => [{ title: "b", url: "u" }],
      },
      {
        apiFallback: { endpoint: "x" },
      },
    );
    const articles = await promise;
    expect(articles.map((a) => a.title)).toEqual(["b"]);
    expect(calls.map((c) => c.fn)).toEqual(["collectCdp", "collectBigsong"]);
    expect(calls.some((c) => c.fn === "collectMcp")).toBe(false);
  });

  it("runs the pool before MCP for pool-eligible sources, then MCP on empty pool", async () => {
    const { promise, calls } = harness(
      {
        collectMcp: async () => [{ title: "m", url: "u" }],
        searchPoolFn: async () => ({ attempts: [], articles: [] }),
        isPoolEligibleFn: () => true,
      },
      { mcpFallback: { command: "x" } },
    );
    const articles = await promise;
    expect(articles.map((a) => a.title)).toEqual(["m"]);
    expect(calls.map((c) => c.fn)).toEqual([
      "collectCdp",
      "isPoolEligibleFn",
      "searchPoolFn",
      "collectMcp",
    ]);
  });

  it("skips the pool for platform-specific MCP sources (direct mcpFallback)", async () => {
    const { promise, calls } = harness(
      { collectMcp: async () => [{ title: "m", url: "u" }] },
      { mcpFallback: { command: "x" } },
    );
    const articles = await promise;
    expect(articles.map((a) => a.title)).toEqual(["m"]);
    expect(calls.map((c) => c.fn)).toEqual(["collectCdp", "isPoolEligibleFn", "collectMcp"]);
  });

  it("applies useCleanTitle after collection and drops empty titles", async () => {
    const { promise } = harness(
      { collectApi: async () => [{ title: "  Title With  Spaces  ", url: "u" }] },
      { apiSearch: { url: () => "https://api.test/q" }, useCleanTitle: true },
    );
    const articles = await promise;
    expect(articles[0].title).toBe("Title With Spaces");
  });

  it("records the layer trajectory in execution order (#200 seam)", async () => {
    const { promise, events } = harness(
      {},
      { apiSearch: { url: () => "https://api.test/q" }, url: () => "https://search.test/q" },
    );
    await promise;
    expect(events.map((e) => e.layer)).toEqual(["api", "cdp"]);
    expect(events.every((e) => e.source === "test_src")).toBe(true);
    expect(events[0].reason).toBe("zero-results");
  });
});
