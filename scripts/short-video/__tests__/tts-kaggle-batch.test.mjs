/**
 * Tests for Kaggle batch push semantics (#241).
 *
 * Behaviour under test (issue #241 + review comment 2026-09-11):
 *  - ONE kernel push carries the whole manifest (N scenes → 1 push, not N
 *    pushes) — the ~5min kernel setup (pip install + model load) is the
 *    dominant TTS cost, so batching is the entire point of the engine;
 *  - the RUNNING budget default is 30min (issue ask: 20min tripped on slow
 *    torch/model downloads even though inference is only ~64s);
 *  - the engine honours injected deps (exec/poll/postProcess) so the batch
 *    contract is testable without touching real Kaggle.
 *
 * All tests use mock deps — no real `kaggle` CLI calls, no real GPU.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildCV3CudaManifest,
  createCosyVoice3KaggleCudaEngine,
  pollKernelStatus,
} from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";

const SCENES = [
  { id: 1, voiceover: "Hook line about a world model.", visualType: "hook" },
  { id: 2, voiceover: "Narrative body with 14 billion parameters.", visualType: "narrative" },
  { id: 3, voiceover: "It hit 720p at 60 frames per second.", visualType: "data" },
];

/** Mock exec: records every command; answers `kaggle kernels output` with a
 *  fake summary.json + wav files so the download/post-process path completes. */
function makeBatchExecMock(scenes) {
  const commands = [];
  return {
    commands,
    exec: async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("kaggle kernels output")) {
        const dir = cmd.match(/-p "([^"]+)"/)[1];
        mkdirSync(join(dir, "output"), { recursive: true });
        writeFileSync(
          join(dir, "output", "summary.json"),
          JSON.stringify({
            segments: scenes.map((s) => ({
              sceneId: s.id,
              output: `scene-${s.id}.wav`,
              error: null,
            })),
          }),
        );
        for (const s of scenes) {
          writeFileSync(join(dir, "output", `scene-${s.id}.wav`), "RIFFmockwav");
        }
      }
      return { stdout: "" };
    },
  };
}

describe("buildCV3CudaManifest — batch manifest shape", () => {
  it("one manifest entry per scene (batch, not per-scene kernels)", () => {
    const manifest = buildCV3CudaManifest(SCENES);
    expect(manifest).toHaveLength(3);
    expect(manifest.map((m) => m.sceneId)).toEqual([1, 2, 3]);
    expect(manifest.every((m) => typeof m.text === "string" && m.output === `scene-${m.sceneId}.wav`)).toBe(true);
  });
});

describe("engine generate — one kernel push for the whole manifest (#241)", () => {
  it("pushes exactly ONE kernel whose manifest embeds all scenes, then polls and downloads once", async () => {
    const outDir = join(tmpdir(), `tts-kaggle-batch-${process.pid}-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    const { commands, exec } = makeBatchExecMock(SCENES);
    const pollCalls = [];
    const engine = await createCosyVoice3KaggleCudaEngine({
      exec,
      poll: async (kernelId, opts) => {
        pollCalls.push({ kernelId, opts });
        return { queuedMs: 0, runningMs: 0 };
      },
      postProcess: async () => 3.0,
    });
    expect(engine).not.toBeNull();

    const results = await engine.generate(SCENES, outDir);

    const pushes = commands.filter((c) => c.includes("kaggle kernels push"));
    const polls = commands.filter((c) => c.includes("kaggle kernels status"));
    const downloads = commands.filter((c) => c.includes("kaggle kernels output"));
    expect(pushes).toHaveLength(1);
    expect(polls).toHaveLength(0); // status polling goes through the injected poll seam
    expect(downloads).toHaveLength(1);

    // The single push embeds ALL scenes in the manifest.
    const kernelScript = readFileSync(
      join(outDir, ".kaggle-kernel", "cosyvoice3_cuda_kernel.py"),
      "utf-8",
    );
    const manifestLine = kernelScript
      .split("\n")
      .find((l) => l.startsWith("MANIFEST_JSON"));
    expect(manifestLine).toBeTruthy();
    const manifest = JSON.parse(manifestLine.match(/r'''(.*)'''/)[1]);
    expect(manifest).toHaveLength(3);

    expect(pollCalls).toHaveLength(1);
    expect(results.map((r) => r.sceneId)).toEqual([1, 2, 3]);

    rmSync(outDir, { recursive: true, force: true });
  });
});

describe("pollKernelStatus — RUNNING budget default is 30min (#241)", () => {
  it("the default run timeout message reports a 30min budget", async () => {
    let t = 0;
    const outputs = Array(200).fill("k running: 2026-09-11");
    const deps = {
      exec: async () => ({ stdout: outputs.shift() ?? "k running: x" }),
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
      log: () => {},
    };
    // No explicit runTimeoutMs — the module default is under test.
    await expect(pollKernelStatus("u/k", {}, deps)).rejects.toThrow(
      /run timeout 30min/,
    );
  });
});
