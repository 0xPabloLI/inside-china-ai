/**
 * Native-engine integration tests for asset-sourcer (#542 L2 + L3).
 *
 * The configured engine (Qwen3-VL) consumes video files natively, so:
 *   - Phase 2.5 must NOT build the #414 window plan (no window/windows reach
 *     the analyzer) — the plan is a frames-mode device;
 *   - the A1 transcript must reach the analyzer as `opts.transcript`;
 *   - provenance (transcriptChars from Python, transcriptGuard from the ASR
 *     guard) must land on the asset and in asset-analysis.json.
 *
 * The frames-engine behavior stays covered by
 * asset-sourcer-visual-integration.test.mjs (which pins getVlmVideoInput to
 * "frames"). This file mocks the same surface with "native".
 *
 * Run with: npx vitest run scripts/short-video/__tests__/asset-sourcer-native-engine.test.mjs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockAnalyzeAssetSemantics = vi.fn();
const mockCloseAnalyzer = vi.fn();
const mockDetectFocus = vi.fn();
const mockCloseFocusDetector = vi.fn();
const mockProbeMedia = vi.fn();
const mockTranscribeVideo = vi.fn();

vi.mock("../lib/visual-analyzer.mjs", () => ({
  analyzeAssetSemantics: (...args) => mockAnalyzeAssetSemantics(...args),
  closeVisualAnalyzer: (...args) => mockCloseAnalyzer(...args),
  detectFocus: (...args) => mockDetectFocus(...args),
  closeFocusDetector: (...args) => mockCloseFocusDetector(...args),
  getVlmConcurrency: () => 1,
  getVlmModelId: () => "test-model",
  // The point of this file: a native-video engine (#542 L1/L2).
  getVlmVideoInput: () => "native",
}));

vi.mock("../lib/media-probe.mjs", () => ({
  probeMedia: (...args) => mockProbeMedia(...args),
  parseProbeOutput: vi.fn(),
}));

vi.mock("../lib/video-understand.mjs", () => ({
  transcribeVideo: (...args) => mockTranscribeVideo(...args),
}));

import { analyzeAssets } from "../lib/asset-sourcer.mjs";

const FULL_SEMANTICS = {
  description: "A humanoid robot in a kitchen.",
  subjects: ["robot", "kitchen", "product"],
  contentKind: "product_demo",
  fit: null,
  criticalEdgeText: null,
  reason: null,
};

const FOCUS_OK = {
  status: "ok",
  errorCode: null,
  frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
  protectedRegions: [],
  saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
};

const TRANSCRIPT = "今天我们来聊一下通义千问的最新版本。";

beforeEach(() => {
  vi.clearAllMocks();
  mockAnalyzeAssetSemantics.mockResolvedValue({ ...FULL_SEMANTICS, sourceMode: "native" });
  mockCloseAnalyzer.mockResolvedValue(undefined);
  mockDetectFocus.mockResolvedValue({ ...FOCUS_OK });
  mockCloseFocusDetector.mockResolvedValue(undefined);
  mockProbeMedia.mockReturnValue({
    durationMs: 60000,
    fps: 30,
    hasAudio: true,
    width: 1920,
    height: 1080,
    rotation: 0,
  });
  mockTranscribeVideo.mockResolvedValue({
    segments: [{ start: 0, end: 2000, text: TRANSCRIPT }],
    fullText: TRANSCRIPT,
    guard: { changed: false, worstRun: 1, collapsedSegments: 0 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Options object of the first analyzer call ({} when called with one arg). */
function firstAnalyzeOpts() {
  return mockAnalyzeAssetSemantics.mock.calls[0][1] ?? {};
}

describe("analyzeAssets — native video engine (#542)", () => {
  it("L2: does not build a window plan — the analyzer gets no window/windows", async () => {
    const assets = [{ path: "/abs/clip.mp4", type: "video", searchKeyword: "test" }];

    await analyzeAssets(assets);

    const opts = firstAnalyzeOpts();
    expect(opts.window).toBeUndefined();
    expect(opts.windows).toBeUndefined();
    expect(opts.startMs).toBeUndefined();
    expect(opts.endMs).toBeUndefined();
    expect(opts.sampleFps).toBeUndefined();
    // The probe still runs: duration is persisted for downstream consumers.
    expect(assets[0].window).toBeUndefined();
    expect(assets[0].windows).toBeUndefined();
    expect(assets[0].durationMs).toBe(60000);
  });

  it("L3: feeds the A1 transcript and records the provenance", async () => {
    mockAnalyzeAssetSemantics.mockResolvedValue({
      ...FULL_SEMANTICS,
      sourceMode: "native",
      transcriptChars: TRANSCRIPT.length,
    });

    const assets = [{ path: "/abs/clip.mp4", type: "video", searchKeyword: "test" }];

    await analyzeAssets(assets);

    expect(mockTranscribeVideo).toHaveBeenCalledWith("/abs/clip.mp4", expect.any(Object));
    expect(firstAnalyzeOpts().transcript).toBe(TRANSCRIPT);
    expect(assets[0].sourceMode).toBe("native");
    expect(assets[0].transcriptChars).toBe(TRANSCRIPT.length);
    expect(assets[0].transcriptGuard).toEqual({
      changed: false,
      worstRun: 1,
      collapsedSegments: 0,
    });
  });

  it("L3: writes the transcript provenance into asset-analysis.json", async () => {
    mockAnalyzeAssetSemantics.mockResolvedValue({
      ...FULL_SEMANTICS,
      sourceMode: "native",
      transcriptChars: TRANSCRIPT.length,
    });

    const fs = await import("fs");
    const tmpDir = fs.mkdtempSync("/tmp/asset-native-artifact-");
    const assets = [{ path: "/abs/clip.mp4", type: "video", searchKeyword: "test" }];

    await analyzeAssets(assets, { outputDir: tmpDir, contentSlug: "test" });

    const artifact = JSON.parse(fs.readFileSync(`${tmpDir}/test/asset-analysis.json`, "utf8"));
    const video = artifact.assets[0];
    expect(video.window).toBeNull();
    expect(video.windows).toBeNull();
    expect(video.sourceMode).toBe("native");
    expect(video.transcriptChars).toBe(TRANSCRIPT.length);
    expect(video.transcriptGuard).toEqual({
      changed: false,
      worstRun: 1,
      collapsedSegments: 0,
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("L3: a silent asset skips transcription (nothing to decode)", async () => {
    mockProbeMedia.mockReturnValue({
      durationMs: 60000,
      fps: 30,
      hasAudio: false,
      width: 1920,
      height: 1080,
      rotation: 0,
    });

    const assets = [{ path: "/abs/silent.mp4", type: "video", searchKeyword: "test" }];

    await analyzeAssets(assets);

    expect(mockTranscribeVideo).not.toHaveBeenCalled();
    expect(firstAnalyzeOpts().transcript).toBeUndefined();
    expect(assets[0].transcriptChars).toBeNull();
    expect(assets[0].transcriptGuard).toBeNull();
  });

  it("L3: transcription failure fails open (analysis still runs, provenance null)", async () => {
    mockTranscribeVideo.mockResolvedValue(null);

    const assets = [{ path: "/abs/clip.mp4", type: "video", searchKeyword: "test" }];

    await analyzeAssets(assets);

    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledTimes(1);
    expect(firstAnalyzeOpts().transcript).toBeUndefined();
    expect(assets[0].transcriptChars).toBeNull();
  });

  it("L3: images are never transcribed", async () => {
    const assets = [{ path: "/abs/img.jpg", type: "image", searchKeyword: "test" }];

    await analyzeAssets(assets);

    expect(mockTranscribeVideo).not.toHaveBeenCalled();
    expect(mockAnalyzeAssetSemantics).toHaveBeenCalledWith("/abs/img.jpg");
  });
});
