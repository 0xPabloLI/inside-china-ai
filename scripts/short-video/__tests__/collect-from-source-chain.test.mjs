/**
 * Integration tests for collectFromSource's six-layer fallback chain
 * (test gap #3 of the #77 audit, implemented on the #200 deps seam).
 *
 * Chain order (#292 verdict, 2026-09-15 — platform-faithful layers before
 * generic ones):
 *   apiSearch → CDP (same-URL short-circuit) → googleSiteFallback
 *     → apiFallback(Bigsong ≡ Grok bridge backend, x_search only — platform-
 *     faithful, never preempted by the pool) → search pool (pool-eligible
 *     generic web_search sources only) → mcpFallback (Grok bridge after an
 *     empty pool; dedicated platform MCPs go straight here)
 *
 * Each layer runs only when the previous one produced zero results; the
 * googleSiteFallback step synthesizes a `{name}_fallback` source; pool runs
 * after the Bigsong bridge and before the Grok MCP only for pool-eligible
 * sources; x_search is NOT pool-eligible (platform-faithful chain); useCleanTitle
 * is applied after collection. These are characterization tests — the layer
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

  // #292 root-cause fix: collectFromCdp reads `cap?.url ?? source.url` and
  // `cap?.articleScript ?? source.articleScript` (#199 rule — cap wins). The
  // synthesized fallback source spreads `...source` and therefore inherits the
  // ORIGINAL capabilities, which shadow the Google fallback URL/script — the
  // "Google site: fallback" silently re-scraped the original page and always
  // recorded zero-results. The synthesis must override the shadowed fields.
  it("googleSiteFallback overrides the shadowed capabilities fields (cap must not win)", async () => {
    const { promise, calls } = harness(
      { collectCdp: async () => ({ articles: [], status: null }) },
      {
        url: () => "https://search.test/q",
        googleSiteFallback: {
          url: (kw) => `https://www.google.com/search?q=site:test.test+${kw}`,
          articleScript: "return ['from-google'];",
        },
      },
      {
        // Pre-enriched source: capabilities.articles carries the original
        // url/articleScript — the shadowing trigger in production.
        capabilities: {
          articles: {
            url: (kw) => `https://original.test/q=${kw}`,
            articleScript: "return ['from-original'];",
          },
        },
      },
    );
    await promise;
    const fallbackSource = calls[1].args[0];
    const cap = fallbackSource.capabilities?.articles;
    expect((cap?.url ?? fallbackSource.url)("DeepSeek")).toContain("site:test.test");
    expect(cap?.articleScript).toBe("return ['from-google'];");
    expect(cap?.loginCheckScript).toBeNull();
    expect(cap?.needsAuth).toBe(false);
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
    // #292 verdict (2026-09-15): x_search's apiFallback chain is platform-
    // faithful end to end — the pool gate is never consulted (it lives in the
    // mcpFallback branch) and Bigsong is never preempted by generic results.
    expect(calls.map((c) => c.fn)).toEqual(["collectCdp", "collectBigsong"]);
    expect(calls.some((c) => c.fn === "searchPoolFn")).toBe(false);
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

  it("passes news-contract opts to the pool call (#309: 7-day recency default)", async () => {
    const { promise, calls } = harness(
      {
        searchPoolFn: async () => ({ attempts: [], articles: [] }),
        isPoolEligibleFn: () => true,
      },
      { mcpFallback: { command: "x" } },
    );
    await promise;
    const poolCall = calls.find((c) => c.fn === "searchPoolFn");
    expect(poolCall.args[1]).toEqual({ news: { days: 7 } });
  });

  it("inherits the source tracking window for long-period sources (#309: 月报类 30 天)", async () => {
    const { promise, calls } = harness(
      {
        searchPoolFn: async () => ({ attempts: [], articles: [] }),
        isPoolEligibleFn: () => true,
      },
      { mcpFallback: { command: "x" }, tracking: { freshnessWindowDays: 30 } },
    );
    await promise;
    const poolCall = calls.find((c) => c.fn === "searchPoolFn");
    expect(poolCall.args[1]).toEqual({ news: { days: 30 } });
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

  // #308: a broken extraction script surfaces as status "script-error" from
  // collectCdp — the trajectory must carry that reason (streak/quarantine
  // signal) and the chain must stay fail-open (fallback layers still run).
  it("records reason script-error from collectCdp status and keeps the fallback chain running (#308)", async () => {
    const { promise, events, calls } = harness(
      { collectCdp: async () => ({ articles: [], status: "script-error" }) },
      {
        url: () => "https://search.test/q",
        googleSiteFallback: {
          url: (kw) => `https://www.google.com/search?q=site:test.test+${kw}`,
          articleScript: "return [];",
        },
        apiFallback: { endpoint: "x" },
        mcpFallback: { command: "x" },
      },
    );
    await promise;
    const cdpEvent = events.find((e) => e.layer === "cdp");
    expect(cdpEvent.reason).toBe("script-error");
    const fbEvent = events.find((e) => e.layer === "google-fallback");
    expect(fbEvent.reason).toBe("script-error");
    // Fail-open: both CDP rounds (primary + synthesized fallback) ran, then
    // the Bigsong and MCP layers were still consulted (pool gate checked,
    // not eligible → straight to MCP).
    expect(calls.map((c) => c.fn)).toEqual([
      "collectCdp",
      "collectCdp",
      "collectBigsong",
      "isPoolEligibleFn",
      "collectMcp",
    ]);
  });
});

// ─── CDP-DOM date semantics (#309 publishedAt two-tier ruling) ───
//
// 裁决（归档 handoff §3）：publishedAt 两档制——API/RSS/pool 族 fail-closed
// 必备；CDP DOM 源在补 selector 前降级标记（不参与时效断言）。落地 = ①
// metadata.publishedTime（og meta，enrichWithMedia 已采）提升为顶层
// publishedAt（真实日期断言，经 normalizePublishedDate 归一）；② 仍无日期的
// 条目打 dateDegraded 标记——fail-closed 不造日期，标记让"无日期"显式可审计。

describe("CDP-DOM date semantics (#309 two-tier publishedAt)", () => {
  it("marks dateless CDP articles as degraded", async () => {
    const { promise } = harness({
      collectCdp: async () => ({ articles: [{ title: "t", url: "u" }], status: null }),
    });
    const articles = await promise;
    expect(articles[0].dateDegraded).toBe(true);
  });

  it("promotes metadata.publishedTime to top-level publishedAt when the article lacks one", async () => {
    const { promise } = harness({
      collectCdp: async () => ({
        articles: [
          {
            title: "t",
            url: "u",
            metadata: { publishedTime: "Wed, 10 Sep 2026 08:00:00 GMT" },
          },
        ],
        status: null,
      }),
    });
    const articles = await promise;
    expect(articles[0].publishedAt).toBe("2026-09-10T08:00:00.000Z");
    expect(articles[0].dateDegraded).toBeUndefined();
  });

  it("keeps an existing articleScript publishedAt — og meta never overwrites a DOM date", async () => {
    const { promise } = harness({
      collectCdp: async () => ({
        articles: [
          {
            title: "t",
            url: "u",
            publishedAt: "2026-09-01T00:00:00.000Z",
            metadata: { publishedTime: "Wed, 10 Sep 2025 08:00:00 GMT" },
          },
        ],
        status: null,
      }),
    });
    const articles = await promise;
    expect(articles[0].publishedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(articles[0].dateDegraded).toBeUndefined();
  });

  it("marks site:-fallback results too — they are CDP DOM extractions", async () => {
    const { promise, calls } = harness(
      {
        collectCdp: (() => {
          let n = 0;
          return async () => ({
            articles: n++ === 0 ? [] : [{ title: "from-google", url: "u" }],
            status: null,
          });
        })(),
      },
      {
        url: () => "https://search.test/q",
        googleSiteFallback: {
          url: (kw) => `https://www.google.com/search?q=site:test.test+${kw}`,
          articleScript: "return [];",
        },
      },
    );
    const articles = await promise;
    expect(calls.map((c) => c.fn)).toEqual(["collectCdp", "collectCdp"]);
    expect(articles[0].dateDegraded).toBe(true);
  });

  it("site: fallback is terminal without mcpFallback — pool and MCP are never consulted", async () => {
    const { promise, calls } = harness(
      {
        collectCdp: (() => {
          let n = 0;
          return async () => ({
            articles: n++ === 0 ? [] : [{ title: "from-google", url: "u" }],
            status: null,
          });
        })(),
        isPoolEligibleFn: () => {
          throw new Error("pool gate must not be reached after site: promotion");
        },
        collectMcp: async () => {
          throw new Error("MCP must not be reached after site: promotion");
        },
        searchPoolFn: async () => {
          throw new Error("pool must not be reached after site: promotion");
        },
      },
      {
        url: () => "https://search.test/q",
        googleSiteFallback: {
          url: (kw) => `https://www.google.com/search?q=site:test.test+${kw}`,
          articleScript: "return [];",
        },
      },
    );
    const articles = await promise;
    expect(articles.map((a) => a.title)).toEqual(["from-google"]);
    expect(calls.map((c) => c.fn)).toEqual(["collectCdp", "collectCdp"]);
  });
});
