import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

// ─── Mock child_process + fs ───
const { execMock, fsMock } = vi.hoisted(() => {
  const execMock = vi.fn((cmd, callback) => {
    callback(null, { stdout: "", stderr: "" });
  });
  const fsMock = {
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
  return { execMock, fsMock };
});

vi.mock("child_process", () => ({
  exec: execMock,
  execSync: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: fsMock.existsSync,
  writeFileSync: fsMock.writeFileSync,
  readFileSync: fsMock.readFileSync,
}));

// Import BOTH old and new names — the new name is the canonical one,
// the old name should be re-exported as an alias for backward compat.
import { runForcedAlignment, runWhisperAlignment } from "../lib/tts/post-process.mjs";
import { regenerateSubtitles, generateSubtitles } from "../lib/subtitles/generate.mjs";
import { buildCues } from "../lib/subtitles/cues.mjs";
import { expectedWordTimes } from "../lib/verify-subtitles.mjs";

// ─── Test data ───

const mockScenes = [
  { id: 1, voiceover: "DeepSeek is changing the AI landscape." },
  { id: 2, voiceover: "The founder held a closed-door meeting." },
];

const mockTTSResults = [
  { sceneId: 1, audioPath: "/output/audio/scene-1.mp3", duration: 3.5 },
  { sceneId: 2, audioPath: "/output/audio/scene-2.mp3", duration: 4.2 },
];

// Old array format: [{ sceneId, segments }]
const oldFormatTiming = [
  {
    sceneId: 1,
    segments: [
      {
        words: [
          { text: "DeepSeek", start: 0.0, end: 0.5 },
          { text: "is", start: 0.5, end: 0.7 },
          { text: "changing", start: 0.7, end: 1.2 },
        ],
      },
    ],
  },
];

// New object format: { scenes: [{ sceneId, segments }] }
const newFormatTiming = {
  scenes: [
    {
      sceneId: 1,
      segments: [
        {
          words: [
            { text: "DeepSeek", start: 0.0, end: 0.5 },
            { text: "is", start: 0.5, end: 0.7 },
            { text: "changing", start: 0.7, end: 1.2 },
          ],
        },
      ],
    },
  ],
};

const mockSceneDurations = [{ sceneId: 1, duration: 3.5, ttsDuration: 3.0, clipDuration: 4.0 }];

// ─── Tests ───

describe("T2: timing JSON format adaptation + runWhisperAlignment rename", () => {
  beforeEach(() => {
    execMock.mockClear();
    execMock.mockImplementation((cmd, callback) => {
      callback(null, { stdout: "", stderr: "" });
    });
    fsMock.existsSync.mockClear();
    fsMock.writeFileSync.mockClear();
    fsMock.readFileSync.mockClear();
  });

  // ─── Function rename: runForcedAlignment is the new name ───
  it("exports runForcedAlignment as the canonical function name", () => {
    expect(runForcedAlignment).toBeDefined();
    expect(typeof runForcedAlignment).toBe("function");
  });

  it("exports runWhisperAlignment as a backward-compatible alias", () => {
    expect(runWhisperAlignment).toBeDefined();
    expect(typeof runWhisperAlignment).toBe("function");
    expect(runWhisperAlignment).toBe(runForcedAlignment);
  });

  // ─── Old array format still works ───
  it("buildCues accepts old array format timing data", () => {
    const cues = buildCues(oldFormatTiming, mockSceneDurations);
    expect(cues).toBeDefined();
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].text).toContain("DeepSeek");
  });

  it("expectedWordTimes accepts old array format timing data", () => {
    const words = expectedWordTimes(oldFormatTiming, mockSceneDurations);
    expect(words).toBeDefined();
    expect(words.length).toBe(3);
    expect(words[0].text).toBe("DeepSeek");
  });

  // ─── New object format works ───
  it("buildCues accepts new object format timing data", () => {
    const cues = buildCues(newFormatTiming, mockSceneDurations);
    expect(cues).toBeDefined();
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].text).toContain("DeepSeek");
  });

  it("expectedWordTimes accepts new object format timing data", () => {
    const words = expectedWordTimes(newFormatTiming, mockSceneDurations);
    expect(words).toBeDefined();
    expect(words.length).toBe(3);
    expect(words[0].text).toBe("DeepSeek");
  });

  // ─── regenerateSubtitles adapts both formats ───
  it("regenerateSubtitles reads old array format and produces cues", () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(JSON.stringify(oldFormatTiming));

    const result = regenerateSubtitles({
      outputDir: "/output",
      sceneDurations: mockSceneDurations,
    });

    expect(result).not.toBeNull();
    expect(result.cues.length).toBeGreaterThan(0);
    expect(result.timingData).toEqual(oldFormatTiming);
  });

  it("regenerateSubtitles reads new object format and produces cues", () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(JSON.stringify(newFormatTiming));

    const result = regenerateSubtitles({
      outputDir: "/output",
      sceneDurations: mockSceneDurations,
    });

    expect(result).not.toBeNull();
    expect(result.cues.length).toBeGreaterThan(0);
    // timingData should be the raw parsed data (format-agnostic)
    expect(result.timingData).toEqual(newFormatTiming);
  });

  // ─── runForcedAlignment still works (same behavior as runWhisperAlignment) ───
  it("runForcedAlignment runs alignment when text-align.py exists", async () => {
    fsMock.existsSync.mockReturnValue(true);

    await runForcedAlignment(mockScenes, mockTTSResults, "/output/audio");

    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      "/output/audio/whisper-manifest.json",
      expect.any(String),
    );
    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock.mock.calls[0][0]).toContain("text-align.py");
  });

  // ─── generateSubtitles works with both formats ───
  it("generateSubtitles works with old array format", () => {
    fsMock.writeFileSync.mockClear();
    const result = generateSubtitles(oldFormatTiming, mockSceneDurations, "/output/sub.ass");
    expect(result.assPath).toBe("/output/sub.ass");
    expect(result.cues.length).toBeGreaterThan(0);
    expect(fsMock.writeFileSync).toHaveBeenCalledWith("/output/sub.ass", expect.any(String), "utf8");
  });

  it("generateSubtitles works with new object format", () => {
    fsMock.writeFileSync.mockClear();
    const result = generateSubtitles(newFormatTiming, mockSceneDurations, "/output/sub.ass");
    expect(result.assPath).toBe("/output/sub.ass");
    expect(result.cues.length).toBeGreaterThan(0);
    expect(fsMock.writeFileSync).toHaveBeenCalledWith("/output/sub.ass", expect.any(String), "utf8");
  });
});
