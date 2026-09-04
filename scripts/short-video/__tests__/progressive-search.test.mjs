/**
 * Progressive Search Tests — T1
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * Tests cover:
 * - shouldTriggerTier3: boundary conditions (scenarios #1, #8)
 * - searchBraveImages: API response parsing (scenarios #3, #4, #6, #9)
 * - searchSearXngImages: API response parsing (scenarios #5, #7, #9)
 * - BraveQuotaTracker: counter logic
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  shouldTriggerTier3,
  searchBraveImages,
  searchSearXngImages,
  BraveQuotaTracker,
  parseBraveImageResponse,
  parseSearXngImageResponse,
  IMAGE_SEARCH_ENGINES,
  normalizeCdpImageCandidates,
  searchGoogleImages,
  searchBingImages,
  parseDuckDuckGoImagesResponse,
  extractVqd,
  searchDuckDuckGoImages,
  parseTavilyImagesResponse,
  searchTavilyImages,
  searchCdpVideoSource,
  normalizeCdpVideoCandidates,
} from "../lib/progressive-search.mjs";
import { ALL_SOURCES } from "../lib/source-registry.mjs";
import { cdpNewTab, cdpCloseTab, extractFromTab, waitForPageLoad } from "../lib/cdp-client.mjs";

vi.mock("../lib/cdp-client.mjs", () => ({
  CDP_BASE: "http://localhost:3456",
  RETRY_WAIT_MS: 3000,
  cdpNewTab: vi.fn(),
  cdpEval: vi.fn(),
  cdpCloseTab: vi.fn(),
  waitForPageLoad: vi.fn(),
  extractFromTab: vi.fn(),
  checkLogin: vi.fn(),
  findCdpProxyScript: vi.fn(),
  ensureCdpProxy: vi.fn(),
}));

// ─── shouldTriggerTier3 ───

describe("shouldTriggerTier3", () => {
  it("returns true when totalAssets < scenesNeedingMedia (scenario #2: insufficient)", () => {
    expect(shouldTriggerTier3(3, 7)).toBe(true);
  });

  it("returns false when totalAssets >= scenesNeedingMedia (scenario #1: sufficient)", () => {
    expect(shouldTriggerTier3(7, 7)).toBe(false);
    expect(shouldTriggerTier3(10, 7)).toBe(false);
  });

  it("returns false when scenesNeedingMedia is 0 (scenario #8: empty scenes)", () => {
    expect(shouldTriggerTier3(0, 0)).toBe(false);
    expect(shouldTriggerTier3(5, 0)).toBe(false);
  });

  it("returns false when scenesNeedingMedia is negative or undefined", () => {
    expect(shouldTriggerTier3(0, -1)).toBe(false);
    expect(shouldTriggerTier3(0, undefined)).toBe(false);
    expect(shouldTriggerTier3(0, null)).toBe(false);
  });

  it("returns true when totalAssets is 0 and scenesNeedingMedia > 0", () => {
    expect(shouldTriggerTier3(0, 5)).toBe(true);
  });
});

// ─── BraveQuotaTracker ───

describe("BraveQuotaTracker", () => {
  it("starts with zero count", () => {
    const tracker = new BraveQuotaTracker();
    expect(tracker.getCount()).toBe(0);
  });

  it("tracks increments", () => {
    const tracker = new BraveQuotaTracker();
    tracker.track();
    tracker.track();
    tracker.track();
    expect(tracker.getCount()).toBe(3);
  });

  it("calculates remaining quota", () => {
    const tracker = new BraveQuotaTracker(1000);
    tracker.track();
    tracker.track();
    expect(tracker.getRemaining()).toBe(998);
  });

  it("returns 0 remaining when over quota", () => {
    const tracker = new BraveQuotaTracker(2);
    tracker.track();
    tracker.track();
    tracker.track();
    expect(tracker.getRemaining()).toBe(0);
  });

  it("canTrack returns false when quota exhausted", () => {
    const tracker = new BraveQuotaTracker(1);
    expect(tracker.canTrack()).toBe(true);
    tracker.track();
    expect(tracker.canTrack()).toBe(false);
  });
});

// ─── parseBraveImageResponse ───

describe("parseBraveImageResponse", () => {
  it("parses a well-formed Brave Image Search response", () => {
    const mockResponse = {
      results: [
        {
          title: "DeepSeek AI Logo",
          properties: {
            url: "https://example.com/deepseek-logo.jpg",
            width: 840,
            height: 498,
          },
          source: "techstartups.com",
        },
        {
          title: "DeepSeek Headquarters",
          properties: {
            url: "https://example.com/deepseek-hq.png",
            width: 1920,
            height: 1080,
          },
          source: "techtimes.com",
        },
      ],
    };

    const candidates = parseBraveImageResponse(mockResponse, "DeepSeek");

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      url: "https://example.com/deepseek-logo.jpg",
      title: "DeepSeek AI Logo",
      type: "image",
      resolution: "840x498",
      source: "brave_image",
    });
    expect(candidates[1]).toEqual({
      url: "https://example.com/deepseek-hq.png",
      title: "DeepSeek Headquarters",
      type: "image",
      resolution: "1920x1080",
      source: "brave_image",
    });
  });

  it("filters out results with null/undefined url (scenario #6)", () => {
    const mockResponse = {
      results: [
        {
          title: "Valid Image",
          properties: { url: "https://example.com/valid.jpg", width: 100, height: 100 },
        },
        {
          title: "Null URL",
          properties: { url: null },
        },
        {
          title: "Undefined URL",
          properties: {},
        },
      ],
    };

    const candidates = parseBraveImageResponse(mockResponse, "test");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe("https://example.com/valid.jpg");
  });

  it("returns empty array for empty results (scenario #9)", () => {
    const mockResponse = { results: [] };
    expect(parseBraveImageResponse(mockResponse, "test")).toEqual([]);
  });

  it("handles missing properties.width/height gracefully", () => {
    const mockResponse = {
      results: [
        {
          title: "No Dimensions",
          properties: { url: "https://example.com/no-dims.jpg" },
        },
      ],
    };

    const candidates = parseBraveImageResponse(mockResponse, "test");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].resolution).toBeUndefined();
  });
});

// ─── parseSearXngImageResponse ───

describe("parseSearXngImageResponse", () => {
  it("parses a well-formed SearXNG image search response", () => {
    const mockResponse = {
      results: [
        {
          title: "DeepSeek raises V4 API prices",
          img_src: "https://techstartups.com/deepseek.jpg",
          resolution: "840x498",
          source: "techstartups.com",
        },
        {
          title: "DeepSeek V4 Pro Launch",
          img_src: "https://techtimes.com/deepseek-v4.jpg",
          resolution: "836x557",
          source: "techtimes.com",
        },
      ],
    };

    const candidates = parseSearXngImageResponse(mockResponse, "DeepSeek");

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      url: "https://techstartups.com/deepseek.jpg",
      title: "DeepSeek raises V4 API prices",
      type: "image",
      resolution: "840x498",
      source: "searxng_image",
    });
    expect(candidates[1].url).toBe("https://techtimes.com/deepseek-v4.jpg");
  });

  it("filters out results with empty img_src (scenario #7)", () => {
    const mockResponse = {
      results: [
        { title: "Valid", img_src: "https://example.com/valid.jpg" },
        { title: "Empty", img_src: "" },
        { title: "No img_src" },
      ],
    };

    const candidates = parseSearXngImageResponse(mockResponse, "test");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe("https://example.com/valid.jpg");
  });

  it("returns empty array for empty results (scenario #9)", () => {
    const mockResponse = { results: [] };
    expect(parseSearXngImageResponse(mockResponse, "test")).toEqual([]);
  });

  it("handles missing resolution gracefully", () => {
    const mockResponse = {
      results: [{ title: "No Resolution", img_src: "https://example.com/no-res.jpg" }],
    };

    const candidates = parseSearXngImageResponse(mockResponse, "test");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].resolution).toBeUndefined();
  });
});

// ─── searchBraveImages (integration with mocked fetch) ───

describe("searchBraveImages", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed candidates on successful API call", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "Test Image",
            properties: { url: "https://example.com/test.jpg", width: 800, height: 600 },
          },
        ],
      }),
    });

    const tracker = new BraveQuotaTracker(1000);
    const candidates = await searchBraveImages("test keyword", "fake-api-key", {
      count: 20,
      quotaTracker: tracker,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe("https://example.com/test.jpg");
    expect(candidates[0].source).toBe("brave_image");
    expect(tracker.getCount()).toBe(1);
  });

  it("returns empty array when API key is null/undefined (scenario #3)", async () => {
    const tracker = new BraveQuotaTracker();
    const candidates = await searchBraveImages("test", null, { quotaTracker: tracker });
    expect(candidates).toEqual([]);
    expect(tracker.getCount()).toBe(0);
  });

  it("returns empty array when fetch fails (scenario #5: network error)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const tracker = new BraveQuotaTracker();
    const candidates = await searchBraveImages("test", "fake-key", { quotaTracker: tracker });
    expect(candidates).toEqual([]);
  });

  it("returns empty array on 429 response (scenario #4: quota exhausted)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    const tracker = new BraveQuotaTracker();
    const candidates = await searchBraveImages("test", "fake-key", { quotaTracker: tracker });
    expect(candidates).toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    const candidates = await searchBraveImages("test", "fake-key", {});
    expect(candidates).toEqual([]);
  });

  it("does not call API when quota is exhausted (scenario #4)", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const tracker = new BraveQuotaTracker(1);
    tracker.track(); // exhaust quota

    const candidates = await searchBraveImages("test", "fake-key", { quotaTracker: tracker });
    expect(candidates).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── searchSearXngImages (integration with mocked fetch) ───

describe("searchSearXngImages", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed candidates on successful API call", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "SearXNG Result",
            img_src: "https://example.com/searxng-result.jpg",
            resolution: "1024x768",
          },
        ],
      }),
    });

    const candidates = await searchSearXngImages("test keyword", {
      baseUrl: "http://localhost:8888",
      count: 20,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe("https://example.com/searxng-result.jpg");
    expect(candidates[0].source).toBe("searxng_image");
  });

  it("returns empty array when fetch fails (scenario #5: SearXNG unreachable)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    const candidates = await searchSearXngImages("test", { baseUrl: "http://localhost:8888" });
    expect(candidates).toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const candidates = await searchSearXngImages("test", { baseUrl: "http://localhost:8888" });
    expect(candidates).toEqual([]);
  });

  it("uses default baseUrl when not provided", async () => {
    let capturedUrl = null;
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({ results: [] }),
      });
    });

    await searchSearXngImages("test");
    expect(capturedUrl).toContain("localhost:8888");
  });
});

// ─── IMAGE_SEARCH_ENGINES (pluggable pool, #112) ───

describe("IMAGE_SEARCH_ENGINES", () => {
  it("is an array of engines with name/label/type/search", () => {
    expect(Array.isArray(IMAGE_SEARCH_ENGINES)).toBe(true);
    for (const engine of IMAGE_SEARCH_ENGINES) {
      expect(typeof engine.name).toBe("string");
      expect(typeof engine.label).toBe("string");
      expect(["api", "cdp", "fetch"]).toContain(engine.type);
      expect(typeof engine.search).toBe("function");
    }
  });

  it("keeps brave_image first to preserve #110 engine order", () => {
    expect(IMAGE_SEARCH_ENGINES[0].name).toBe("brave_image");
  });

  it("includes the #110 engines brave_image and searxng_image", () => {
    const names = IMAGE_SEARCH_ENGINES.map((e) => e.name);
    expect(names).toContain("brave_image");
    expect(names).toContain("searxng_image");
  });

  it("api engine metadata stays consistent with source-registry capabilities (SSOT)", () => {
    const registryByName = new Map(
      ALL_SOURCES.filter((s) => s.capabilities?.images?.method === "api").map((s) => [s.name, s]),
    );
    for (const engine of IMAGE_SEARCH_ENGINES) {
      const registrySource = registryByName.get(engine.name);
      if (!registrySource) continue; // engines not in registry (e.g. tavily_images) are fine
      expect(engine.requiresApiKey).toBe(registrySource.capabilities.images.requiresApiKey);
      expect(engine.apiKeyEnv).toBe(registrySource.capabilities.images.apiKeyEnv);
    }
  });

  it("brave_image search delegates to searchBraveImages with ctx apiKey and quotaTracker", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "T", properties: { url: "https://example.com/t.jpg", width: 10, height: 10 } },
        ],
      }),
    });

    const engine = IMAGE_SEARCH_ENGINES.find((e) => e.name === "brave_image");
    const tracker = new BraveQuotaTracker();
    const candidates = await engine.search("test keyword", {
      apiKey: "fake-key",
      quotaTracker: tracker,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("brave_image");
    expect(tracker.getCount()).toBe(1);
  });

  it("searxng_image search delegates to searchSearXngImages", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ title: "S", img_src: "https://example.com/s.jpg" }],
      }),
    });

    const engine = IMAGE_SEARCH_ENGINES.find((e) => e.name === "searxng_image");
    const candidates = await engine.search("test keyword", {});

    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("searxng_image");
  });
});

// ─── normalizeCdpImageCandidates (CDP engine shared normalization, #112) ───

describe("normalizeCdpImageCandidates", () => {
  it("keeps http(s) image entries and stamps source/type", () => {
    const raw = [
      {
        title: "Robot",
        url: "https://img.example/robot.jpg",
        type: "image",
        sourceUrl: "https://page.example/a",
      },
      { title: "Chart", url: "https://img.example/chart.png", sourceUrl: "https://page.example/b" },
    ];
    const out = normalizeCdpImageCandidates(raw, "google_images");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      url: "https://img.example/robot.jpg",
      title: "Robot",
      type: "image",
      source: "google_images",
      sourceUrl: "https://page.example/a",
    });
    expect(out[1].type).toBe("image");
  });

  it("filters data:/javascript:/missing urls", () => {
    const raw = [
      { title: "inline", url: "data:image/png;base64,AAAA" },
      { title: "js", url: "javascript:void(0)" },
      { title: "no url" },
      { title: "ok", url: "https://img.example/ok.jpg" },
    ];
    const out = normalizeCdpImageCandidates(raw, "bing_images");
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://img.example/ok.jpg");
  });

  it("rejects protocol-relative and non-http schemes (http(s) contract)", () => {
    const raw = [
      { title: "protocol-relative", url: "//img.example/a.jpg" },
      { title: "ftp", url: "ftp://img.example/a.jpg" },
      { title: "bare host", url: "img.example/a.jpg" },
      { title: "ok", url: "http://img.example/b.jpg" },
    ];
    const out = normalizeCdpImageCandidates(raw, "google_images");
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("http://img.example/b.jpg");
  });

  it("falls back title to keyword and drops empty raw input", () => {
    expect(
      normalizeCdpImageCandidates([{ url: "https://img.example/x.jpg" }], "google_images", "kw"),
    ).toMatchObject([
      { url: "https://img.example/x.jpg", title: "kw", type: "image", source: "google_images" },
    ]);
    expect(normalizeCdpImageCandidates([], "google_images")).toEqual([]);
    expect(normalizeCdpImageCandidates(null, "google_images")).toEqual([]);
  });
});

// ─── searchGoogleImages (CDP engine, #112) ───

describe("searchGoogleImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("engine pool contains google_images as a cdp engine", () => {
    const engine = IMAGE_SEARCH_ENGINES.find((e) => e.name === "google_images");
    expect(engine).toBeDefined();
    expect(engine.type).toBe("cdp");
    expect(engine.label).toBe("Google Images");
  });

  it("opens a tbm=isch tab, extracts, normalizes and closes the tab", async () => {
    cdpNewTab.mockResolvedValue("tab-g");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab.mockResolvedValue([
      {
        title: "Unitree Robot",
        url: "https://img.example/unitree.jpg",
        type: "image",
        sourceUrl: "https://page.example/u",
      },
    ]);
    cdpCloseTab.mockResolvedValue(undefined);

    const candidates = await searchGoogleImages("unitree robot", { waitMs: 1 });

    expect(cdpNewTab).toHaveBeenCalledWith(expect.stringContaining("google.com/search"));
    expect(cdpNewTab).toHaveBeenCalledWith(expect.stringContaining("tbm=isch"));
    expect(cdpNewTab).toHaveBeenCalledWith(expect.stringContaining("unitree%20robot"));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      url: "https://img.example/unitree.jpg",
      title: "Unitree Robot",
      type: "image",
      source: "google_images",
    });
    expect(cdpCloseTab).toHaveBeenCalledWith("tab-g");
  });

  it("retries once with the fallback script when primary extraction is empty", async () => {
    cdpNewTab.mockResolvedValue("tab-g");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ title: "Fallback", url: "https://img.example/f.jpg" }]);
    cdpCloseTab.mockResolvedValue(undefined);

    const candidates = await searchGoogleImages("kw", { waitMs: 1 });
    expect(extractFromTab).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("google_images");
  });

  it("returns empty array when tab creation fails", async () => {
    cdpNewTab.mockRejectedValue(new Error("proxy down"));
    const candidates = await searchGoogleImages("kw");
    expect(candidates).toEqual([]);
    expect(cdpCloseTab).not.toHaveBeenCalled();
  });
});

// ─── searchBingImages (CDP engine, #112) ───

describe("searchBingImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("engine pool contains bing_images as a cdp engine", () => {
    const engine = IMAGE_SEARCH_ENGINES.find((e) => e.name === "bing_images");
    expect(engine).toBeDefined();
    expect(engine.type).toBe("cdp");
    expect(engine.label).toBe("Bing Images");
  });

  it("opens a bing images tab, extracts a.iusc murl JSON, normalizes and closes", async () => {
    cdpNewTab.mockResolvedValue("tab-b");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab.mockResolvedValue([
      {
        title: "Bostrom Quote",
        url: "https://img.example/bostrom-full.jpg",
        type: "image",
        sourceUrl: "https://page.example/bostrom",
      },
    ]);
    cdpCloseTab.mockResolvedValue(undefined);

    const candidates = await searchBingImages("nick bostrom");

    expect(cdpNewTab).toHaveBeenCalledWith(expect.stringContaining("bing.com/images/search"));
    expect(cdpNewTab).toHaveBeenCalledWith(expect.stringContaining("nick%20bostrom"));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      url: "https://img.example/bostrom-full.jpg",
      title: "Bostrom Quote",
      type: "image",
      source: "bing_images",
      sourceUrl: "https://page.example/bostrom",
    });
    expect(cdpCloseTab).toHaveBeenCalledWith("tab-b");
  });

  it("retries once then uses the fallback script when primary extraction is empty", async () => {
    cdpNewTab.mockResolvedValue("tab-b");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ title: "Thumb", url: "https://tse.mm.bing.net/th?id=OIP.x" }]);
    cdpCloseTab.mockResolvedValue(undefined);

    const candidates = await searchBingImages("kw", { waitMs: 1 });
    expect(extractFromTab).toHaveBeenCalledTimes(3);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("bing_images");
  });

  it("returns empty array when tab creation fails", async () => {
    cdpNewTab.mockRejectedValue(new Error("proxy down"));
    const candidates = await searchBingImages("kw");
    expect(candidates).toEqual([]);
  });
});

// ─── DuckDuckGo Images (vqd + i.js, #112) ───

describe("parseDuckDuckGoImagesResponse", () => {
  it("maps i.js results to candidates with resolution", () => {
    const data = {
      results: [
        { title: "Robot", image: "https://img.example/robot.jpg", width: 1920, height: 1080 },
        { title: "Chip", image: "https://img.example/chip.png", width: 800, height: 600 },
      ],
    };
    const out = parseDuckDuckGoImagesResponse(data, "kw");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      url: "https://img.example/robot.jpg",
      title: "Robot",
      type: "image",
      resolution: "1920x1080",
      source: "duckduckgo_images",
    });
  });

  it("filters entries without image url and tolerates missing dims", () => {
    const data = {
      results: [
        { title: "ok", image: "https://img.example/ok.jpg" },
        { title: "no image" },
        { image: "" },
      ],
    };
    const out = parseDuckDuckGoImagesResponse(data, "kw");
    expect(out).toHaveLength(1);
    expect(out[0].resolution).toBeUndefined();
  });

  it("returns empty for empty/invalid input", () => {
    expect(parseDuckDuckGoImagesResponse({}, "kw")).toEqual([]);
    expect(parseDuckDuckGoImagesResponse(null, "kw")).toEqual([]);
  });
});

describe("extractVqd", () => {
  it("extracts vqd from duckduckgo.com HTML", () => {
    const html = `<html><head><script>vqd="4-1234567890123456",qv="test"</script></head></html>`;
    expect(extractVqd(html)).toBe("4-1234567890123456");
  });

  it("handles single quotes and unquoted forms", () => {
    expect(extractVqd("vqd='4-abc-def'")).toBe("4-abc-def");
    expect(extractVqd("vqd=4-abc-def;")).toBe("4-abc-def");
  });

  it("returns null when vqd is absent", () => {
    expect(extractVqd("<html><body>no token</body></html>")).toBeNull();
    expect(extractVqd("")).toBeNull();
  });
});

describe("searchDuckDuckGoImages", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("engine pool contains duckduckgo_images as a fetch engine", () => {
    const engine = IMAGE_SEARCH_ENGINES.find((e) => e.name === "duckduckgo_images");
    expect(engine).toBeDefined();
    expect(engine.type).toBe("fetch");
    expect(engine.label).toBe("DuckDuckGo Images");
  });

  it("fetches the landing page for vqd then calls i.js with the token", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<script>vqd="4-tok123"</script>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { title: "DDG Result", image: "https://img.example/ddg.jpg", width: 640, height: 480 },
          ],
        }),
      });

    const candidates = await searchDuckDuckGoImages("humanoid robot");

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const landingUrl = globalThis.fetch.mock.calls[0][0];
    const ijsUrl = globalThis.fetch.mock.calls[1][0];
    expect(landingUrl).toContain("duckduckgo.com/?q=humanoid%20robot");
    expect(landingUrl).toContain("iax=images");
    expect(ijsUrl).toContain("duckduckgo.com/i.js");
    expect(ijsUrl).toContain("vqd=4-tok123");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      url: "https://img.example/ddg.jpg",
      source: "duckduckgo_images",
      resolution: "640x480",
    });
  });

  it("returns empty array and skips i.js when vqd is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<html>challenge page</html>",
    });

    const candidates = await searchDuckDuckGoImages("kw");
    expect(candidates).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns empty array on landing page network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const candidates = await searchDuckDuckGoImages("kw");
    expect(candidates).toEqual([]);
  });

  it("returns empty array when i.js responds non-ok", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => `vqd="4-tok"` })
      .mockResolvedValueOnce({ ok: false, status: 403 });

    const candidates = await searchDuckDuckGoImages("kw");
    expect(candidates).toEqual([]);
  });
});

// ─── Tavily include_images last-resort (#112) ───

describe("parseTavilyImagesResponse", () => {
  it("maps string entries and {url, description} objects", () => {
    const data = {
      images: [
        "https://img.example/plain.jpg",
        { url: "https://img.example/desc.jpg", description: "Factory floor" },
      ],
    };
    const out = parseTavilyImagesResponse(data, "kw");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      url: "https://img.example/plain.jpg",
      title: "kw",
      type: "image",
      source: "tavily_images",
    });
    expect(out[1]).toEqual({
      url: "https://img.example/desc.jpg",
      title: "Factory floor",
      type: "image",
      source: "tavily_images",
    });
  });

  it("filters empty/invalid entries", () => {
    const data = { images: ["", null, { url: "" }, { url: "https://img.example/ok.jpg" }] };
    const out = parseTavilyImagesResponse(data, "kw");
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://img.example/ok.jpg");
  });

  it("returns empty for missing images array", () => {
    expect(parseTavilyImagesResponse({}, "kw")).toEqual([]);
    expect(parseTavilyImagesResponse(null, "kw")).toEqual([]);
  });
});

describe("searchTavilyImages", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("engine pool contains tavily_images last as a fetch engine with key metadata", () => {
    const engine = IMAGE_SEARCH_ENGINES[IMAGE_SEARCH_ENGINES.length - 1];
    expect(engine.name).toBe("tavily_images");
    expect(engine.type).toBe("fetch");
    expect(engine.label).toBe("Tavily Images");
    expect(engine.requiresApiKey).toBe(true);
    expect(engine.apiKeyEnv).toBe("TAVILY_API_KEY");
  });

  it("POSTs to api.tavily.com with include_images and Bearer auth", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [{ url: "https://img.example/tv.jpg", description: "Robot" }],
      }),
    });

    const candidates = await searchTavilyImages("humanoid robot", "tvly-key");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tvly-key");
    const body = JSON.parse(init.body);
    expect(body.query).toBe("humanoid robot");
    expect(body.include_images).toBe(true);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("tavily_images");
  });

  it("returns empty array without API key", async () => {
    globalThis.fetch = vi.fn();
    const candidates = await searchTavilyImages("kw", null);
    expect(candidates).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns empty array on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const candidates = await searchTavilyImages("kw", "key");
    expect(candidates).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const candidates = await searchTavilyImages("kw", "key");
    expect(candidates).toEqual([]);
  });
});

// ─── #183: CDP video search ───

describe("searchCdpVideoSource", () => {
  it("opens the source url, extracts with videoScript and closes", async () => {
    const source = {
      name: "ithome",
      url: (kw) => `https://www.ithome.com/search?word=${encodeURIComponent(kw)}`,
      videoScript: "var r = []; return r;",
    };
    cdpNewTab.mockResolvedValue("tab-v");
    waitForPageLoad.mockResolvedValue(true);
    extractFromTab.mockResolvedValue([
      { url: "https://www.bilibili.com/video/BV1x", type: "video" },
    ]);
    cdpCloseTab.mockResolvedValue(undefined);

    const out = await searchCdpVideoSource(source, "滴滴");
    expect(cdpNewTab).toHaveBeenCalledWith(expect.stringContaining("ithome.com"));
    expect(extractFromTab).toHaveBeenCalledWith("tab-v", "var r = []; return r;");
    expect(out).toHaveLength(1);
    expect(cdpCloseTab).toHaveBeenCalledWith("tab-v");
  });
});

describe("normalizeCdpVideoCandidates", () => {
  it("normalizes bilibili player iframe urls to watch urls", () => {
    const out = normalizeCdpVideoCandidates(
      [{ url: "//player.bilibili.com/player.html?bvid=BV1gJ5T6CEt7" }],
      "ithome",
      "kw",
    );
    expect(out).toEqual([
      {
        url: "https://www.bilibili.com/video/BV1gJ5T6CEt7",
        title: "kw",
        platform: "bilibili",
        type: "video",
        source: "ithome",
      },
    ]);
  });

  it("normalizes youtube embeds to watch urls", () => {
    const out = normalizeCdpVideoCandidates(
      [{ url: "https://www.youtube.com/embed/n7J6dPuk6Ek" }],
      "ithome",
      "kw",
    );
    expect(out[0]).toMatchObject({
      url: "https://www.youtube.com/watch?v=n7J6dPuk6Ek",
      platform: "youtube",
    });
  });

  it("keeps direct http video sources with platform null", () => {
    const out = normalizeCdpVideoCandidates(
      [{ url: "https://media.example/clip.mp4", title: "clip" }],
      "qbitai",
      "kw",
    );
    expect(out[0]).toMatchObject({
      url: "https://media.example/clip.mp4",
      platform: null,
      title: "clip",
    });
  });

  it("dedupes by url and rejects non-video urls", () => {
    const out = normalizeCdpVideoCandidates(
      [
        { url: "https://www.bilibili.com/video/BV1x" },
        { url: "https://www.bilibili.com/video/BV1x" },
        { url: "https://page.example/article" },
        { url: "data:text/html,x" },
      ],
      "ithome",
      "kw",
    );
    expect(out).toHaveLength(1);
  });

  it("returns [] for empty/invalid raw", () => {
    expect(normalizeCdpVideoCandidates(null, "ithome")).toEqual([]);
    expect(normalizeCdpVideoCandidates([], "ithome")).toEqual([]);
  });
});
