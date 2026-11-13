/**
 * Extract Media Tests — SVE (#114) T2
 *
 * Tests for the detail page media cache script (extract-media.mjs).
 * Tests the media extraction eval script logic, file I/O, and logo filtering.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  MEDIA_CACHE_VERSION,
  buildMediaExtractScript,
  parseMediaExtractResult,
  loadMediaCache,
  saveMediaCache,
  mergeMediaCacheEntry,
} from "../lib/extract-media.mjs";

// ─── buildMediaExtractScript: the eval script string ───

describe("buildMediaExtractScript", () => {
  it("returns a string that can be evaluated", () => {
    const script = buildMediaExtractScript();
    expect(typeof script).toBe("string");
    expect(script.length).toBeGreaterThan(100);
  });

  it("#1304: gates images at 600px and ships their dimensions to the parser", () => {
    const script = buildMediaExtractScript();
    expect(script).toContain("naturalWidth");
    expect(script).toContain("600");
    expect(script).not.toContain(">= 400");
    expect(script).toContain("width: w");
    expect(script).toContain("height: h");
  });

  it("excludes data URI images (1x1 SVG placeholders report viewBox naturalWidth)", () => {
    const script = buildMediaExtractScript();
    expect(script).toContain("startsWith('data:')");
  });

  it("includes video extraction for <video> and <iframe>", () => {
    const script = buildMediaExtractScript();
    expect(script).toContain("video");
    expect(script).toContain("iframe");
  });

  it("includes og:image and og:video meta extraction", () => {
    const script = buildMediaExtractScript();
    expect(script).toContain("og:image");
    expect(script).toContain("og:video");
  });

  it("#945: parses, and reads the shared og: publish-date fallback", () => {
    const documentStub = {
      querySelectorAll: () => [],
      querySelector: (sel) =>
        sel === "meta[property='og:article:published_time']"
          ? { getAttribute: () => "2026-10-15T00:00:00Z" }
          : null,
    };
    const out = new Function("document", buildMediaExtractScript())(documentStub);
    expect(out.metadata.publishedTime).toBe("2026-10-15T00:00:00Z");
  });

  it("#945: maps the shared embed hosts to their platforms", () => {
    const iframes = [
      { src: "https://www.youtube.com/embed/abc" },
      { src: "https://player.bilibili.com/player.html?bvid=1" },
      { src: "https://www.douyin.com/video/1" },
      { src: "https://player.youku.com/embed/x" },
      { src: "https://example.com/embed/player" },
    ];
    const documentStub = {
      querySelectorAll: (sel) => (sel === "iframe[src]" ? iframes : []),
      querySelector: () => null,
    };
    const out = new Function("document", buildMediaExtractScript())(documentStub);
    expect(out.videos.map((v) => v.platform)).toEqual(["youtube", "bilibili", "douyin", "youku"]);
  });
});

// ─── parseMediaExtractResult: normalize CDP eval output ───

describe("parseMediaExtractResult", () => {
  it("parses a result with images, videos, and metadata", () => {
    const raw = {
      images: [{ url: "https://example.com/img1.jpg", alt: "DeepSeek V4 发布会现场" }],
      videos: [{ url: "https://example.com/video.mp4", platform: "direct" }],
      metadata: {
        ogImage: "https://example.com/og.jpg",
        ogTitle: "DeepSeek V4",
        publishedTime: "2026-08-27T10:00:00Z",
      },
    };
    const result = parseMediaExtractResult(raw, "https://example.com/article");
    expect(result.sourceUrl).toBe("https://example.com/article");
    expect(result.images).toHaveLength(1);
    expect(result.videos).toHaveLength(1);
    expect(result.metadata.ogImage).toBe("https://example.com/og.jpg");
  });

  it("filters out logo/icon images", () => {
    const raw = {
      images: [
        { url: "https://example.com/logo.png", alt: "logo" },
        { url: "https://example.com/content.jpg", alt: "DeepSeek V4" },
        { url: "https://example.com/avatar.jpg", alt: "avatar" },
      ],
      videos: [],
      metadata: {},
    };
    const result = parseMediaExtractResult(raw, "https://example.com/article");
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe("https://example.com/content.jpg");
  });

  it("handles empty result", () => {
    const result = parseMediaExtractResult({}, "https://example.com/article");
    expect(result.images).toEqual([]);
    expect(result.videos).toEqual([]);
    expect(result.metadata).toEqual({});
  });

  it("handles null result", () => {
    const result = parseMediaExtractResult(null, "https://example.com/article");
    expect(result.images).toEqual([]);
    expect(result.videos).toEqual([]);
  });

  it("identifies video platform from URL", () => {
    const raw = {
      images: [],
      videos: [
        { url: "https://www.youtube.com/embed/abc123" },
        { url: "https://player.bilibili.com/player.html?bvid=BV1xx" },
        { url: "https://example.com/video.mp4" },
      ],
      metadata: {},
    };
    const result = parseMediaExtractResult(raw, "https://example.com/article");
    expect(result.videos).toHaveLength(3);
    expect(result.videos[0].platform).toBe("youtube");
    expect(result.videos[1].platform).toBe("bilibili");
    expect(result.videos[2].platform).toBe("direct");
  });
});

// ─── #1304: page furniture must not reach the cache ───

describe("parseMediaExtractResult — decoration filtering", () => {
  const parse = (images) =>
    parseMediaExtractResult({ images, videos: [], metadata: {} }, "https://example.com/a");

  it("drops a leaderboard-shaped image (1200×90 promo banner)", () => {
    // The measured #1304 defect: xinhua's "download our app" strip cleared the
    // old width-only gate at 1200px wide and was cached as a stage photo.
    const out = parse([
      { url: "https://example.com/news/2026/stage.jpg", alt: "", width: 1200, height: 90 },
    ]);
    expect(out.images).toEqual([]);
  });

  it("keeps a normal article figure and its dimensions", () => {
    const out = parse([
      { url: "https://example.com/news/2026/stage.jpg", alt: "大会现场", width: 1200, height: 800 },
    ]);
    expect(out.images).toHaveLength(1);
    expect(out.images[0]).toMatchObject({ width: 1200, height: 800, alt: "大会现场" });
  });

  it("drops images whose alt copy is page furniture", () => {
    const out = parse([
      { url: "https://example.com/a.jpg", alt: "扫码下载客户端", width: 1200, height: 800 },
      { url: "https://example.com/b.jpg", alt: "关注公众号", width: 1200, height: 800 },
      { url: "https://example.com/c.jpg", alt: "大会现场", width: 1200, height: 800 },
    ]);
    expect(out.images.map((i) => i.alt)).toEqual(["大会现场"]);
  });

  it("drops images whose URL slug says what they are", () => {
    const out = parse([
      { url: "https://example.com/qrcode_share.png", alt: "", width: 1200, height: 1200 },
      { url: "https://example.com/site-banner.png", alt: "", width: 1200, height: 800 },
      { url: "https://example.com/keynote.jpg", alt: "", width: 1200, height: 800 },
    ]);
    expect(out.images.map((i) => i.url)).toEqual(["https://example.com/keynote.jpg"]);
  });

  it("keeps a lazy image that reported no height", () => {
    // A 0/absent height is "not measured yet", not "banner" — dropping it
    // would silently lose every below-the-fold figure.
    const out = parse([
      { url: "https://example.com/keynote.jpg", alt: "", width: 1200, height: 0 },
    ]);
    expect(out.images).toHaveLength(1);
  });

  it("keeps legacy cache rows that carry no dimensions at all", () => {
    const out = parse([{ url: "https://example.com/keynote.jpg", alt: "大会现场" }]);
    expect(out.images).toHaveLength(1);
  });

  it("still drops a narrow image even when it has a good alt", () => {
    const out = parse([
      { url: "https://example.com/x.jpg", alt: "大会现场", width: 320, height: 320 },
    ]);
    expect(out.images).toEqual([]);
  });
});

// ─── File I/O: loadMediaCache / saveMediaCache / mergeMediaCacheEntry ───

describe("loadMediaCache", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "extract-media-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty cache when file doesn't exist", () => {
    const cache = loadMediaCache(join(tmpDir, "nonexistent.json"));
    expect(cache.version).toBe(MEDIA_CACHE_VERSION);
    expect(cache.entries).toEqual([]);
  });

  it("returns empty cache when file is malformed", () => {
    const filePath = join(tmpDir, "bad.json");
    writeFileSync(filePath, "{ not valid json }");
    const cache = loadMediaCache(filePath);
    expect(cache.entries).toEqual([]);
  });

  it("loads valid cache file", () => {
    const filePath = join(tmpDir, "cache.json");
    const data = {
      version: MEDIA_CACHE_VERSION,
      entries: [
        {
          sourceUrl: "https://example.com/article-1",
          scrapedAt: "2026-08-27T10:00:00Z",
          images: [{ url: "https://example.com/img1.jpg" }],
          videos: [],
          metadata: {},
        },
      ],
    };
    writeFileSync(filePath, JSON.stringify(data));
    const cache = loadMediaCache(filePath);
    expect(cache.entries).toHaveLength(1);
    expect(cache.entries[0].sourceUrl).toBe("https://example.com/article-1");
  });
});

describe("saveMediaCache", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "extract-media-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates parent directories if needed", () => {
    const filePath = join(tmpDir, "research", "media-cache.json");
    saveMediaCache(filePath, { version: MEDIA_CACHE_VERSION, entries: [] });
    expect(existsSync(filePath)).toBe(true);
  });

  it("writes valid JSON with version field", () => {
    const filePath = join(tmpDir, "cache.json");
    saveMediaCache(filePath, { version: MEDIA_CACHE_VERSION, entries: [] });
    const content = JSON.parse(readFileSync(filePath, "utf8"));
    expect(content.version).toBe(MEDIA_CACHE_VERSION);
    expect(content.entries).toEqual([]);
  });
});

describe("mergeMediaCacheEntry", () => {
  it("appends new entry when sourceUrl doesn't exist", () => {
    const cache = { version: MEDIA_CACHE_VERSION, entries: [] };
    const entry = {
      sourceUrl: "https://example.com/article-1",
      scrapedAt: "2026-08-27T10:00:00Z",
      images: [{ url: "https://example.com/img1.jpg" }],
      videos: [],
      metadata: {},
    };
    const result = mergeMediaCacheEntry(cache, entry);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sourceUrl).toBe("https://example.com/article-1");
  });

  it("replaces entry when sourceUrl already exists", () => {
    const cache = {
      version: MEDIA_CACHE_VERSION,
      entries: [
        {
          sourceUrl: "https://example.com/article-1",
          scrapedAt: "2026-08-26T10:00:00Z",
          images: [{ url: "https://example.com/old.jpg" }],
          videos: [],
          metadata: {},
        },
      ],
    };
    const entry = {
      sourceUrl: "https://example.com/article-1",
      scrapedAt: "2026-08-27T10:00:00Z",
      images: [{ url: "https://example.com/new.jpg" }],
      videos: [],
      metadata: {},
    };
    const result = mergeMediaCacheEntry(cache, entry);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].images[0].url).toBe("https://example.com/new.jpg");
    expect(result.entries[0].scrapedAt).toBe("2026-08-27T10:00:00Z");
  });

  it("preserves other entries when updating one", () => {
    const cache = {
      version: MEDIA_CACHE_VERSION,
      entries: [
        {
          sourceUrl: "https://example.com/article-1",
          scrapedAt: "2026-08-26T10:00:00Z",
          images: [],
          videos: [],
          metadata: {},
        },
        {
          sourceUrl: "https://example.com/article-2",
          scrapedAt: "2026-08-26T11:00:00Z",
          images: [],
          videos: [],
          metadata: {},
        },
      ],
    };
    const entry = {
      sourceUrl: "https://example.com/article-2",
      scrapedAt: "2026-08-27T10:00:00Z",
      images: [{ url: "https://example.com/new.jpg" }],
      videos: [],
      metadata: {},
    };
    const result = mergeMediaCacheEntry(cache, entry);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].sourceUrl).toBe("https://example.com/article-1");
    expect(result.entries[1].sourceUrl).toBe("https://example.com/article-2");
    expect(result.entries[1].images[0].url).toBe("https://example.com/new.jpg");
  });
});
