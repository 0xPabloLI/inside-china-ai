import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

describe("infra path resolution after lib/ migration", () => {
  it("f5_mlx_batch_tts.py exists at resolved path", () => {
    const path = join(ROOT, "f5_mlx_batch_tts.py");
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
  // The FFmpeg scene-by-scene assembler was retired with the HTML/Playwright
  // render path (decision 59); the module keeps the output-path resolver only
  // (behavioral coverage: lib/__tests__/assemble-output-resolve.test.mjs).
  it("exports resolveOutputVideo and no longer exports assembleVideo", async () => {
    const mod = await import("../lib/assemble.mjs");
    expect(typeof mod.resolveOutputVideo).toBe("function");
    expect(mod.assembleVideo).toBeUndefined();
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
