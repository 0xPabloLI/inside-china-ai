import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createApifyClient,
  normalizeVideo,
  ApifyError,
  ApifyAuthError,
  ApifyTimeoutError,
} from "../lib/apify-client.mjs";

// ─── normalizeVideo tests ───

describe("normalizeVideo", () => {
  it("N1: normalizes a complete raw item", () => {
    const raw = {
      id: "7234567890",
      text: "DeepSeek makes AI cheaper",
      authorMeta: { name: "technews", fans: 50000 },
      playCount: 12345,
      diggCount: 678,
      commentCount: 23,
      shareCount: 45,
      webVideoUrl: "https://www.tiktok.com/@technews/video/7234567890",
      createTimeISO: "2026-08-01T00:00:00Z",
      musicMeta: { musicName: "Original Sound" },
    };
    const result = normalizeVideo(raw);
    expect(result).toEqual({
      id: "7234567890",
      text: "DeepSeek makes AI cheaper",
      author: "technews",
      authorFollowers: 50000,
      plays: 12345,
      likes: 678,
      comments: 23,
      shares: 45,
      url: "https://www.tiktok.com/@technews/video/7234567890",
      createdAt: "2026-08-01T00:00:00Z",
      music: "Original Sound",
    });
  });

  it("N2: returns null for missing id", () => {
    expect(normalizeVideo({ text: "no id" })).toBeNull();
  });

  it("N3: returns null for non-object", () => {
    expect(normalizeVideo(null)).toBeNull();
    expect(normalizeVideo("string")).toBeNull();
    expect(normalizeVideo(undefined)).toBeNull();
  });

  it("N4: defaults missing fields to 0/null/empty", () => {
    const result = normalizeVideo({ id: "123" });
    expect(result.id).toBe("123");
    expect(result.plays).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.author).toBeNull();
    expect(result.url).toBeNull();
    expect(result.music).toBeNull();
  });
});

// ─── Client tests ───

describe("createApifyClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.APIFY_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─── Auth ───

  it("A1: missing token → ApifyAuthError, no network request", async () => {
    // Mock resolveToken to return null by setting token to a sentinel
    // createApifyClient resolves token from env/.env.local if not provided,
    // so we pass an explicit empty string to override.
    const client = createApifyClient({ dryRun: false, token: "" });
    await expect(client.fetchHashtagVideos("deepseek")).rejects.toThrow(ApifyAuthError);

    // Verify actual token value is NOT in error message
    // (the word "token" in "APIFY_TOKEN" is fine — it's the env var name)
    try {
      await client.fetchHashtagVideos("deepseek");
    } catch (e) {
      expect(e.message).toContain("APIFY_TOKEN");
      // No actual token value should be present
      expect(e.message).not.toMatch(/[a-f0-9]{20,}/i);
    }
  }, 10000);

  // ─── Dry run ───

  it("A2: dry-run mode blocks remote requests", async () => {
    const client = createApifyClient({ dryRun: true, token: "fake-token" });
    await expect(client.fetchHashtagVideos("deepseek")).rejects.toThrow(/Dry-run/);
  });

  // ─── URL construction ───

  it("A3: buildUrl uses actors/:actorId/run-sync-get-dataset-items with encoded ID", () => {
    const client = createApifyClient({ dryRun: true, token: "fake-token" });
    const url = client._buildUrl("clockworks~tiktok-scraper");
    expect(url).toBe(
      "https://api.apify.com/v2/actors/clockworks~tiktok-scraper/run-sync-get-dataset-items",
    );
    // Verify ~ is NOT separately encoded
    expect(url).toContain("clockworks~tiktok-scraper");
  });

  it("A4: buildUrl encodes dynamic actor IDs safely", () => {
    const client = createApifyClient({ dryRun: true, token: "fake-token" });
    const url = client._buildUrl("test~actor/with special chars");
    // The / and space should be encoded, ~ should pass through
    expect(url).toContain(encodeURIComponent("test~actor/with special chars"));
  });

  // ─── Auth header (via fetch mock) ───

  it("A5: token only in Authorization header, not in URL or error text", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => [],
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "secret-token-12345",
    });
    await client.fetchHashtagVideos("deepseek", { maxItems: 5 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    // Token NOT in URL
    expect(url).not.toContain("secret-token-12345");
    // Token in Authorization header
    expect(init.headers["Authorization"]).toBe("Bearer secret-token-12345");
  });

  // ─── Normal video sample ───

  it("A6: fetchHashtagVideos returns normalized video array", async () => {
    const mockResponse = [
      {
        id: "vid1",
        text: "DeepSeek R1 is amazing",
        authorMeta: { name: "user1", fans: 1000 },
        playCount: 500,
        diggCount: 50,
        commentCount: 5,
        shareCount: 10,
        webVideoUrl: "https://tiktok.com/@user1/video/vid1",
        createTimeISO: "2026-08-01T00:00:00Z",
        musicMeta: { musicName: "Sound1" },
      },
      {
        id: "vid2",
        text: "Another video",
        authorMeta: { name: "user2", fans: 2000 },
        playCount: 300,
        diggCount: 30,
        commentCount: 3,
        shareCount: 5,
        webVideoUrl: "https://tiktok.com/@user2/video/vid2",
        createTimeISO: "2026-08-02T00:00:00Z",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => mockResponse,
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
    });
    const result = await client.fetchHashtagVideos("deepseek", { maxItems: 2 });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("vid1");
    expect(result[0].author).toBe("user1");
    expect(result[0].plays).toBe(500);
    expect(result[1].music).toBeNull();
  });

  // ─── Non-array response ───

  it("A7: non-array response → schema error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => ({ error: "unexpected object" }),
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
    });
    await expect(client.fetchHashtagVideos("deepseek")).rejects.toThrow(
      /Unexpected response shape/,
    );
  });

  // ─── Retry on 429 ───

  it("A8: 429 → retries with backoff, then succeeds", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, text: () => "rate limited" })
      .mockResolvedValueOnce({
        status: 200,
        json: () => [{ id: "vid1" }],
      });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
      maxRetries: 3,
    });
    const result = await client.fetchHashtagVideos("deepseek");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("vid1");
  });

  // ─── Retry exhausted on 5xx ───

  it("A9: 503 after all retries → ApifyError with status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 503,
      text: () => "service unavailable",
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
      maxRetries: 2,
    });
    await expect(client.fetchHashtagVideos("deepseek")).rejects.toThrow(ApifyError);

    try {
      await client.fetchHashtagVideos("deepseek");
    } catch (e) {
      expect(e.status).toBe(503);
      expect(e.actor).toBe("clockworks~tiktok-scraper");
    }
  });

  // ─── Timeout (408) ───

  it("A10: 408 → ApifyTimeoutError, no cache write", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 408,
      text: () => "timeout",
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
      maxRetries: 0,
    });
    await expect(client.fetchHashtagVideos("deepseek")).rejects.toThrow(ApifyTimeoutError);

    // Verify cache is empty (timeout should not cache)
    expect(
      client._cache.get(
        'clockworks~tiktok-scraper:{"hashtags":["deepseek"],"resultsPerPage":20,"shouldDownloadVideos":false,"shouldDownloadCovers":false}',
      ),
    ).toBeNull();
  });

  // ─── Cache ───

  it("A11: same tag+params → cache hit, no duplicate request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => [{ id: "cached-vid" }],
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
    });
    const r1 = await client.fetchHashtagVideos("deepseek", { maxItems: 5 });
    const r2 = await client.fetchHashtagVideos("deepseek", { maxItems: 5 });

    expect(mockFetch).toHaveBeenCalledTimes(1); // Second call used cache
    expect(r1).toEqual(r2);
  });

  it("A12: forceRefresh bypasses cache", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => [{ id: "fresh-vid" }],
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
    });
    await client.fetchHashtagVideos("deepseek", { maxItems: 5 });
    await client.fetchHashtagVideos("deepseek", { maxItems: 5, forceRefresh: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ─── Cost guard ───

  it("A13: cost cap included in payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => [],
    });
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
    });
    await client.fetchHashtagVideos("deepseek", { maxTotalChargeUsd: 0.05 });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.maxTotalChargeUsd).toBe(0.05);
  });

  // ─── Network error ───

  it("A14: network error → retryable, then fails with status 503", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    global.fetch = mockFetch;

    const client = createApifyClient({
      dryRun: false,
      token: "test-token",
      maxRetries: 2,
    });
    await expect(client.fetchHashtagVideos("deepseek")).rejects.toThrow(/Network error/);

    try {
      await client.fetchHashtagVideos("deepseek");
    } catch (e) {
      expect(e.status).toBe(503);
    }
  });
});
