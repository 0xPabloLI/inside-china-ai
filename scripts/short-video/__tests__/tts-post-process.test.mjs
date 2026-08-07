import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock child_process ───
// vi.mock is hoisted, so we use vi.hoisted() to make the mock available
// inside the factory. exec is used via promisify(exec) in post-process.mjs.

const { execMock } = vi.hoisted(() => {
  const execMock = vi.fn((cmd, callback) => {
    callback(null, { stdout: "", stderr: "" });
  });
  return { execMock };
});

vi.mock("child_process", () => ({
  exec: execMock,
  execSync: vi.fn(),
}));

import {
  buildFilter,
  postProcessAudio,
  postProcessBatch,
  getAtempo,
} from "../lib/tts/post-process.mjs";

// ─── Tests ───

describe("TTS Post-Processing", () => {
  beforeEach(() => {
    execMock.mockClear();
    // Reset to default implementation (callback with empty stdout)
    execMock.mockImplementation((cmd, callback) => {
      callback(null, { stdout: "", stderr: "" });
    });
    delete process.env.TTS_ATEMPO;
  });

  afterEach(() => {
    delete process.env.TTS_ATEMPO;
  });

  // ── buildFilter ──

  describe("buildFilter()", () => {
    it("includes silenceremove when useSilenceFilter=true (default)", () => {
      const filter = buildFilter();
      expect(filter).toContain("silenceremove");
      expect(filter).toContain("stop_periods=-1");
      expect(filter).toContain("stop_duration=0.25");
      expect(filter).toContain("stop_silence=0.08");
      expect(filter).toContain("stop_threshold=0.018");
    });

    it("excludes silenceremove when useSilenceFilter=false (F5 path)", () => {
      const filter = buildFilter({ useSilenceFilter: false });
      expect(filter).not.toContain("silenceremove");
    });

    // Scenario 8: TTS_ATEMPO=1.3 → atempo applied to F5 output
    it("S8: applies atempo when TTS_ATEMPO set and useSilenceFilter=false", () => {
      process.env.TTS_ATEMPO = "1.3";
      const filter = buildFilter({ useSilenceFilter: false });
      expect(filter).toBe("atempo=1.3");
    });

    it("appends atempo to silenceremove when TTS_ATEMPO set and useSilenceFilter=true", () => {
      process.env.TTS_ATEMPO = "1.3";
      const filter = buildFilter({ useSilenceFilter: true });
      expect(filter).toContain("silenceremove");
      expect(filter).toContain(",atempo=1.3");
    });

    it("returns empty string when no atempo and useSilenceFilter=false", () => {
      const filter = buildFilter({ useSilenceFilter: false });
      expect(filter).toBe("");
    });
  });

  // ── getAtempo ──

  describe("getAtempo()", () => {
    it("returns null when TTS_ATEMPO not set", () => {
      expect(getAtempo()).toBeNull();
    });

    it("returns parsed value when TTS_ATEMPO set", () => {
      process.env.TTS_ATEMPO = "1.5";
      expect(getAtempo()).toBe(1.5);
    });
  });

  // ── postProcessAudio ──

  describe("postProcessAudio()", () => {
    // Scenario 6: XTTS batch — post-process with SILENCE_FILTER
    it("S6: applies silenceremove filter for XTTS-style audio", async () => {
      await postProcessAudio("input.mp3", "output.mp3", { useSilenceFilter: true, resample: true });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("ffmpeg");
      expect(cmd).toContain('-i "input.mp3"');
      expect(cmd).toContain("-af");
      expect(cmd).toContain("silenceremove");
      expect(cmd).toContain("-ar 44100");
      expect(cmd).toContain("-b:a 192k");
      expect(cmd).toContain('"output.mp3"');
    });

    // Scenario 7: Edge-TTS — post-process with SILENCE_FILTER, no resample
    it("S7: applies silenceremove without resample for edge-tts audio", async () => {
      await postProcessAudio("raw.mp3", "final.mp3", { useSilenceFilter: true, resample: false });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("silenceremove");
      expect(cmd).not.toContain("-ar 44100");
      expect(cmd).not.toContain("-b:a 192k");
    });

    // Scenario 5: F5 batch — post-process WITHOUT silenceremove
    it("S5: skips silenceremove for F5 audio (clean generation)", async () => {
      await postProcessAudio("input.mp3", "output.mp3", {
        useSilenceFilter: false,
        resample: true,
      });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("ffmpeg");
      expect(cmd).not.toContain("silenceremove");
      expect(cmd).toContain("-ar 44100");
    });

    // Scenario 8: F5 with atempo
    it("S8: applies atempo to F5 output when TTS_ATEMPO set", async () => {
      process.env.TTS_ATEMPO = "1.3";
      await postProcessAudio("input.mp3", "output.mp3", {
        useSilenceFilter: false,
        resample: true,
      });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("atempo=1.3");
      expect(cmd).not.toContain("silenceremove");
    });

    it("handles empty filter (no atempo, no silenceremove) — just resample", async () => {
      await postProcessAudio("input.mp3", "output.mp3", {
        useSilenceFilter: false,
        resample: true,
      });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("ffmpeg");
      expect(cmd).toContain("-ar 44100");
      expect(cmd).not.toContain("-af");
    });
  });

  // ── postProcessBatch ──

  describe("postProcessBatch()", () => {
    it("post-processes in-place and returns duration (F5 path)", async () => {
      // Mock: first exec call = ffmpeg, second = mv, third = ffprobe
      execMock
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "", stderr: "" })) // ffmpeg
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "", stderr: "" })) // mv
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "3.45\n", stderr: "" })); // ffprobe

      const duration = await postProcessBatch("scene-1.mp3", { useSilenceFilter: false });

      expect(duration).toBe(3.45);
      // First call: ffmpeg with -processed.mp3 output
      expect(execMock.mock.calls[0][0]).toContain("ffmpeg");
      expect(execMock.mock.calls[0][0]).toContain("scene-1-processed.mp3");
      // Second call: mv
      expect(execMock.mock.calls[1][0]).toContain("mv");
      // Third call: ffprobe
      expect(execMock.mock.calls[2][0]).toContain("ffprobe");
    });

    it("post-processes in-place with silenceremove (XTTS path)", async () => {
      execMock
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "", stderr: "" })) // ffmpeg
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "", stderr: "" })) // mv
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "5.20\n", stderr: "" })); // ffprobe

      const duration = await postProcessBatch("scene-2.mp3", { useSilenceFilter: true });

      expect(duration).toBe(5.2);
      expect(execMock.mock.calls[0][0]).toContain("silenceremove");
    });
  });
});
