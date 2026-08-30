import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so variables are available in mock factories
const { mockSpawn, mockHomedir, mockExistsSync, mockOpenSync, mockCloseSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockHomedir: vi.fn(() => "/fake/home"),
  mockExistsSync: vi.fn(() => false),
  mockOpenSync: vi.fn(() => 999),
  mockCloseSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: (...args) => mockSpawn(...args),
}));

vi.mock("node:os", () => ({
  homedir: mockHomedir,
  hostname: () => "localhost",
  platform: () => "darwin",
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  openSync: mockOpenSync,
  closeSync: mockCloseSync,
}));

import {
  cdpNewTab,
  cdpEval,
  cdpCloseTab,
  waitForPageLoad,
  extractFromTab,
  checkLogin,
  findCdpProxyScript,
  ensureCdpProxy,
  CDP_BASE,
} from "../lib/cdp-client.mjs";

// #89 P0: the per-domain rate limiter is unit-tested separately
// (rate-limiter.test.mjs). Keep these integration tests free of real waits
// and state writes via the escape hatch.
vi.stubEnv("RATE_LIMITER_DISABLED", "1");

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

// ─── findCdpProxyScript ───

describe("findCdpProxyScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("S3: returns null when no candidate path exists", () => {
    mockExistsSync.mockReturnValue(false);
    mockHomedir.mockReturnValue("/fake/home");

    const result = findCdpProxyScript();
    expect(result).toBeNull();
  });

  it("S3b: returns path when cdp-proxy.mjs found in skill dir", () => {
    const fakeHome = "/fake/home";
    mockHomedir.mockReturnValue(fakeHome);
    const expectedPath = `${fakeHome}/.agents/skills/web-access/scripts/cdp-proxy.mjs`;
    mockExistsSync.mockImplementation((p) => p === expectedPath);

    const result = findCdpProxyScript();
    expect(result).toBe(expectedPath);
  });
});

// ─── ensureCdpProxy ───

describe("ensureCdpProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mockSpawn.mockReset();
    mockExistsSync.mockReturnValue(false); // default: not found
    mockHomedir.mockReturnValue("/fake/home");
    mockOpenSync.mockReturnValue(999);
    mockCloseSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("S1: returns true immediately when proxy already running", async () => {
    global.fetch.mockResolvedValue(mockFetchResponse([{ targetId: "tab_1" }]));

    const result = await ensureCdpProxy({ maxRetries: 1, intervalMs: 0 });
    expect(result).toBe(true);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("S1b: returns true when /targets returns non-ok but /health says connected", async () => {
    // /targets returns error but proxy process is running (edge case)
    global.fetch.mockResolvedValue({ ok: false, status: 502, json: () => Promise.resolve({}) });

    const result = await ensureCdpProxy({ maxRetries: 1, intervalMs: 0 });
    expect(result).toBe(false); // Can't verify proxy is actually working
  });
  it("S3: returns false when cdp-proxy.mjs not found in any path", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNREFUSED"));
    mockExistsSync.mockReturnValue(false);
    mockHomedir.mockReturnValue("/fake/home");

    const result = await ensureCdpProxy({ maxRetries: 1, intervalMs: 0 });
    expect(result).toBe(false);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("S4: returns false when proxy starts but health check times out", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNREFUSED"));
    mockHomedir.mockReturnValue("/fake/home");
    mockExistsSync.mockReturnValue(true);

    const mockChild = {
      unref: vi.fn(),
      on: vi.fn(),
      pid: 12345,
    };
    mockSpawn.mockReturnValue(mockChild);

    const result = await ensureCdpProxy({ maxRetries: 2, intervalMs: 0 });
    expect(result).toBe(false);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("S2: spawns proxy and returns true when /targets becomes available", async () => {
    let callCount = 0;
    global.fetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error("ECONNREFUSED");
      return Promise.resolve(mockFetchResponse([{ targetId: "tab_1" }]));
    });

    mockHomedir.mockReturnValue("/fake/home");
    mockExistsSync.mockReturnValue(true);

    const mockChild = { unref: vi.fn(), on: vi.fn(), pid: 12345 };
    mockSpawn.mockReturnValue(mockChild);

    const result = await ensureCdpProxy({ maxRetries: 5, intervalMs: 0 });
    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
