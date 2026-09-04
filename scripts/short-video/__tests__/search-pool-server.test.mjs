import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMessage, TOOL_NAME } from "../lib/search-pool-server.mjs";

const POOL_OK = {
  articles: [{ title: "T", url: "https://example.com/a", snippet: "s" }],
  engine: "tavily",
  attempts: [{ engine: "brave", ok: false, error: "fetch failed" }],
};
const POOL_EMPTY = {
  articles: [],
  engine: null,
  attempts: [{ engine: "brave", ok: false, error: "x" }],
};

function baseDeps(overrides = {}) {
  return {
    searchPool: vi.fn(async () => POOL_OK),
    grokSearch: vi.fn(async () => []),
    ...overrides,
  };
}

describe("search-pool-server", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exposes a single web_search tool", () => {
    const resp = handleMessage({ id: 1, method: "tools/list" }, baseDeps());
    expect(resp.id).toBe(1);
    expect(resp.result.tools).toHaveLength(1);
    expect(resp.result.tools[0].name).toBe(TOOL_NAME);
    expect(resp.result.tools[0].inputSchema.required).toContain("query");
  });

  it("handshakes initialize with server info and no capabilities", () => {
    const resp = handleMessage(
      { id: 2, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      baseDeps(),
    );
    expect(resp.result.protocolVersion).toBe("2024-11-05");
    expect(resp.result.serverInfo.name).toBe("search-pool");
  });

  it("returns null for notifications (no response frame)", () => {
    expect(handleMessage({ method: "notifications/initialized" }, baseDeps())).toBeNull();
  });

  it("returns null for unknown methods with no id", () => {
    expect(handleMessage({ method: "something/else" }, baseDeps())).toBeNull();
  });

  it("tools/call runs the pool and returns JSON articles as text content", async () => {
    const deps = baseDeps();
    const resp = await handleMessage(
      {
        id: 3,
        method: "tools/call",
        params: { name: TOOL_NAME, arguments: { query: "DeepSeek V4" } },
      },
      deps,
    );
    expect(deps.searchPool).toHaveBeenCalledWith("DeepSeek V4");
    expect(deps.grokSearch).not.toHaveBeenCalled();
    expect(resp.result.isError).toBeUndefined();
    const payload = JSON.parse(resp.result.content[0].text);
    expect(payload.engine).toBe("tavily");
    expect(payload.articles).toHaveLength(1);
    expect(payload.articles[0].url).toBe("https://example.com/a");
  });

  it("falls back to Grok when the pool returns zero articles", async () => {
    const deps = baseDeps({
      searchPool: vi.fn(async () => POOL_EMPTY),
      grokSearch: vi.fn(async () => [{ title: "Grok hit", url: "https://g", snippet: "" }]),
    });
    const resp = await handleMessage(
      { id: 4, method: "tools/call", params: { name: TOOL_NAME, arguments: { query: "q" } } },
      deps,
    );
    expect(deps.grokSearch).toHaveBeenCalledWith("q");
    const payload = JSON.parse(resp.result.content[0].text);
    expect(payload.engine).toBe("grok");
    expect(payload.articles).toHaveLength(1);
  });

  it("reports an error result when pool and Grok both fail", async () => {
    const deps = baseDeps({
      searchPool: vi.fn(async () => POOL_EMPTY),
      grokSearch: vi.fn(async () => []),
    });
    const resp = await handleMessage(
      { id: 5, method: "tools/call", params: { name: TOOL_NAME, arguments: { query: "q" } } },
      deps,
    );
    expect(resp.result.isError).toBe(true);
    expect(resp.result.content[0].text).toContain("no results");
  });

  it("rejects unknown tool names", async () => {
    const deps = baseDeps();
    const resp = await handleMessage(
      { id: 6, method: "tools/call", params: { name: "other_tool", arguments: {} } },
      deps,
    );
    expect(resp.result.isError).toBe(true);
    expect(resp.result.content[0].text).toContain("unknown tool");
  });

  it("rejects a call without a query string", async () => {
    const deps = baseDeps();
    const resp = await handleMessage(
      { id: 7, method: "tools/call", params: { name: TOOL_NAME, arguments: {} } },
      deps,
    );
    expect(resp.result.isError).toBe(true);
    expect(resp.result.content[0].text).toContain("query");
  });

  it("returns an error result (not a crash) when the pool throws", async () => {
    const deps = baseDeps({
      searchPool: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const resp = await handleMessage(
      { id: 8, method: "tools/call", params: { name: TOOL_NAME, arguments: { query: "q" } } },
      deps,
    );
    expect(resp.result.isError).toBe(true);
    expect(resp.result.content[0].text).toContain("boom");
  });
});
