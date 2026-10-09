/**
 * Tests for lib/video-understand.mjs — Video understanding pipeline.
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * These are interface/contract tests with mocked exec/CDP functions — they verify:
 * - URL parsing & platform detection (detectPlatform, parseVideoMeta)
 * - Whisper output parsing (parseWhisperOutput)
 * - Download orchestration (downloadVideo)
 * - Full pipeline (understandVideo) with graceful degradation
 *
 * Prior art: upscale.test.mjs (mock child_process + fs pattern)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";

// ─── Mock child_process + fs ───

let mockExecAsync = vi.fn();
let mockExistsSync = vi.fn(() => true);
let mockWriteFileSync = vi.fn();
let mockMkdirSync = vi.fn();
let mockReadFileSync = vi.fn(() => "{}");
// #418: the model is sanity-checked beyond existence (ggml magic + size).
let mockModelSize = 2 * 1024 ** 3;
let mockModelMagic = Buffer.from([0x6c, 0x6d, 0x67, 0x67]);

vi.mock("child_process", () => ({
  exec: (...args) => {
    // exec(callback) → execAsync pattern
    const cb = args[args.length - 1];
    if (typeof cb === "function") {
      const result = mockExecAsync(args[0]);
      if (result instanceof Promise) {
        result.then(
          ({ stdout, stderr }) => cb(null, stdout, stderr),
          (err) => cb(err),
        );
      } else {
        cb(null, "", "");
      }
    }
  },
}));

vi.mock("fs", () => ({
  existsSync: (...args) => mockExistsSync(...args),
  writeFileSync: (...args) => mockWriteFileSync(...args),
  mkdirSync: (...args) => mockMkdirSync(...args),
  readFileSync: (...args) => mockReadFileSync(...args),
  openSync: () => 7,
  closeSync: () => {},
  fstatSync: () => ({ size: mockModelSize }),
  readSync: (fd, buf) => {
    mockModelMagic.copy(buf, 0);
    return buf.length;
  },
}));

// Import after mocks
import {
  detectPlatform,
  parseVideoMeta,
  parseWhisperOutput,
  downloadVideo,
  transcribeVideo,
  understandVideo,
  asrAvailability,
} from "../lib/video-understand.mjs";
import { DEFAULT_WHISPER_CPP_MODEL_NAME } from "../lib/asr-defaults.mjs";

// ═══════════════════════════════════════════════════════════════
// ─── detectPlatform ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

describe("detectPlatform", () => {
  it("detects TikTok short URL", () => {
    expect(detectPlatform("https://vt.tiktok.com/ZSVAVk4n1")).toBe("tiktok");
  });

  it("detects TikTok full URL", () => {
    expect(detectPlatform("https://www.tiktok.com/@lacedmedia/video/7666472897946422541")).toBe(
      "tiktok",
    );
  });

  it("detects YouTube watch URL", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=yPlG-SFUVQs")).toBe("youtube");
  });

  it("detects YouTube short URL", () => {
    expect(detectPlatform("https://www.youtube.com/shorts/yPlG-SFUVQs")).toBe("youtube");
  });

  it("detects youtu.be URL", () => {
    expect(detectPlatform("https://youtu.be/yPlG-SFUVQs")).toBe("youtube");
  });

  it("detects Bilibili URL", () => {
    expect(detectPlatform("https://www.bilibili.com/video/BV1xx411c7mD")).toBe("bilibili");
  });

  it("throws on unknown platform", () => {
    expect(() => detectPlatform("https://example.com/video/123")).toThrow(/Unsupported platform/);
  });

  it("throws on empty URL", () => {
    expect(() => detectPlatform("")).toThrow(/Unsupported platform/);
  });
});

// ═══════════════════════════════════════════════════════════════
// ─── parseVideoMeta ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

describe("parseVideoMeta", () => {
  it("parses TikTok full URL", () => {
    const meta = parseVideoMeta(
      "https://www.tiktok.com/@lacedmedia/video/7666472897946422541",
      "tiktok",
    );
    expect(meta.platform).toBe("tiktok");
    expect(meta.author).toBe("lacedmedia");
    expect(meta.videoId).toBe("7666472897946422541");
  });

  it("parses YouTube watch URL", () => {
    const meta = parseVideoMeta("https://www.youtube.com/watch?v=yPlG-SFUVQs", "youtube");
    expect(meta.platform).toBe("youtube");
    expect(meta.videoId).toBe("yPlG-SFUVQs");
  });

  it("parses YouTube Shorts URL", () => {
    const meta = parseVideoMeta("https://www.youtube.com/shorts/yPlG-SFUVQs", "youtube");
    expect(meta.platform).toBe("youtube");
    expect(meta.videoId).toBe("yPlG-SFUVQs");
  });

  it("parses youtu.be URL", () => {
    const meta = parseVideoMeta("https://youtu.be/yPlG-SFUVQs", "youtube");
    expect(meta.platform).toBe("youtube");
    expect(meta.videoId).toBe("yPlG-SFUVQs");
  });

  it("parses Bilibili URL", () => {
    const meta = parseVideoMeta("https://www.bilibili.com/video/BV1xx411c7mD", "bilibili");
    expect(meta.platform).toBe("bilibili");
    expect(meta.videoId).toBe("BV1xx411c7mD");
  });

  it("returns null author for YouTube (not available in URL)", () => {
    const meta = parseVideoMeta("https://www.youtube.com/watch?v=yPlG-SFUVQs", "youtube");
    expect(meta.author).toBeNull();
  });

  it("returns null title for all platforms (not in URL)", () => {
    const meta = parseVideoMeta("https://www.tiktok.com/@user/video/123", "tiktok");
    expect(meta.title).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// ─── parseWhisperOutput ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

describe("parseWhisperOutput", () => {
  it("parses valid whisper JSON with segments", () => {
    const json = JSON.stringify({
      transcription: [
        {
          timestamps: { from: "00:00:00,000", to: "00:00:02,500" },
          offsets: { from: 0, to: 2500 },
          text: " Hello world",
        },
        {
          timestamps: { from: "00:00:02,500", to: "00:00:05,000" },
          offsets: { from: 2500, to: 5000 },
          text: " This is a test",
        },
      ],
    });
    const result = parseWhisperOutput(json);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({
      start: 0,
      end: 2500,
      text: "Hello world",
    });
    expect(result.segments[1]).toEqual({
      start: 2500,
      end: 5000,
      text: "This is a test",
    });
    expect(result.fullText).toBe("Hello world This is a test");
  });

  it("handles empty transcription (no segments)", () => {
    const json = JSON.stringify({ transcription: [] });
    const result = parseWhisperOutput(json);
    expect(result.segments).toEqual([]);
    expect(result.fullText).toBe("");
  });

  it("handles null/undefined input", () => {
    expect(parseWhisperOutput(null)).toEqual({ segments: [], fullText: "" });
    expect(parseWhisperOutput(undefined)).toEqual({
      segments: [],
      fullText: "",
    });
  });

  it("handles malformed JSON", () => {
    expect(parseWhisperOutput("not json")).toEqual({
      segments: [],
      fullText: "",
    });
  });

  it("handles missing transcription field", () => {
    expect(parseWhisperOutput("{}")).toEqual({ segments: [], fullText: "" });
  });

  it("handles single segment", () => {
    const json = JSON.stringify({
      transcription: [
        {
          timestamps: { from: "00:00:00,000", to: "00:00:01,000" },
          offsets: { from: 0, to: 1000 },
          text: " Hello",
        },
      ],
    });
    const result = parseWhisperOutput(json);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("Hello");
    expect(result.fullText).toBe("Hello");
  });

  it("trims whitespace from text", () => {
    const json = JSON.stringify({
      transcription: [
        {
          timestamps: { from: "00:00:00,000", to: "00:00:01,000" },
          offsets: { from: 0, to: 1000 },
          text: "   spaced text   ",
        },
      ],
    });
    const result = parseWhisperOutput(json);
    expect(result.segments[0].text).toBe("spaced text");
  });
});

// ═══════════════════════════════════════════════════════════════
// ─── downloadVideo (mocked) ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════

describe("downloadVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("downloads YouTube video via yt-dlp", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

    const result = await downloadVideo("https://www.youtube.com/watch?v=test123", {
      outputDir: "/tmp/test-download",
    });

    expect(result.platform).toBe("youtube");
    expect(result.videoId).toBe("test123");
    expect(result.videoPath).toMatch(/\.mp4$/);
    expect(mockExecAsync).toHaveBeenCalled();
    const cmd = mockExecAsync.mock.calls[0][0];
    expect(cmd).toContain("yt-dlp");
    expect(cmd).toContain("--cookies-from-browser chrome");
  });

  it("downloads Bilibili video via yt-dlp (no cookies)", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

    const result = await downloadVideo("https://www.bilibili.com/video/BV1xx411c7mD", {
      outputDir: "/tmp/test-download",
    });

    expect(result.platform).toBe("bilibili");
    expect(result.videoId).toBe("BV1xx411c7mD");
    const cmd = mockExecAsync.mock.calls[0][0];
    expect(cmd).toContain("yt-dlp");
    expect(cmd).not.toContain("--cookies-from-browser");
  });

  it("throws on unknown platform", async () => {
    await expect(downloadVideo("https://example.com/video/123")).rejects.toThrow(
      /Unsupported platform/,
    );
  });

  it("throws on download failure", async () => {
    mockExecAsync.mockRejectedValue(new Error("Network error"));

    await expect(downloadVideo("https://www.youtube.com/watch?v=test123")).rejects.toThrow(
      /Download failed/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// ─── transcribeVideo (mocked) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════

describe("transcribeVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("returns transcript segments from whisper-cli", async () => {
    const whisperJson = JSON.stringify({
      transcription: [
        {
          timestamps: { from: "00:00:00,000", to: "00:00:02,000" },
          offsets: { from: 0, to: 2000 },
          text: " Hello world",
        },
      ],
    });
    // First call: ffmpeg, second call: whisper-cli
    mockExecAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // ffmpeg
      .mockResolvedValueOnce({ stdout: "", stderr: "" }); // whisper

    mockReadFileSync.mockReturnValue(whisperJson);

    const result = await transcribeVideo("/tmp/test.mp4");

    expect(result).not.toBeNull();
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("Hello world");
    expect(result.fullText).toBe("Hello world");
  });

  it("returns null when whisper-cli not found", async () => {
    // ffmpeg succeeds, whisper fails
    mockExecAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // ffmpeg
      .mockRejectedValueOnce(new Error("whisper-cli: command not found")); // whisper

    const result = await transcribeVideo("/tmp/test.mp4");

    expect(result).toBeNull();
  });

  it("returns null when video file doesn't exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await transcribeVideo("/tmp/nonexistent.mp4");

    expect(result).toBeNull();
  });

  it("returns empty transcript when whisper produces no segments", async () => {
    const whisperJson = JSON.stringify({ transcription: [] });
    mockExecAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // ffmpeg
      .mockResolvedValueOnce({ stdout: "", stderr: "" }); // whisper

    mockReadFileSync.mockReturnValue(whisperJson);

    const result = await transcribeVideo("/tmp/test.mp4");

    expect(result).not.toBeNull();
    expect(result.segments).toEqual([]);
    expect(result.fullText).toBe("");
  });

  // #418 equivalence run: with the cross-segment text context on, both
  // whisper.cpp and MLX hallucinate repetition on long audio (repeats 17→1 /
  // 18→4 once disabled). The production call must keep it off.
  it("disables the cross-segment text context on the whisper-cli call (-mc 0)", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ transcription: [] }));
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

    await transcribeVideo("/tmp/test.mp4");

    const whisperCmd = mockExecAsync.mock.calls[1][0];
    expect(whisperCmd).toContain("whisper-cli");
    expect(whisperCmd).toContain("-mc 0");
  });

  // `-mc 0` lowers the loop rate but does not remove it — the guard is the
  // second line of defence (#418 complementary piece).
  it("collapses a decode loop and reports the guard provenance", async () => {
    const whisperJson = JSON.stringify({
      transcription: [
        {
          offsets: { from: 0, to: 2000 },
          text: " Good.",
        },
        {
          offsets: { from: 2000, to: 6000 },
          text: " " + Array(30).fill("Kampung").join(" "),
        },
      ],
    });
    mockExecAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // ffmpeg
      .mockResolvedValueOnce({ stdout: "", stderr: "" }); // whisper
    mockReadFileSync.mockReturnValue(whisperJson);

    const result = await transcribeVideo("/tmp/test.mp4");

    expect(result.guard.contaminated).toBe(true);
    expect(result.guard.changed).toBe(true);
    expect(result.guard.collapsedSegments).toBe(1);
    expect(result.segments[1].text).toContain("重复×");
    expect(result.segments[0].text).toBe("Good."); // untouched segment
    expect(result.fullText).toContain("重复×");
  });

  it("reports a clean guard for a transcript without loops", async () => {
    const whisperJson = JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 2000 }, text: " Hello world from the studio" },
        { offsets: { from: 2000, to: 4000 }, text: " Second line here today" },
      ],
    });
    mockExecAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    mockReadFileSync.mockReturnValue(whisperJson);

    const result = await transcribeVideo("/tmp/test.mp4");

    expect(result.guard).toEqual({
      contaminated: false,
      changed: false,
      worstRun: 1,
      collapsedSegments: 0,
    });
    expect(result.segments.map((s) => s.text)).toEqual([
      "Hello world from the studio",
      "Second line here today",
    ]);
  });

  // #415 ①: the TTS gate must be able to tell "ASR is not installed" from
  // "this take is bad".
  it("reports ASR availability from the binary and the model", () => {
    mockExistsSync.mockReturnValue(true);
    expect(asrAvailability().ok).toBe(true);

    mockExistsSync.mockReturnValue(false);
    const missing = asrAvailability();
    expect(missing.ok).toBe(false);
    expect(missing.cliFound).toBe(false);
    expect(missing.modelFound).toBe(false);
  });

  // #418: ADR-0020 §3's single source of truth was nominal — the constant had
  // no consumers and this path was hardcoded, so a default change would have
  // silently kept loading the old model. Pin the wiring.
  it("resolves the model path from the ADR-0020 default constant", () => {
    expect(asrAvailability().model).toContain(DEFAULT_WHISPER_CPP_MODEL_NAME);
    expect(asrAvailability().model).toMatch(/ggml-[\w.-]+\.bin$/);
  });

  // #418: `existsSync` alone accepts a truncated download or a zero-byte file,
  // which then fails deep inside the transcriber — the same failure class as
  // the corrupted faster-whisper cache. The gate must call that "unusable".
  it("rejects a truncated model file", () => {
    mockExistsSync.mockReturnValue(true);
    mockModelSize = 1024;
    try {
      const a = asrAvailability();
      expect(a.modelFound).toBe(true);
      expect(a.modelUsable).toBe(false);
      expect(a.ok).toBe(false);
      expect(a.modelIssue).toMatch(/truncated/);
    } finally {
      mockModelSize = 2 * 1024 ** 3;
    }
  });

  it("rejects a model file whose magic is not ggml", () => {
    mockExistsSync.mockReturnValue(true);
    mockModelMagic = Buffer.from("PK\x03\x04", "latin1"); // a zip, not a model
    try {
      const a = asrAvailability();
      expect(a.modelUsable).toBe(false);
      expect(a.modelIssue).toMatch(/magic/);
    } finally {
      mockModelMagic = Buffer.from([0x6c, 0x6d, 0x67, 0x67]);
    }
  });

  it("reports the model as missing rather than unreadable when absent", () => {
    mockExistsSync.mockReturnValue(false);
    const a = asrAvailability();
    expect(a.modelIssue).toBe("missing");
    expect(a.modelUsable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// ─── understandVideo (mocked) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════

describe("understandVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("returns full result when all steps succeed", async () => {
    const whisperJson = JSON.stringify({
      transcription: [
        {
          timestamps: { from: "00:00:00,000", to: "00:00:02,000" },
          offsets: { from: 0, to: 2000 },
          text: " Test transcript",
        },
      ],
    });

    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
    mockReadFileSync.mockReturnValue(whisperJson);

    // Mock visual-analyzer
    vi.doMock("../lib/visual-analyzer.mjs", () => ({
      analyzeAssetSemantics: vi.fn().mockResolvedValue({
        description: "A test video.",
        subjects: ["test"],
        contentKind: "talking_head",
      }),
      closeVisualAnalyzer: vi.fn().mockResolvedValue(undefined),
    }));

    const result = await understandVideo("https://www.youtube.com/watch?v=test123", {
      visual: true,
      transcript: true,
      outputDir: "/tmp/test-vu",
    });

    expect(result.platform).toBe("youtube");
    expect(result.status).toBe("ok");
    expect(result.transcript).not.toBeNull();
    expect(result.transcript.segments).toHaveLength(1);
    expect(result.visualAnalysis).toBeDefined();
    expect(result.visualAnalysis.description).toBe("A test video.");

    vi.doUnmock("../lib/visual-analyzer.mjs");
  });

  it("degrades gracefully when whisper-cli unavailable", async () => {
    mockExecAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // download
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // ffmpeg
      .mockRejectedValueOnce(new Error("whisper-cli not found")); // whisper

    vi.doMock("../lib/visual-analyzer.mjs", () => ({
      analyzeAssetSemantics: vi.fn().mockResolvedValue({
        description: "A test video.",
        subjects: ["test"],
        contentKind: "other",
      }),
      closeVisualAnalyzer: vi.fn().mockResolvedValue(undefined),
    }));

    const result = await understandVideo("https://www.youtube.com/watch?v=test123", {
      outputDir: "/tmp/test-vu",
    });

    expect(result.status).toBe("degraded");
    expect(result.transcript).toBeNull();

    vi.doUnmock("../lib/visual-analyzer.mjs");
  });

  it("returns error status when download fails", async () => {
    // downloadVideo calls execAsync, which is mocked to reject
    mockExecAsync.mockRejectedValue(new Error("Network error"));
    // Also need existsSync to return false for whisper check so it doesn't try VLM
    mockExistsSync.mockReturnValue(false);

    const result = await understandVideo("https://www.youtube.com/watch?v=test123", {
      visual: false,
      transcript: false,
    });

    expect(result.status).toBe("error");
  });

  it("uses default options when none provided", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
    mockReadFileSync.mockReturnValue(JSON.stringify({ transcription: [] }));

    vi.doMock("../lib/visual-analyzer.mjs", () => ({
      analyzeAssetSemantics: vi.fn().mockResolvedValue({
        description: "",
        subjects: [],
        contentKind: null,
      }),
      closeVisualAnalyzer: vi.fn().mockResolvedValue(undefined),
    }));

    const result = await understandVideo("https://www.youtube.com/watch?v=test123");

    expect(result).toBeDefined();
    expect(result.platform).toBe("youtube");

    vi.doUnmock("../lib/visual-analyzer.mjs");
  });

  it("skips VLM when visual=false", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
    mockReadFileSync.mockReturnValue(JSON.stringify({ transcription: [] }));

    const mockClose = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../lib/visual-analyzer.mjs", () => ({
      analyzeAssetSemantics: vi.fn(),
      closeVisualAnalyzer: mockClose,
    }));

    const result = await understandVideo("https://www.youtube.com/watch?v=test123", {
      visual: false,
      outputDir: "/tmp/test-vu",
    });

    expect(result.visualAnalysis).toBeNull();
    expect(mockClose).not.toHaveBeenCalled();

    vi.doUnmock("../lib/visual-analyzer.mjs");
  });

  it("skips transcript when transcript=false", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

    vi.doMock("../lib/visual-analyzer.mjs", () => ({
      analyzeAssetSemantics: vi.fn().mockResolvedValue({
        description: "Visual only.",
        subjects: [],
        contentKind: "other",
      }),
      closeVisualAnalyzer: vi.fn().mockResolvedValue(undefined),
    }));

    const result = await understandVideo("https://www.youtube.com/watch?v=test123", {
      transcript: false,
      outputDir: "/tmp/test-vu",
    });

    expect(result.transcript).toBeNull();

    vi.doUnmock("../lib/visual-analyzer.mjs");
  });
});
