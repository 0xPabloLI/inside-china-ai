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
} from "../lib/progressive-search.mjs";

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
