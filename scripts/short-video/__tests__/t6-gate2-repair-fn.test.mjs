import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process + fs
const { execFileMock, fsMock } = vi.hoisted(() => ({
  execFileMock: vi.fn((cmd, args, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    cb(null, { stdout: "", stderr: "" });
  }),
  fsMock: {
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock("child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  // #1598: alignment runs through execFile argv.
  execFile: execFileMock,
}));

// Spread the real module: import-time code in the dependency chain (ytdlp-guard
// -> proxy-port) calls realpathSync, and a bare object mock breaks that import.
vi.mock("fs", async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: fsMock.existsSync,
  writeFileSync: fsMock.writeFileSync,
  readFileSync: fsMock.readFileSync,
  unlinkSync: fsMock.unlinkSync,
}));

import { runForcedAlignment } from "../lib/tts/post-process.mjs";
import { regenerateSubtitles } from "../lib/subtitles/generate.mjs";

const scenes = [{ id: 1, voiceover: "ByteDance launched Doubao Work today." }];
const ttsResults = [{ sceneId: 1, audioPath: "/output/audio/scene-1.mp3", duration: 1.5 }];

const matchingTiming = [
  {
    sceneId: 1,
    segments: [
      {
        words: [
          { text: "ByteDance", start: 0, end: 0.5 },
          { text: "launched", start: 0.5, end: 0.8 },
          { text: "Doubao", start: 0.8, end: 1.0 },
          { text: "Work", start: 1.0, end: 1.2 },
          { text: "today.", start: 1.2, end: 1.5 },
        ],
      },
    ],
  },
];

const sceneDurations = [{ sceneId: 1, duration: 1.5, ttsDuration: 1.5, clipDuration: 2.0 }];

describe("T6: Gate 2 — subtitle-alignment repairFn", () => {
  beforeEach(() => {
    // clearAllMocks resets call history only: re-arm the success path so a
    // failure mock installed by one test cannot silence the next one.
    execFileMock.mockImplementation((cmd, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(null, { stdout: "", stderr: "" });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-runs forced alignment + regenerates ASS on subtitle-alignment failure", async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(JSON.stringify(matchingTiming));

    // Step 1: Re-run forced alignment (text-align.py)
    await runForcedAlignment(scenes, ttsResults, "/output/audio");
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      "/output/audio/whisper-manifest.json",
      expect.any(String),
    );
    expect(execFileMock).toHaveBeenCalledTimes(1);

    // Step 2: Regenerate subtitles (reads updated timing from disk)
    fsMock.writeFileSync.mockClear();
    const result = regenerateSubtitles({
      outputDir: "/output",
      sceneDurations,
      // #753 makes the dual-track invariant mandatory: the repair path reads the
      // same scene data the pipeline generated from.
      scenes,
    });
    expect(result).not.toBeNull();
    expect(result.cues.length).toBeGreaterThan(0);
    expect(result.assPath).toBeDefined();
  });

  it("handles text-align.py crash gracefully during repair", async () => {
    fsMock.existsSync.mockReturnValue(true);
    execFileMock.mockImplementation((cmd, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(new Error("wav2vec2 model not found"));
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // runForcedAlignment catches the error and logs warning — doesn't throw
    await runForcedAlignment(scenes, ttsResults, "/output/audio");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Force-align failed"));

    logSpy.mockRestore();
  });

  it("full repair flow: align → regenerate → return updated paths", async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(JSON.stringify(matchingTiming));

    // Simulate the repairFn flow
    // 1. Align
    await runForcedAlignment(scenes, ttsResults, "/output/audio");
    expect(execFileMock).toHaveBeenCalledTimes(1);

    // 2. Regenerate
    fsMock.writeFileSync.mockClear();
    const regen = regenerateSubtitles({ outputDir: "/output", sceneDurations, scenes });
    expect(regen).not.toBeNull();

    // 3. Return success with updated paths (burnSubtitles is execSync, mocked)
    const repairResult = {
      success: true,
      videoPath: "/output/video-final.mp4",
      assPath: regen.assPath,
    };
    expect(repairResult.success).toBe(true);
    expect(repairResult.assPath).toContain("/output/subtitles.ass");
  });
});
