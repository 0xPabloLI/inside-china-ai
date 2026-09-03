// Issue #66: scenario-driven fetch layer (static → Jina → CDP).
//
// fetchPage(url, { method }) picks the lightest extraction tool that works:
//   'static' — plain HTTP GET (raw HTML)
//   'jina'   — Jina Reader (r.jina.ai, light JS rendering, Markdown out)
//   'cdp'    — CDP browser extraction (heavy, full render + session)
//   'auto'   — static → jina → cdp, first success wins
// Tests mock global.fetch (repo style) and the cdp-client module.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/cdp-client.mjs", () => ({
  cdpNewTab: vi.fn(),
  cdpCloseTab: vi.fn(),
  waitForPageLoad: vi.fn(),
  extractFromTab: vi.fn(),
}));

import { fetchPage, fetchStatic, fetchJina, fetchCdp } from "../lib/fetch-page.mjs";
import { cdpNewTab, cdpCloseTab, waitForPageLoad, extractFromTab } from "../lib/cdp-client.mjs";

function mockResponse({ ok = true, status = 200, text = "" } = {}) {
  return {
    ok,
    status,
    text: async () => text,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  delete process.env.JINA_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("fetchStatic", () => {
  it("returns raw HTML via plain HTTP GET", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ text: "<html><body>hello</body></html>" })),
    );
    const result = await fetchStatic("https://example.com/article");
    expect(result.ok).toBe(true);
    expect(result.method).toBe("static");
    expect(result.text).toContain("hello");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/article",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fails gracefully on HTTP error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 403 })));
    const result = await fetchStatic("https://example.com/blocked");
    expect(result.ok).toBe(false);
    expect(result.method).toBe("static");
    expect(result.error).toContain("403");
  });

  it("fails gracefully on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await fetchStatic("https://example.com/down");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("fetchJina", () => {
  it("routes through r.jina.ai and returns the reader text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ text: "Markdown content of the page" })),
    );
    const result = await fetchJina("https://example.com/js-page");
    expect(result.ok).toBe(true);
    expect(result.method).toBe("jina");
    expect(result.text).toContain("Markdown content");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://r.jina.ai/https://example.com/js-page",
      expect.any(Object),
    );
  });

  it("sends Authorization bearer when JINA_API_KEY is set", async () => {
    process.env.JINA_API_KEY = "jina_test_key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ text: "content" })));
    await fetchJina("https://example.com/a");
    const opts = global.fetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer jina_test_key");
  });

  it("fails gracefully on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 429 })));
    const result = await fetchJina("https://example.com/rate-limited");
    expect(result.ok).toBe(false);
    expect(result.method).toBe("jina");
  });
});

describe("fetchCdp", () => {
  it("extracts page text through the CDP client and closes the tab", async () => {
    cdpNewTab.mockResolvedValue("tab-123");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab.mockResolvedValue("rendered page text");
    cdpCloseTab.mockResolvedValue(undefined);

    const result = await fetchCdp("https://example.com/heavy-js");
    expect(result).toEqual({ ok: true, method: "cdp", text: "rendered page text" });
    expect(cdpNewTab).toHaveBeenCalledWith("https://example.com/heavy-js");
    expect(extractFromTab).toHaveBeenCalled();
    expect(cdpCloseTab).toHaveBeenCalledWith("tab-123");
  });

  it("does not close a tab that was never opened (cdpNewTab rejected)", async () => {
    cdpNewTab.mockRejectedValue(new Error("no browser"));
    const result = await fetchCdp("https://example.com/x");
    expect(result.ok).toBe(false);
    expect(result.method).toBe("cdp");
    expect(cdpCloseTab).not.toHaveBeenCalled();
  });
});

describe("fetchPage auto mode", () => {
  it("prefers static when the plain HTTP GET works", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ text: "<html>static html</html>" })),
    );
    const result = await fetchPage("https://example.com/static-page");
    expect(result.method).toBe("static");
    expect(result.ok).toBe(true);
  });

  it("falls back to Jina when static returns an error status", async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).startsWith("https://r.jina.ai/")) {
        return Promise.resolve(mockResponse({ text: "jina markdown" }));
      }
      return Promise.resolve(mockResponse({ ok: false, status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchPage("https://example.com/fallback");
    expect(result.method).toBe("jina");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("jina markdown");
  });

  it("falls back to CDP when both static and Jina fail", async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).startsWith("https://r.jina.ai/")) {
        return Promise.resolve(mockResponse({ ok: false, status: 429 }));
      }
      return Promise.resolve(mockResponse({ ok: false, status: 403 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    cdpNewTab.mockResolvedValue("tab-9");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab.mockResolvedValue("cdp text");
    cdpCloseTab.mockResolvedValue(undefined);

    const result = await fetchPage("https://example.com/heavy");
    expect(result.method).toBe("cdp");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("cdp text");
  });

  it("reports failure with per-layer errors when every layer fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500 })));
    cdpNewTab.mockRejectedValue(new Error("no browser"));

    const result = await fetchPage("https://example.com/nope");
    expect(result.ok).toBe(false);
    expect(result.method).toBe("auto");
    expect(result.errors).toEqual({
      static: expect.any(String),
      jina: expect.any(String),
      cdp: expect.any(String),
    });
  });

  it("respects minLength — an empty static page falls through to Jina", async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).startsWith("https://r.jina.ai/")) {
        return Promise.resolve(mockResponse({ text: "real content from jina" }));
      }
      return Promise.resolve(mockResponse({ text: "   " }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchPage("https://example.com/empty");
    expect(result.method).toBe("jina");
    expect(result.ok).toBe(true);
  });
});

describe("fetchPage explicit methods", () => {
  it("method 'jina' only tries Jina", async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).startsWith("https://r.jina.ai/")) {
        return Promise.resolve(mockResponse({ text: "jina only" }));
      }
      return Promise.resolve(mockResponse({ text: "static body" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchPage("https://example.com/pick-jina", { method: "jina" });
    expect(result.method).toBe("jina");
    expect(result.text).toBe("jina only");
    // Only the r.jina.ai request was made
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("method 'static' never touches Jina or CDP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500 })));
    const result = await fetchPage("https://example.com/s", { method: "static" });
    expect(result.ok).toBe(false);
    expect(result.method).toBe("static");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("method 'cdp' goes straight to the browser", async () => {
    cdpNewTab.mockResolvedValue("tab-1");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab.mockResolvedValue("browser text");
    cdpCloseTab.mockResolvedValue(undefined);

    const result = await fetchPage("https://example.com/c", { method: "cdp" });
    expect(result.method).toBe("cdp");
    expect(result.text).toBe("browser text");
  });

  it("rejects an unknown method", async () => {
    await expect(fetchPage("https://example.com", { method: "teleport" })).rejects.toThrow(
      /unknown method/i,
    );
  });
});
