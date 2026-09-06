/**
 * Tests for search-sources' discovery-side search-cache writes (#198 Item 6).
 *
 * Discovery (search-sources) and sourcing (asset-sourcer) used to each open
 * a CDP tab for the same source+keyword. Discovery now records its collected
 * articles into the content-local search-cache.json — the same envelope
 * asset-sourcer already consumes with a 24h TTL — so the sourcing process
 * reuses the tab's results. Write-side only: discovery must never READ the
 * cache (news discovery needs fresh results).
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { recordCollectedArticles } from "../search-sources.mjs";
import {
  createSearchResultsCache,
  loadSearchResultsCache,
  saveSearchResultsCache,
} from "../lib/search-results-cache.mjs";

describe("recordCollectedArticles (#198 Item 6)", () => {
  let dirs = [];
  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };
  afterEach(cleanup);

  const articles = [
    { title: "新模型发布", url: "https://example.com/a", type: "text", snippet: "..." },
    { title: "另一条", url: "https://example.com/b", type: "text", snippet: "..." },
  ];

  it("records a source run and persists it in the asset-sourcer envelope", () => {
    const dir = mkdtempSync(join(tmpdir(), "search-cache-write-"));
    dirs.push(dir);
    const cachePath = join(dir, "search-cache.json");
    const cache = createSearchResultsCache();

    const dirty = recordCollectedArticles(cache, {
      source: "36kr_search",
      keyword: "具身智能",
      articles,
    });
    expect(dirty).toBe(true);
    expect(saveSearchResultsCache(cachePath, cache).success).toBe(true);

    const reloaded = loadSearchResultsCache(cachePath);
    const entry = reloaded.entries.find((e) => e.source === "36kr_search");
    expect(entry.keyword).toBe("具身智能");
    expect(entry.results).toHaveLength(2);
    expect(entry.results[0].url).toBe("https://example.com/a");
  });

  it("replaces a previous entry for the same source+keyword", () => {
    const cache = createSearchResultsCache();
    recordCollectedArticles(cache, {
      source: "36kr_search",
      keyword: "具身智能",
      articles: [{ title: "旧", url: "https://old.example.com", type: "text" }],
    });
    recordCollectedArticles(cache, {
      source: "36kr_search",
      keyword: "具身智能",
      articles,
    });
    expect(cache.entries).toHaveLength(1);
    expect(cache.entries[0].results[0].url).toBe("https://example.com/a");
  });

  it("does not record empty result sets (failure indistinguishable from empty)", () => {
    const cache = createSearchResultsCache();
    const dirty = recordCollectedArticles(cache, {
      source: "36kr_search",
      keyword: "具身智能",
      articles: [],
    });
    expect(dirty).toBe(false);
    expect(cache.entries).toHaveLength(0);
  });

  it("does not record without a keyword (trend mode has no keyword scope)", () => {
    const cache = createSearchResultsCache();
    const dirty = recordCollectedArticles(cache, {
      source: "36kr_search",
      keyword: null,
      articles,
    });
    expect(dirty).toBe(false);
    expect(cache.entries).toHaveLength(0);
  });

  it("tolerates a null cache (unscoped mode) without recording", () => {
    const dirty = recordCollectedArticles(null, {
      source: "36kr_search",
      keyword: "具身智能",
      articles,
    });
    expect(dirty).toBe(false);
  });
});
