import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock child_process + fs ───
// vi.mock is hoisted, so we use vi.hoisted() to make mocks available
// inside the factory.

const { execMock, fsMock } = vi.hoisted(() => {
  const execMock = vi.fn((cmd, callback) => {
    callback(null, { stdout: "", stderr: "" });
  });
  const fsMock = {
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return { execMock, fsMock };
});

vi.mock("child_process", () => ({
  exec: execMock,
  execSync: vi.fn(),
  // getDuration is the argv-safe ffprobe probe (#319 deferred class sweep);
  // it resolves through execFile with an empty duration.
  execFile: vi.fn((cmd, args, callback) => callback(null, { stdout: "", stderr: "" })),
}));

vi.mock("fs", () => ({
  existsSync: fsMock.existsSync,
  writeFileSync: fsMock.writeFileSync,
  readFileSync: vi.fn(),
}));

import { runWhisperAlignment } from "../lib/tts/post-process.mjs";

// ─── Test data ───

const mockScenes = [
  { id: 1, voiceover: "DeepSeek is changing the AI landscape." },
  { id: 2, voiceover: "The founder held a closed-door meeting." },
];

const mockTTSResults = [
  { sceneId: 1, audioPath: "/output/audio/scene-1.mp3", duration: 3.5 },
  { sceneId: 2, audioPath: "/output/audio/scene-2.mp3", duration: 4.2 },
];

// ─── Tests ───

describe("TTS Subtitle Alignment — runWhisperAlignment()", () => {
  beforeEach(() => {
    execMock.mockClear();
    execMock.mockImplementation((cmd, callback) => {
      callback(null, { stdout: "", stderr: "" });
    });
    fsMock.existsSync.mockClear();
    fsMock.writeFileSync.mockClear();
  });

  // Scenario 9: text-align.py exists → alignment runs
  it("S9: runs alignment when text-align.py exists", async () => {
    fsMock.existsSync.mockReturnValue(true); // text-align.py found

    await runWhisperAlignment(mockScenes, mockTTSResults, "/output/audio");

    // Should write whisper-manifest.json
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      "/output/audio/whisper-manifest.json",
      expect.any(String),
    );
    const manifestJson = fsMock.writeFileSync.mock.calls[0][1];
    const manifest = JSON.parse(manifestJson);
    expect(manifest).toHaveLength(2);
    expect(manifest[0]).toEqual({
      sceneId: 1,
      text: "DeepSeek is changing the AI landscape.",
      audioPath: "/output/audio/scene-1.mp3",
    });

    // Should exec the alignment script
    expect(execMock).toHaveBeenCalledTimes(1);
    const cmd = execMock.mock.calls[0][0];
    expect(cmd).toContain("text-align.py");
    expect(cmd).toContain("--manifest");
    expect(cmd).toContain("whisper-manifest.json");
    expect(cmd).toContain("--output");
    expect(cmd).toContain("subtitle-timing.json");
  });

  // Scenario 10: text-align.py missing → alignment skipped, warning logged
  it("S10: skips alignment when text-align.py not found", async () => {
    fsMock.existsSync.mockReturnValue(false); // text-align.py not found

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runWhisperAlignment(mockScenes, mockTTSResults, "/output/audio");

    // Should NOT write manifest or exec alignment script
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(execMock).not.toHaveBeenCalled();
    // Should log warning
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("text-align.py not found"));

    logSpy.mockRestore();
  });

  // Extra: alignment script throws → graceful fallback with warning
  it("handles alignment failure gracefully", async () => {
    fsMock.existsSync.mockReturnValue(true);
    execMock.mockImplementation((cmd, callback) => {
      callback(new Error("wav2vec2 model not found"));
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runWhisperAlignment(mockScenes, mockTTSResults, "/output/audio");

    // Should still write manifest
    expect(fsMock.writeFileSync).toHaveBeenCalled();
    // Should exec the alignment script
    expect(execMock).toHaveBeenCalled();
    // Should log failure warning
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Force-align failed"));

    logSpy.mockRestore();
  });

  // #394: the offline flags default to 1 but must honor an explicit parent
  // override so a deliberate model fetch/upgrade can opt out.
  it("honors HF_HUB_OFFLINE=0 from the parent env (#394)", async () => {
    fsMock.existsSync.mockReturnValue(true);
    const prev = process.env.HF_HUB_OFFLINE;
    process.env.HF_HUB_OFFLINE = "0";
    try {
      await runWhisperAlignment(mockScenes, mockTTSResults, "/output/audio");
    } finally {
      if (prev === undefined) delete process.env.HF_HUB_OFFLINE;
      else process.env.HF_HUB_OFFLINE = prev;
    }

    const cmd = execMock.mock.calls[0][0];
    expect(cmd).toContain("HF_HUB_OFFLINE=0");
    expect(cmd).not.toContain("HF_HUB_OFFLINE=1");
    expect(cmd).toContain("TRANSFORMERS_OFFLINE=0");
  });

  // #394: the incident's opaque failure. whisperx swallows the real cause
  // ("could not be found in huggingface or torchaudio"), so the run must name
  // the missing cache and the one-time fetch command.
  it("prints the offline cache-miss fetch hint when the cache is incomplete (#394)", async () => {
    fsMock.existsSync.mockReturnValue(true);
    const miss = new Error(
      'ValueError: The chosen align_model "facebook/wav2vec2-large-960h-lv60-self" could not be found in huggingface (https://huggingface.co/models) or torchaudio (https://pytorch.org/audio/stable/pipelines.html#id14)',
    );
    execMock.mockImplementation((cmd, callback) => {
      callback(miss);
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runWhisperAlignment(mockScenes, mockTTSResults, "/output/audio");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Force-align failed"));
    const text = errSpy.mock.calls.flat().join("\n");
    expect(text).toContain("Offline HF cache miss");
    expect(text).toContain("facebook/wav2vec2-large-960h-lv60-self");
    expect(text).toContain("snapshot_download('facebook/wav2vec2-large-960h-lv60-self')");

    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
