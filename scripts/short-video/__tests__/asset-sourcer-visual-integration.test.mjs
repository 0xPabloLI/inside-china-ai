/**
 * Integration tests for AI analyzer integration into asset-sourcer.
 *
 * Ticket 04: Verify that the asset-sourcer pipeline correctly calls
 * visual-analyzer, stores results, and handles fallback.
 *
 * These tests mock the visual-analyzer module (describeImage, describeVideo,
 * closeVisualAnalyzer) and verify the integration behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock visual-analyzer module ───

const mockDescribeImage = vi.fn();
const mockDescribeVideo = vi.fn();
const mockAnalyzeFit = vi.fn();
const mockCloseAnalyzer = vi.fn();
const mockDetectFocus = vi.fn();
const mockCloseFocusDetector = vi.fn();

vi.mock("../lib/visual-analyzer.mjs", () => ({
  describeImage: (...args) => mockDescribeImage(...args),
  describeVideo: (...args) => mockDescribeVideo(...args),
  analyzeFit: (...args) => mockAnalyzeFit(...args),
  closeVisualAnalyzer: (...args) => mockCloseAnalyzer(...args),
  detectFocus: (...args) => mockDetectFocus(...args),
  closeFocusDetector: (...args) => mockCloseFocusDetector(...args),
}));

// Import after mocks
import { analyzeAssets, buildReport, scoreCandidate, assignAssetsToScenes } from "../lib/asset-sourcer.mjs";

beforeEach(() => {
  vi.clearAllMocks();
  mockDescribeImage.mockResolvedValue("A robot in a lab");
  mockDescribeVideo.mockResolvedValue("A robot walking demonstration");
  mockAnalyzeFit.mockResolvedValue({}); // default: no fit analysis (portrait assets)
  mockCloseAnalyzer.mockResolvedValue(undefined);
  mockDetectFocus.mockResolvedValue({
    status: "ok",
    errorCode: null,
    frame: null,
    protectedRegions: [],
    saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
  });
  mockCloseFocusDetector.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───

describe("analyzeAssets — AI integration", () => {
  it("calls describeImage for image assets and describeVideo for video assets", async () => {
    const assets = [
      { path: "/abs/img1.jpg", type: "image" },
      { path: "/abs/clip1.mp4", type: "video" },
    ];

    await analyzeAssets(assets);

    expect(mockDescribeImage).toHaveBeenCalledTimes(1);
    expect(mockDescribeImage).toHaveBeenCalledWith("/abs/img1.jpg");

    expect(mockDescribeVideo).toHaveBeenCalledTimes(1);
    expect(mockDescribeVideo).toHaveBeenCalledWith("/abs/clip1.mp4");
  });

  it("stores aiDescription on each asset", async () => {
    const assets = [
      { path: "/abs/img1.jpg", type: "image" },
      { path: "/abs/clip1.mp4", type: "video" },
    ];

    await analyzeAssets(assets);

    expect(assets[0].aiDescription).toBe("A robot in a lab");
    expect(assets[1].aiDescription).toBe("A robot walking demonstration");
  });

  it("returns aiAnalysis report with per-asset data", async () => {
    const assets = [
      { path: "/abs/img1.jpg", type: "image" },
      { path: "/abs/clip1.mp4", type: "video" },
    ];

    const report = await analyzeAssets(assets);

    expect(report).toHaveLength(2);
    expect(report[0]).toHaveProperty("path", "/abs/img1.jpg");
    expect(report[0]).toHaveProperty("description", "A robot in a lab");
    expect(report[0]).toHaveProperty("success", true);
    expect(report[0]).toHaveProperty("analysisTimeMs");
    expect(typeof report[0].analysisTimeMs).toBe("number");
  });

  it("does NOT call closeVisualAnalyzer (caller is responsible)", async () => {
    const assets = [{ path: "/abs/img1.jpg", type: "image" }];

    await analyzeAssets(assets);

    // analyzeAssets no longer closes the VLM process — the main function does.
    // But it DOES close the focus detector (Phase 1 lifecycle).
    expect(mockCloseAnalyzer).not.toHaveBeenCalled();
    expect(mockCloseFocusDetector).toHaveBeenCalled();
  });

  it("handles VLM unavailable gracefully — returns empty descriptions", async () => {
    mockDescribeImage.mockResolvedValue("");
    mockDescribeVideo.mockResolvedValue("");

    const assets = [
      { path: "/abs/img1.jpg", type: "image" },
      { path: "/abs/clip1.mp4", type: "video" },
    ];

    const report = await analyzeAssets(assets);

    expect(assets[0].aiDescription).toBe("");
    expect(assets[1].aiDescription).toBe("");
    expect(report[0].success).toBe(false);
    expect(report[1].success).toBe(false);
    // Pipeline did not crash, closeVisualAnalyzer not called by analyzeAssets
    expect(mockCloseAnalyzer).not.toHaveBeenCalled();
    // But closeFocusDetector IS called (Phase 1 finally block)
    expect(mockCloseFocusDetector).toHaveBeenCalled();
  });

  it("logs progress per asset", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const assets = [
      { path: "/abs/img1.jpg", type: "image" },
      { path: "/abs/clip1.mp4", type: "video" },
      { path: "/abs/img2.jpg", type: "image" },
    ];

    await analyzeAssets(assets);

    // Check progress log format
    const progressLogs = consoleSpy.mock.calls
      .map((c) => c[0])
      .filter((s) => typeof s === "string" && s.includes("Analyzing"));
    expect(progressLogs.length).toBe(3);
    // Should include index/total format
    expect(progressLogs[0]).toContain("1/3");

    consoleSpy.mockRestore();
  });

  it("handles assets without path gracefully", async () => {
    const assets = [{ type: "image" }]; // no path

    const report = await analyzeAssets(assets);

    expect(report).toHaveLength(1);
    expect(report[0].success).toBe(false);
    expect(report[0].description).toBe("");
    expect(mockDescribeImage).not.toHaveBeenCalled();
  });

  it("scoreCandidate receives aiDescription after analysis", () => {
    const candidate = {
      title: "Demo Video",
      type: "video",
      duration: 5,
      fileSize: 5000000,
      resolution: "720p",
    };

    // Without aiDescription
    const scoreWithout = scoreCandidate(candidate, "Unitree");

    // With aiDescription that mentions keyword
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
        aiDescription: "A robot demo",
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

// ─── P1-3a: focusAnalysis mapping + aiFit/aiFocus contract ───

describe("assignAssetsToScenes — focusAnalysis + aiFit/aiFocus contract (P1-3a)", () => {
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
          frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
          protectedRegions: [
            { rect: [0.1, 0.2, 0.3, 0.4], kind: "face", confidence: null, confidenceKind: "not_provided" },
          ],
          saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
        },
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches).toHaveLength(1);
    expect(patches[0].status).toBe("assigned");

    // analysis.focusAnalysis should have the complete schema
    expect(patches[0].analysis).toBeDefined();
    expect(patches[0].analysis.focusAnalysis).toBeDefined();
    expect(patches[0].analysis.focusAnalysis.status).toBe("ok");
    expect(patches[0].analysis.focusAnalysis.errorCode).toBeNull();
    expect(patches[0].analysis.focusAnalysis.frame).toBeDefined();
    expect(patches[0].analysis.focusAnalysis.protectedRegions).toHaveLength(1);
    expect(patches[0].analysis.focusAnalysis.saliency).toHaveProperty("available");
    expect(patches[0].analysis.focusAnalysis.saliency).toHaveProperty("dispersion");
    expect(patches[0].analysis.focusAnalysis.saliency).toHaveProperty("centroid");
  });

  it("writes media.fit from asset.aiFit (landscape asset)", () => {
    const assets = [
      {
        path: "/abs/wide.jpg",
        type: "image",
        score: 85,
        source: "pexels",
        aiFit: "cover",
        aiFitReason: "subject fills frame",
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].media.fit).toBe("cover");
  });

  it("does NOT write media.focus (deprecated per spec §4.8)", () => {
    const assets = [
      {
        path: "/abs/wide.jpg",
        type: "image",
        score: 85,
        source: "pexels",
        aiFit: "contain",
        aiFitReason: "UI at edges",
      },
    ];

    const patches = assignAssetsToScenes(assets, mockScenes);
    expect(patches[0].media.fit).toBe("contain");
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
