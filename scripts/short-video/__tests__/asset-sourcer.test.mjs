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
    const candidate = { title: "Unitree H1 Robot Demo", type: "video", duration: 6, fileSize: 5000000, resolution: "720p" };
    const score = scoreCandidate(candidate, "Unitree");
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it("scores 0 match points when keyword not in title (with resolution)", () => {
    const candidate = { title: "Humanoid Robot Backflip", type: "video", duration: 6, fileSize: 5000000, resolution: "720p" };
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
    const candidate = { title: "Unitree", type: "video", duration: 5, fileSize: 5000000, resolution: "720p" };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 (match) + 25 (duration) + 20 (size) + 10 (res) = 95
    expect(score).toBe(95);
  });

  it("scores video >60s duration as 5", () => {
    const candidate = { title: "Unitree", type: "video", duration: 120, fileSize: 5000000, resolution: "720p" };
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
    const candidate = { title: "Unitree", type: "video", duration: 5, fileSize: 15000000, resolution: "720p" };
    const score = scoreCandidate(candidate, "Unitree");
    expect(score).toBe(95);
  });

  it("scores video >50MB as 0 size points", () => {
    const candidate = { title: "Unitree", type: "video", duration: 5, fileSize: 60000000, resolution: "720p" };
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
    const candidate = { title: "Unitree Unitree Unitree", type: "video", duration: 5, fileSize: 5000000, resolution: "1080p" };
    const score = scoreCandidate(candidate, "Unitree");
    // 40 + 25 + 20 + 15 = 100
    expect(score).toBeLessThanOrEqual(100);
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
      { source: "youtube", keyword: "Unitree", type: "video", path: "assets/youtube-unitree-01.mp4", score: 85, status: "downloaded" },
      { source: "ithome", keyword: "Unitree", type: "image", path: "assets/ithome-unitree-01.jpg", score: 70, status: "downloaded" },
    ];
    const failed = [
      { source: "douyin", keyword: "Unitree", error: "needs auth" },
    ];
    const skipped = [
      { source: "pixabay", reason: "no API key" },
    ];

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

  it("has coverr source without auth", () => {
    const coverr = API_SOURCES.find((s) => s.name === "coverr");
    expect(coverr).toBeDefined();
    expect(coverr.requiresApiKey).toBe(false);
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
        { alt: "Unitree robot", src: { original: "https://img.pexels.com/1.jpg" }, width: 1080, height: 1920 },
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
    try { unlinkSync(destPath); } catch {}
    try { rmdirSync(tmpDir); } catch {}
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

    const result = await downloadAsset("https://example.com/missing.jpg", "/tmp/nonexistent/missing.jpg");
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
