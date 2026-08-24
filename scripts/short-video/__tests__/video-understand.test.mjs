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
}));

// Import after mocks
import {
  detectPlatform,
  parseVideoMeta,
  parseWhisperOutput,
  downloadVideo,
  transcribeVideo,
  understandVideo,
} from "../lib/video-understand.mjs";

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
