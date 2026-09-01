/**
 * Integration tests for VLM semantic merge pipeline in asset-sourcer.
 *
 * Ticket 04: Verify that the asset-sourcer pipeline correctly calls
 * analyzeAssetSemantics (single VLM call), stores results, writes
 * asset-analysis.json, and handles pre-filter + semantic scoring.
 *
 * These tests mock the visual-analyzer module (analyzeAssetSemantics,
 * detectFocus, closeVisualAnalyzer, closeFocusDetector) and verify
 * the integration behavior.
 *
 * Run with: npx vitest run scripts/short-video/__tests__/asset-sourcer-visual-integration.test.mjs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";

// ─── Mock visual-analyzer module ───

const mockAnalyzeAssetSemantics = vi.fn();
const mockCloseAnalyzer = vi.fn();
const mockDetectFocus = vi.fn();
const mockCloseFocusDetector = vi.fn();
const mockProbeMedia = vi.fn();

vi.mock("../lib/visual-analyzer.mjs", () => ({
  analyzeAssetSemantics: (...args) => mockAnalyzeAssetSemantics(...args),
  closeVisualAnalyzer: (...args) => mockCloseAnalyzer(...args),
  detectFocus: (...args) => mockDetectFocus(...args),
  closeFocusDetector: (...args) => mockCloseFocusDetector(...args),
}));

vi.mock("../lib/media-probe.mjs", () => ({
  probeMedia: (...args) => mockProbeMedia(...args),
  parseProbeOutput: vi.fn(), // not used in integration tests
}));

// Import after mocks
import {
  analyzeAssets,
  buildReport,
  scoreCandidate,
  assignAssetsToScenes,
  preFilterCandidate,
  normalizePathForPatch,
} from "../lib/asset-sourcer.mjs";

// ─── Default mock returns ───

const DEGRADED = {
  description: "",
  subjects: [],
  contentKind: null,
  fit: null,
  criticalEdgeText: null,
  reason: null,
};

const FULL_SEMANTICS = {
  description: "A humanoid robot in a kitchen.",
  subjects: ["robot", "kitchen", "product"],
  contentKind: "product_demo",
  fit: "contain",
  criticalEdgeText: "yes — bottom edge has product label text",
  reason: "Bottom edge has product label text that would be cropped.",
};

const FOCUS_OK = {
  status: "ok",
  errorCode: null,
  frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
  protectedRegions: [],
  saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS });
  mockCloseAnalyzer.mockResolvedValue(undefined);
  mockDetectFocus.mockResolvedValue({ ...FOCUS_OK });
  mockCloseFocusDetector.mockResolvedValue(undefined);
  // T6: default probeMedia returns null (no probe infrastructure)
  mockProbeMedia.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───

describe("analyzeAssets — VLM semantic merge integration", () => {
  it("calls analyzeAssetSemantics once per asset (single VLM call)", async () => {
    const assets = [
      { path: "/abs/img1.jpg", type: "image", title: "Unitree", searchKeyword: "Unitree" },
      { path: "/abs/clip1.mp4", type: "video", title: "Unitree demo", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets);

    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledTimes(2);
    // Image: called with 1 arg (no opts)
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/img1.jpg");
    // Video: called with 2 args (path + window)
    const videoCall = mockAnalyzeAssetSemantics.mock.calls.find((c) => c[0] === "/abs/clip1.mp4");
    expect(videoCall).toBeDefined();
    expect(videoCall[1]).toBeDefined();
    expect(videoCall[1].startMs).toBe(0);
    expect(videoCall[1].endMs).toBe(8000);
    expect(videoCall[1].sampleFps).toBe(1.0);
  });

  it("stores VLM fields on each asset (description, subjects, contentKind, fit, reason)", async () => {
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets);

    expect(assets[0].description).toBe("A humanoid robot in a kitchen.");
    expect(assets[0].subjects).toEqual(["robot", "kitchen", "product"]);
    expect(assets[0].contentKind).toBe("product_demo");
    expect(assets[0].fit).toBe("contain");
    expect(assets[0].criticalEdgeText).toContain("bottom edge");
    expect(assets[0].reason).toContain("cropped");
  });

  it("does NOT store old fields (aiDescription, aiFit, aiFitReason)", async () => {
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets);

    expect(assets[0].aiDescription).toBeUndefined();
    expect(assets[0].aiFit).toBeUndefined();
    expect(assets[0].aiFitReason).toBeUndefined();
  });

  // T06 fix: pre-filter (Phase 1) runs BEFORE detectFocus (Phase 2)
  it("calls detectFocus in Phase 2 (after pre-filter) and closeFocusDetector after", async () => {
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets);

    expect(mockDetectFocus).toHaveBeenCalledTimes(1);
    expect(mockDetectFocus).toHaveBeenCalledWith("/abs/img1.jpg");
    expect(mockCloseFocusDetector).toHaveBeenCalledTimes(1);
  });

  it("does NOT call closeVisualAnalyzer (caller is responsible)", async () => {
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets);

    expect(mockCloseAnalyzer).not.toHaveBeenCalled();
  });

  it("handles VLM unavailable gracefully — returns degraded semantics", async () => {
    mockAnalyzeAssetSemantics.mockResolvedValue({ ...DEGRADED });

    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    const report = await analyzeAssets(assets);

    expect(assets[0].description).toBe("");
    expect(assets[0].subjects).toEqual([]);
    expect(report[0].success).toBe(false);
  });

  it("logs progress per asset", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const assets = [
      { path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" },
      { path: "/abs/clip1.mp4", type: "video", searchKeyword: "Unitree" },
      { path: "/abs/img2.jpg", type: "image", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets);

    const progressLogs = consoleSpy.mock.calls
      .map((c) => c[0])
      .filter((s) => typeof s === "string" && s.includes("Analyzing"));
    expect(progressLogs.length).toBe(3);
    expect(progressLogs[0]).toContain("1/3");

    consoleSpy.mockRestore();
  });

  it("handles assets without path gracefully", async () => {
    const assets = [{ type: "image", searchKeyword: "Unitree" }];

    const report = await analyzeAssets(assets);

    // Assets without path are skipped — no report entry, no VLM call
    expect(report).toHaveLength(0);
    expect(mockAnalyzeAssetSemantics).not.toHaveBeenCalled();
  });

  it("handles empty assets array", async () => {
    const report = await analyzeAssets([]);

    expect(report).toEqual([]);
    expect(mockAnalyzeAssetSemantics).not.toHaveBeenCalled();
  });

  // T06 fix: pre-filter (Phase 1) runs BEFORE detectFocus (Phase 2)
  // lowConfidence assets should NOT be sent to detectFocus at all
  it("pre-filters low-confidence assets — skips BOTH detectFocus AND VLM (T06)", async () => {
    const assets = [
      {
        path: "/abs/good.jpg",
        type: "image",
        title: "Unitree Robot Demo",
        searchKeyword: "Unitree",
        fileSize: 3_000_000,
        resolution: "1080p",
      },
      {
        path: "/abs/bad.jpg",
        type: "video",
        title: "unrelated content",
        searchKeyword: "Unitree",
        fileSize: 100_000_000,
        duration: 120,
      },
    ];

    await analyzeAssets(assets);

    // Only good asset should be analyzed by VLM
    // bad asset: titleScore=0, durationScore=3 (>60s), sizeScore=0 (>50M), resScore=0 = 3 < 30
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/good.jpg");

    // T06: detectFocus should only be called for the GOOD asset (survived pre-filter)
    // NOT for the bad asset (lowConfidence → skipped before Phase 2)
    expect(mockDetectFocus).toHaveBeenCalledTimes(1);
    expect(mockDetectFocus).toHaveBeenCalledWith("/abs/good.jpg");
  });

  it("returns aiAnalysis report with per-asset data", async () => {
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    const report = await analyzeAssets(assets);

    expect(report).toHaveLength(1);
    expect(report[0]).toHaveProperty("path", "/abs/img1.jpg");
    expect(report[0]).toHaveProperty("description", "A humanoid robot in a kitchen.");
    expect(report[0]).toHaveProperty("success", true);
    expect(report[0]).toHaveProperty("analysisTimeMs");
    expect(typeof report[0].analysisTimeMs).toBe("number");
  });

  it("writes asset-analysis.json artifact", async () => {
    const tmpDir = join(process.cwd(), "tmp-test-output-" + Date.now());
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets, { outputDir: tmpDir });

    // Check that asset-analysis.json was written
    const artifactPath = join(tmpDir, "asset-analysis.json");
    const { existsSync: exists } = await import("fs");
    expect(exists(artifactPath)).toBe(true);

    // Verify artifact structure
    const { readFileSync: readFile } = await import("fs");
    const written = JSON.parse(readFile(artifactPath, "utf8"));
    expect(written.version).toBe(1);
    expect(written.model).toBeDefined();
    expect(written.analyzedAt).toBeDefined();
    expect(Array.isArray(written.assets)).toBe(true);
    expect(written.assets).toHaveLength(1);
    expect(written.assets[0].path).toBe("/abs/img1.jpg");
    expect(written.assets[0].description).toBe("A humanoid robot in a kitchen.");
    expect(written.assets[0].subjects).toEqual(["robot", "kitchen", "product"]);

    // Cleanup
    const { rmSync: rm } = await import("fs");
    try {
      rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("scoreCandidate receives VLM description + subjects after analysis", () => {
    const candidate = {
      title: "Demo Video",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };

    // Without VLM data
    const scoreWithout = scoreCandidate(candidate, "Unitree");

    // With VLM description that mentions keyword
    const scoreWith = scoreCandidate(
      candidate,
      "Unitree",
      "A Unitree humanoid robot walking in a lab",
    );

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it("buildReport includes aiAnalysis section when provided", () => {
    const assets = [
      {
        source: "youtube",
        type: "video",
        path: "assets/clip.mp4",
        score: 85,
        status: "downloaded",
        description: "A robot demo",
        subjects: ["robot"],
        contentKind: "product_demo",
      },
    ];
    const aiAnalysis = [
      {
        path: "assets/clip.mp4",
        description: "A robot demo",
        success: true,
        analysisTimeMs: 120,
      },
    ];

    const report = buildReport("test", ["Unitree"], assets, [], [], { aiAnalysis });

    expect(report.aiAnalysis).toBeDefined();
    expect(report.aiAnalysis).toHaveLength(1);
    expect(report.aiAnalysis[0].description).toBe("A robot demo");
  });
});

// ─── assignAssetsToScenes — contentKind + video fit guard ───

describe("assignAssetsToScenes — contentKind + video fit guard", () => {
  const mockScenes = [
    { id: 1, visualType: "narrative", voiceover: "test" },
    { id: 2, visualType: "narrative", voiceover: "test" },
  ];

  it("maps asset.focusAnalysis to analysis.focusAnalysis with complete schema", () => {
    const assets = [
      {
        path: "/abs/img1.jpg",
        type: "image",
        score: 90,
        source: "pexels",
        focusAnalysis: {
          status: "ok",
          errorCode: null,
          frame: {
            width: 1920,
            height: 1080,
            orientation: "landscape",
            orientationNormalized: true,
          },
          protectedRegions: [
            {
              rect: [0.1, 0.2, 0.3, 0.4],
              kind: "face",
              confidence: null,
              confidenceKind: "not_provided",
            },
          ],
          saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
        },
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches).toHaveLength(1);
    expect(patches[0].status).toBe("assigned");

    expect(patches[0].analysis).toBeDefined();
    expect(patches[0].analysis.focusAnalysis).toBeDefined();
    expect(patches[0].analysis.focusAnalysis.status).toBe("ok");
    expect(patches[0].analysis.focusAnalysis.protectedRegions).toHaveLength(1);
  });

  it("writes media.fit from asset.fit (landscape asset)", () => {
    const assets = [
      {
        path: "/abs/wide.jpg",
        type: "image",
        score: 85,
        source: "pexels",
        fit: "cover",
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].media.fit).toBe("cover");
  });

  it("does NOT write media.fit for video assets (video fit guard)", () => {
    const assets = [
      {
        path: "/abs/clip.mp4",
        type: "video",
        score: 85,
        source: "pexels",
        fit: "cover",
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].media.fit).toBeUndefined();
  });

  it("does NOT write media.focus (deprecated per spec §4.8)", () => {
    const assets = [
      {
        path: "/abs/wide.jpg",
        type: "image",
        score: 85,
        source: "pexels",
        fit: "contain",
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].media.focus).toBeUndefined();
  });

  it("omits analysis when asset has no focusAnalysis", () => {
    const assets = [
      {
        path: "/abs/img1.jpg",
        type: "image",
        score: 90,
        source: "pexels",
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].analysis).toBeUndefined();
  });
});

// ─── Ticket 01: Path isolation — relative path preservation (P0) ───
// Scenario Matrix rows: #1, #2, #3

describe("Ticket 01 — Path isolation (relative path preservation)", () => {
  // Scenario #1: Asset with relative path → analyzeAssets with contentDir
  //   VLM/Focus receives join(contentDir, 'assets/img.jpg'); asset.path stays 'assets/img.jpg'
  it("keeps asset.path relative when contentDir is provided (Scenario #1)", async () => {
    const assets = [{ path: "assets/img.jpg", type: "image", searchKeyword: "Unitree" }];
    const contentDir = "/content/unitree";

    await analyzeAssets(assets, { contentDir });

    // asset.path should still be the relative path — NOT mutated to absolute
    expect(assets[0].path).toBe("assets/img.jpg");

    // VLM should have been called with the resolved absolute path
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/content/unitree/assets/img.jpg");
  });

  // Scenario #1 (focus detection part): detectFocus also gets absolute path
  it("passes resolved absolute path to detectFocus (Scenario #1)", async () => {
    const assets = [{ path: "assets/clip.mp4", type: "video", searchKeyword: "Unitree" }];
    const contentDir = "/content/demo";

    await analyzeAssets(assets, { contentDir });

    expect(mockDetectFocus).toHaveBeenCalledWith("/content/demo/assets/clip.mp4");
  });

  // Scenario #2: assignAssetsToScenes with relative-path assets → media.path is relative
  it("produces media.path relative in assignAssetsToScenes (Scenario #2)", () => {
    const scenes = [{ id: 1, visualType: "narrative", voiceover: "test" }];
    const assets = [
      {
        path: "assets/img.jpg",
        type: "image",
        score: 85,
        source: "pexels",
      },
    ];

    const patches = assignAssetsToScenes(assets, scenes);
    expect(patches[0].status).toBe("assigned");
    expect(patches[0].media.path).toBe("assets/img.jpg");
  });

  // Scenario #2 (multi-asset): all media.path values are relative
  it("all media.path values are relative in multi-asset patch (Scenario #2)", () => {
    const scenes = [
      { id: 1, visualType: "narrative", voiceover: "a" },
      { id: 2, visualType: "narrative", voiceover: "b" },
    ];
    const assets = [
      { path: "assets/img1.jpg", type: "image", score: 90, source: "pexels" },
      { path: "assets/img2.jpg", type: "image", score: 80, source: "unsplash" },
    ];

    const patches = assignAssetsToScenes(assets, scenes);
    const assigned = patches.filter((p) => p.status === "assigned");
    expect(assigned).toHaveLength(2);
    for (const p of assigned) {
      expect(p.media.path).toMatch(/^(assets\/|\.\/)/);
      expect(p.media.path).not.toMatch(/^\//);
    }
  });

  // Scenario #3: Absolute path that escapes contentDir → throws
  it("throws on path escape (absolute path outside contentDir) (Scenario #3)", () => {
    expect(() => {
      normalizePathForPatch("/etc/passwd", "/content/unitree");
    }).toThrow();
  });

  // Scenario #3 (positive): absolute path inside contentDir → normalized to relative
  it("normalizes absolute path inside contentDir to relative (Scenario #3)", () => {
    const result = normalizePathForPatch("/content/unitree/assets/img.jpg", "/content/unitree");
    expect(result).toBe("assets/img.jpg");
  });

  // Scenario #2 (defensive normalization): already-relative path passes through
  it("passes through already-relative path unchanged (defensive)", () => {
    const result = normalizePathForPatch("assets/img.jpg", "/content/unitree");
    expect(result).toBe("assets/img.jpg");
  });
});

// ─── Ticket 03: Artifact isolation by content slug (P1-3) ───
// Scenario Matrix rows: #11, #12, #13, #14, #15, #16

describe("Ticket 03 — Artifact isolation by content slug", () => {
  // Scenario #12: asset-analysis.json written to output/{contentSlug}/
  it("writes asset-analysis.json to output/{contentSlug}/ (Scenario #12)", async () => {
    const tmpBase = join(process.cwd(), "tmp-test-slug-" + Date.now());
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets, { outputDir: tmpBase, contentSlug: "test-content" });

    const artifactPath = join(tmpBase, "test-content", "asset-analysis.json");
    const { existsSync: exists } = await import("fs");
    expect(exists(artifactPath)).toBe(true);

    // Cleanup
    const { rmSync: rm } = await import("fs");
    try {
      rm(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  // Scenario #13: media-patch.json also goes to output/{contentSlug}/ (checked via main path logic)
  // (media-patch.json path is constructed in main(), tested via integration)
  // For unit test: verify artifact path uses contentSlug subdirectory
  it("does NOT write to flat output/ when contentSlug is provided (Scenario #13)", async () => {
    const tmpBase = join(process.cwd(), "tmp-test-slug2-" + Date.now());
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets, { outputDir: tmpBase, contentSlug: "my-content" });

    const { existsSync: exists } = await import("fs");
    // Should NOT exist at flat level
    expect(exists(join(tmpBase, "asset-analysis.json"))).toBe(false);
    // Should exist under contentSlug subdirectory
    expect(exists(join(tmpBase, "my-content", "asset-analysis.json"))).toBe(true);

    const { rmSync: rm } = await import("fs");
    try {
      rm(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  // Scenario #14: re-run same content slug overwrites (acceptable)
  it("overwrites on re-run same content slug (Scenario #14)", async () => {
    const tmpBase = join(process.cwd(), "tmp-test-slug3-" + Date.now());
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    // First run
    await analyzeAssets(assets, { outputDir: tmpBase, contentSlug: "rerun-test" });

    // Second run (overwrite)
    await analyzeAssets(assets, { outputDir: tmpBase, contentSlug: "rerun-test" });

    const { existsSync: exists, readFileSync: readFile } = await import("fs");
    const artifactPath = join(tmpBase, "rerun-test", "asset-analysis.json");
    expect(exists(artifactPath)).toBe(true);

    // Should be valid JSON (not corrupted by overwrite)
    const written = JSON.parse(readFile(artifactPath, "utf8"));
    expect(written.version).toBe(1);

    const { rmSync: rm } = await import("fs");
    try {
      rm(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  // Scenario #15: different content slugs produce different directories
  it("different contentSlugs produce different directories (Scenario #15)", async () => {
    const tmpBase = join(process.cwd(), "tmp-test-slug4-" + Date.now());
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets, { outputDir: tmpBase, contentSlug: "content-a" });
    await analyzeAssets(assets, { outputDir: tmpBase, contentSlug: "content-b" });

    const { existsSync: exists } = await import("fs");
    expect(exists(join(tmpBase, "content-a", "asset-analysis.json"))).toBe(true);
    expect(exists(join(tmpBase, "content-b", "asset-analysis.json"))).toBe(true);

    const { rmSync: rm } = await import("fs");
    try {
      rm(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  // Backward compat: no contentSlug → write to flat outputDir
  it("writes to flat outputDir when no contentSlug (backward compat)", async () => {
    const tmpBase = join(process.cwd(), "tmp-test-slug5-" + Date.now());
    const assets = [{ path: "/abs/img1.jpg", type: "image", searchKeyword: "Unitree" }];

    await analyzeAssets(assets, { outputDir: tmpBase });

    const { existsSync: exists } = await import("fs");
    expect(exists(join(tmpBase, "asset-analysis.json"))).toBe(true);

    const { rmSync: rm } = await import("fs");
    try {
      rm(tmpBase, { recursive: true, force: true });
    } catch {}
  });
});

// ─── Ticket 03: Pre-filter is hard gate (P1-2) ───
// Scenario Matrix row: #11

describe("Ticket 03 — Pre-filter is hard gate (P1-2)", () => {
  // Scenario #11: lowConfidence = true asset is hard-skipped from VLM analysis
  // T06: lowConfidence asset also skips detectFocus (Phase 2)
  it("hard-skips lowConfidence assets from VLM AND detectFocus (Scenario #11, T06)", async () => {
    const assets = [
      {
        path: "/abs/good.jpg",
        type: "image",
        title: "Unitree Robot Demo",
        searchKeyword: "Unitree",
        fileSize: 3_000_000,
        resolution: "1080p",
      },
      {
        path: "/abs/bad.jpg",
        type: "video",
        title: "unrelated",
        searchKeyword: "Unitree",
        fileSize: 100_000_000,
        duration: 120,
      },
    ];

    await analyzeAssets(assets);

    // Good asset analyzed, bad asset skipped
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/good.jpg");

    // T06: detectFocus only called for good asset, NOT for bad asset
    expect(mockDetectFocus).toHaveBeenCalledTimes(1);
    expect(mockDetectFocus).toHaveBeenCalledWith("/abs/good.jpg");

    // Bad asset should have lowConfidence = true
    expect(assets[1].lowConfidence).toBe(true);
    // Bad asset should NOT have VLM fields set
    expect(assets[1].description).toBeUndefined();
    // T06: Bad asset should NOT have focusAnalysis set
    expect(assets[1].focusAnalysis).toBeUndefined();
  });

  // T06 Scenario #12: ALL assets are lowConfidence → detectFocus + VLM not called at all
  it("skips detectFocus and VLM entirely when all assets are lowConfidence (Scenario #12)", async () => {
    const assets = [
      {
        path: "/abs/bad1.jpg",
        type: "video",
        title: "unrelated",
        searchKeyword: "Unitree",
        fileSize: 100_000_000,
        duration: 120,
      },
      {
        path: "/abs/bad2.jpg",
        type: "video",
        title: "another bad",
        searchKeyword: "Unitree",
        fileSize: 80_000_000,
        duration: 200,
      },
    ];

    await analyzeAssets(assets);

    // No detectFocus calls at all
    expect(mockDetectFocus).not.toHaveBeenCalled();
    expect(mockCloseFocusDetector).not.toHaveBeenCalled();
    // No VLM calls at all
    expect(mockAnalyzeAssetSemantics).not.toHaveBeenCalled();
    // All assets marked lowConfidence
    expect(assets[0].lowConfidence).toBe(true);
    expect(assets[1].lowConfidence).toBe(true);
  });
});

// ─── Phase 3b: Crop Decision integration ───

describe("analyzeAssets — Phase 3b crop decision", () => {
  const FOCUS_LANDSCAPE_OK = {
    status: "ok",
    errorCode: null,
    frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
    protectedRegions: [],
    saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
  };

  const FOCUS_LANDSCAPE_FACE = {
    status: "ok",
    errorCode: null,
    frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
    protectedRegions: [
      {
        rect: [0.1, 0.4, 0.15, 0.3],
        kind: "face",
        confidence: null,
        confidenceKind: "not_provided",
      },
    ],
    saliency: { available: true, dispersion: 0.05, centroid: [0.2, 0.5] },
  };

  const FOCUS_PORTRAIT = {
    status: "ok",
    errorCode: null,
    frame: { width: 1080, height: 1920, orientation: "portrait", orientationNormalized: true },
    protectedRegions: [],
    saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
  };

  it("VC-01: landscape image with no protected regions → safe crop, cropFocus set", async () => {
    mockDetectFocus.mockResolvedValue({ ...FOCUS_LANDSCAPE_OK });
    mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS, fit: "cover" });

    const assets = [{ path: "/abs/wide.jpg", type: "image", searchKeyword: "test" }];
    await analyzeAssets(assets);

    expect(assets[0].cropDecision).toBeDefined();
    expect(assets[0].cropDecision.status).toBe("safe");
    expect(assets[0].cropFocus).toEqual({ x: 0.5, y: 0.5 });
    expect(assets[0].fit).toBe("cover");
  });

  it("VC-02: landscape image with face → crop focus shifted", async () => {
    mockDetectFocus.mockResolvedValue({ ...FOCUS_LANDSCAPE_FACE });
    mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS, fit: "cover" });

    const assets = [{ path: "/abs/face.jpg", type: "image", searchKeyword: "test" }];
    await analyzeAssets(assets);

    expect(assets[0].cropDecision).toBeDefined();
    expect(assets[0].cropDecision.status).toBe("safe");
    expect(assets[0].cropFocus).toBeDefined();
    expect(assets[0].cropFocus.x).toBeLessThan(0.5);
  });

  it("VC-03: landscape image with wide content → unsafe, fit=contain", async () => {
    const focusWide = {
      ...FOCUS_LANDSCAPE_OK,
      protectedRegions: [
        {
          rect: [0.0, 0.4, 0.1, 0.3],
          kind: "face",
          confidence: null,
          confidenceKind: "not_provided",
        },
        {
          rect: [0.9, 0.4, 0.1, 0.3],
          kind: "face",
          confidence: null,
          confidenceKind: "not_provided",
        },
      ],
    };
    mockDetectFocus.mockResolvedValue(focusWide);
    mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS, fit: "cover" });

    const assets = [{ path: "/abs/wide.jpg", type: "image", searchKeyword: "test" }];
    await analyzeAssets(assets);

    expect(assets[0].cropDecision.status).toBe("unsafe");
    expect(assets[0].cropFocus).toBeUndefined();
    expect(assets[0].fit).toBe("contain");
  });

  it("VC-04: degraded focus (no saliency, no protected) → indeterminate, no cropFocus", async () => {
    const focusDegraded = {
      status: "degraded",
      errorCode: "focus_dependency_not_available",
      frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
      protectedRegions: [],
      saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
    };
    mockDetectFocus.mockResolvedValue(focusDegraded);
    mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS, fit: "cover" });

    const assets = [{ path: "/abs/degraded.jpg", type: "image", searchKeyword: "test" }];
    await analyzeAssets(assets);

    expect(assets[0].cropDecision.status).toBe("indeterminate");
    expect(assets[0].cropFocus).toBeUndefined();
  });

  it("portrait image → no crop decision (source not wider than target)", async () => {
    mockDetectFocus.mockResolvedValue({ ...FOCUS_PORTRAIT });

    const assets = [{ path: "/abs/portrait.jpg", type: "image", searchKeyword: "test" }];
    await analyzeAssets(assets);

    expect(assets[0].cropDecision).toBeUndefined();
    expect(assets[0].cropFocus).toBeUndefined();
  });

  it("VLM says contain → crop decision still runs but does not override to cover", async () => {
    mockDetectFocus.mockResolvedValue({ ...FOCUS_LANDSCAPE_OK });
    mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS, fit: "contain" });

    const assets = [{ path: "/abs/wide.jpg", type: "image", searchKeyword: "test" }];
    await analyzeAssets(assets);

    // Crop decision should be safe (no protected regions)
    expect(assets[0].cropDecision.status).toBe("safe");
    expect(assets[0].cropFocus).toBeDefined();
    // But VLM's "contain" should NOT be overridden to "cover"
    expect(assets[0].fit).toBe("contain");
  });

  it("video asset → no crop decision", async () => {
    mockDetectFocus.mockResolvedValue({ ...FOCUS_LANDSCAPE_OK });

    const assets = [{ path: "/abs/clip.mp4", type: "video", searchKeyword: "test" }];
    await analyzeAssets(assets);

    expect(assets[0].cropDecision).toBeUndefined();
    expect(assets[0].cropFocus).toBeUndefined();
  });

  it("writes cropDecision to asset-analysis.json artifact", async () => {
    mockDetectFocus.mockResolvedValue({ ...FOCUS_LANDSCAPE_OK });
    mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS, fit: "cover" });

    const tmpDir = `/tmp/test-crop-artifact-${Date.now()}`;
    const assets = [{ path: "/abs/wide.jpg", type: "image", searchKeyword: "test" }];
    await analyzeAssets(assets, { outputDir: tmpDir, contentSlug: "test" });

    const fs = await import("fs");
    const artifactPath = `${tmpDir}/test/asset-analysis.json`;
    expect(fs.existsSync(artifactPath)).toBe(true);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    expect(artifact.assets[0].cropDecision).toBeDefined();
    expect(artifact.assets[0].cropDecision.status).toBe("safe");
    expect(artifact.assets[0].cropFocus).toEqual({ x: 0.5, y: 0.5 });

    // Cleanup
    fs.rmSync(`${tmpDir}/test`, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── assignAssetsToScenes — cropFocus in patch ───

describe("assignAssetsToScenes — cropFocus in patch output", () => {
  const mockScenes = [{ id: 1, visualType: "narrative", voiceover: "test" }];

  it("includes cropFocus in media object when asset has cropFocus", () => {
    const assets = [
      {
        path: "/abs/wide.jpg",
        type: "image",
        score: 90,
        source: "pexels",
        fit: "cover",
        cropFocus: { x: 0.3, y: 0.5 },
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].media.cropFocus).toEqual({ x: 0.3, y: 0.5 });
  });

  it("does NOT include cropFocus when asset has none", () => {
    const assets = [
      {
        path: "/abs/wide.jpg",
        type: "image",
        score: 90,
        source: "pexels",
        fit: "cover",
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].media.cropFocus).toBeUndefined();
  });
});

describe("analyzeAssets — Phase 2.5 probe + window (T6)", () => {
  it("calls probeMedia for video assets only (not images)", async () => {
    const assets = [
      { path: "/abs/img1.jpg", type: "image", title: "Unitree", searchKeyword: "Unitree" },
      { path: "/abs/clip1.mp4", type: "video", title: "Unitree demo", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets);

    // probeMedia called only for the video asset
    expect(mockProbeMedia).toHaveBeenCalledTimes(1);
    expect(mockProbeMedia).toHaveBeenCalledWith("/abs/clip1.mp4");
  });

  it("passes computed window to analyzeAssetSemantics for video assets (Scenario #1)", async () => {
    // probeMedia returns 10s duration
    mockProbeMedia.mockReturnValue({
      durationMs: 10000,
      fps: 30,
      hasAudio: true,
      width: 1920,
      height: 1080,
      rotation: 0,
    });

    const assets = [
      { path: "/abs/clip1.mp4", type: "video", title: "Unitree demo", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets);

    // Window = { 0, min(10000, 8000), 1.0 }
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/clip1.mp4", {
      startMs: 0,
      endMs: 8000,
      sampleFps: 1.0,
    });
  });

  it("uses default window when probeMedia returns null (Scenario #2)", async () => {
    // probeMedia returns null (corrupt file or ffprobe missing)
    mockProbeMedia.mockReturnValue(null);

    const assets = [
      { path: "/abs/clip1.mp4", type: "video", title: "Unitree demo", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets);

    // Default window: { 0, 8000, 1.0 }
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/clip1.mp4", {
      startMs: 0,
      endMs: 8000,
      sampleFps: 1.0,
    });
  });

  it("does NOT pass window for image assets (Scenario #3)", async () => {
    const assets = [
      { path: "/abs/img1.jpg", type: "image", title: "Unitree", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets);

    // Image: called without opts (backward compat)
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledTimes(1);
    const callArgs = mockAnalyzeAssetSemantics.mock.calls[0];
    expect(callArgs[0]).toBe("/abs/img1.jpg");
    // Second arg (opts) should be undefined
    expect(callArgs[1]).toBeUndefined();
  });

  it("caps window at 8s for long videos", async () => {
    mockProbeMedia.mockReturnValue({
      durationMs: 60000,
      fps: 30,
      hasAudio: true,
      width: 1920,
      height: 1080,
      rotation: 0,
    });

    const assets = [
      { path: "/abs/long.mp4", type: "video", title: "test demo", searchKeyword: "test" },
    ];

    await analyzeAssets(assets);

    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/long.mp4", {
      startMs: 0,
      endMs: 8000,
      sampleFps: 1.0,
    });
  });

  it("uses full duration for very short videos (Scenario #5)", async () => {
    mockProbeMedia.mockReturnValue({
      durationMs: 500,
      fps: 30,
      hasAudio: false,
      width: 640,
      height: 480,
      rotation: 0,
    });

    const assets = [
      { path: "/abs/short.mp4", type: "video", title: "test clip", searchKeyword: "test" },
    ];

    await analyzeAssets(assets);

    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/short.mp4", {
      startMs: 0,
      endMs: 500,
      sampleFps: 1.0,
    });
  });

  it("stores window and sourceMode on video assets", async () => {
    mockProbeMedia.mockReturnValue({
      durationMs: 10000,
      fps: 30,
      hasAudio: true,
      width: 1920,
      height: 1080,
      rotation: 0,
    });

    mockAnalyzeAssetSemantics.mockResolvedValue({
      ...FULL_SEMANTICS,
      sourceMode: "frames",
    });

    const assets = [
      { path: "/abs/clip1.mp4", type: "video", title: "Unitree demo", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets);

    // Asset should have window and sourceMode stored
    expect(assets[0].window).toEqual({ startMs: 0, endMs: 8000, sampleFps: 1.0 });
    expect(assets[0].sourceMode).toBe("frames");
  });

  it("writes window and sourceMode to asset-analysis.json artifact", async () => {
    mockProbeMedia.mockReturnValue({
      durationMs: 10000,
      fps: 30,
      hasAudio: true,
      width: 1920,
      height: 1080,
      rotation: 0,
    });

    mockAnalyzeAssetSemantics.mockResolvedValue({
      ...FULL_SEMANTICS,
      sourceMode: "frames",
    });

    const tmpDir = `/tmp/test-t6-artifact-${Date.now()}`;
    const assets = [
      { path: "/abs/clip1.mp4", type: "video", title: "Unitree demo", searchKeyword: "Unitree" },
    ];

    await analyzeAssets(assets, { outputDir: tmpDir, contentSlug: "test" });

    // Read the artifact
    const fs = await import("fs");
    const artifactPath = `${tmpDir}/test/asset-analysis.json`;
    expect(fs.existsSync(artifactPath)).toBe(true);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    // The video asset should have window and sourceMode in the artifact
    const videoAsset = artifact.assets[0];
    expect(videoAsset.window).toEqual({ startMs: 0, endMs: 8000, sampleFps: 1.0 });
    expect(videoAsset.sourceMode).toBe("frames");

    // Cleanup
    fs.unlinkSync(artifactPath);
    fs.rmdirSync(`${tmpDir}/test`);
    fs.rmdirSync(tmpDir);
  });
});
