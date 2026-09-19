import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  searchPool,
  isPoolEligible,
  POOL_ENGINE_NAMES,
  POOL_ENGINES,
} from "../lib/search-pool.mjs";

// Pinned chain for the legacy three-engine behavior tests: opts.engines is the
// test seam, so engine-list changes (serper joined in #226) can't skew these
// tests. Inclusion-list on purpose — a future engine must not silently join
// this chain. Serper's default-chain behavior is covered by dedicated tests.
const LEGACY_CHAIN = POOL_ENGINES.filter((e) => ["brave", "tavily", "jina"].includes(e.name));
const TAVILY_ONLY = POOL_ENGINES.filter((e) => e.name === "tavily");

// ─── Helpers ───

/** Build a mock fetch returning a JSON response. */
function jsonFetch(responder) {
  return vi.fn(async (url, init) => {
    const spec = responder(url, init);
    return {
      ok: spec.status >= 200 && spec.status < 300,
      status: spec.status,
      text: async () => JSON.stringify(spec.body),
      json: async () => spec.body,
    };
  });
}

const BRAVE_BODY = {
  web: {
    results: [
      { title: "DeepSeek V4 released", url: "https://example.com/a", description: "Brave desc" },
      { title: "Second result", url: "https://example.com/b", description: "Another" },
    ],
  },
};

const TAVILY_BODY = {
  results: [{ title: "Tavily hit", url: "https://example.com/t", content: "Tavily content" }],
};

const JINA_BODY = {
  code: 200,
  data: [{ title: "Jina hit", url: "https://example.com/j", description: "Jina desc" }],
};

// Real Serper.dev response shape (#281, 2026-09-14 probe): organic entries
// carry `link`/`snippet` (+ `date`/`position`) — NOT the `url`/`description`
// vocabulary Brave/Tavily/Jina use. The article-mapping seam must normalize
// both; this fixture mirrors the API contract, not the pool's mapping.
const SERPER_BODY = {
  organic: [
    {
      title: "Serper hit",
      link: "https://example.com/s",
      snippet: "Serper desc",
      position: 1,
      date: "1 day ago",
    },
  ],
};

// ─── isPoolEligible ───

describe("isPoolEligible", () => {
  // #307 (2026-09-19): pool eligibility is an EXPLICIT declaration on the
  // source (poolEligible: true), decoupled from the Grok bridge. The old
  // mcpFallback.toolName === "web_search" derivation died with the bridge
  // retirement — the two mechanisms are independent concerns.
  it("true when the source declares poolEligible at top level", () => {
    expect(isPoolEligible({ name: "google_search", poolEligible: true })).toBe(true);
  });

  it("true when the flag lives in capabilities.articles (enriched registry)", () => {
    const source = { name: "google_search", capabilities: { articles: { poolEligible: true } } };
    expect(isPoolEligible(source)).toBe(true);
  });

  it("false for the legacy mcpFallback.web_search derivation — decoupled (#307)", () => {
    const source = { name: "legacy", mcpFallback: { toolName: "web_search" } };
    expect(isPoolEligible(source)).toBe(false);
  });

  // #292 verdict (2026-09-15, user): platform sources never enter the
  // generic pool. x_search keeps no flag — the absence IS the declaration.
  it("false for the Bigsong direct bridge (x_search, apiFallback) — platform-faithful chain, never pool", () => {
    const source = { name: "x_search", apiFallback: { type: "http", resultMapper: () => [] } };
    expect(isPoolEligible(source)).toBe(false);
  });

  it("false for platform-specific MCP fallbacks (sogou_weixin)", () => {
    const source = {
      name: "sogou_weixin",
      capabilities: { articles: { mcpFallback: { toolName: "weixin_search" } } },
    };
    expect(isPoolEligible(source)).toBe(false);
  });

  it("false when there is no poolEligible flag at all", () => {
    expect(isPoolEligible({ name: "qbitai" })).toBe(false);
    expect(isPoolEligible(null)).toBe(false);
  });
});

// ─── searchPool ───

describe("searchPool", () => {
  beforeEach(() => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "brave-test-key");
    vi.stubEnv("TAVILY_API_KEY", "tavily-test-key");
    vi.stubEnv("JINA_API_KEY", "jina-test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("exposes the fixed engine order Serper > Brave > Tavily > Jina", () => {
    expect(POOL_ENGINE_NAMES).toEqual(["serper", "brave", "tavily", "jina"]);
  });

  it("sends the Serper X-API-KEY header and maps organic results", async () => {
    vi.stubEnv("SERPER_API_KEY", "serper-test-key");
    let seenUrl;
    let seenInit;
    const fetchMock = jsonFetch((url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return { status: 200, body: SERPER_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
    expect(result.engine).toBe("serper");
    expect(seenUrl).toContain("google.serper.dev/search");
    expect(seenInit.method).toBe("POST");
    expect(seenInit.headers["X-API-KEY"]).toBe("serper-test-key");
    expect(JSON.parse(seenInit.body).q).toBe("DeepSeek V4");
    expect(result.articles[0]).toEqual({
      title: "Serper hit",
      url: "https://example.com/s",
      snippet: "Serper desc",
      publishedAt: expect.stringMatching(/^20\d\d-/),
    });
  });

  it("attempts Serper first when its key is present (default chain head)", async () => {
    vi.stubEnv("SERPER_API_KEY", "serper-test-key");
    const fetchMock = jsonFetch((url) => {
      expect(String(url)).toContain("google.serper.dev");
      return { status: 200, body: SERPER_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
    expect(result.engine).toBe("serper");
    // Only the Serper call — the chain head wins, no fallback churn
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses Brave first and maps web.results to articles", async () => {
    const fetchMock = jsonFetch((url) => {
      expect(String(url)).toContain("api.search.brave.com");
      return { status: 200, body: BRAVE_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(result.engine).toBe("brave");
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0]).toEqual({
      title: "DeepSeek V4 released",
      url: "https://example.com/a",
      snippet: "Brave desc",
    });
    // Only one engine called — no fallback churn on success
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the Brave subscription token header", async () => {
    let seenInit;
    const fetchMock = jsonFetch((url, init) => {
      seenInit = init;
      return { status: 200, body: BRAVE_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(seenInit.headers["X-Subscription-Token"]).toBe("brave-test-key");
    expect(seenInit.headers["Accept"]).toBe("application/json");
  });

  it("falls back to Tavily when Brave returns empty results", async () => {
    const fetchMock = jsonFetch((url) => {
      if (String(url).includes("brave")) return { status: 200, body: { web: { results: [] } } };
      return { status: 200, body: TAVILY_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(result.engine).toBe("tavily");
    expect(result.articles[0].title).toBe("Tavily hit");
  });

  it("falls back on HTTP 429 and records the attempt", async () => {
    const fetchMock = jsonFetch((url) => {
      if (String(url).includes("brave")) return { status: 429, body: {} };
      return { status: 200, body: TAVILY_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(result.engine).toBe("tavily");
    expect(result.attempts).toEqual([
      { engine: "brave", ok: false, error: expect.stringContaining("429") },
    ]);
  });

  it("sends Tavily bearer auth and query body", async () => {
    let seenUrl;
    let seenInit;
    const fetchMock = jsonFetch((url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return { status: 200, body: TAVILY_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: TAVILY_ONLY });
    expect(result.engine).toBe("tavily");
    expect(seenUrl).toContain("api.tavily.com/search");
    expect(seenInit.method).toBe("POST");
    expect(seenInit.headers.Authorization).toBe("Bearer tavily-test-key");
    expect(JSON.parse(seenInit.body).query).toBe("DeepSeek V4");
  });

  it("falls back to Jina when Brave and Tavily both fail", async () => {
    const fetchMock = jsonFetch((url) => {
      if (String(url).includes("brave")) throw new Error("DNS boom");
      if (String(url).includes("tavily")) return { status: 500, body: {} };
      return { status: 200, body: JINA_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(result.engine).toBe("jina");
    expect(result.articles[0]).toEqual({
      title: "Jina hit",
      url: "https://example.com/j",
      snippet: "Jina desc",
    });
  });

  it("skips engines whose API key is missing without calling fetch", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "");
    const fetchMock = jsonFetch((url) => {
      expect(String(url)).toContain("s.jina.ai");
      return { status: 200, body: JINA_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(result.engine).toBe("jina");
    // Only the Jina call — skipped engines never touch the network
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the Jina bearer token against s.jina.ai", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "");
    let seenInit;
    const fetchMock = jsonFetch((url, init) => {
      seenInit = init;
      return { status: 200, body: JINA_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(seenInit.headers.Authorization).toBe("Bearer jina-test-key");
    expect(seenInit.headers.Accept).toBe("application/json");
  });

  it("returns empty articles and all attempts when every engine fails", async () => {
    // Real key on every engine so each one fails at the HTTP level rather than
    // being skipped at the key level — the failure path this test exercises.
    vi.stubEnv("SERPER_API_KEY", "serper-test-key");
    const fetchMock = jsonFetch(() => ({ status: 500, body: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
    expect(result.articles).toEqual([]);
    expect(result.engine).toBeNull();
    // Derive from the exported order — missing-key engines still record an
    // attempt, so this follows engine additions without a length hard-code.
    expect(result.attempts.map((a) => a.engine)).toEqual(POOL_ENGINE_NAMES);
  });

  it("treats a network throw as a failed attempt, not a crash", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("EAI_AGAIN");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(result.articles).toEqual([]);
    expect(result.attempts[0].error).toContain("EAI_AGAIN");
  });

  it("caps snippet length and drops entries without url", async () => {
    const braveBody = {
      web: {
        results: [
          { title: "No url", url: "", description: "x".repeat(500) },
          { title: "Good", url: "https://example.com/g", description: "y".repeat(500) },
        ],
      },
    };
    const fetchMock = jsonFetch(() => ({ status: 200, body: braveBody }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4", { engines: LEGACY_CHAIN });
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].snippet.length).toBeLessThanOrEqual(200);
  });

  it("honors opts.engines override (test seam) and its order", async () => {
    const fetchMock = jsonFetch(() => {
      throw new Error("should not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    const jinaOnly = [
      {
        name: "jina",
        apiKeyEnv: "JINA_API_KEY",
        search: async () => ({
          ok: true,
          articles: [{ title: "J", url: "https://j", snippet: "" }],
        }),
      },
    ];

    const result = await searchPool("DeepSeek V4", { engines: jinaOnly });
    expect(result.engine).toBe("jina");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── publishedAt preservation (#309 news contract) ───
//
// The grilling ruling (2026-09-15): pool `toArticle` dropped every engine's
// date field (Serper `date`, Brave `age`/`page_age`, Tavily `published_date`,
// Jina `date`), leaving pool results outside any fail-closed freshness filter
// (filterRecentTrackedArticles needs a Date-parseable publishedAt). The
// #309 probe (2026-09-16) confirmed: with news params on, Serper/Tavily/Brave
// carry dates on 100% of results; normalization to ISO happens at the pool
// seam so relative strings ("1 day ago") don't degenerate into NaN.

const only = (name) => [POOL_ENGINES.find((e) => e.name === name)];

describe("publishedAt preservation (#309)", () => {
  beforeEach(() => {
    vi.stubEnv("SERPER_API_KEY", "serper-test-key");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "brave-test-key");
    vi.stubEnv("TAVILY_API_KEY", "tavily-test-key");
    vi.stubEnv("JINA_API_KEY", "jina-test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("normalizes Serper relative date ('1 day ago') to a recent ISO timestamp", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(() => ({
        status: 200,
        body: {
          organic: [{ title: "t", link: "https://e.com/a", snippet: "s", date: "1 day ago" }],
        },
      })),
    );
    const { articles } = await searchPool("k", { engines: only("serper") });
    const ts = new Date(articles[0].publishedAt).getTime();
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeLessThanOrEqual(Date.now());
    expect(ts).toBeGreaterThan(Date.now() - 26 * 3600e3);
  });

  it("prefers Brave page_age (ISO) over the relative age", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(() => ({
        status: 200,
        body: {
          web: {
            results: [
              {
                title: "t",
                url: "https://e.com/b",
                description: "d",
                age: "2 days ago",
                page_age: "2026-09-13T15:33:21Z",
              },
            ],
          },
        },
      })),
    );
    const { articles } = await searchPool("k", { engines: only("brave") });
    expect(articles[0].publishedAt).toBe(new Date("2026-09-13T15:33:21Z").toISOString());
  });

  it("falls back to Brave relative age when page_age is absent", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(() => ({
        status: 200,
        body: {
          web: {
            results: [{ title: "t", url: "https://e.com/b", description: "d", age: "2 days ago" }],
          },
        },
      })),
    );
    const { articles } = await searchPool("k", { engines: only("brave") });
    const ts = new Date(articles[0].publishedAt).getTime();
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThan(Date.now() - 3 * 864e5);
  });

  it("normalizes Tavily RFC2822 published_date to ISO", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(() => ({
        status: 200,
        body: {
          results: [
            {
              title: "t",
              url: "https://e.com/t",
              content: "c",
              published_date: "Thu, 10 Sep 2026 23:33:41 GMT",
            },
          ],
        },
      })),
    );
    const { articles } = await searchPool("k", { engines: only("tavily") });
    expect(articles[0].publishedAt).toBe("2026-09-10T23:33:41.000Z");
  });

  it("maps Jina date strings to ISO when parseable", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(() => ({
        status: 200,
        body: {
          data: [{ title: "t", url: "https://e.com/j", description: "d", date: "2025-08-09" }],
        },
      })),
    );
    const { articles } = await searchPool("k", { engines: only("jina") });
    expect(articles[0].publishedAt).toBe("2025-08-09T00:00:00.000Z");
  });

  it("omits publishedAt when the engine carries no date field (unchanged shape)", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(() => ({ status: 200, body: TAVILY_BODY })),
    );
    const { articles } = await searchPool("k", { engines: only("tavily") });
    expect(articles[0].publishedAt).toBeUndefined();
    expect(articles[0]).toEqual({
      title: "Tavily hit",
      url: "https://example.com/t",
      snippet: "Tavily content",
    });
  });

  it("omits publishedAt when the date string is unparseable (fail-closed, no garbage)", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(() => ({
        status: 200,
        body: {
          organic: [{ title: "t", link: "https://e.com/a", snippet: "s", date: "soon-ish" }],
        },
      })),
    );
    const { articles } = await searchPool("k", { engines: only("serper") });
    expect(articles[0].publishedAt).toBeUndefined();
  });
});

// ─── news-mode engine params (#309 news contract, ruling (b)) ───
//
// Ruling: pool calls gain news params — Serper `tbs`, Tavily `topic:"news"` +
// `days`, Brave `freshness`; recency defaults to 7 days. Jina has no news
// param and only 62.5% per-entry dates (probe: 5/8 dated, 58.9k tokens/call)
// — it exits the news chain fail-closed and stays in the general chain.

describe("news-mode engine params (#309)", () => {
  beforeEach(() => {
    vi.stubEnv("SERPER_API_KEY", "serper-test-key");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "brave-test-key");
    vi.stubEnv("TAVILY_API_KEY", "tavily-test-key");
    vi.stubEnv("JINA_API_KEY", "jina-test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("Serper: adds tbs=qdr:w for the default 7-day window", async () => {
    let seenBody;
    vi.stubGlobal(
      "fetch",
      jsonFetch((_url, init) => {
        seenBody = JSON.parse(init.body);
        return { status: 200, body: SERPER_BODY };
      }),
    );
    await searchPool("k", { news: true, engines: only("serper") });
    expect(seenBody.tbs).toBe("qdr:w");
  });

  it("Tavily: adds topic:news + days=7 for the default window", async () => {
    let seenBody;
    vi.stubGlobal(
      "fetch",
      jsonFetch((_url, init) => {
        seenBody = JSON.parse(init.body);
        return { status: 200, body: TAVILY_BODY };
      }),
    );
    await searchPool("k", { news: true, engines: only("tavily") });
    expect(seenBody.topic).toBe("news");
    expect(seenBody.days).toBe(7);
  });

  it("Brave: adds freshness=pw for the default window", async () => {
    let seenUrl;
    vi.stubGlobal(
      "fetch",
      jsonFetch((url) => {
        seenUrl = String(url);
        return { status: 200, body: BRAVE_BODY };
      }),
    );
    await searchPool("k", { news: true, engines: only("brave") });
    expect(seenUrl).toContain("freshness=pw");
  });

  it("buckets explicit day windows (1 day → qdr:d / pd, 30 days → qdr:m / pm)", async () => {
    const seen = [];
    vi.stubGlobal(
      "fetch",
      jsonFetch((url, init) => {
        if (String(url).includes("brave")) seen.push(["brave", String(url)]);
        else seen.push(["serper", JSON.parse(init.body)]);
        return String(url).includes("brave")
          ? { status: 200, body: BRAVE_BODY }
          : { status: 200, body: SERPER_BODY };
      }),
    );
    await searchPool("k", { news: { days: 1 }, engines: only("serper") });
    await searchPool("k", { news: { days: 30 }, engines: only("serper") });
    await searchPool("k", { news: { days: 1 }, engines: only("brave") });
    await searchPool("k", { news: { days: 30 }, engines: only("brave") });
    expect(seen.map(([e, v]) => [e, v.tbs ?? v.match(/freshness=(\w+)/)?.[1] ?? null])).toEqual([
      ["serper", "qdr:d"],
      ["serper", "qdr:m"],
      ["brave", "pd"],
      ["brave", "pm"],
    ]);
  });

  it("skips Jina in news mode without a network call (fail-closed news exit)", async () => {
    const fetchMock = jsonFetch((url) => {
      if (String(url).includes("s.jina.ai"))
        throw new Error("jina must not be called in news mode");
      return { status: 500, body: {} };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("k", { news: true });
    expect(result.engine).toBeNull();
    expect(result.articles).toEqual([]);
    expect(result.attempts.map((a) => a.engine)).toEqual(["serper", "brave", "tavily", "jina"]);
    expect(result.attempts[3].error).toContain("fail-closed");
  });

  it("keeps Jina in the chain outside news mode (general fallback unchanged)", async () => {
    const fetchMock = jsonFetch((url) => {
      if (String(url).includes("s.jina.ai")) return { status: 200, body: JINA_BODY };
      return { status: 500, body: {} };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("k", { engines: LEGACY_CHAIN });
    expect(result.engine).toBe("jina");
  });

  it("adds no news params without opts.news (backward compat)", async () => {
    const seen = [];
    vi.stubGlobal(
      "fetch",
      jsonFetch((url, init) => {
        seen.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
        return { status: 200, body: TAVILY_BODY };
      }),
    );
    await searchPool("k", { engines: [POOL_ENGINES.find((e) => e.name === "serper")] });
    expect(seen[0].body.tbs).toBeUndefined();
    expect(seen[0].url).not.toContain("freshness");
    expect(seen[0].body.topic).toBeUndefined();
  });
});
