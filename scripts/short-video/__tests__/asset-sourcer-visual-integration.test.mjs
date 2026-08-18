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

vi.mock("../lib/visual-analyzer.mjs", () => ({
  describeImage: (...args) => mockDescribeImage(...args),
  describeVideo: (...args) => mockDescribeVideo(...args),
  analyzeFit: (...args) => mockAnalyzeFit(...args),
  closeVisualAnalyzer: (...args) => mockCloseAnalyzer(...args),
}));

// Import after mocks
import { analyzeAssets, buildReport, scoreCandidate } from "../lib/asset-sourcer.mjs";

beforeEach(() => {
  vi.clearAllMocks();
  mockDescribeImage.mockResolvedValue("A robot in a lab");
  mockDescribeVideo.mockResolvedValue("A robot walking demonstration");
  mockAnalyzeFit.mockResolvedValue({}); // default: no fit analysis (portrait assets)
  mockCloseAnalyzer.mockResolvedValue(undefined);
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
    expect(mockCloseAnalyzer).not.toHaveBeenCalled();
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
