import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

describe("infra path resolution after lib/ migration", () => {
  it("cosyvoice_batch_tts.py exists at resolved path", () => {
    const path = join(ROOT, "cosyvoice_batch_tts.py");
    expect(existsSync(path)).toBe(true);
  });

  it("qwen_tts_batch.py exists at resolved path", () => {
    const path = join(ROOT, "qwen_tts_batch.py");
    expect(existsSync(path)).toBe(true);
  });

  it("voice-sample-24k.wav exists at resolved path", () => {
    const path = join(ROOT, "voice-samples", "voice-sample-24k.wav");
    expect(existsSync(path)).toBe(true);
  });

  it("voice-sample-ref-text.txt exists at resolved path", () => {
    const path = join(ROOT, "voice-samples", "voice-sample-ref-text.txt");
    expect(existsSync(path)).toBe(true);
  });

  it("text-align.py exists at resolved path", () => {
    const path = join(ROOT, "text-align.py");
    expect(existsSync(path)).toBe(true);
  });

});

describe("assemble.mjs interface", () => {
  it("export uses pipelineId parameter", async () => {
    const mod = await import("../lib/assemble.mjs");
    // The function should accept pipelineId as 3rd arg
    expect(typeof mod.assembleVideo).toBe("function");
    // Verify the function has at least 3 parameters (scenes, outputDir, pipelineId, ...)
    expect(mod.assembleVideo.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses to assemble when a scene has no audioPath", async () => {
    const { assembleVideo } = await import("../lib/assemble.mjs");
    // The guard must fire before any fs/ffmpeg work, so bogus paths are fine.
    expect(() =>
      assembleVideo(
        [{ sceneId: 1, videoPath: "/nonexistent.webm", duration: 1 }],
        "/tmp/x",
        "test",
      ),
    ).toThrow(/audioPath/);
  });
});

describe("generate-bgm.mjs interface", () => {
  it("export uses outputDir parameter", async () => {
    const mod = await import("../lib/generate-bgm.mjs");
    expect(typeof mod.generateBGM).toBe("function");
    // Check function signature includes outputDir parameter
    const fnStr = mod.generateBGM.toString();
    expect(fnStr).toContain("outputDir");
  });
});
