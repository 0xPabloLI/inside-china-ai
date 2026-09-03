import { describe, it, expect, vi, afterEach } from "vitest";
import { searchX, searchXhs } from "../lib/bigsong-api.mjs";

function mockResponse(body, ok = true, status = 200) {
  return { ok, status, text: async () => body };
}

const UPSTREAM_JSON = JSON.stringify({
  choices: [
    {
      message: {
        content:
          '1. **Full text**: "DeepSeek V4 released"\n   **Author**: demo\n   **URL**: https://x.com/1',
      },
    },
  ],
});

describe("bigsong-api direct client (#90)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("searchX posts system prompt + query to SEARCH_BASE_URL with SEARCH_MODEL", async () => {
    vi.stubEnv("SEARCH_BASE_URL", "https://key.bigsong.site/v1");
    vi.stubEnv("SEARCH_API_KEY", "test_key");
    vi.stubEnv("SEARCH_MODEL", "grok-chat-fast");
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(UPSTREAM_JSON));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchX("DeepSeek V4");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://key.bigsong.site/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer test_key");
    const payload = JSON.parse(init.body);
    expect(payload.model).toBe("grok-chat-fast");
    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages[0].content).toContain(
      "Never invent numbers, links, quotes, or citations.",
    );
    expect(payload.messages[1]).toEqual({ role: "user", content: "DeepSeek V4" });
    expect(result.success).toBe(true);
    expect(result.data).toContain("DeepSeek V4 released");
  });

  it("searchXhs defaults to the dots-chat model on the same upstream", async () => {
    vi.stubEnv("SEARCH_BASE_URL", "https://key.bigsong.site/v1");
    vi.stubEnv("SEARCH_API_KEY", "test_key");
    vi.stubEnv("SEARCH_MODEL", "grok-chat-fast");
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(UPSTREAM_JSON));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchXhs("AI芯片");

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://key.bigsong.site/v1/chat/completions",
    );
    expect(payload.model).toBe("dots-chat");
    expect(result.success).toBe(true);
  });

  it("honors model override via opts", async () => {
    vi.stubEnv("SEARCH_BASE_URL", "https://key.bigsong.site/v1");
    vi.stubEnv("SEARCH_API_KEY", "test_key");
    vi.stubEnv("SEARCH_MODEL", "grok-chat-fast");
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(UPSTREAM_JSON));
    vi.stubGlobal("fetch", fetchMock);

    await searchX("kw", { model: "dots-chat" });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.model).toBe("dots-chat");
  });

  it("aborts after timeoutMs when upstream never responds", async () => {
    vi.stubEnv("SEARCH_BASE_URL", "https://key.bigsong.site/v1");
    vi.stubEnv("SEARCH_API_KEY", "test_key");
    vi.stubEnv("SEARCH_MODEL", "grok-chat-fast");
    // Mirror undici: reject when the abort signal fires.
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "TimeoutError";
            reject(err);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchX("kw", { timeoutMs: 50 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("returns failure with status detail on non-ok HTTP", async () => {
    vi.stubEnv("SEARCH_BASE_URL", "https://key.bigsong.site/v1");
    vi.stubEnv("SEARCH_API_KEY", "test_key");
    vi.stubEnv("SEARCH_MODEL", "grok-chat-fast");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse("boom", false, 502)));

    const result = await searchX("kw");

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 502");
  });

  it("returns failure when upstream is not JSON", async () => {
    vi.stubEnv("SEARCH_BASE_URL", "https://key.bigsong.site/v1");
    vi.stubEnv("SEARCH_API_KEY", "test_key");
    vi.stubEnv("SEARCH_MODEL", "grok-chat-fast");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse("<html>not json</html>")));

    const result = await searchX("kw");

    expect(result.success).toBe(false);
    expect(result.error).toContain("did not return JSON");
  });

  it("returns failure when upstream content is missing", async () => {
    vi.stubEnv("SEARCH_BASE_URL", "https://key.bigsong.site/v1");
    vi.stubEnv("SEARCH_API_KEY", "test_key");
    vi.stubEnv("SEARCH_MODEL", "grok-chat-fast");
    const empty = JSON.stringify({ choices: [{ message: {} }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(empty)));

    const result = await searchX("kw");

    expect(result.success).toBe(false);
    expect(result.error).toContain("no content");
  });

  it("fails closed with a precise missing-settings error", async () => {
    const result = await searchX("kw");

    expect(result.success).toBe(false);
    expect(result.error).toContain("SEARCH_BASE_URL");
    expect(result.error).toContain("SEARCH_API_KEY");
    expect(result.error).toContain("SEARCH_MODEL");
  });
});
