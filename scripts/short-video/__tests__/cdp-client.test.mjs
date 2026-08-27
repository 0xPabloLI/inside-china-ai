import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  cdpNewTab,
  cdpEval,
  cdpCloseTab,
  waitForPageLoad,
  extractFromTab,
  checkLogin,
  CDP_BASE,
} from "../lib/cdp-client.mjs";

// ─── Helpers ───

function mockFetchResponse(data) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(typeof data === "string" ? data : JSON.stringify(data)),
  };
}

// ─── cdpNewTab ───

describe("cdpNewTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("S1: creates tab via POST and returns targetId", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ targetId: "tab_abc123" }));

    const tabId = await cdpNewTab("https://example.com");
    expect(tabId).toBe("tab_abc123");
    expect(global.fetch).toHaveBeenCalledWith(
      `${CDP_BASE}/new`,
      expect.objectContaining({
        method: "POST",
        body: "https://example.com",
      }),
    );
  });

  it("S3: URL with query params is passed as POST body without truncation", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ targetId: "tab_xyz" }));
    const urlWithQuery = "https://xhs.com/explore/abc?xsec_token=ABC&type=normal";
    const tabId = await cdpNewTab(urlWithQuery);
    expect(tabId).toBe("tab_xyz");
    const call = global.fetch.mock.calls[0];
    expect(call[0]).toBe(`${CDP_BASE}/new`);
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBe(urlWithQuery);
  });

  it("S1b: throws when no targetId returned", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ error: "Failed" }));

    await expect(cdpNewTab("https://example.com")).rejects.toThrow(/Failed to create tab/);
  });
});

// ─── cdpEval ───

describe("cdpEval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns eval response JSON", async () => {
    const evalResult = { result: { value: "complete" } };
    global.fetch.mockResolvedValue(mockFetchResponse(evalResult));

    const result = await cdpEval("tab_123", "document.readyState");
    expect(result).toEqual(evalResult);
    expect(global.fetch).toHaveBeenCalledWith(
      `${CDP_BASE}/eval?target=tab_123`,
      expect.objectContaining({
        method: "POST",
        body: "document.readyState",
      }),
    );
  });
});

// ─── cdpCloseTab ───

describe("cdpCloseTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("S3: closes tab without throwing", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ ok: true }));

    await expect(cdpCloseTab("tab_123")).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(`${CDP_BASE}/close?target=tab_123`);
  });

  it("S3b: does not throw when fetch fails", async () => {
    global.fetch.mockRejectedValue(new Error("Connection refused"));

    await expect(cdpCloseTab("tab_123")).resolves.toBeUndefined();
  });
});

// ─── waitForPageLoad ───

describe("waitForPageLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("S1: returns true when readyState is complete", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: "complete" } }));

    const loaded = await waitForPageLoad("tab_123");
    expect(loaded).toBe(true);
  });

  it("S1b: returns true when readyState is interactive", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: "interactive" } }));

    const loaded = await waitForPageLoad("tab_123");
    expect(loaded).toBe(true);
  });

  it("S1c: returns false when readyState never becomes complete", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: "loading" } }));

    const loaded = await waitForPageLoad("tab_123", 1); // 1 retry
    expect(loaded).toBe(false);
  });

  it("S1d: returns false when cdpEval throws", async () => {
    global.fetch.mockRejectedValue(new Error("Tab not found"));

    const loaded = await waitForPageLoad("tab_123", 1);
    expect(loaded).toBe(false);
  });
});

// ─── extractFromTab ───

describe("extractFromTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("S1: returns array from eval response", async () => {
    const articles = [{ title: "Article 1" }, { title: "Article 2" }];
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: articles } }));

    const result = await extractFromTab("tab_123", "return [{title: 'Article 1'}]");
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Article 1");
  });

  it("S1b: handles response.value directly (no result wrapper)", async () => {
    const articles = [{ title: "Direct" }];
    global.fetch.mockResolvedValue(mockFetchResponse({ value: articles }));

    const result = await extractFromTab("tab_123", "return []");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Direct");
  });

  it("S1c: parses JSON string response into array", async () => {
    const articles = [{ title: "Parsed" }];
    global.fetch.mockResolvedValue(
      mockFetchResponse({ result: { value: JSON.stringify(articles) } }),
    );

    const result = await extractFromTab("tab_123", "return ''");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Parsed");
  });

  it("S3: returns empty array when fetch throws", async () => {
    global.fetch.mockRejectedValue(new Error("Connection lost"));

    const result = await extractFromTab("tab_123", "return []");
    expect(result).toEqual([]);
  });

  it("S3b: returns empty array when response is not array or JSON", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: "some random text" } }));

    const result = await extractFromTab("tab_123", "return ''");
    expect(result).toEqual([]);
  });

  it("S3c: returns empty array when response is null", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: null } }));

    const result = await extractFromTab("tab_123", "return null");
    expect(result).toEqual([]);
  });

  it("wraps script in IIFE", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: [] } }));

    await extractFromTab("tab_123", "return []");

    const call = global.fetch.mock.calls[0];
    expect(call[1].body).toContain("(async function(){");
    expect(call[1].body).toContain("})()");
  });
});

// ─── checkLogin ───

describe("checkLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("S4: returns 'ok' when no loginCheckScript provided", async () => {
    const result = await checkLogin("tab_123", null);
    expect(result).toBe("ok");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("S4b: returns 'need_login' when script returns it", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: "need_login" } }));

    const result = await checkLogin("tab_123", "return 'need_login'");
    expect(result).toBe("need_login");
  });

  it("S4c: returns 'captcha' when script returns it", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: "captcha" } }));

    const result = await checkLogin("tab_123", "return 'captcha'");
    expect(result).toBe("captcha");
  });

  it("S4d: returns 'ok' when eval throws", async () => {
    global.fetch.mockRejectedValue(new Error("Tab closed"));

    const result = await checkLogin("tab_123", "return 'ok'");
    expect(result).toBe("ok");
  });

  it("wraps loginCheckScript in IIFE", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse({ result: { value: "ok" } }));

    await checkLogin("tab_123", "return 'ok'");

    const call = global.fetch.mock.calls[0];
    expect(call[1].body).toContain("(async function(){");
    expect(call[1].body).toContain("})()");
  });
});
