import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";

import {
  SEARCH_RESULTS_CACHE_TTL_MS,
  SEARCH_RESULTS_CACHE_VERSION,
  createSearchResultsCache,
  getCachedSearchResults,
  loadSearchResultsCache,
  recordSearchResults,
  saveSearchResultsCache,
  getOrSearchResults,
} from "../lib/search-results-cache.mjs";

const TEMP_DIRS = [];

function makeTempCachePath() {
  const dir = mkdtempSync(join(tmpdir(), "search-results-cache-"));
  TEMP_DIRS.push(dir);
  return join(dir, "search-cache.json");
}

afterEach(() => {
  for (const dir of TEMP_DIRS.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("search results cache", () => {
  it("creates an empty versioned cache when no cache file exists", () => {
    const cache = loadSearchResultsCache("/tmp/does-not-exist-search-cache.json");

    expect(cache).toEqual(createSearchResultsCache());
    expect(cache.version).toBe(SEARCH_RESULTS_CACHE_VERSION);
    expect(cache.entries).toEqual([]);
  });

  it("treats malformed JSON as an empty cache", () => {
    const cachePath = makeTempCachePath();
    writeFileSync(cachePath, "{not-json", "utf8");

    expect(loadSearchResultsCache(cachePath)).toEqual(createSearchResultsCache());
  });

  it("treats a mismatched cache version as an empty cache", () => {
    const cachePath = makeTempCachePath();
    writeFileSync(
      cachePath,
      JSON.stringify({ version: SEARCH_RESULTS_CACHE_VERSION + 1, entries: [] }),
      "utf8",
    );

    expect(loadSearchResultsCache(cachePath)).toEqual(createSearchResultsCache());
  });

  it("reuses a recent cached video candidate without losing video metadata", () => {
    const now = Date.UTC(2026, 7, 21, 12, 0, 0);
    const cache = createSearchResultsCache();
    const video = {
      title: "Unitree H1 robot demo",
      url: "https://www.youtube.com/watch?v=unitree-h1",
      type: "video",
      duration: 8,
      resolution: "1080x1920",
    };
    recordSearchResults(cache, {
      source: "youtube",
      keyword: "Unitree H1",
      results: [video],
      timestamp: new Date(now - 1_000).toISOString(),
    });

    expect(
      getCachedSearchResults(cache, {
        source: "youtube",
        keyword: "Unitree H1",
        now,
      }),
    ).toEqual([video]);
  });

  it("keys entries by source and a trimmed case-insensitive keyword", () => {
    const now = Date.UTC(2026, 7, 21, 12, 0, 0);
    const cache = createSearchResultsCache();
    recordSearchResults(cache, {
      source: "youtube",
      keyword: "Unitree",
      results: [{ title: "YouTube result", url: "https://youtube.example/1", type: "video" }],
      timestamp: new Date(now).toISOString(),
    });
    recordSearchResults(cache, {
      source: "bilibili",
      keyword: "Unitree",
      results: [{ title: "Bilibili result", url: "https://bilibili.example/1", type: "video" }],
      timestamp: new Date(now).toISOString(),
    });

    expect(
      getCachedSearchResults(cache, { source: "youtube", keyword: " unitree ", now }),
    ).toHaveLength(1);
    expect(
      getCachedSearchResults(cache, { source: "bilibili", keyword: "Unitree", now }),
    ).toHaveLength(1);
    expect(
      getCachedSearchResults(cache, { source: "youtube", keyword: "DeepSeek", now }),
    ).toBeNull();
  });

  it("treats expired, empty, and malformed entries as misses", () => {
    const now = Date.UTC(2026, 7, 21, 12, 0, 0);
    const cache = {
      version: SEARCH_RESULTS_CACHE_VERSION,
      entries: [
        {
          source: "youtube",
          keyword: "expired",
          timestamp: new Date(now - SEARCH_RESULTS_CACHE_TTL_MS - 1).toISOString(),
          results: [{ title: "Old video", url: "https://youtube.example/old", type: "video" }],
        },
        {
          source: "youtube",
          keyword: "empty",
          timestamp: new Date(now).toISOString(),
          results: [],
        },
        {
          source: "youtube",
          keyword: "broken",
          timestamp: "not-a-date",
          results: [{ title: "Broken", url: "https://youtube.example/broken", type: "video" }],
        },
        {
          source: "youtube",
          keyword: "invalid-candidate",
          timestamp: new Date(now).toISOString(),
          results: [null],
        },
      ],
    };

    expect(
      getCachedSearchResults(cache, { source: "youtube", keyword: "expired", now }),
    ).toBeNull();
    expect(getCachedSearchResults(cache, { source: "youtube", keyword: "empty", now })).toBeNull();
    expect(getCachedSearchResults(cache, { source: "youtube", keyword: "broken", now })).toBeNull();
    expect(
      getCachedSearchResults(cache, { source: "youtube", keyword: "invalid-candidate", now }),
    ).toBeNull();
  });

  it("does not record empty live-search results", () => {
    const cache = createSearchResultsCache();

    expect(
      recordSearchResults(cache, {
        source: "pexels-video",
        keyword: "Unitree",
        results: [],
      }),
    ).toBe(false);
    expect(cache.entries).toEqual([]);
  });

  it.each([
    ["pexels", "Unitree", { title: "Robot photo", url: "https://pexels.example/1", type: "image" }],
    [
      "youtube",
      "Unitree",
      { title: "Robot video", url: "https://youtube.example/1", type: "video" },
    ],
    [
      "google_news",
      "Unitree",
      { title: "News image", url: "https://news.example/1", type: "image" },
    ],
  ])(
    "uses a cached %s result without invoking its live search",
    async (source, keyword, result) => {
      const now = Date.UTC(2026, 7, 21, 12, 0, 0);
      const cache = createSearchResultsCache();
      recordSearchResults(cache, {
        source,
        keyword,
        results: [result],
        timestamp: new Date(now).toISOString(),
      });
      const search = vi.fn(async () => [
        { title: "Live result", url: "https://live.example/1", type: result.type },
      ]);

      await expect(getOrSearchResults(cache, { source, keyword, search, now })).resolves.toEqual({
        cacheHit: true,
        results: [result],
      });
      expect(search).not.toHaveBeenCalled();
    },
  );

  it("calls a live search on a miss and records its non-empty result set", async () => {
    const now = Date.UTC(2026, 7, 21, 12, 0, 0);
    const cache = createSearchResultsCache();
    const liveResults = [
      {
        title: "Unitree live video",
        url: "https://youtube.example/live",
        type: "video",
        duration: 8,
      },
    ];
    const search = vi.fn(async () => liveResults);

    await expect(
      getOrSearchResults(cache, { source: "youtube", keyword: "Unitree", search, now }),
    ).resolves.toEqual({ cacheHit: false, results: liveResults });
    expect(search).toHaveBeenCalledTimes(1);
    expect(getCachedSearchResults(cache, { source: "youtube", keyword: "Unitree", now })).toEqual(
      liveResults,
    );
  });

  it("reports a persistence failure without throwing", () => {
    const cachePath = makeTempCachePath();
    const cache = createSearchResultsCache();
    recordSearchResults(cache, {
      source: "youtube",
      keyword: "Unitree",
      results: [{ title: "Robot video", url: "https://youtube.example/1", type: "video" }],
    });

    expect(saveSearchResultsCache(dirname(cachePath), cache)).toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it("cleans up its temporary file when an atomic cache save fails", () => {
    const cachePath = makeTempCachePath();
    const cache = createSearchResultsCache();
    const timestamp = 12345;
    const now = vi.spyOn(Date, "now").mockReturnValue(timestamp);
    recordSearchResults(cache, {
      source: "youtube",
      keyword: "Unitree",
      results: [{ title: "Robot video", url: "https://youtube.example/1", type: "video" }],
    });

    try {
      saveSearchResultsCache(dirname(cachePath), cache);
      expect(existsSync(`${dirname(cachePath)}.${process.pid}.${timestamp}.tmp`)).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("merges multiple source entries and persists a single valid envelope", () => {
    const cachePath = makeTempCachePath();
    const cache = createSearchResultsCache();
    recordSearchResults(cache, {
      source: "pexels",
      keyword: "Unitree",
      results: [{ title: "Robot photo", url: "https://pexels.example/1", type: "image" }],
    });
    recordSearchResults(cache, {
      source: "youtube",
      keyword: "Unitree",
      results: [{ title: "Robot video", url: "https://youtube.example/1", type: "video" }],
    });

    expect(saveSearchResultsCache(cachePath, cache)).toEqual({ success: true });
    expect(existsSync(cachePath)).toBe(true);
    expect(JSON.parse(readFileSync(cachePath, "utf8"))).toEqual(cache);
  });
});
