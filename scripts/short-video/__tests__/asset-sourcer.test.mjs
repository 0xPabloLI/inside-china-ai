/**
 * Asset Sourcer Tests — AS-1 through AS-5
 *
 * TDD: Tests written first (red), implementation second (green).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unlinkSync, rmdirSync } from "fs";

import {
  extractKeywords,
  scoreCandidate,
  recommendScene,
  buildFilename,
  slugifyKeyword,
  buildReport,
  API_SOURCES,
  YTDLP_SOURCES,
  CDP_SOURCES,
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
} from "../lib/asset-sourcer.mjs";

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
  it("scores exact keyword match in title as 40", () => {
    const candidate = {
      title: "Unitree H1 Robot Demo",
      type: "video",
      duration: 6,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    expect(score).toBeGreaterThanOrEqual(40);
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
    // No "Unitree" in title → 0 match points, but duration+size+resolution add up
    // 0 (match) + 25 (duration) + 20 (size) + 10 (res) = 55
    expect(score).toBe(55);
  });

  it("scores 0 match points when keyword not in title (no resolution)", () => {
    const candidate = { title: "Cooking Tutorial", type: "video", duration: 6, fileSize: 5000000 };
    const score = scoreCandidate(candidate, "Unitree");
    // keyword not in title, but duration/size may add points
    // match portion should be 0
    expect(score).toBeLessThanOrEqual(60); // 25+20+15 max from other dims
  });

  it("scores video 3-8s duration as 25", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 (match) + 25 (duration) + 20 (size) + 10 (res) = 95
    expect(score).toBe(95);
  });

  it("scores video >60s duration as 5", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 120,
      fileSize: 5000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 + 5 + 20 + 10 = 75
    expect(score).toBe(75);
  });

  it("scores image as 20 duration points (fixed)", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000, resolution: "1080p" };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 + 20 + 20 + 15 = 95
    expect(score).toBe(95);
  });

  it("scores video <20MB as 20 size points", () => {
    const candidate = {
      title: "Unitree",
      type: "video",
      duration: 5,
      fileSize: 15000000,
      resolution: "720p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    expect(score).toBe(95);
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
    // 40 + 25 + 0 + 10 = 75
    expect(score).toBe(75);
  });

  it("scores resolution >=1080p as 15", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000, resolution: "1080p" };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 + 20 + 20 + 15 = 95
    expect(score).toBe(95);
  });

  it("scores unknown resolution as 0", () => {
    const candidate = { title: "Unitree", type: "image", fileSize: 2000000 };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 + 20 + 20 + 0 = 80
    expect(score).toBe(80);
  });

  it("caps score at 100", () => {
    const candidate = {
      title: "Unitree Unitree Unitree",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "1080p",
    };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 + 25 + 20 + 15 = 100
    expect(score).toBeLessThanOrEqual(100);
  });

  // ─── AI description scoring (Ticket 03) ───

  it("adds content score when aiDescription is present and matches keyword", () => {
    const candidate = {
      title: "Humanoid Robot",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    // Without aiDescription: 0 (match) + 25 + 20 + 10 = 55
    const scoreNoAI = scoreCandidate(candidate, "Unitree");
    expect(scoreNoAI).toBe(55);

    // With aiDescription that mentions "Unitree" → should score higher
    const scoreWithAI = scoreCandidate(
      candidate,
      "Unitree",
      "A Unitree humanoid robot walking in a lab",
    );
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
    // Base score: 40 (match) + 25 (dur) + 20 (size) + 15 (res) = 100
    // Even with a matching aiDescription, total should not exceed 100
    const score = scoreCandidate(
      candidate,
      "Unitree",
      "Unitree robot Unitree humanoid Unitree demo Unitree lab",
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it("content score from aiDescription is additive to keyword match", () => {
    const candidate = {
      title: "Unitree Robot",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };
    // Base: 40 (match) + 25 (dur) + 20 (size) + 10 (res) = 95
    const scoreNoAI = scoreCandidate(candidate, "Unitree");
    expect(scoreNoAI).toBe(95);

    // With matching aiDescription → adds content points, capped at 100
    const scoreWithAI = scoreCandidate(
      candidate,
      "Unitree",
      "Unitree humanoid robot walking in lab",
    );
    expect(scoreWithAI).toBe(100); // 95 + 5 min → capped at 100
  });

  it("handles aiDescription with multiple keyword matches", () => {
    const candidate = {
      title: "Demo Video",
      type: "image",
      fileSize: 2000000,
      resolution: "1080p",
    };
    // Base: 0 (match) + 20 (image) + 20 (size) + 15 (res) = 55
    const scoreNoAI = scoreCandidate(candidate, "Unitree");
    expect(scoreNoAI).toBe(55);

    // aiDescription with multiple keyword-relevant words
    const scoreWithAI = scoreCandidate(
      candidate,
      "Unitree",
      "Unitree H1 humanoid robot performing a walking demonstration in a tech lab",
    );
    expect(scoreWithAI).toBeGreaterThan(scoreNoAI);
    // Should have "unitree" matching → content score > 0
    expect(scoreWithAI).toBeLessThanOrEqual(85); // 55 + up to 30
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

  it("returns null for hook scene", () => {
    const scenes = [{ visualType: "hook", id: 1 }];
    const asset = { type: "video" };
    const rec = recommendScene(asset, scenes);
    expect(rec).toBeNull();
  });

  it("returns null for cta scene", () => {
    const scenes = [{ visualType: "cta", id: 10 }];
    const asset = { type: "video" };
    const rec = recommendScene(asset, scenes);
    expect(rec).toBeNull();
  });

  it("returns null when no suitable scenes exist", () => {
    const scenes = [
      { visualType: "hook", id: 1 },
      { visualType: "cta", id: 2 },
    ];
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
  it("has youtube source", () => {
    const yt = YTDLP_SOURCES.find((s) => s.name === "youtube");
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
});

// ─── AS-3: searchYtdlp ───

describe("searchYtdlp", () => {
  it("is a function that can be called", () => {
    // execSync can't be easily mocked in ESM without vitest config,
    // so we verify the function exists and is callable
    expect(typeof searchYtdlp).toBe("function");
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
    expect(typeof ithome.primaryScript).toBe("string");
    expect(ithome.primaryScript).toContain("return results");
    expect(typeof ithome.fallbackScript).toBe("string");
    expect(ithome.fallbackScript).toContain("img");
  });

  it("has jiqizhixin source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "jiqizhixin");
    expect(src).toBeDefined();
    expect(src.url("DeepSeek")).toContain("jiqizhixin.com");
    expect(src.primaryScript).toContain("return results");
  });

  it("has xinhua source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "xinhua");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("news.cn");
    expect(src.primaryScript).toContain("return results");
  });

  it("has thepaper source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "thepaper");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("thepaper.cn");
    expect(src.primaryScript).toContain("return results");
  });

  it("all CDP sources have fallbackScript", () => {
    for (const src of CDP_SOURCES) {
      expect(typeof src.fallbackScript).toBe("string");
      expect(src.fallbackScript).toContain("img[src]");
      expect(src.fallbackScript).toContain("naturalWidth");
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

  it("has attribution for xiaohongshu", () => {
    expect(SOURCE_ATTRIBUTIONS.xiaohongshu).toBeDefined();
  });

  it("has attribution for weibo", () => {
    expect(SOURCE_ATTRIBUTIONS.weibo).toBeDefined();
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

describe("YTDLP_SOURCES new additions", () => {
  it("has douyin source", () => {
    const src = YTDLP_SOURCES.find((s) => s.name === "douyin");
    expect(src).toBeDefined();
    expect(src.platform).toBe("douyin");
    expect(src.cookieRequired).toBe(true);
  });

  it("has xiaohongshu source", () => {
    const src = YTDLP_SOURCES.find((s) => s.name === "xiaohongshu");
    expect(src).toBeDefined();
    expect(src.platform).toBe("xiaohongshu");
    expect(src.cookieRequired).toBe(true);
  });

  it("has weibo source", () => {
    const src = YTDLP_SOURCES.find((s) => s.name === "weibo");
    expect(src).toBeDefined();
    expect(src.platform).toBe("weibo");
    expect(src.cookieRequired).toBe(true);
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
    expect(src.primaryScript).toContain("return results");
  });

  it("has bing_news source", () => {
    const src = CDP_SOURCES.find((s) => s.name === "bing_news");
    expect(src).toBeDefined();
    expect(src.url("AI")).toContain("bing.com");
    expect(src.primaryScript).toContain("return results");
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

  // #13: Scene with visualType "hook" → skipped
  it("skips scenes with visualType in NO_MEDIA_TYPES", () => {
    const scenes = [makeScene(1, "hook"), makeScene(2, "narrative")];
    const assets = [makeAsset("a1.mp4", "video", 90)];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.filter((r) => r.status === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].sceneId).toBe(2); // scene 1 (hook) skipped
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
});
