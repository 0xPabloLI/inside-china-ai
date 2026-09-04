/**
 * Asset Sourcer Tests — AS-1 through AS-5
 *
 * TDD: Tests written first (red), implementation second (green).
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { mkdtempSync, rmSync, unlinkSync, rmdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  extractKeywords,
  buildZhVideoKeywords,
  pickVideoKeywordGroups,
  parseYtdlpSearchOutput,
  scoreCandidate,
  preFilterCandidate,
  recommendScene,
  buildFilename,
  slugifyKeyword,
  buildReport,
  API_SOURCES,
  YTDLP_SOURCES,
  CDP_SOURCES,
  CDP_VIDEO_SOURCES,
  SOURCE_ATTRIBUTIONS,
  buildAttribution,
  buildCreditsSection,
  fetchWikimediaLicense,
  searchApiSource,
  downloadAsset,
  searchYtdlp,
  downloadYtdlp,
  checkCdpAvailable,
  loadEnvLocal,
  getApiKey,
  persistSearchResultsCache,
  loadCachedImages,
  toCachedImageCandidate,
  isLogoOrIcon,
  hasKeywordMatch,
  PRE_DOWNLOAD_FILTER_THRESHOLD,
  shouldSkipUrl,
  markDownloaded,
  loadCachedMedia,
  toCachedMediaCandidate,
} from "../lib/asset-sourcer.mjs";
import { createSearchResultsCache, recordSearchResults } from "../lib/search-results-cache.mjs";

// ─── search cache persistence ───

describe("persistSearchResultsCache", () => {
  it("warns and preserves a completed search run when cache persistence fails", () => {
    const cache = createSearchResultsCache();
    recordSearchResults(cache, {
      source: "youtube",
      keyword: "Unitree",
      results: [{ title: "Robot video", url: "https://youtube.example/1", type: "video" }],
    });
    const cachePath = mkdtempSync(join(tmpdir(), "asset-sourcer-cache-dir-"));
    const logger = { log: vi.fn(), warn: vi.fn() };

    try {
      expect(persistSearchResultsCache(cachePath, cache, logger)).toEqual(
        expect.objectContaining({ success: false }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Search cache was not saved"),
      );
    } finally {
      rmSync(cachePath, { recursive: true, force: true });
    }
  });
});

// ─── extractKeywords ───

describe("extractKeywords", () => {
  it("returns companies from meta.keyEntities when present", () => {
    const scenes = [{ voiceover: "Unitree makes robots" }];
    const meta = { keyEntities: { companies: ["Unitree", "DeepSeek"] } };
    const result = extractKeywords(scenes, meta, null);
    expect(result).toContain("Unitree");
    expect(result).toContain("DeepSeek");
  });

  it("falls back to CLI keywords when keyEntities is empty", () => {
    const scenes = [{ voiceover: "Something happened" }];
    const meta = { keyEntities: {} };
    const result = extractKeywords(scenes, meta, ["robot", "AI"]);
    expect(result).toContain("robot");
    expect(result).toContain("AI");
  });

  it("falls back to CLI keywords when keyEntities is undefined", () => {
    const scenes = [{ voiceover: "Something" }];
    const meta = undefined;
    const result = extractKeywords(scenes, meta, ["DeepSeek"]);
    expect(result).toContain("DeepSeek");
  });

  it("extracts company names from voiceover when no keyEntities and no CLI keywords", () => {
    const scenes = [
      { voiceover: "Unitree released a new H1 humanoid robot today" },
      { voiceover: "DeepSeek also announced their V4 model" },
    ];
    const result = extractKeywords(scenes, null, null);
    // Should extract known company names from voiceover text
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((k) => k.toLowerCase().includes("unitree"))).toBe(true);
  });

  it("returns empty array when all sources are empty", () => {
    const scenes = [{ voiceover: "The weather is nice today" }];
    const result = extractKeywords(scenes, null, null);
    expect(result).toEqual([]);
  });

  it("deduplicates keywords across sources", () => {
    const scenes = [{ voiceover: "Unitree robot demo" }];
    const meta = { keyEntities: { companies: ["Unitree"] } };
    const cli = ["Unitree", "robot"];
    const result = extractKeywords(scenes, meta, cli);
    const unitreeCount = result.filter((k) => k.toLowerCase() === "unitree").length;
    expect(unitreeCount).toBe(1);
  });
});

// ─── scoreCandidate ───

describe("scoreCandidate", () => {
  // New rebalanced weights: title 0-28, duration 0-18, size 0-14, resolution 0-10, AI 0-30
  // Technical max = 70, AI max = 30, total max = 100

  it("scores exact keyword match in title as 28", () => {
    const candidate = {
      title: "Unitree H1 Robot Demo",
      type: "video",
      duration: 6,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 (title) + 18 (dur 3-8s) + 14 (size<20M) + 7 (720p) = 67
    expect(score).toBe(67);
  });

  it("scores 0 match points when keyword not in title (with resolution)", () => {
    const candidate = {
      title: "Humanoid Robot Backflip",
      type: "video",
      duration: 6,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 0 (title) + 18 (dur) + 14 (size) + 7 (res) = 39
    expect(score).toBe(39);
  });

  it("scores 0 match points when keyword not in title (no resolution)", () => {
    const candidate = { title: "Cooking Tutorial", type: "video", duration: 6, fileSize: 5000000 };
    const score = scoreCandidate(candidate, "Unitree");
    // 0 (title) + 18 (dur) + 14 (size) + 0 (no res) = 32
    expect(score).toBe(32);
  });

  it("scores video 3-8s duration as 18", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 (title) + 18 (dur) + 14 (size) + 7 (res) = 67
    expect(score).toBe(67);
  });

  it("scores video >60s duration as 3", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 120,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 (title) + 3 (dur) + 14 (size) + 7 (res) = 52
    expect(score).toBe(52);
  });

  it("scores image as 14 duration points (fixed)", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000, resolution: "1080p" };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 (title) + 14 (image dur) + 14 (size<5M) + 10 (1080p) = 66
    expect(score).toBe(66);
  });

  it("scores video <20MB as 14 size points", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 15000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 + 18 + 14 + 7 = 67
    expect(score).toBe(67);
  });

  it("scores video >50MB as 0 size points", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 60000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 + 18 + 0 + 7 = 53
    expect(score).toBe(53);
  });

  it("scores resolution >=1080p as 10", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000, resolution: "1080p" };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 + 14 + 14 + 10 = 66
    expect(score).toBe(66);
  });

  it("scores 4K resolution case-insensitive (Issue #44 P3 fix)", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000, resolution: "4K" };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 + 14 + 14 + 10 = 66
    expect(score).toBe(66);
  });

  it("scores 2160 resolution correctly", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000, resolution: "2160p" };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 + 14 + 14 + 10 = 66
    expect(score).toBe(66);
  });

  it("scores unknown resolution as 0", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000 };
    const score = scoreCandidate(candidate, "Unitree");
    // 28 + 14 + 14 + 0 = 56
    expect(score).toBe(56);
  });

  it("caps score at 100", () => {
    const candidate = {
      title: "Unitree Unitree Unitree",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "1080p",
    };
    const score = scoreCandidate(candidate, "Unitree", "Unitree robot in lab");
    // 28 + 18 + 14 + 10 = 70 technical + 30 AI (boundary match) = 100
    expect(score).toBe(100);
  });

  it("near-100 base score with AI still capped at 100 (Issue #44 P1 cap fix)", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "1080p",
    };
    // 28 + 18 + 14 + 10 = 70 technical + 30 AI = 100
    const score = scoreCandidate(candidate, "Unitree", "Unitree humanoid robot");
    expect(score).toBe(100);
  });

  // ─── AI description scoring (Issue #44 rebalanced) ───

  it("adds content score when aiDescription is present and matches keyword", () => {
    const candidate = {
      title: "Humanoid Robot",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    // Without aiDescription: 0 (title) + 18 + 14 + 7 = 39
    const scoreNoAI = scoreCandidate(candidate, "Unitree");
    expect(scoreNoAI).toBe(39);

    // With aiDescription that mentions "Unitree" → should score higher
    const scoreWithAI = scoreCandidate(
      candidate,
      "Unitree",
      "A Unitree humanoid robot walking in a lab",
    );
    // boundary match: subjects(20) + description(10) = 30 → 39 + 30 = 69
    expect(scoreWithAI).toBe(69);
    expect(scoreWithAI).toBeGreaterThan(scoreNoAI);
  });

  it("does not change score when aiDescription is empty string", () => {
    const candidate = {
      title: "Unitree H1 Robot",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const scoreWithout = scoreCandidate(candidate, "Unitree");
    const scoreWithEmpty = scoreCandidate(candidate, "Unitree", "");
    expect(scoreWithEmpty).toBe(scoreWithout);
  });

  it("does not change score when aiDescription is undefined", () => {
    const candidate = {
      title: "Unitree H1 Robot",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const scoreWithout = scoreCandidate(candidate, "Unitree");
    const scoreWithUndefined = scoreCandidate(candidate, "Unitree", undefined);
    expect(scoreWithUndefined).toBe(scoreWithout);
  });

  it("gives 0 content score when aiDescription has no overlapping words with keyword", () => {
    const candidate = {
      title: "Cooking Tutorial",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    // aiDescription about cooking — no overlap with "Unitree"
    const scoreWithout = scoreCandidate(candidate, "Unitree");
    const scoreWithAI = scoreCandidate(candidate, "Unitree", "A person cooking pasta in a kitchen");
    expect(scoreWithAI).toBe(scoreWithout); // no content bonus
  });

  it("content score is 0-30 range (capped)", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "1080p",
    };
    // Base technical: 28 + 18 + 14 + 10 = 70
    // Even with a matching aiDescription, total should not exceed 100
    const score = scoreCandidate(
      candidate,
      "Unitree",
      "Unitree robot Unitree humanoid Unitree demo Unitree lab",
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles aiDescription with multiple keyword matches", () => {
    const candidate = {
      title: "Demo Video",
      type: "image",
      fileSize: 2000000,
      resolution: "1080p",
    };
    // Base: 0 (title) + 14 (image) + 14 (size) + 10 (res) = 38
    const scoreNoAI = scoreCandidate(candidate, "Unitree");
    expect(scoreNoAI).toBe(38);

    // aiDescription with boundary-matched keyword
    const scoreWithAI = scoreCandidate(
      candidate,
      "Unitree",
      "Unitree H1 humanoid robot performing a walking demonstration in a tech lab",
    );
    // subjects(20) + description(10) = 30 → 38 + 30 = 68
    expect(scoreWithAI).toBe(68);
    expect(scoreWithAI).toBeGreaterThan(scoreNoAI);
  });

  // ─── Boundary matching tests (Issue #44 P2) ───

  it("does NOT match keyword 'AI' inside 'train' (boundary matching)", () => {
    const candidate = {
      title: "Train arriving at station",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "AI", "A train arriving at a station");
    // 'AI' should NOT match 'train' → 0 relevance + title 0 + 18 + 14 + 7 = 39
    expect(score).toBe(39);
  });

  it("does NOT match keyword 'AI' inside 'painting' (boundary matching)", () => {
    const candidate = {
      title: "Painting exhibition",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "AI", "A painting at an exhibition");
    // 0 + 18 + 14 + 7 = 39
    expect(score).toBe(39);
  });

  it("matches keyword with hyphen normalization (Unitree-H1 → Unitree)", () => {
    const candidate = {
      title: "Unitree-H1 Robot Demo",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 'unitree' boundary-matches in 'unitree h1 robot demo' after hyphen→space
    // 28 + 18 + 14 + 7 = 67
    expect(score).toBe(67);
  });

  it("matches CJK keywords with includes() (no word boundaries)", () => {
    const candidate = {
      title: "宇树科技人形机器人",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "宇树");
    // 28 (CJK match) + 18 + 14 + 7 = 67
    expect(score).toBe(67);
  });
});

// ─── preFilterCandidate ───

describe("preFilterCandidate", () => {
  it("marks good asset as not lowConfidence", () => {
    const candidate = {
      title: "Unitree Robot Demo",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const result = preFilterCandidate(candidate, "Unitree");
    // 28 + 18 + 14 + 7 = 67 → not low confidence
    expect(result.technicalScore).toBe(67);
    expect(result.lowConfidence).toBe(false);
  });

  it("marks garbage asset as lowConfidence (below threshold 30)", () => {
    const candidate = {
      title: "Random video",
      type: "video",
      duration: 120,
      fileSize: 60000000,
      // no resolution
    };
    const result = preFilterCandidate(candidate, "Unitree");
    // 0 + 3 + 0 + 0 = 3 → low confidence
    expect(result.technicalScore).toBe(3);
    expect(result.lowConfidence).toBe(true);
  });

  it("marks borderline asset correctly (score near 30)", () => {
    const candidate = {
      title: "Cooking Tutorial",
      type: "video",
      duration: 6,
      fileSize: 5000000,
      // no resolution
    };
    const result = preFilterCandidate(candidate, "Unitree");
    // 0 + 18 + 14 + 0 = 32 → not low confidence
    expect(result.technicalScore).toBe(32);
    expect(result.lowConfidence).toBe(false);
  });
});

// ─── recommendScene ───

describe("recommendScene", () => {
  it("recommends fade/zoom for narrative scene", () => {
    const scenes = [{ visualType: "narrative", id: 2 }];
    const asset = { type: "video" };
    const rec = recommendScene(asset, scenes);
    expect(rec.sceneId).toBe(2);
    expect(["fade", "zoom"]).toContain(rec.animation);
    expect(rec.overlay).toBe(0.7);
  });

  it("recommends ken-burns for info-card scene with image", () => {
    const scenes = [{ visualType: "info-card", id: 4 }];
    const asset = { type: "image" };
    const rec = recommendScene(asset, scenes);
    expect(rec.sceneId).toBe(4);
    expect(rec.animation).toBe("ken-burns");
    expect(rec.overlay).toBe(0.75);
  });

  it("recommends fade for quote scene", () => {
    const scenes = [{ visualType: "quote", id: 6 }];
    const asset = { type: "image" };
    const rec = recommendScene(asset, scenes);
    expect(rec.sceneId).toBe(6);
    expect(rec.animation).toBe("fade");
    expect(rec.overlay).toBe(0.8);
  });

  it("returns null for data/stat-reveal scene", () => {
    const scenes = [{ visualType: "data", id: 3 }];
    const asset = { type: "image" };
    const rec = recommendScene(asset, scenes);
    expect(rec).toBeNull();
  });

  // hook is no longer in NO_MEDIA_TYPES — it gets a recommendation

  it("returns null for cta scene", () => {
    const scenes = [{ visualType: "cta", id: 10 }];
    const asset = { type: "video" };
    const rec = recommendScene(asset, scenes);
    expect(rec).toBeNull();
  });

  it("returns null when no suitable scenes exist", () => {
    const scenes = [{ visualType: "cta", id: 2 }];
    const asset = { type: "video" };
    const rec = recommendScene(asset, scenes);
    expect(rec).toBeNull();
  });
});

// ─── slugifyKeyword ───

describe("slugifyKeyword", () => {
  it("slugifies normal keyword", () => {
    expect(slugifyKeyword("Unitree")).toBe("unitree");
  });

  it("slugifies keyword with spaces", () => {
    expect(slugifyKeyword("Unitree H1")).toBe("unitree-h1");
  });

  it("slugifies keyword with special chars", () => {
    expect(slugifyKeyword("DeepSeek's")).toBe("deepseeks");
  });

  it("slugifies keyword with uppercase", () => {
    expect(slugifyKeyword("AIRobot")).toBe("airobot");
  });

  it("slugifies Chinese characters (keep as-is, romanized fallback)", () => {
    // Chinese chars are kept as-is in filename (filesystem supports UTF-8)
    // but for cross-platform safety, we keep them
    const result = slugifyKeyword("宇树科技");
    expect(result).toBe("宇树科技");
  });

  it("handles empty string", () => {
    expect(slugifyKeyword("")).toBe("");
  });
});

// ─── buildFilename ───

describe("buildFilename", () => {
  it("builds filename from source, keyword, index, ext", () => {
    const filename = buildFilename("ithome", "Unitree", 1, "jpg");
    expect(filename).toBe("ithome-unitree-01.jpg");
  });

  it("pads index to 2 digits", () => {
    expect(buildFilename("youtube", "robot", 1, "mp4")).toBe("youtube-robot-01.mp4");
    expect(buildFilename("youtube", "robot", 10, "mp4")).toBe("youtube-robot-10.mp4");
  });

  it("slugifies keyword in filename", () => {
    const filename = buildFilename("pexels", "Unitree H1", 3, "jpg");
    expect(filename).toBe("pexels-unitree-h1-03.jpg");
  });
});

// ─── buildReport ───

describe("buildReport", () => {
  it("builds report with assets, failed, and skipped", () => {
    const assets = [
      {
        source: "youtube",
        keyword: "Unitree",
        type: "video",
        path: "assets/youtube-unitree-01.mp4",
        score: 85,
        status: "downloaded",
      },
      {
        source: "ithome",
        keyword: "Unitree",
        type: "image",
        path: "assets/ithome-unitree-01.jpg",
        score: 70,
        status: "downloaded",
      },
    ];
    const failed = [{ source: "douyin", keyword: "Unitree", error: "needs auth" }];
    const skipped = [{ source: "pixabay", reason: "no API key" }];

    const report = buildReport("unitree", ["Unitree"], assets, failed, skipped);

    expect(report.content).toBe("unitree");
    expect(report.keywords).toEqual(["Unitree"]);
    expect(report.totalAssets).toBe(2);
    expect(report.assets).toHaveLength(2);
    expect(report.failed).toHaveLength(1);
    expect(report.skipped).toHaveLength(1);
    expect(report.searchedAt).toBeDefined();
  });

  it("builds report with empty results", () => {
    const report = buildReport("test", [], [], [], []);
    expect(report.content).toBe("test");
    expect(report.totalAssets).toBe(0);
    expect(report.assets).toEqual([]);
    expect(report.failed).toEqual([]);
    expect(report.skipped).toEqual([]);
  });

  it("includes searchedAt ISO timestamp", () => {
    const report = buildReport("test", [], [], [], []);
    expect(report.searchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── AS-2: API source definitions ───

describe("API_SOURCES", () => {
  it("has pexels source with correct config", () => {
    const pexels = API_SOURCES.find((s) => s.name === "pexels");
    expect(pexels).toBeDefined();
    expect(pexels.requiresApiKey).toBe(true);
    expect(pexels.apiKeyEnv).toBe("PEXELS_API_KEY");
    expect(pexels.authHeader).toBe("Authorization");
    expect(typeof pexels.searchUrl).toBe("function");
    expect(typeof pexels.parseResponse).toBe("function");
  });

  it("has unsplash source with correct config", () => {
    const unsplash = API_SOURCES.find((s) => s.name === "unsplash");
    expect(unsplash).toBeDefined();
    expect(unsplash.requiresApiKey).toBe(true);
    expect(unsplash.apiKeyEnv).toBe("UNSPLASH_ACCESS_KEY");
    expect(unsplash.authValue("test-key")).toBe("Client-ID test-key");
  });

  it("has wikimedia source without auth", () => {
    const wikimedia = API_SOURCES.find((s) => s.name === "wikimedia");
    expect(wikimedia).toBeDefined();
    expect(wikimedia.requiresApiKey).toBe(false);
    expect(wikimedia.apiKeyEnv).toBe(null);
    expect(wikimedia.userAgent).toContain("ChinaAINews");
  });

  it("has coverr source requiring API key (updated 2026-08-14)", () => {
    const coverr = API_SOURCES.find((s) => s.name === "coverr");
    expect(coverr).toBeDefined();
    expect(coverr.requiresApiKey).toBe(true);
    expect(coverr.apiKeyEnv).toBe("COVERR_API_KEY");
    expect(typeof coverr.searchUrl).toBe("function");
    expect(typeof coverr.parseResponse).toBe("function");
  });
});

// ─── AS-2: searchApiSource ───

describe("searchApiSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns candidates when API responds", async () => {
    const source = API_SOURCES.find((s) => s.name === "pexels");
    const mockData = {
      photos: [
        {
          alt: "Unitree robot",
          src: { original: "https://img.pexels.com/1.jpg" },
          width: 1080,
          height: 1920,
        },
      ],
    };
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });

    const result = await searchApiSource(source, "Unitree", "test-key");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Unitree robot");
    expect(result[0].type).toBe("image");
  });

  it("returns empty array when fetch fails", async () => {
    const source = API_SOURCES.find((s) => s.name === "pexels");
    global.fetch.mockRejectedValue(new Error("Network error"));

    const result = await searchApiSource(source, "Unitree", "test-key");
    expect(result).toEqual([]);
  });

  it("returns empty array when API key is required but missing", async () => {
    const source = API_SOURCES.find((s) => s.name === "pexels");
    const result = await searchApiSource(source, "Unitree", null);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns empty array when response is not ok", async () => {
    const source = API_SOURCES.find((s) => s.name === "pexels");
    global.fetch.mockResolvedValue({ ok: false, status: 403 });

    const result = await searchApiSource(source, "Unitree", "test-key");
    expect(result).toEqual([]);
  });
});

// ─── AS-2: downloadAsset ───

describe("downloadAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads and writes file when fetch succeeds", async () => {
    // Use a temp file path that doesn't exist
    const tmpDir = `/tmp/asset-sourcer-test-${Date.now()}`;
    const destPath = `${tmpDir}/new.jpg`;

    global.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)),
    });

    const result = await downloadAsset("https://example.com/img.jpg", destPath);
    expect(result.success).toBe(true);
    expect(result.path).toBe(destPath);

    // Clean up
    try {
      unlinkSync(destPath);
    } catch {}
    try {
      rmdirSync(tmpDir);
    } catch {}
  });

  it("returns failure for file <1KB (corrupt)", async () => {
    const destPath = `/tmp/asset-sourcer-test-corrupt-${Date.now()}.jpg`;
    global.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    const result = await downloadAsset("https://example.com/small.jpg", destPath);
    expect(result.success).toBe(false);
    expect(result.error).toContain("too small");
  });

  it("returns failure on HTTP error", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });

    const result = await downloadAsset(
      "https://example.com/missing.jpg",
      "/tmp/nonexistent/missing.jpg",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("404");
  });

  it("returns failure on network error", async () => {
    global.fetch.mockRejectedValue(new Error("Connection refused"));

    const result = await downloadAsset("https://example.com/img.jpg", "/tmp/nonexistent/fail.jpg");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection refused");
  });
});

// ─── AS-3: yt-dlp source definitions ───

describe("YTDLP_SOURCES", () => {
  it("has youtube_search source", () => {
    const yt = YTDLP_SOURCES.find((s) => s.name === "youtube_search");
    expect(yt).toBeDefined();
    expect(yt.platform).toBe("youtube");
    expect(yt.type).toBe("video");
  });

  it("has bilibili source", () => {
    const bili = YTDLP_SOURCES.find((s) => s.name === "bilibili");
    expect(bili).toBeDefined();
    expect(bili.platform).toBe("bilibili");
    expect(bili.type).toBe("video");
  });

  it("bilibili carries zh-CN locale; youtube_search has none (#180)", () => {
    const bili = YTDLP_SOURCES.find((s) => s.name === "bilibili");
    const yt = YTDLP_SOURCES.find((s) => s.name === "youtube_search");
    expect(bili.locale).toBe("zh-CN");
    expect(yt.locale).toBeFalsy();
  });
});

// ─── #180: zh video keyword routing ───

describe("buildZhVideoKeywords", () => {
  it("maps meta.keyEntities companies through COMPANY_NAME_ZH", () => {
    const meta = { keyEntities: { companies: ["didi", "pony-ai", "waymo", "tesla"] } };
    expect(buildZhVideoKeywords(meta, [])).toEqual(["滴滴", "小马智行", "Waymo", "特斯拉"]);
  });

  it("skips companies without a zh mapping and dedups", () => {
    const meta = { keyEntities: { companies: ["openai", "didi", "didi"] } };
    expect(buildZhVideoKeywords(meta, [])).toEqual(["滴滴"]);
  });

  it("returns [] when nothing maps (graceful fallback to existing groups)", () => {
    expect(buildZhVideoKeywords({ keyEntities: { companies: ["openai"] } }, [])).toEqual([]);
    expect(buildZhVideoKeywords(null, [])).toEqual([]);
  });

  it("derives zh names from voiceover-mentioned companies when meta absent", () => {
    const scenes = [{ id: 1, voiceover: "Unitree unveiled a new robot" }];
    expect(buildZhVideoKeywords(null, scenes)).toEqual(["宇树"]);
  });
});

describe("pickVideoKeywordGroups", () => {
  const groups = [{ keywords: ["autonomous vehicle interior"], claimSceneId: 3 }];

  it("routes zh-CN sources to the zh pool", () => {
    expect(pickVideoKeywordGroups({ locale: "zh-CN" }, groups, ["滴滴"])).toEqual([
      { keywords: ["滴滴"], claimSceneId: null },
    ]);
  });

  it("keeps existing groups when the zh pool is empty (graceful)", () => {
    expect(pickVideoKeywordGroups({ locale: "zh-CN" }, groups, [])).toBe(groups);
  });

  it("keeps existing groups for non-zh sources (YouTube unchanged)", () => {
    expect(pickVideoKeywordGroups({}, groups, ["滴滴"])).toBe(groups);
    expect(pickVideoKeywordGroups(null, groups, ["滴滴"])).toBe(groups);
  });
});

// ─── #180: yt-dlp search output parsing ───

describe("parseYtdlpSearchOutput", () => {
  it("splits real-tab lines into id/title/duration candidates", () => {
    const out = parseYtdlpSearchOutput(
      "BV1gJ5T6CEt7\t深圳街头L4级别自动驾驶车辆实测\t464.566\nn7J6dPuk6Ek\tWaymo, Zoox, Tesla: Robotaxi\t664",
      "bilibili",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "BV1gJ5T6CEt7",
      title: "深圳街头L4级别自动驾驶车辆实测",
      duration: 464.566,
      type: "video",
      url: "https://www.bilibili.com/video/BV1gJ5T6CEt7",
    });
    expect(out[1]).toMatchObject({
      id: "n7J6dPuk6Ek",
      title: "Waymo, Zoox, Tesla: Robotaxi",
      duration: 664,
    });
  });

  it("maps NA placeholders to empty title and drops non-numeric duration", () => {
    const out = parseYtdlpSearchOutput("116985228695093\tNA\tNA", "bilibili");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("");
    expect(out[0].duration).toBeUndefined();
    expect(out[0].url).toBe("https://www.bilibili.com/video/116985228695093");
  });

  it("rejoins titles that contain a real tab", () => {
    const out = parseYtdlpSearchOutput("n7J6dPuk6Ek\tWaymo\tZoox: Robotaxi\t664", "youtube");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Waymo\tZoox: Robotaxi");
    expect(out[0].duration).toBe(664);
  });

  it("skips lines without a real tab separator (legacy literal-\\t output)", () => {
    expect(parseYtdlpSearchOutput("116985228695093\\tNA\\tNA", "bilibili")).toEqual([]);
  });

  it("skips entries without a usable id", () => {
    expect(parseYtdlpSearchOutput("NA\tSome Title\t10", "youtube")).toEqual([]);
  });

  it("returns [] for empty or invalid output", () => {
    expect(parseYtdlpSearchOutput("", "bilibili")).toEqual([]);
    expect(parseYtdlpSearchOutput(null, "bilibili")).toEqual([]);
  });
});

// ─── AS-3: searchYtdlp ───

describe("searchYtdlp", () => {
  it("is a function that can be called", () => {
    // execSync can't be easily mocked in ESM without vitest config,
    // so we verify the function exists and is callable
    expect(typeof searchYtdlp).toBe("function");
  });

  // T2: unsupported platforms must return [] (not fall through to YouTube)
  it("T2: returns [] for unsupported platform 'xiaohongshu'", () => {
    const result = searchYtdlp("test", "xiaohongshu");
    expect(result).toEqual([]);
  });

  it("T2: returns [] for unsupported platform 'douyin'", () => {
    const result = searchYtdlp("test", "douyin");
    expect(result).toEqual([]);
  });

  it("T2: returns [] for unsupported platform 'weibo'", () => {
    const result = searchYtdlp("test", "weibo");
    expect(result).toEqual([]);
  });
});

// ─── AS-3: downloadYtdlp ───

describe("downloadYtdlp", () => {
  it("is a function", () => {
    expect(typeof downloadYtdlp).toBe("function");
  });
});

// ─── AS-4: CDP source definitions ───

describe("CDP_SOURCES", () => {
  it("has ithome source", () => {
    const ithome = CDP_SOURCES.find((s) => s.name === "ithome");
    expect(ithome).toBeDefined();
    expect(typeof ithome.url).toBe("function");
    expect(ithome.url("Unitree")).toContain("ithome.com");
    expect(typeof ithome.imageScript).toBe("string");
    expect(ithome.imageScript).toContain("return results");
    expect(typeof ithome.imageFallbackScript).toBe("string");
    expect(ithome.imageFallbackScript).toContain("img");
  });

  it("has jiqizhixin source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "jiqizhixin");
    expect(src).toBeDefined();
    expect(src.url("DeepSeek")).toContain("jiqizhixin.com");
    expect(src.imageScript).toContain("return results");
  });

  it("has xinhua source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "xinhua");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("news.cn");
    expect(src.imageScript).toContain("return results");
  });

  it("has thepaper source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "thepaper");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("thepaper.cn");
    expect(src.imageScript).toContain("return results");
  });

  it("all CDP sources have imageFallbackScript", () => {
    for (const src of CDP_SOURCES) {
      expect(typeof src.imageFallbackScript).toBe("string");
      expect(src.imageFallbackScript).toContain("img[src]");
      expect(src.imageFallbackScript).toContain("naturalWidth");
    }
  });
});

// ─── AS-4: checkCdpAvailable ───

describe("checkCdpAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when CDP proxy responds", async () => {
    global.fetch.mockResolvedValue({ ok: true });
    const result = await checkCdpAvailable();
    expect(result).toBe(true);
  });

  it("returns false when CDP proxy is unreachable", async () => {
    global.fetch.mockRejectedValue(new Error("Connection refused"));
    const result = await checkCdpAvailable();
    expect(result).toBe(false);
  });
});

// ─── AS-5: loadEnvLocal ───

describe("loadEnvLocal", () => {
  it("is a function", () => {
    expect(typeof loadEnvLocal).toBe("function");
  });
});

// ─── AS-5: getApiKey ───

describe("getApiKey", () => {
  it("returns key when present", () => {
    const env = { PEXELS_API_KEY: "abc123" };
    expect(getApiKey(env, "PEXELS_API_KEY")).toBe("abc123");
  });

  it("returns null when key is missing", () => {
    const env = {};
    expect(getApiKey(env, "PEXELS_API_KEY")).toBe(null);
  });

  it("returns null when env is null", () => {
    expect(getApiKey(null, "PEXELS_API_KEY")).toBe(null);
  });
});

// ─── Attribution tests ───

describe("SOURCE_ATTRIBUTIONS", () => {
  it("has attribution for pexels", () => {
    expect(SOURCE_ATTRIBUTIONS.pexels).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.pexels.license).toBe("Pexels License");
    expect(SOURCE_ATTRIBUTIONS.pexels.logoRequired).toBe(false);
  });

  it("has attribution for pixabay with logoRequired=true", () => {
    expect(SOURCE_ATTRIBUTIONS.pixabay).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.pixabay.logoRequired).toBe(true);
  });

  it("has attribution for coverr", () => {
    expect(SOURCE_ATTRIBUTIONS.coverr).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.coverr.license).toBe("Coverr License");
  });

  it("has attribution for google_news", () => {
    expect(SOURCE_ATTRIBUTIONS.google_news).toBeDefined();
  });

  it("has attribution for bing_news", () => {
    expect(SOURCE_ATTRIBUTIONS.bing_news).toBeDefined();
  });

  it("has attribution for leiphone", () => {
    expect(SOURCE_ATTRIBUTIONS.leiphone).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.leiphone.license).toBe("News copyright");
  });

  it("has attribution for xinzhiyuan", () => {
    expect(SOURCE_ATTRIBUTIONS.xinzhiyuan).toBeDefined();
  });

  it("has attribution for douyin", () => {
    expect(SOURCE_ATTRIBUTIONS.douyin).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.douyin.license).toBe("Fair use");
  });

  it("has attribution for xhs (R3: matches yt-dlp source name)", () => {
    expect(SOURCE_ATTRIBUTIONS.xhs).toBeDefined();
  });

  it("has attribution for weibo_hot (R3: matches yt-dlp source name)", () => {
    expect(SOURCE_ATTRIBUTIONS.weibo_hot).toBeDefined();
  });
});

describe("buildAttribution", () => {
  it("builds attribution for pexels asset with author", () => {
    const asset = { author: "John Doe", url: "https://pexels.com/photo/1" };
    const attr = buildAttribution("pexels", asset);
    expect(attr).not.toBeNull();
    expect(attr.text).toContain("John Doe");
    expect(attr.text).toContain("Pexels");
    expect(attr.source).toBe("pexels");
    expect(attr.license).toBe("Pexels License");
    expect(attr.logoRequired).toBe(false);
  });

  it("builds attribution for pixabay asset", () => {
    const asset = { url: "https://pixabay.com/1" };
    const attr = buildAttribution("pixabay", asset);
    expect(attr).not.toBeNull();
    expect(attr.text).toContain("Pixabay");
    expect(attr.logoRequired).toBe(true);
  });

  it("builds attribution for ithome news source", () => {
    const asset = { url: "https://ithome.com/1" };
    const attr = buildAttribution("ithome", asset);
    expect(attr).not.toBeNull();
    expect(attr.text).toContain("IT之家");
    expect(attr.license).toBe("News copyright");
  });

  it("returns null for unknown source", () => {
    const attr = buildAttribution("unknown_source", {});
    expect(attr).toBeNull();
  });
});

describe("buildCreditsSection", () => {
  it("returns empty string when no assets have attribution", () => {
    const assets = [{ source: "test" }];
    const credits = buildCreditsSection(assets);
    expect(credits).toBe("");
  });

  it("builds credits section with multiple sources", () => {
    const assets = [
      {
        attribution: {
          source: "pexels",
          text: "Photo by John from Pexels",
          author: "John",
          logoRequired: false,
        },
      },
      {
        attribution: {
          source: "pixabay",
          text: "Source: Pixabay",
          author: undefined,
          logoRequired: true,
        },
      },
    ];
    const credits = buildCreditsSection(assets);
    // Only Pixabay should appear (logoRequired=true)
    expect(credits).toContain("--- Credits ---");
    expect(credits).toContain("Source: Pixabay");
    // Pexels should NOT appear (logoRequired=false)
    expect(credits).not.toContain("Photo by John");
  });

  it("deduplicates credits by source+author", () => {
    const assets = [
      {
        attribution: {
          source: "pixabay",
          text: "Source: Pixabay",
          author: undefined,
          logoRequired: true,
        },
      },
      {
        attribution: {
          source: "pixabay",
          text: "Source: Pixabay",
          author: undefined,
          logoRequired: true,
        },
      },
    ];
    const credits = buildCreditsSection(assets);
    // Should have 1 unique entry
    const lines = credits.split("\n").filter((l) => l && !l.startsWith("---"));
    expect(lines.length).toBe(1);
  });

  it("returns empty string when no assets require logo", () => {
    const assets = [
      { attribution: { source: "pexels", text: "Photo by John from Pexels", logoRequired: false } },
    ];
    const credits = buildCreditsSection(assets);
    expect(credits).toBe("");
  });

  it("returns empty string for empty assets array", () => {
    const credits = buildCreditsSection([]);
    expect(credits).toBe("");
  });
});

// ─── New yt-dlp source tests ───

// T2: douyin, xhs, weibo_hot removed from YTDLP_SOURCES (unsupported by yt-dlp)
describe("T2 — unsupported platforms removed from YTDLP_SOURCES", () => {
  it("does NOT have douyin in YTDLP_SOURCES", () => {
    const src = YTDLP_SOURCES.find((s) => s.name === "douyin");
    expect(src).toBeUndefined();
  });

  it("does NOT have xhs in YTDLP_SOURCES", () => {
    const src = YTDLP_SOURCES.find((s) => s.name === "xhs");
    expect(src).toBeUndefined();
  });

  it("does NOT have weibo_hot in YTDLP_SOURCES", () => {
    const src = YTDLP_SOURCES.find((s) => s.name === "weibo_hot");
    expect(src).toBeUndefined();
  });
});

// ─── Wikimedia license fetch tests ───

describe("fetchWikimediaLicense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a function", () => {
    expect(typeof fetchWikimediaLicense).toBe("function");
  });

  it("returns null when fetch fails", async () => {
    global.fetch.mockRejectedValue(new Error("Network error"));
    const result = await fetchWikimediaLicense("File:Example.jpg");
    expect(result).toBeNull();
  });

  it("returns null when response is not ok", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await fetchWikimediaLicense("File:Example.jpg");
    expect(result).toBeNull();
  });

  it("extracts license metadata from Wikimedia API response", async () => {
    const mockData = {
      query: {
        pages: {
          123: {
            pageid: 123,
            title: "File:Test.jpg",
            imageinfo: [
              {
                extmetadata: {
                  LicenseShortName: { value: "CC BY-SA 4.0" },
                  Artist: { value: "<a href='/wiki/User:Test'>TestUser</a>" },
                  AttributionRequired: { value: "true" },
                  LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                },
              },
            ],
          },
        },
      },
    };
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });

    const result = await fetchWikimediaLicense("File:Test.jpg");
    expect(result).not.toBeNull();
    expect(result.license).toBe("CC BY-SA 4.0");
    expect(result.author).toBe("TestUser"); // HTML stripped
    expect(result.attributionRequired).toBe(true);
    expect(result.licenseUrl).toContain("creativecommons.org");
  });

  it("returns null when extmetadata is missing", async () => {
    const mockData = {
      query: {
        pages: {
          123: {
            pageid: 123,
            title: "File:Test.jpg",
            imageinfo: [{}],
          },
        },
      },
    };
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });

    const result = await fetchWikimediaLicense("File:Test.jpg");
    expect(result).toBeNull();
  });
});

// ─── New CDP source tests ───

describe("CDP_SOURCES new additions", () => {
  it("has google_news source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "google_news");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("google.com");
    expect(src.imageScript).toContain("return results");
  });

  it("has bing_news source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "bing_news");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("bing.com");
    expect(src.imageScript).toContain("return results");
  });

  it("has leiphone source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "leiphone");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("leiphone.com");
  });

  it("has xinzhiyuan source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "xinzhiyuan");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("xinzhiyuan.com");
  });

  it("has zhidx source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "zhidx");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("zhidx.com");
  });
});

// ─── Wikimedia dynamic attribution tests ───

describe("Wikimedia dynamic attribution", () => {
  it("SOURCE_ATTRIBUTIONS.wikimedia has dynamicAttribution flag", () => {
    expect(SOURCE_ATTRIBUTIONS.wikimedia).toBeDefined();
    expect(SOURCE_ATTRIBUTIONS.wikimedia.dynamicAttribution).toBe(true);
    expect(SOURCE_ATTRIBUTIONS.wikimedia.logoRequired).toBe(false);
  });

  it("buildAttribution sets attributionRequired=true for CC-BY-SA license", () => {
    const asset = {
      licenseInfo: {
        license: "CC BY-SA 4.0",
        author: "TestUser",
        attributionRequired: true,
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      },
    };
    const attr = buildAttribution("wikimedia", asset);
    expect(attr).not.toBeNull();
    expect(attr.attributionRequired).toBe(true);
    expect(attr.license).toBe("CC BY-SA 4.0");
    expect(attr.author).toBe("TestUser");
    expect(attr.logoRequired).toBe(false);
  });

  it("buildAttribution sets attributionRequired=false for Public Domain", () => {
    const asset = {
      licenseInfo: {
        license: "Public Domain",
        author: undefined,
        attributionRequired: false,
        licenseUrl: undefined,
      },
    };
    const attr = buildAttribution("wikimedia", asset);
    expect(attr).not.toBeNull();
    expect(attr.attributionRequired).toBe(false);
    expect(attr.license).toBe("Public Domain");
  });

  it("buildAttribution infers attributionRequired from license name even if API says false", () => {
    // CC-BY should require attribution even if AttributionRequired field is not "true"
    const asset = {
      licenseInfo: {
        license: "CC BY 4.0",
        author: "Someone",
        attributionRequired: false, // API didn't set this
      },
    };
    const attr = buildAttribution("wikimedia", asset);
    expect(attr.attributionRequired).toBe(true); // Inferred from "CC BY"
  });

  it("buildAttribution does not set attributionRequired for CC0", () => {
    const asset = {
      licenseInfo: {
        license: "CC0",
        author: undefined,
        attributionRequired: false,
      },
    };
    const attr = buildAttribution("wikimedia", asset);
    expect(attr.attributionRequired).toBe(false);
  });

  it("buildCreditsSection includes Wikimedia CC-BY-SA assets (attributionRequired)", () => {
    const assets = [
      {
        attribution: {
          source: "wikimedia",
          text: "TestUser via Wikimedia Commons (CC BY-SA 4.0)",
          author: "TestUser",
          logoRequired: false,
          attributionRequired: true,
        },
      },
      {
        attribution: {
          source: "pexels",
          text: "Photo by John from Pexels",
          logoRequired: false,
          attributionRequired: false,
        },
      },
    ];
    const credits = buildCreditsSection(assets);
    expect(credits).toContain("Wikimedia Commons");
    expect(credits).toContain("CC BY-SA 4.0");
    // Pexels should NOT appear (neither logoRequired nor attributionRequired)
    expect(credits).not.toContain("Photo by John");
  });

  it("buildCreditsSection excludes Wikimedia Public Domain assets", () => {
    const assets = [
      {
        attribution: {
          source: "wikimedia",
          text: "Unknown via Wikimedia Commons (Public Domain)",
          logoRequired: false,
          attributionRequired: false,
        },
      },
    ];
    const credits = buildCreditsSection(assets);
    expect(credits).toBe(""); // No credits for PD content
  });

  it("buildAttribution works for wikimedia without licenseInfo (fallback to default)", () => {
    const asset = { author: "Someone" };
    const attr = buildAttribution("wikimedia", asset);
    expect(attr).not.toBeNull();
    // Without licenseInfo, falls back to static default
    expect(attr.license).toBe("CC-BY-SA 4.0");
    expect(attr.attributionRequired).toBe(false); // logoRequired is false
  });
});

// ─── Coverr API fix tests ───

describe("Coverr API fix", () => {
  it("uses /videos endpoint with query parameter", () => {
    const coverr = API_SOURCES.find((s) => s.name === "coverr");
    const url = coverr.searchUrl("robot", "test-key");
    expect(url).toContain("/videos");
    expect(url).toContain("query=robot");
  });

  it("uses Bearer token for auth", () => {
    const coverr = API_SOURCES.find((s) => s.name === "coverr");
    expect(coverr.authValue("mykey")).toBe("Bearer mykey");
  });

  it("parses hits array from Coverr response", () => {
    const coverr = API_SOURCES.find((s) => s.name === "coverr");
    const mockData = {
      hits: [{ title: "Robot vacuum", base_filename: "coverr-robot-123", is_vertical: false }],
      params: { userToken: "abc123" },
    };
    const result = coverr.parseResponse(mockData, "robot");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Robot vacuum");
    expect(result[0].url).toContain("coverr-robot-123");
    expect(result[0].type).toBe("video");
  });
});

// ─── Pixabay source tests ───

describe("Pixabay API source", () => {
  it("is defined in API_SOURCES", () => {
    const pixabay = API_SOURCES.find((s) => s.name === "pixabay");
    expect(pixabay).toBeDefined();
    expect(pixabay.requiresApiKey).toBe(true);
    expect(pixabay.apiKeyEnv).toBe("PIXABAY_API_KEY");
  });

  it("searchUrl includes key and keyword", () => {
    const pixabay = API_SOURCES.find((s) => s.name === "pixabay");
    const url = pixabay.searchUrl("robot", "testkey123");
    expect(url).toContain("key=testkey123");
    expect(url).toContain("q=robot");
  });

  it("parseResponse extracts hits", () => {
    const pixabay = API_SOURCES.find((s) => s.name === "pixabay");
    const mockData = {
      hits: [
        {
          tags: "robot, technology",
          largeImageURL: "https://pixabay.com/1.jpg",
          imageWidth: 1080,
          imageHeight: 1920,
          user: "photographer1",
        },
      ],
    };
    const result = pixabay.parseResponse(mockData, "robot");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("robot, technology");
    expect(result[0].url).toContain("pixabay.com");
    expect(result[0].author).toBe("photographer1");
  });
});

// ─── assignAssetsToScenes tests ───

import { assignAssetsToScenes } from "../lib/asset-sourcer.mjs";

describe("assignAssetsToScenes", () => {
  // Helper: create a minimal scene
  const makeScene = (id, visualType, hasMedia = false) => ({
    id,
    visualType,
    media: hasMedia ? { type: "video", path: "existing.mp4" } : undefined,
  });

  // Helper: create a minimal asset
  const makeAsset = (path, type, score, source = "youtube") => ({
    path,
    type,
    score,
    source,
    title: `Asset ${path}`,
  });

  // #9: 0 assets, 3 available scenes → empty patch array
  it("returns empty array when no assets are provided", () => {
    const scenes = [
      makeScene(2, "narrative"),
      makeScene(4, "info-card"),
      makeScene(5, "narrative"),
    ];
    const result = assignAssetsToScenes([], scenes);
    expect(result).toEqual([]);
  });

  // #10: 5 assets, 2 available scenes → top-2 assigned, 3 unassigned
  it("assigns top-scoring assets to available scenes, marks rest as unassigned", () => {
    const scenes = [makeScene(2, "narrative"), makeScene(4, "info-card")];
    const assets = [
      makeAsset("a1.mp4", "video", 90),
      makeAsset("a2.mp4", "video", 85),
      makeAsset("a3.mp4", "video", 80),
      makeAsset("a4.mp4", "video", 75),
      makeAsset("a5.mp4", "video", 70),
    ];
    const result = assignAssetsToScenes(assets, scenes);
    expect(result).toHaveLength(5);
    const assigned = result.filter((r) => r.status === "assigned");
    const unassigned = result.filter((r) => r.status === "unassigned");
    expect(assigned).toHaveLength(2);
    expect(unassigned).toHaveLength(3);
    // Top asset (score 90) → scene 2
    expect(assigned[0].sceneId).toBe(2);
    expect(assigned[0].assetScore).toBe(90);
    // Second asset (score 85) → scene 4
    expect(assigned[1].sceneId).toBe(4);
    expect(assigned[1].assetScore).toBe(85);
  });

  // #11: Image asset → media.volume omitted in patch
  it("omits volume field for image assets", () => {
    const scenes = [makeScene(4, "info-card")];
    const assets = [makeAsset("building.jpg", "image", 80)];
    const result = assignAssetsToScenes(assets, scenes);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("assigned");
    expect(result[0].media.volume).toBeUndefined();
  });

  // #12: Scene already has media → skipped
  it("skips scenes that already have media assigned", () => {
    const scenes = [makeScene(2, "narrative", true), makeScene(4, "info-card")];
    const assets = [makeAsset("a1.mp4", "video", 90)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.filter((r) => r.status === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].sceneId).toBe(4); // scene 2 skipped, asset goes to scene 4
  });

  // #13: hook is no longer in NO_MEDIA_TYPES — it can receive media
  it("skips scenes with visualType in NO_MEDIA_TYPES (cta, data, stat-reveal)", () => {
    const scenes = [makeScene(1, "cta"), makeScene(2, "narrative")];
    const assets = [makeAsset("a1.mp4", "video", 90)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.filter((r) => r.status === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].sceneId).toBe(2); // scene 1 (cta) skipped
  });

  // #14: Two assets with same path → first assigned, second skipped
  it("deduplicates assets by path — first wins, second marked unassigned", () => {
    const scenes = [makeScene(2, "narrative")];
    const assets = [makeAsset("same.mp4", "video", 90), makeAsset("same.mp4", "video", 80)];
    const result = assignAssetsToScenes(assets, scenes);
    expect(result).toHaveLength(2);
    const assigned = result.filter((r) => r.status === "assigned");
    const unassigned = result.filter((r) => r.status === "unassigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].assetScore).toBe(90);
    expect(unassigned).toHaveLength(1);
  });

  // #15: Asset without path field → skipped
  it("skips assets without a path field", () => {
    const scenes = [makeScene(2, "narrative")];
    const assets = [{ type: "video", score: 90, source: "youtube", title: "no path" }];
    const result = assignAssetsToScenes(assets, scenes);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("unassigned");
  });

  // #16: Volume per visualType
  it("recommends volume 0.10 for narrative+video", () => {
    const scenes = [makeScene(2, "narrative")];
    const assets = [makeAsset("demo.mp4", "video", 90)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.volume).toBe(0.1);
  });

  it("recommends volume 0.04 for quote+video", () => {
    const scenes = [makeScene(3, "quote")];
    const assets = [makeAsset("clip.mp4", "video", 85)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.volume).toBe(0.04);
  });

  it("recommends volume 0.08 for info-card+video (default)", () => {
    const scenes = [makeScene(4, "info-card")];
    const assets = [makeAsset("info.mp4", "video", 80)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.volume).toBe(0.08);
  });

  it("sets correct animation for narrative+video (zoom)", () => {
    const scenes = [makeScene(2, "narrative")];
    const assets = [makeAsset("demo.mp4", "video", 90)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.animation).toBe("zoom");
  });

  it("sets correct animation for info-card+image (ken-burns)", () => {
    const scenes = [makeScene(4, "info-card")];
    const assets = [makeAsset("building.jpg", "image", 80)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.animation).toBe("ken-burns");
  });

  // ── Hook media auto-assignment (spec-hook-media-support.md D4) ──

  it("assigns to hook scene when score>=60 and fit=cover", () => {
    const scenes = [makeScene(1, "hook"), makeScene(2, "narrative")];
    const assets = [makeAsset("a1.jpg", "image", 90)];
    assets[0].fit = "cover";
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.filter((r) => r.status === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].sceneId).toBe(1); // scene 1 (hook) gets the asset
  });

  it("does NOT assign to hook when score < 60", () => {
    const scenes = [makeScene(1, "hook"), makeScene(2, "narrative")];
    const assets = [makeAsset("a1.jpg", "image", 50)];
    assets[0].fit = "cover";
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.filter((r) => r.status === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].sceneId).toBe(2); // hook rejected, goes to narrative
  });

  it("does NOT assign to hook when fit=contain (leaves for narrative)", () => {
    const scenes = [makeScene(1, "hook"), makeScene(2, "narrative")];
    const assets = [makeAsset("a1.jpg", "image", 90)];
    assets[0].fit = "contain";
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.filter((r) => r.status === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].sceneId).toBe(2); // hook rejected (contain), goes to narrative
  });

  it("does NOT assign to hook when aiFit is missing", () => {
    const scenes = [makeScene(1, "hook"), makeScene(2, "narrative")];
    const assets = [makeAsset("a1.jpg", "image", 90)];
    // no aiFit set
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.filter((r) => r.status === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].sceneId).toBe(2); // hook rejected (no fit), goes to narrative
  });

  it("hook assignment uses ken-burns animation and overlay 0.5", () => {
    const scenes = [makeScene(1, "hook")];
    const assets = [makeAsset("a1.jpg", "image", 90)];
    assets[0].fit = "cover";
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.animation).toBe("ken-burns");
    expect(assigned.media.overlay).toBe(0.5);
    expect(assigned.media.fit).toBe("cover");
  });

  it("sets correct animation for narrative+image (ken-burns)", () => {
    const scenes = [makeScene(2, "narrative")];
    const assets = [makeAsset("building.jpg", "image", 80)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.animation).toBe("ken-burns");
  });
});

// ─── Ticket 02: scoreCandidate { description, subjects } + recommendScene contentKind (P1-1) ───
// Scenario Matrix rows: #4, #5, #6, #7, #8, #9, #10, #17, #18

describe("Ticket 02 — scoreCandidate with { description, subjects }", () => {
  const baseCandidate = {
    title: "Demo Video",
    type: "video",
    duration: 5,
    fileSize: 5000000,
    resolution: "720p",
  };
  // Technical: 0 (title) + 18 + 14 + 7 = 39

  // Scenario #4: subjects exact match = 20 pts; description has no keyword = 0; total = 20
  it("scores subjects exact match as 20 pts when description has no keyword (Scenario #4)", () => {
    const score = scoreCandidate(baseCandidate, "Unitree", {
      description: "robot lab",
      subjects: ["unitree"],
    });
    // 39 (technical) + 20 (subjects) + 0 (description) = 59
    expect(score).toBe(59);
  });

  // Scenario #5: subjects empty = 0 pts; description has keyword = 10 pts; total = 10
  it("scores description match as 10 pts when subjects empty (Scenario #5)", () => {
    const score = scoreCandidate(baseCandidate, "Unitree", {
      description: "Unitree robot",
      subjects: [],
    });
    // 39 (technical) + 0 (subjects) + 10 (description) = 49
    expect(score).toBe(49);
  });

  // Scenario #6: string semantics (backward compat) → works as before
  it("accepts string semantics as backward compat (Scenario #6)", () => {
    const scoreWithString = scoreCandidate(
      baseCandidate,
      "Unitree",
      "A Unitree humanoid robot walking in a lab",
    );
    // 39 (technical) + 20 (subjects from description boundary match) + 10 (description) = 69
    // Old behavior: string is treated as description, boundary match gives 20+10=30
    expect(scoreWithString).toBe(69);
  });

  // Scenario #6 (object form): { description } without subjects → only description score
  it("accepts object { description } without subjects (Scenario #6 variant)", () => {
    const scoreWithObj = scoreCandidate(baseCandidate, "Unitree", {
      description: "A Unitree humanoid robot walking in a lab",
    });
    // 39 (technical) + 0 (no subjects) + 10 (description boundary match) = 49
    expect(scoreWithObj).toBe(49);
  });

  // Scenario #17: subjects containing keyword as substring (not exact) → no match
  it("does NOT match subjects substring (exact match only, case-insensitive) (Scenario #17)", () => {
    const score = scoreCandidate(
      baseCandidate,
      "Unitree",
      { description: "robot lab", subjects: ["unitreeRobot"] }, // substring, not exact
    );
    // 39 (technical) + 0 (subjects: "unitree" != "unitreerobot") + 0 (description) = 39
    expect(score).toBe(39);
  });

  // Scenario #18: multi-word keyword tokenized match against subjects
  it("matches multi-word keyword tokens against subjects (Scenario #18)", () => {
    const score = scoreCandidate(baseCandidate, "Alibaba Cloud", {
      description: "infrastructure",
      subjects: ["alibaba", "cloud", "infrastructure"],
    });
    // 39 (technical) + 20 (subjects: both tokens match: 2/2 = proportional full 20) + 0 (description: "infrastructure" no "alibaba cloud") = 59
    // Per-token match: 2/2 tokens match = full 20 pts
    expect(score).toBe(59);
  });

  // Additional: both subjects and description match → combined score
  it("combines subjects and description scores when both match", () => {
    const score = scoreCandidate(baseCandidate, "Unitree", {
      description: "Unitree robot in lab",
      subjects: ["unitree", "robot"],
    });
    // 39 (technical) + 20 (subjects exact match) + 10 (description boundary) = 69
    expect(score).toBe(69);
  });

  // Capped at 30 for relevance
  it("relevance score capped at 30 with both subjects and description", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "1080p",
    };
    // 28 + 18 + 14 + 10 = 70 technical
    const score = scoreCandidate(candidate, "Unitree", {
      description: "Unitree robot Unitree lab",
      subjects: ["unitree", "robot"],
    });
    // 70 + min(20 + 10, 30) = 100
    expect(score).toBe(100);
  });
});

// ─── Ticket 02: recommendScene with contentKind mapping ───

describe("Ticket 02 — recommendScene with contentKind", () => {
  // Scenario #7: contentKind: "product_demo" → prefers narrative scene
  it("prefers narrative scene for contentKind=product_demo (Scenario #7)", () => {
    const scenes = [
      { id: 1, visualType: "info-card" },
      { id: 2, visualType: "narrative" },
      { id: 3, visualType: "quote" },
    ];
    const asset = { type: "image", contentKind: "product_demo" };
    const rec = recommendScene(asset, scenes);
    expect(rec.sceneId).toBe(2); // narrative preferred
  });

  // Scenario #8: contentKind: "talking_head" → prefers quote scene
  it("prefers quote scene for contentKind=talking_head (Scenario #8)", () => {
    const scenes = [
      { id: 1, visualType: "narrative" },
      { id: 2, visualType: "quote" },
    ];
    const asset = { type: "image", contentKind: "talking_head" };
    const rec = recommendScene(asset, scenes);
    expect(rec.sceneId).toBe(2); // quote preferred
  });

  // Scenario #9: contentKind null or unknown → falls back to current logic
  it("falls back to current logic for null contentKind (Scenario #9)", () => {
    const scenes = [
      { id: 1, visualType: "info-card" },
      { id: 2, visualType: "narrative" },
    ];
    const asset = { type: "image", contentKind: null };
    const rec = recommendScene(asset, scenes);
    // No preference → first available scene (info-card)
    expect(rec.sceneId).toBe(1);
  });

  it("falls back to current logic for unknown contentKind (Scenario #9)", () => {
    const scenes = [
      { id: 1, visualType: "narrative" },
      { id: 2, visualType: "quote" },
    ];
    const asset = { type: "image", contentKind: "landscape" };
    const rec = recommendScene(asset, scenes);
    // Unknown contentKind → no preference → first available
    expect(rec.sceneId).toBe(1);
  });

  // Scenario #10: contentKind=product_demo but all narrative scenes taken → falls through
  it("falls through when preferred type all taken (Scenario #10)", () => {
    const scenes = [
      { id: 1, visualType: "narrative", media: { type: "image" } }, // already taken
      { id: 2, visualType: "info-card" },
    ];
    const asset = { type: "image", contentKind: "product_demo" };
    const rec = recommendScene(asset, scenes);
    // All narrative taken → fall through to info-card
    expect(rec.sceneId).toBe(2);
  });
});

// ─── End-to-end path contract (Review P0-1 completion criterion) ───
// Review P0-1: "相对路径 → assignAssetsToScenes → validatePatchEntry → valid: true"
// Verifies that the full pipeline produces patches that the apply-media-patch.mjs validator accepts.

describe("End-to-end: assignAssetsToScenes → validatePatchEntry (Review P0-1)", () => {
  // Import validatePatchEntry and isPathContained from the apply-media-patch module
  // Using dynamic import to avoid circular dependency issues
  let validatePatchEntry, isPathContained;
  beforeAll(async () => {
    const mod = await import("../apply-media-patch.mjs");
    validatePatchEntry = mod.validatePatchEntry;
    isPathContained = mod.isPathContained;
  });

  it("relative-path asset → assignAssetsToScenes → validatePatchEntry: valid", () => {
    const contentDir = "/fake/content/unitree";
    const scenes = [{ id: 1, visualType: "narrative" }];
    const assets = [{ type: "image", path: "assets/img.jpg", score: 80, source: "pexels" }];
    const patches = assignAssetsToScenes(assets, scenes);
    expect(patches).toHaveLength(1);
    expect(patches[0].status).toBe("assigned");
    // media.path must be relative
    expect(patches[0].media.path).toBe("assets/img.jpg");
    // validatePatchEntry must accept it
    const result = validatePatchEntry(patches[0], scenes, contentDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("isPathContained accepts relative path", () => {
    expect(isPathContained("assets/img.jpg", "/fake/content/unitree")).toBe(true);
  });

  it("isPathContained rejects absolute path (the P0-1 bug)", () => {
    expect(isPathContained("/fake/content/unitree/assets/img.jpg", "/fake/content/unitree")).toBe(
      false,
    );
  });

  it("isPathContained rejects path traversal", () => {
    expect(isPathContained("../../etc/passwd", "/fake/content/unitree")).toBe(false);
  });
});

// ─── T04 (#56): Cached-image flow ───

describe("loadCachedImages", () => {
  it("returns empty array when file does not exist (T04 scenario #6)", () => {
    const result = loadCachedImages("/nonexistent/trending-topics.json", ["DeepSeek"]);
    expect(result).toEqual([]);
  });

  it("extracts images from trending-topics.json (T04)", () => {
    const mockData = {
      topics: {
        breaking: [
          {
            title: "DeepSeek V4 announced",
            sources: ["qbitai"],
            urls: ["http://qbitai.com/1"],
            images: [{ url: "http://qbitai.com/img/v4.jpg", sourceArticle: "http://qbitai.com/1" }],
          },
        ],
        fermenting: [],
        data: [],
        explainer: [],
      },
    };
    const tmpFile = `/tmp/test-trending-${Date.now()}.json`;
    writeFileSync(tmpFile, JSON.stringify(mockData));
    try {
      const result = loadCachedImages(tmpFile, ["DeepSeek"]);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("http://qbitai.com/img/v4.jpg");
      expect(result[0].sourceArticle).toBe("http://qbitai.com/1");
      expect(result[0].sourceTitle).toBe("DeepSeek V4 announced");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("returns empty array when keywords do not match any topic (T04)", () => {
    const mockData = {
      topics: {
        breaking: [
          {
            title: "Some unrelated topic",
            sources: ["qbitai"],
            urls: ["http://qbitai.com/1"],
            images: [{ url: "http://qbitai.com/img/1.jpg", sourceArticle: "http://qbitai.com/1" }],
          },
        ],
        fermenting: [],
        data: [],
        explainer: [],
      },
    };
    const tmpFile = `/tmp/test-trending-${Date.now()}.json`;
    writeFileSync(tmpFile, JSON.stringify(mockData));
    try {
      const result = loadCachedImages(tmpFile, ["DeepSeek"]);
      expect(result).toEqual([]);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe("toCachedImageCandidate (#56)", () => {
  it("maps the originating topic title and stable provenance before pre-download filtering", () => {
    const asset = toCachedImageCandidate({
      url: "https://qbitai.com/images/deepseek-v4.jpg",
      sourceArticle: "https://qbitai.com/articles/deepseek-v4",
      sourceTitle: "DeepSeek V4 announced",
    });

    expect(asset).toMatchObject({
      title: "DeepSeek V4 announced",
      source: "cached",
      sourceArticle: "https://qbitai.com/articles/deepseek-v4",
      type: "image",
    });
    expect(preFilterCandidate(asset, "DeepSeek").technicalScore).toBeGreaterThanOrEqual(
      PRE_DOWNLOAD_FILTER_THRESHOLD,
    );
  });
});

describe("isLogoOrIcon", () => {
  it("rejects URLs containing logo (T04 scenario #7)", () => {
    expect(isLogoOrIcon("http://example.com/logo.png")).toBe(true);
  });

  it("rejects URLs containing avatar", () => {
    expect(isLogoOrIcon("http://example.com/avatar.jpg")).toBe(true);
  });

  it("rejects URLs containing icon", () => {
    expect(isLogoOrIcon("http://example.com/icon-32x32.png")).toBe(true);
  });

  it("rejects URLs containing placeholder", () => {
    expect(isLogoOrIcon("http://example.com/placeholder.png")).toBe(true);
  });

  it("rejects URLs containing spinner", () => {
    expect(isLogoOrIcon("http://example.com/spinner.gif")).toBe(true);
  });

  it("rejects data URI images (WeChat 1x1 SVG placeholders)", () => {
    expect(
      isLogoOrIcon(
        "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22",
      ),
    ).toBe(true);
  });

  it("accepts normal image URLs", () => {
    expect(isLogoOrIcon("http://qbitai.com/img/v4.jpg")).toBe(false);
  });
});

describe("hasKeywordMatch", () => {
  it("returns true when title contains keyword", () => {
    expect(hasKeywordMatch("DeepSeek V4 announced", ["DeepSeek"])).toBe(true);
  });

  it("returns true when any keyword matches", () => {
    expect(hasKeywordMatch("Unitree robot demo", ["DeepSeek", "Unitree"])).toBe(true);
  });

  it("returns false when no keywords match", () => {
    expect(hasKeywordMatch("Some random news", ["DeepSeek"])).toBe(false);
  });

  it("returns false for empty keywords", () => {
    expect(hasKeywordMatch("DeepSeek V4", [])).toBe(false);
  });
});

// ─── T05 (#57): Pre-download filter gate ───

describe("T05 — Pre-download filter gate (threshold 20)", () => {
  it("exports PRE_DOWNLOAD_FILTER_THRESHOLD as 20", () => {
    expect(PRE_DOWNLOAD_FILTER_THRESHOLD).toBe(20);
  });

  it("preFilterCandidate returns technicalScore for good asset above threshold 20", () => {
    // Good candidate: title match + image type + small file + 720p = 28 + 14 + 14 + 7 = 63
    const candidate = {
      title: "Unitree Robot Demo",
      type: "image",
      fileSize: 3_000_000,
      resolution: "720p",
    };
    const result = preFilterCandidate(candidate, "Unitree");
    expect(result.technicalScore).toBe(63);
    expect(result.technicalScore).toBeGreaterThanOrEqual(PRE_DOWNLOAD_FILTER_THRESHOLD);
  });

  it("preFilterCandidate returns technicalScore for bad asset below threshold 20", () => {
    // Bad candidate: no title match + unknown duration + huge file = 0 + 3 + 0 + 0 = 3
    const candidate = {
      title: "Random unrelated video",
      type: "video",
      fileSize: 200_000_000,
      duration: 300,
    };
    const result = preFilterCandidate(candidate, "Unitree");
    expect(result.technicalScore).toBe(3);
    expect(result.technicalScore).toBeLessThan(PRE_DOWNLOAD_FILTER_THRESHOLD);
  });

  it("pre-download threshold (20) is lower than post-download threshold (30)", () => {
    // This is a design assertion: pre-download is more lenient because
    // pre-download metadata is sparser (no file size from API, resolution may be missing)
    expect(PRE_DOWNLOAD_FILTER_THRESHOLD).toBeLessThan(30);
  });

  it("blocks asset with sparse metadata below threshold 20", () => {
    // Candidate with no title match + bad duration = 0 + 3 + 0 + 0 = 3
    // 3 < 20 → blocked pre-download
    const candidate = {
      title: "Random unrelated video",
      type: "video",
      duration: 300, // >60s → durationScore=3
    };
    const result = preFilterCandidate(candidate, "Unitree");
    // title: no match=0, duration: 3, size: 0, res: 0 = 3
    expect(result.technicalScore).toBe(3);
    expect(result.technicalScore).toBeLessThan(PRE_DOWNLOAD_FILTER_THRESHOLD);
    expect(result.technicalScore).toBeLessThan(30); // also below post-download
  });

  it("scenario #10: asset passes pre-download (>=20) but fails post-download (<30)", () => {
    // This is the soft gate scenario: some assets are downloaded then skipped at post-download
    // Example: partial title match (14) + image type (14) = 28
    // 28 >= 20 (pre-download) but 28 < 30 (post-download)
    // "Unitr" is the 5-char prefix of "Unitree" — must be a boundary match
    const candidate = {
      title: "Unitr demo video", // partial match (5-char prefix "Unitr") → titleScore=14
      type: "image", // durationScore=14
      // no fileSize, no resolution → sizeScore=0, resScore=0
    };
    const result = preFilterCandidate(candidate, "Unitree");
    expect(result.technicalScore).toBe(28);
    // Pre-download: 28 >= 20 → downloaded
    expect(result.technicalScore).toBeGreaterThanOrEqual(PRE_DOWNLOAD_FILTER_THRESHOLD);
    // Post-download: 28 < 30 → lowConfidence (skipped from VLM)
    expect(result.lowConfidence).toBe(true);
  });
});

// ─── T1: Misfilter prevention tests ───

describe("T1: preFilterCandidate misfilter prevention", () => {
  it("good asset with sparse metadata (no fileSize, no resolution) is not hard-skipped", () => {
    // API source like Pexels returns title + type but no fileSize or resolution.
    // title match (14, partial) + duration (18) + size (0) + res (0) = 32
    const candidate = {
      title: "Unitree H1 Robot Walks",
      type: "video",
      duration: 5,
      // no fileSize, no resolution — sparse metadata from API
    };
    const result = preFilterCandidate(candidate, "Unitree");
    // 28 (full match) + 18 + 0 + 0 = 46 — should pass both thresholds
    expect(result.technicalScore).toBe(46);
    expect(result.lowConfidence).toBe(false);
  });

  it("image with sparse metadata (no fileSize, no resolution) passes pre-download filter", () => {
    // Image from CDP extraction: title match + type, no fileSize/resolution
    const candidate = {
      title: "DeepSeek AI Logo",
      type: "image",
      // no fileSize, no resolution
    };
    const result = preFilterCandidate(candidate, "DeepSeek");
    // 28 (full match) + 14 (image duration) + 0 + 0 = 42
    expect(result.technicalScore).toBe(42);
    expect(result.technicalScore).toBeGreaterThanOrEqual(PRE_DOWNLOAD_FILTER_THRESHOLD);
    expect(result.lowConfidence).toBe(false);
  });

  it("CJK title vs English keyword — no boundary match (documents known gap)", () => {
    // "优必选" is UBTECH in Chinese. hasBoundaryMatch uses includes() for CJK
    // but keyword is Latin — Latin path uses word boundary regex.
    // "优必选机器人" lowercased is still "优必选机器人" — no Latin "ubtech" token.
    const candidate = {
      title: "优必选机器人演示",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const result = preFilterCandidate(candidate, "UBTECH");
    // No title match (CJK vs Latin) + 18 + 14 + 7 = 39
    // 39 >= 30 → not lowConfidence — passes because duration/size/res provide enough signal
    expect(result.technicalScore).toBe(39);
    expect(result.lowConfidence).toBe(false);
  });

  it("asset with only type match (no title match, no metadata) is lowConfidence", () => {
    const candidate = {
      title: "Random unrelated content",
      type: "video",
      duration: 5,
      fileSize: 5000000,
    };
    const result = preFilterCandidate(candidate, "Unitree");
    // 0 (no title match) + 18 + 14 + 0 = 32
    // 32 >= 30 → not lowConfidence — has enough signal from duration/size
    expect(result.technicalScore).toBe(32);
    expect(result.lowConfidence).toBe(false);
  });

  it("asset with no metadata at all (unknown type, no duration) is lowConfidence", () => {
    const candidate = {
      title: "Mystery Video",
      type: "video",
      // no duration, no fileSize, no resolution
    };
    const result = preFilterCandidate(candidate, "Unitree");
    // 0 (no title match) + 3 (unknown duration) + 0 + 0 = 3
    expect(result.technicalScore).toBe(3);
    expect(result.lowConfidence).toBe(true);
  });
});

// ─── T3: CDP type handling tests ───

describe("T3 — CDP type handling", () => {
  // T3 original: CDP download loop must skip type='text' candidates from image download path
  it("google_news imageScript pushes type='image' when img exists", () => {
    const src = CDP_SOURCES.find((s) => s.name === "google_news");
    expect(src).toBeDefined();
    expect(src.imageScript).toContain("'image'");
  });

  it("bing_news imageScript pushes type='image' when img exists", () => {
    const src = CDP_SOURCES.find((s) => s.name === "bing_news");
    expect(src).toBeDefined();
    expect(src.imageScript).toContain("'image'");
  });

  // New: CDP scripts should also push type='text' when no img but link+title exist
  it("google_news imageScript pushes type='text' for text-only results", () => {
    const src = CDP_SOURCES.find((s) => s.name === "google_news");
    expect(src.imageScript).toContain("'text'");
  });

  it("bing_news imageScript pushes type='text' for text-only results", () => {
    const src = CDP_SOURCES.find((s) => s.name === "bing_news");
    expect(src.imageScript).toContain("'text'");
  });

  // All CDP sources should push text candidates (not just google/bing)
  it("all CDP sources push type='text' for text-only results", () => {
    for (const src of CDP_SOURCES) {
      expect(src.imageScript, `${src.name} missing text push`).toContain("'text'");
    }
  });

  // All CDP sources should include sourceUrl in both image and text candidates
  it("all CDP sources include sourceUrl in image candidates", () => {
    for (const src of CDP_SOURCES) {
      expect(src.imageScript, `${src.name} missing sourceUrl`).toContain("sourceUrl");
    }
  });

  // All CDP sources should include snippet in both image and text candidates
  it("all CDP sources include snippet in image candidates", () => {
    for (const src of CDP_SOURCES) {
      expect(src.imageScript, `${src.name} missing snippet`).toContain("snippet");
    }
  });
});

// ─── URL dedup helpers (cross-phase Single Visit Extraction) ───
// Spec: docs/spec-tier3-parallel-and-url-dedup.md
// Scenario matrix rows #1, #2, #4, #5, #9

describe("shouldSkipUrl", () => {
  // Scenario #1: Phase 0 downloads URL X, Tier 2 returns same URL X
  it("returns true when URL is already in the Set", () => {
    const downloadedUrls = new Set(["https://example.com/img/123.jpg"]);
    expect(shouldSkipUrl("https://example.com/img/123.jpg", downloadedUrls)).toBe(true);
  });

  // Scenario #2: Different source returns same URL
  it("returns true regardless of which source added the URL", () => {
    const downloadedUrls = new Set(["https://ithome.com/img/deepseek.jpg"]);
    expect(shouldSkipUrl("https://ithome.com/img/deepseek.jpg", downloadedUrls)).toBe(true);
  });

  // Scenario #4: Failed download → URL NOT in Set → should NOT skip
  it("returns false when URL was not downloaded (download failed)", () => {
    const downloadedUrls = new Set(); // empty — download failed, nothing added
    expect(shouldSkipUrl("https://example.com/failed.jpg", downloadedUrls)).toBe(false);
  });

  // Scenario #5: URL is null/undefined
  it("returns false for null URL", () => {
    const downloadedUrls = new Set();
    expect(shouldSkipUrl(null, downloadedUrls)).toBe(false);
  });

  it("returns false for undefined URL", () => {
    const downloadedUrls = new Set();
    expect(shouldSkipUrl(undefined, downloadedUrls)).toBe(false);
  });

  it("returns false for empty string URL", () => {
    const downloadedUrls = new Set();
    expect(shouldSkipUrl("", downloadedUrls)).toBe(false);
  });

  it("returns false for non-string URL", () => {
    const downloadedUrls = new Set();
    expect(shouldSkipUrl(123, downloadedUrls)).toBe(false);
  });

  // Scenario: URL not yet downloaded
  it("returns false when URL is not in the Set", () => {
    const downloadedUrls = new Set(["https://example.com/img/123.jpg"]);
    expect(shouldSkipUrl("https://example.com/img/456.jpg", downloadedUrls)).toBe(false);
  });

  // Case sensitivity: URLs are case-sensitive in practice
  it("treats URLs as case-sensitive", () => {
    const downloadedUrls = new Set(["https://Example.com/IMG/123.jpg"]);
    expect(shouldSkipUrl("https://example.com/img/123.jpg", downloadedUrls)).toBe(false);
  });
});

describe("markDownloaded", () => {
  it("adds URL to the Set after successful download", () => {
    const downloadedUrls = new Set();
    markDownloaded("https://example.com/img/123.jpg", downloadedUrls);
    expect(downloadedUrls.has("https://example.com/img/123.jpg")).toBe(true);
  });

  it("does not throw for null URL", () => {
    const downloadedUrls = new Set();
    expect(() => markDownloaded(null, downloadedUrls)).not.toThrow();
    expect(downloadedUrls.size).toBe(0);
  });

  it("does not throw for undefined URL", () => {
    const downloadedUrls = new Set();
    expect(() => markDownloaded(undefined, downloadedUrls)).not.toThrow();
    expect(downloadedUrls.size).toBe(0);
  });

  it("does not throw for empty string URL", () => {
    const downloadedUrls = new Set();
    expect(() => markDownloaded("", downloadedUrls)).not.toThrow();
    expect(downloadedUrls.size).toBe(0);
  });

  it("does not throw for non-string URL", () => {
    const downloadedUrls = new Set();
    expect(() => markDownloaded(123, downloadedUrls)).not.toThrow();
    expect(downloadedUrls.size).toBe(0);
  });
});

// Integration-style: shouldSkipUrl + markDownloaded together
describe("URL dedup flow (shouldSkipUrl + markDownloaded)", () => {
  // Scenario #1: Phase 0 → Tier 2 same URL
  it("simulates Phase 0 download then Tier 2 skip", () => {
    const downloadedUrls = new Set();
    const url = "https://ithome.com/img/deepseek-123.jpg";

    // Phase 0: not yet downloaded
    expect(shouldSkipUrl(url, downloadedUrls)).toBe(false);
    markDownloaded(url, downloadedUrls);

    // Tier 2: same URL → skip
    expect(shouldSkipUrl(url, downloadedUrls)).toBe(true);
  });

  // Scenario #4: Failed download doesn't block retry
  it("simulates failed download then retry in later phase", () => {
    const downloadedUrls = new Set();
    const url = "https://example.com/flaky.jpg";

    // Phase 0: download fails → NOT marked
    // (shouldSkipUrl returns false, but download fails, so markDownloaded not called)
    expect(shouldSkipUrl(url, downloadedUrls)).toBe(false);

    // Tier 2: same URL → not in Set → retry
    expect(shouldSkipUrl(url, downloadedUrls)).toBe(false);
    markDownloaded(url, downloadedUrls);

    // Tier 3: same URL → now skip
    expect(shouldSkipUrl(url, downloadedUrls)).toBe(true);
  });
});

// ─── SVE (#114): Phase 0b — cached media from detail pages ───

describe("loadCachedMedia", () => {
  it("returns empty array when file does not exist (SVE scenario #11)", () => {
    const result = loadCachedMedia("/nonexistent/media-cache.json", ["DeepSeek"]);
    expect(result).toEqual([]);
  });

  it("returns empty array when keywords are empty", () => {
    const tmpFile = `/tmp/test-media-cache-${Date.now()}.json`;
    writeFileSync(tmpFile, JSON.stringify({ version: 1, entries: [] }));
    try {
      const result = loadCachedMedia(tmpFile, []);
      expect(result).toEqual([]);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("returns empty array when file is malformed (SVE scenario #12)", () => {
    const tmpFile = `/tmp/test-media-cache-${Date.now()}.json`;
    writeFileSync(tmpFile, "{ not valid json }");
    try {
      const result = loadCachedMedia(tmpFile, ["DeepSeek"]);
      expect(result).toEqual([]);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("returns empty array when no entries match keywords (SVE scenario #13)", () => {
    const tmpFile = `/tmp/test-media-cache-${Date.now()}.json`;
    const mockData = {
      version: 1,
      entries: [
        {
          sourceUrl: "https://example.com/article-1",
          scrapedAt: "2026-08-27T10:00:00Z",
          images: [{ url: "https://example.com/img1.jpg" }],
          videos: [],
          metadata: { ogTitle: "Completely unrelated topic" },
        },
      ],
    };
    writeFileSync(tmpFile, JSON.stringify(mockData));
    try {
      const result = loadCachedMedia(tmpFile, ["DeepSeek"]);
      expect(result).toEqual([]);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("loads cached images and videos matching keywords", () => {
    const tmpFile = `/tmp/test-media-cache-${Date.now()}.json`;
    const mockData = {
      version: 1,
      entries: [
        {
          sourceUrl: "https://example.com/deepseek-article",
          scrapedAt: "2026-08-27T10:00:00Z",
          images: [{ url: "https://example.com/img1.jpg", alt: "DeepSeek V4" }],
          videos: [{ url: "https://youtube.com/embed/abc", platform: "youtube" }],
          metadata: { ogTitle: "DeepSeek V4 announced", ogImage: "https://example.com/og.jpg" },
        },
        {
          sourceUrl: "https://example.com/other-article",
          scrapedAt: "2026-08-27T11:00:00Z",
          images: [{ url: "https://example.com/other.jpg" }],
          videos: [],
          metadata: { ogTitle: "Other topic" },
        },
      ],
    };
    writeFileSync(tmpFile, JSON.stringify(mockData));
    try {
      const result = loadCachedMedia(tmpFile, ["DeepSeek"]);
      expect(result.length).toBeGreaterThan(0);
      // Should include images from the DeepSeek entry
      const images = result.filter((r) => r.type === "image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      expect(images[0].url).toBe("https://example.com/img1.jpg");
      // Should include videos from the DeepSeek entry
      const videos = result.filter((r) => r.type === "video");
      expect(videos.length).toBeGreaterThanOrEqual(1);
      expect(videos[0].url).toBe("https://youtube.com/embed/abc");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("includes og:image as an additional image candidate", () => {
    const tmpFile = `/tmp/test-media-cache-${Date.now()}.json`;
    const mockData = {
      version: 1,
      entries: [
        {
          sourceUrl: "https://example.com/deepseek-article",
          scrapedAt: "2026-08-27T10:00:00Z",
          images: [],
          videos: [],
          metadata: { ogImage: "https://example.com/og-cover.jpg", ogTitle: "DeepSeek V4" },
        },
      ],
    };
    writeFileSync(tmpFile, JSON.stringify(mockData));
    try {
      const result = loadCachedMedia(tmpFile, ["DeepSeek"]);
      const images = result.filter((r) => r.type === "image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      expect(images[0].url).toBe("https://example.com/og-cover.jpg");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("filters out logo/icon images from cache entries (SVE scenario #17)", () => {
    const tmpFile = `/tmp/test-media-cache-${Date.now()}.json`;
    const mockData = {
      version: 1,
      entries: [
        {
          sourceUrl: "https://example.com/deepseek-article",
          scrapedAt: "2026-08-27T10:00:00Z",
          images: [
            { url: "https://example.com/logo.png", alt: "logo" },
            { url: "https://example.com/content.jpg", alt: "DeepSeek V4" },
          ],
          videos: [],
          metadata: { ogTitle: "DeepSeek V4" },
        },
      ],
    };
    writeFileSync(tmpFile, JSON.stringify(mockData));
    try {
      const result = loadCachedMedia(tmpFile, ["DeepSeek"]);
      const images = result.filter((r) => r.type === "image");
      expect(images).toHaveLength(1);
      expect(images[0].url).toBe("https://example.com/content.jpg");
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe("toCachedMediaCandidate", () => {
  it("preserves image type from cached media entry", () => {
    const candidate = {
      url: "https://example.com/img.jpg",
      type: "image",
      sourceArticle: "https://example.com/article",
      sourceTitle: "DeepSeek V4",
    };
    const result = toCachedMediaCandidate(candidate);
    expect(result.type).toBe("image");
    expect(result.source).toBe("cached-media");
    expect(result.title).toBe("DeepSeek V4");
  });

  it("preserves video type from cached media entry", () => {
    const candidate = {
      url: "https://youtube.com/embed/abc",
      type: "video",
      sourceArticle: "https://example.com/article",
      sourceTitle: "DeepSeek V4",
    };
    const result = toCachedMediaCandidate(candidate);
    expect(result.type).toBe("video");
    expect(result.source).toBe("cached-media");
  });

  it("maps ogTitle to title field", () => {
    const candidate = {
      url: "https://example.com/img.jpg",
      type: "image",
      sourceArticle: "https://example.com/article",
      sourceTitle: "DeepSeek V4 announced",
    };
    const result = toCachedMediaCandidate(candidate);
    expect(result.title).toBe("DeepSeek V4 announced");
  });
});

// ─── #183: CDP video sources ───

describe("CDP_VIDEO_SOURCES", () => {
  it("derives cdp video sources from capabilities.videos", () => {
    expect(CDP_VIDEO_SOURCES.length).toBeGreaterThanOrEqual(10);
    for (const s of CDP_VIDEO_SOURCES) {
      expect(s.videoScript).toBeTruthy();
      expect(s.videoScript).toContain("iframe");
      expect(typeof s.url).toBe("function");
    }
    expect(CDP_VIDEO_SOURCES.find((s) => s.name === "qbitai")).toBeDefined();
    expect(CDP_VIDEO_SOURCES.find((s) => s.name === "ithome")).toBeDefined();
    // ytdlp sources must not leak into the CDP video list
    expect(CDP_VIDEO_SOURCES.find((s) => s.name === "bilibili")).toBeUndefined();
  });
});
