/**
 * CosyVoice3 Colab CUDA adapter (2026-11-18).
 *
 * The engine sits between Kaggle and Modal: same CUDA emotion, free, but a
 * cold VM per run. These tests pin the chain slot, the stdout artifact
 * contract and the promotion path without touching Google.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildWavBuffer } from "../lib/audio/wav.mjs";
import {
  createCosyVoice3ColabCudaEngine,
  parseColabOutput,
  renderColabScript,
  resolveColabBin,
} from "../lib/tts/cosyvoice3-colab-cuda.mjs";
import { PRIORITY } from "../lib/tts/registry.mjs";

describe("engine chain", () => {
  it("puts Colab after Kaggle and before Modal", () => {
    expect(PRIORITY.indexOf("cosyvoice3-colab-cuda")).toBe(
      PRIORITY.indexOf("cosyvoice3-kaggle-cuda") + 1,
    );
    expect(PRIORITY.indexOf("cosyvoice3-colab-cuda")).toBeLessThan(
      PRIORITY.indexOf("cosyvoice3-modal-cuda"),
    );
  });
});

describe("resolveColabBin", () => {
  it("prefers an explicit path over PATH", () => {
    expect(resolveColabBin({ colabBin: "/tmp/colab" })).toBe("/tmp/colab");
  });
});

describe("renderColabScript", () => {
  it("embeds the manifest and reference audio, leaving no placeholder", () => {
    const script = renderColabScript(
      [{ sceneId: 1, text: "hello", output: "scene-1.wav" }],
      Buffer.from("fake-ref"),
    );
    expect(script).not.toContain("__MANIFEST_B64__");
    expect(script).not.toContain("__REF_AUDIO_B64__");
    expect(script).not.toContain("__MODEL_CACHE_URL__");
    expect(script).not.toContain("__MODEL_CACHE_GDRIVE_ID__");
    expect(script).toContain(Buffer.from("fake-ref").toString("base64"));
  });

  it("embeds a non-interactive model cache source when provided", () => {
    const script = renderColabScript(
      [{ sceneId: 1, text: "hello", output: "scene-1.wav" }],
      Buffer.from("fake-ref"),
      {
        modelCacheUrl: "https://example.com/cosyvoice3-model.tar",
        modelCacheGdriveId: "drive-file-id",
      },
    );
    expect(script).toContain('MODEL_CACHE_URL = "https://example.com/cosyvoice3-model.tar"');
    expect(script).toContain('MODEL_CACHE_GDRIVE_ID = "drive-file-id"');
    expect(script).not.toContain("__MODEL_CACHE_URL__");
    expect(script).not.toContain("__MODEL_CACHE_GDRIVE_ID__");
  });
});

describe("parseColabOutput", () => {
  it("reads one file per marker plus the summary", () => {
    const wav = buildWavBuffer([0.1, -0.1, 0.2], 44100);
    const summary = { segments: [{ sceneId: 1, audioDuration: 2.4 }] };
    const stdout = [
      "noise",
      `__COLAB_TTS_FILE__1:${wav.toString("base64")}`,
      `__COLAB_TTS_SUMMARY__${Buffer.from(JSON.stringify(summary)).toString("base64")}`,
    ].join("\n");
    const parsed = parseColabOutput(stdout);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].sceneId).toBe(1);
    expect(parsed.files[0].wav.equals(wav)).toBe(true);
    expect(parsed.summary).toEqual(summary);
  });

  it("returns empty results when the markers are absent", () => {
    expect(parseColabOutput("just logs")).toEqual({ files: [], summary: null });
  });
});

describe("generate", () => {
  it("promotes every artifact, validating the WAV header first", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "colab-tts-"));
    const refPath = join(outputDir, "ref.wav");
    writeFileSync(refPath, buildWavBuffer([0.1, -0.1], 24000));
    const wav = buildWavBuffer([0.2, -0.2, 0.1, 0], 44100);
    const summary = { segments: [{ sceneId: 2, output: "scene-2.wav" }] };
    const stdout = [
      `__COLAB_TTS_FILE__2:${wav.toString("base64")}`,
      `__COLAB_TTS_SUMMARY__${Buffer.from(JSON.stringify(summary)).toString("base64")}`,
    ].join("\n");
    let invokedArgs;
    const engine = await createCosyVoice3ColabCudaEngine({
      assumeAvailable: true,
      colabBin: "/fake/colab",
      refAudioPath: refPath,
      execFile: async (_bin, args) => {
        invokedArgs = args;
        return { stdout };
      },
      postProcess: async () => ({ duration: 1.25 }),
    });
    expect(engine?.name).toBe("cosyvoice3-colab-cuda");

    const results = await engine.generate(
      [{ id: 2, voiceover: "hello", visualType: "narrative" }],
      outputDir,
    );
    expect(invokedArgs).toContain("--timeout");
    expect(invokedArgs[invokedArgs.indexOf("--timeout") + 1]).toBe("900");
    expect(results).toHaveLength(1);
    expect(results[0].duration).toBe(1.25);
    const dest = join(outputDir, "scene-2.wav");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).equals(wav)).toBe(true);
  });

  it("fails closed when the script emits no summary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "colab-tts-"));
    const refPath = join(dir, "ref.wav");
    writeFileSync(refPath, buildWavBuffer([0.1, -0.1], 24000));
    const engine = await createCosyVoice3ColabCudaEngine({
      assumeAvailable: true,
      refAudioPath: refPath,
      execFile: async () => ({ stdout: "no markers" }),
      postProcess: async () => ({ duration: 1 }),
    });
    await expect(
      engine.generate([{ id: 1, voiceover: "hi", visualType: "hook" }], dir),
    ).rejects.toThrow(/no summary line/);
  });
});
