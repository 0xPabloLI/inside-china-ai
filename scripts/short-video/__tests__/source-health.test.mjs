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
  mergeRunEntries,
  REVIEW_THRESHOLD,
  QUARANTINE_THRESHOLD,
} from "../lib/source-health.mjs";
import { poolHealthEntries } from "../lib/search-pool.mjs";
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

  // #308: script-error zero runs count toward the quarantine criterion and
  // the recorded quarantineReason names the script error, not "zero-results".
  it("quarantines a source whose zero runs are labeled script-error", () => {
    let log = null;
    for (let i = 0; i < QUARANTINE_THRESHOLD; i++) {
      log = updateSourceHealth(log, [{ name: "x_search", count: 0, zeroReason: "script-error" }], {
        now: 1000 + i,
      });
    }
    const record = log.sources["x_search"];
    expect(record.consecutiveZeroRuns).toBe(QUARANTINE_THRESHOLD);
    expect(record.quarantined).toBe(true);
    expect(record.quarantineReason).toBe("script-error");
    expect(record.lastZeroReason).toBe("script-error");
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
      // #269 added the CDP pre-flight probe (probeFn defaults to a real fetch
      // of the source's search URL) AFTER these stubs were written — cdp is
      // module-default true, so the real probe would hit the fake URL and hang
      // ~5s per test. Stub it fail-open (httpStatus null → judge keeps alive).
      probeFn: async (searchUrl) => ({ searchUrl, finalUrl: null, httpStatus: null }),
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

// ─── #305 B: pool engine zero streaks in the shared ledger ───
//
// A pool engine that silently stopped delivering (the #281 parse bug, an
// expired key) had no cross-run memory — "0 results" read the same as "no
// news today". Per-call outcomes (poolHealthEntries) are merged to one
// entry per engine per RUN (the pool may serve several sources in a run;
// without the merge each call would double-count the streak) and fold into
// updateSourceHealth, so pool:<engine> records share the quarantine
// vocabulary with CDP sources: REVIEW/QUARANTINE_THRESHOLD consecutive zero
// runs surface the engine; a delivering run clears the flag.

describe("mergeRunEntries (#305 B)", () => {
  it("dedupes by name — a delivery beats a zero from the same run", () => {
    const merged = mergeRunEntries([
      { name: "pool:serper", count: 0, zeroReason: "0 results" },
      { name: "pool:serper", count: 8 },
    ]);
    expect(merged).toEqual([{ name: "pool:serper", count: 8 }]);
  });

  it("keeps the first-seen zeroReason when every call zeroed", () => {
    const merged = mergeRunEntries([
      { name: "pool:serper", count: 0, zeroReason: "0 results" },
      { name: "pool:serper", count: 0, zeroReason: "Serper HTTP 500" },
    ]);
    expect(merged).toEqual([{ name: "pool:serper", count: 0, zeroReason: "0 results" }]);
  });

  it("preserves first-occurrence order across distinct engines", () => {
    const merged = mergeRunEntries([
      { name: "pool:brave", count: 0, zeroReason: "Brave HTTP 429" },
      { name: "pool:serper", count: 3 },
    ]);
    expect(merged.map((e) => e.name)).toEqual(["pool:brave", "pool:serper"]);
  });
});

describe("pool engine zero streak (#305 B)", () => {
  const zeroPoolRun = () =>
    poolHealthEntries({
      attempts: [
        { engine: "serper", ok: false, error: "0 results" },
        { engine: "brave", ok: false, error: "Brave HTTP 429" },
      ],
      engine: null,
      articles: [],
    });

  it("flags pool:<engine> after N consecutive zero runs and clears on delivery", () => {
    let log = null;
    for (let i = 0; i < QUARANTINE_THRESHOLD; i++) {
      log = updateSourceHealth(log, mergeRunEntries(zeroPoolRun()), { now: 1000 + i });
    }
    const rec = log.sources["pool:serper"];
    expect(rec.consecutiveZeroRuns).toBe(QUARANTINE_THRESHOLD);
    expect(rec.quarantined).toBe(true);
    expect(rec.quarantineReason).toBe("0 results");

    // A delivering run clears the flag through the same recovery path the
    // CDP sources use; engines that failed that run keep counting.
    const okRun = poolHealthEntries({
      attempts: [{ engine: "serper", ok: false, error: "Serper HTTP 500" }],
      engine: "brave",
      articles: [{ url: "https://a" }],
    });
    log = updateSourceHealth(log, mergeRunEntries(okRun), { now: 9999 });
    expect(log.sources["pool:brave"].quarantined).toBeUndefined();
    expect(log.sources["pool:brave"].consecutiveZeroRuns).toBe(0);
    expect(log.sources["pool:serper"].consecutiveZeroRuns).toBe(QUARANTINE_THRESHOLD + 1);
  });

  it("never-flagged threshold: fewer zero runs than the threshold stay unflagged", () => {
    let log = null;
    for (let i = 0; i < QUARANTINE_THRESHOLD - 1; i++) {
      log = updateSourceHealth(log, mergeRunEntries(zeroPoolRun()), { now: 1000 + i });
    }
    expect(log.sources["pool:serper"].quarantined).toBeUndefined();
    expect(log.sources["pool:serper"].consecutiveZeroRuns).toBe(QUARANTINE_THRESHOLD - 1);
  });
});
