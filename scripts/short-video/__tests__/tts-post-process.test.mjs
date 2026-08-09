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
  getProsodyProfile,
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
    delete process.env.TTS_HIGHPASS;
    delete process.env.TTS_DENOISE;
  });

  afterEach(() => {
    delete process.env.TTS_ATEMPO;
    delete process.env.TTS_HIGHPASS;
    delete process.env.TTS_DENOISE;
  });

  // ── buildFilter ──

  describe("buildFilter() — cleanup chain", () => {
    // S4: Default cleanup params (highpass=80 + afftdn=nr=5)
    it("S4: includes highpass and afftdn by default", () => {
      const filter = buildFilter({ useSilenceFilter: false });
      expect(filter).toContain("highpass=f=80");
      expect(filter).toContain("afftdn=nr=5");
    });

    // S2: TTS_DENOISE=0 → no afftdn
    it("S2: excludes afftdn when TTS_DENOISE=0", () => {
      process.env.TTS_DENOISE = "0";
      const filter = buildFilter({ useSilenceFilter: false });
      expect(filter).not.toContain("afftdn");
    });

    // S3: TTS_HIGHPASS=0 → no highpass
    it("S3: excludes highpass when TTS_HIGHPASS=0", () => {
      process.env.TTS_HIGHPASS = "0";
      const filter = buildFilter({ useSilenceFilter: false });
      expect(filter).not.toContain("highpass");
    });

    // S5: Cleanup chain order: highpass → afftdn → silenceremove → rubberband → atempo
    it("S5: cleanup chain before silenceremove (XTTS path)", () => {
      const filter = buildFilter({ useSilenceFilter: true });
      const hpIdx = filter.indexOf("highpass");
      const afftdnIdx = filter.indexOf("afftdn");
      const srIdx = filter.indexOf("silenceremove");
      expect(hpIdx).toBeLessThan(afftdnIdx);
      expect(afftdnIdx).toBeLessThan(srIdx);
    });

    // S6: Cleanup chain + rubberband + volume (F5 path, no silenceremove)
    it("S6: cleanup chain before rubberband, volume after (F5 path with hook prosody)", () => {
      const prosody = { pitch: 1.04, tempo: 1.06, volume: 1.15, label: "hook" };
      const filter = buildFilter({ useSilenceFilter: false, prosody });
      const hpIdx = filter.indexOf("highpass");
      const afftdnIdx = filter.indexOf("afftdn");
      const rbIdx = filter.indexOf("rubberband");
      const volIdx = filter.indexOf("volume");
      expect(hpIdx).toBeLessThan(afftdnIdx);
      expect(afftdnIdx).toBeLessThan(rbIdx);
      expect(rbIdx).toBeLessThan(volIdx);
    });
  });

  describe("buildFilter() — silenceremove", () => {
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
  });

  describe("buildFilter() — atempo", () => {
    // Scenario 8: TTS_ATEMPO=1.3 → atempo applied to F5 output
    it("S8: applies atempo when TTS_ATEMPO set and useSilenceFilter=false", () => {
      process.env.TTS_ATEMPO = "1.3";
      const filter = buildFilter({ useSilenceFilter: false });
      expect(filter).toContain("atempo=1.3");
    });

    it("appends atempo after silenceremove when TTS_ATEMPO set and useSilenceFilter=true", () => {
      process.env.TTS_ATEMPO = "1.3";
      const filter = buildFilter({ useSilenceFilter: true });
      expect(filter).toContain("silenceremove");
      expect(filter).toContain("atempo=1.3");
      // atempo must come after silenceremove
      const srIdx = filter.indexOf("silenceremove");
      const atempoIdx = filter.indexOf("atempo");
      expect(srIdx).toBeLessThan(atempoIdx);
    });
  });

  describe("buildFilter() — prosody", () => {
    it("includes rubberband when prosody provided", () => {
      const prosody = { pitch: 1.04, tempo: 1.06, volume: 1.15, label: "hook" };
      const filter = buildFilter({ useSilenceFilter: false, prosody });
      expect(filter).toContain("rubberband");
      expect(filter).toContain("pitch=1.0400");
      expect(filter).toContain("tempo=1.0600");
    });

    it("includes volume boost when prosody.volume > 1.0", () => {
      const prosody = { pitch: 1.04, tempo: 1.06, volume: 1.15, label: "hook" };
      const filter = buildFilter({ useSilenceFilter: false, prosody });
      expect(filter).toContain("volume=1.15");
      // volume comes after rubberband
      const rbIdx = filter.indexOf("rubberband");
      const volIdx = filter.indexOf("volume");
      expect(rbIdx).toBeLessThan(volIdx);
    });

    it("excludes volume when prosody.volume is 1.0", () => {
      const prosody = { pitch: 0.98, tempo: 0.98, volume: 1.0, label: "data" };
      const filter = buildFilter({ useSilenceFilter: false, prosody });
      expect(filter).not.toContain("volume");
    });

    it("excludes rubberband when prosody is null", () => {
      const filter = buildFilter({ useSilenceFilter: false, prosody: null });
      expect(filter).not.toContain("rubberband");
    });
  });

  describe("getProsodyProfile()", () => {
    it("returns hook profile for visualType=hook", () => {
      const p = getProsodyProfile("hook");
      expect(p).not.toBeNull();
      expect(p.pitch).toBe(1.04);
      expect(p.tempo).toBe(1.06);
      expect(p.volume).toBe(1.15);
    });

    it("returns null for unknown visualType", () => {
      expect(getProsodyProfile("narrative")).toBeNull();
    });

    it("returns null for undefined visualType", () => {
      expect(getProsodyProfile(undefined)).toBeNull();
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
      expect(cmd).toContain("highpass");
      expect(cmd).toContain("afftdn");
      expect(cmd).toContain("silenceremove");
      expect(cmd).toContain("-ar 44100");
      expect(cmd).toContain("-b:a 320k");
      expect(cmd).toContain('"output.mp3"');
    });

    // Scenario 7: Edge-TTS — post-process with SILENCE_FILTER, no resample
    it("S7: applies silenceremove without resample for edge-tts audio", async () => {
      await postProcessAudio("raw.mp3", "final.mp3", { useSilenceFilter: true, resample: false });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("silenceremove");
      expect(cmd).not.toContain("-ar 44100");
      expect(cmd).not.toContain("-b:a");
    });

    // Scenario 5: F5 batch — post-process WITHOUT silenceremove, WITH cleanup chain
    it("S5: skips silenceremove for F5 audio but includes cleanup chain", async () => {
      await postProcessAudio("input.mp3", "output.mp3", {
        useSilenceFilter: false,
        resample: true,
      });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("ffmpeg");
      expect(cmd).not.toContain("silenceremove");
      expect(cmd).toContain("highpass");
      expect(cmd).toContain("afftdn");
      expect(cmd).toContain("-ar 44100");
      expect(cmd).toContain("-b:a 320k");
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

    it("includes cleanup chain even with no atempo, no silenceremove", async () => {
      await postProcessAudio("input.mp3", "output.mp3", {
        useSilenceFilter: false,
        resample: true,
      });

      const cmd = execMock.mock.calls[0][0];
      expect(cmd).toContain("ffmpeg");
      expect(cmd).toContain("-af");
      expect(cmd).toContain("highpass");
      expect(cmd).toContain("-ar 44100");
      expect(cmd).toContain("-b:a 320k");
    });
  });

  // ── postProcessBatch ──

  describe("postProcessBatch()", () => {
    // S17: F5 WAV input → MP3 output
    it("S17: handles .wav input (F5 new behavior) → .mp3 output", async () => {
      execMock
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "", stderr: "" })) // ffmpeg
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "", stderr: "" })) // mv
        .mockImplementationOnce((cmd, cb) => cb(null, { stdout: "3.45\n", stderr: "" })); // ffprobe

      const duration = await postProcessBatch("scene-1.wav", { useSilenceFilter: false });

      expect(duration).toBe(3.45);
      // First call: ffmpeg processes .wav → -processed.wav (same ext as input)
      expect(execMock.mock.calls[0][0]).toContain("ffmpeg");
      expect(execMock.mock.calls[0][0]).toContain("scene-1-processed.wav");
      // Second call: mv -processed.wav back to original .wav
      expect(execMock.mock.calls[1][0]).toContain("mv");
      expect(execMock.mock.calls[1][0]).toContain("scene-1.wav");
      // Third call: ffprobe
      expect(execMock.mock.calls[2][0]).toContain("ffprobe");
    });

    it("post-processes in-place and returns duration (F5 path, .mp3 input)", async () => {
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
