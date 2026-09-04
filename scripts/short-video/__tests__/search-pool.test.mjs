import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPool, isPoolEligible, POOL_ENGINE_NAMES } from "../lib/search-pool.mjs";

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

// ─── isPoolEligible ───

describe("isPoolEligible", () => {
  it("true when the source mcpFallback is the generic web_search bridge", () => {
    const source = { name: "google_search", mcpFallback: { toolName: "web_search" } };
    expect(isPoolEligible(source)).toBe(true);
  });

  it("true when toolName lives in capabilities.articles (enriched registry)", () => {
    const source = {
      name: "x_search",
      capabilities: { articles: { mcpFallback: { toolName: "web_search" } } },
    };
    expect(isPoolEligible(source)).toBe(true);
  });

  it("false for platform-specific MCP fallbacks (sogou_weixin)", () => {
    const source = {
      name: "sogou_weixin",
      capabilities: { articles: { mcpFallback: { toolName: "weixin_search" } } },
    };
    expect(isPoolEligible(source)).toBe(false);
  });

  it("false when there is no mcpFallback at all", () => {
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

  it("exposes the fixed engine order Brave > Tavily > Jina", () => {
    expect(POOL_ENGINE_NAMES).toEqual(["brave", "tavily", "jina"]);
  });

  it("uses Brave first and maps web.results to articles", async () => {
    const fetchMock = jsonFetch((url) => {
      expect(String(url)).toContain("api.search.brave.com");
      return { status: 200, body: BRAVE_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
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

    await searchPool("DeepSeek V4");
    expect(seenInit.headers["X-Subscription-Token"]).toBe("brave-test-key");
    expect(seenInit.headers["Accept"]).toBe("application/json");
  });

  it("falls back to Tavily when Brave returns empty results", async () => {
    const fetchMock = jsonFetch((url) => {
      if (String(url).includes("brave")) return { status: 200, body: { web: { results: [] } } };
      return { status: 200, body: TAVILY_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
    expect(result.engine).toBe("tavily");
    expect(result.articles[0].title).toBe("Tavily hit");
  });

  it("falls back on HTTP 429 and records the attempt", async () => {
    const fetchMock = jsonFetch((url) => {
      if (String(url).includes("brave")) return { status: 429, body: {} };
      return { status: 200, body: TAVILY_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
    expect(result.engine).toBe("tavily");
    expect(result.attempts).toEqual([
      { engine: "brave", ok: false, error: expect.stringContaining("429") },
    ]);
  });

  it("sends Tavily bearer auth and query body", async () => {
    // Brave disabled via missing key → Tavily is first called engine
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    let seenUrl;
    let seenInit;
    const fetchMock = jsonFetch((url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return { status: 200, body: TAVILY_BODY };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
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

    const result = await searchPool("DeepSeek V4");
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

    const result = await searchPool("DeepSeek V4");
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

    await searchPool("DeepSeek V4");
    expect(seenInit.headers.Authorization).toBe("Bearer jina-test-key");
    expect(seenInit.headers.Accept).toBe("application/json");
  });

  it("returns empty articles and all attempts when every engine fails", async () => {
    const fetchMock = jsonFetch(() => ({ status: 500, body: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
    expect(result.articles).toEqual([]);
    expect(result.engine).toBeNull();
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.map((a) => a.engine)).toEqual(["brave", "tavily", "jina"]);
  });

  it("treats a network throw as a failed attempt, not a crash", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("EAI_AGAIN");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPool("DeepSeek V4");
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

    const result = await searchPool("DeepSeek V4");
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
