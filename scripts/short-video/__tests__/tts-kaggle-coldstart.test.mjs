/**
 * Tests for the Kaggle CUDA cold-start contract (#804).
 *
 * Behaviour under test (measured 2026-10-20 on the production 10-scene job):
 *  - `wetext==0.0.4` resolves its fsts with
 *    `snapshot_download("pengzhendong/wetext")` inside `Normalizer.__init__`,
 *    which the engine reaches from `CosyVoice3()` → `CosyVoiceFrontEnd()`.
 *    That download took 1265.2s of a 1800s budget (unauthenticated, rate
 *    limited), leaving 154s of headroom, so the 10-scene run died.
 *  - the fix is a pre-seeded dataset + a local short-circuit, NOT a wider
 *    timeout: a wider timeout pushes the cliff out and keeps burning GPU
 *    minutes on every run.
 *  - the old `subprocess.run(..., capture_output=True, timeout=1800)` threw
 *    away everything the child had printed when the timeout fired, so a
 *    30-minute run produced one exception and zero evidence.
 *
 * These are source-level assertions plus one engine-level metadata check.
 * They pin the shape of the contract, not the runtime (no GPU here).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createCosyVoice3KaggleCudaEngine } from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { wavBytes } from "./fixtures/wav-fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KERNEL_SRC = readFileSync(join(HERE, "..", "kaggle", "cosyvoice3_cuda_kernel.py"), "utf-8");
const INFERENCE_CODE = KERNEL_SRC.match(/INFERENCE_CODE = r'''([\s\S]*?)'''/)[1];

const RUN_INFERENCE_MARKER = "=== Running inference ===";

describe("kernel cold start — wetext snapshot is seeded, not downloaded (#804)", () => {
  it("seeds the modelscope cache before inference starts", () => {
    const callAt = KERNEL_SRC.indexOf("\nseed_wetext_cache()\n");
    const runAt = KERNEL_SRC.indexOf(RUN_INFERENCE_MARKER);
    expect(callAt).toBeGreaterThan(-1);
    expect(runAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(runAt);
  });

  it("seeds the exact path wetext 0.0.4's snapshot_download reads", () => {
    // `snapshot_download("pengzhendong/wetext")` caches under
    // ~/.cache/modelscope/hub/<owner>/<model>; if this drifts the seed lands
    // somewhere the library never looks and the download comes back.
    expect(KERNEL_SRC).toContain('"~/.cache/modelscope/hub/pengzhendong/wetext"');
    expect(KERNEL_SRC).toContain('os.path.join(WETEXT_CACHE, "configuration.json")');
  });

  it("extracts the sealed tarball so dotfiles and subdirs survive the upload", () => {
    // A loose upload lets kaggle-cli drop hidden files (.mdl/.msc) and turn
    // en/ zh/ into archives, which is why the snapshot ships as one tarball
    // with a top-level `wetext/`.
    expect(KERNEL_SRC).toContain('"wetext-snapshot.tar"');
    const sealedAt = KERNEL_SRC.indexOf("os.path.dirname(WETEXT_CACHE)");
    expect(sealedAt).toBeGreaterThan(-1);
  });

  it("falls back to the download instead of failing closed when the mount is absent", () => {
    // Removing the dataset must degrade behaviour, not break the engine.
    expect(KERNEL_SRC).toContain("cosyvoice3-wetext mount missing");
    expect(KERNEL_SRC).toContain("return False");
  });

  it("degrades on a corrupt archive instead of killing the GPU run", () => {
    // A truncated upload raises CalledProcessError / BadZipFile out of
    // `tar xf` / `extractall`. Unguarded, that propagates to the top of the
    // kernel and kills the run before inference — the same cold-start
    // fatality the seed is meant to remove, so it has to be caught.
    const fnAt = KERNEL_SRC.indexOf("def seed_wetext_cache():");
    const seededAt = KERNEL_SRC.indexOf("wetext cache seeded in");
    expect(fnAt).toBeGreaterThan(-1);
    expect(seededAt).toBeGreaterThan(fnAt);
    const fn = KERNEL_SRC.slice(fnAt, seededAt);
    const tryAt = fn.indexOf("    try:");
    const extractAt = fn.indexOf('subprocess.run(["tar", "xf", sealed_tar');
    const exceptAt = fn.indexOf("except Exception as exc:");
    expect(tryAt).toBeGreaterThan(-1);
    expect(extractAt).toBeGreaterThan(tryAt);
    expect(exceptAt).toBeGreaterThan(extractAt);
    const handler = fn.slice(exceptAt);
    expect(handler).toContain("shutil.rmtree(WETEXT_CACHE, ignore_errors=True)");
    expect(handler).toContain("return False");
  });

  it("serves the one snapshot_download call from disk when the seed exists", () => {
    // wetext binds `from modelscope import snapshot_download` at import time,
    // so the patch has to be installed before CosyVoice3() constructs the
    // frontend — assert the order rather than just the presence.
    const patchAt = INFERENCE_CODE.indexOf("_snapshot_from_seed");
    const buildAt = INFERENCE_CODE.indexOf("CosyVoice3(model_dir=model_dir)");
    expect(patchAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(-1);
    expect(patchAt).toBeLessThan(buildAt);
    expect(INFERENCE_CODE).toContain('if repo == "pengzhendong/wetext"');
  });
});

describe("kernel inference — model class and audio assembly", () => {
  it("constructs CosyVoice3 explicitly instead of AutoModel", () => {
    // AutoModel dispatches on which yaml it finds and checks cosyvoice.yaml
    // (v1) first, so a polluted model_dir would silently hand back the v1
    // class and only fail later on a missing speech_tokenizer_v1.onnx.
    expect(INFERENCE_CODE).toContain("from cosyvoice.cli.cosyvoice import CosyVoice3");
    // The comment above may name AutoModel; what must not survive is a call.
    expect(INFERENCE_CODE).not.toContain("AutoModel(");
  });

  it("appends each chunk once per branch (no doubled audio)", () => {
    // The non-instruct branch used to append the same chunk twice, which
    // doubles the duration of every scene without instruct_text.
    const branchAt = INFERENCE_CODE.indexOf('for j in cosyvoice.inference(t["text"]');
    const joinAt = INFERENCE_CODE.indexOf("full = torch.cat(chunks, dim=-1)");
    expect(branchAt).toBeGreaterThan(-1);
    expect(joinAt).toBeGreaterThan(branchAt);
    const branch = INFERENCE_CODE.slice(branchAt, joinAt);
    expect(branch.match(/chunks\.append\(j\['tts_speech'\]\)/g)).toHaveLength(1);
  });
});

describe("kernel timeout — streaming output and split budgets", () => {
  it("streams the child's output instead of buffering it", () => {
    // capture_output=True is what made the 2026-10-20 failure undiagnosable.
    expect(KERNEL_SRC).not.toContain("capture_output=True, text=True, timeout");
    expect(KERNEL_SRC).toContain("subprocess.Popen(");
    expect(KERNEL_SRC).toContain("threading.Thread(");
  });

  it("switches from the load budget to the synthesis budget on `Loaded in`", () => {
    // Cold start and synthesis fail for different reasons at different
    // rates; one blanket timer conflates them.
    expect(KERNEL_SRC).toContain("LOAD_BUDGET_SEC");
    expect(KERNEL_SRC).toContain("SYNTH_PER_SEGMENT_SEC");
    const pumpAt = KERNEL_SRC.indexOf('if line.startswith("Loaded in")');
    expect(pumpAt).toBeGreaterThan(-1);
    const reset = KERNEL_SRC.slice(pumpAt, pumpAt + 200);
    expect(reset).toContain("deadline[0] =");
  });

  it("names the stalled phase when the budget is exhausted", () => {
    expect(KERNEL_SRC).toContain("inference exceeded its budget");
    expect(KERNEL_SRC).toContain("sys.exit(1)");
  });
});

describe("engine metadata — the wetext dataset rides along with the kernel", () => {
  it("declares xPabloLI/cosyvoice3-wetext in dataset_sources", async () => {
    process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
    const outDir = join(tmpdir(), `tts-wetext-ds-${process.pid}-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    // voice-samples/ is not committed, so the default ref-audio probe would
    // make isAvailable() return null on CI. Write one and pass it explicitly.
    const refAudioPath = join(outDir, "voice-sample-24k.wav");
    writeFileSync(refAudioPath, wavBytes("ref"));
    const scenes = [{ id: 1, voiceover: "Hook line.", visualType: "hook" }];
    const engine = await createCosyVoice3KaggleCudaEngine({
      refAudioPath,
      exec: async (cmd) => {
        if (cmd.includes("kaggle kernels output")) {
          const dir = cmd.match(/-p "([^"]+)"/)[1];
          mkdirSync(join(dir, "output"), { recursive: true });
          writeFileSync(
            join(dir, "output", "summary.json"),
            JSON.stringify({
              requestId: readFileSync(
                join(dirname(dirname(dir)), "cosyvoice3_cuda_kernel.py"),
                "utf-8",
              ).match(/REQUEST_ID = r'''(.*?)'''/s)[1],
              segments: [{ sceneId: 1, output: "scene-1.wav", error: null }],
            }),
          );
          writeFileSync(join(dir, "output", "scene-1.wav"), wavBytes("scene-1"));
        }
        return { stdout: "" };
      },
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      postProcess: async () => ({ duration: 3.0 }),
    });
    expect(engine).not.toBeNull();
    try {
      await engine.generate(scenes, outDir);
      const meta = JSON.parse(
        readFileSync(join(outDir, ".kaggle-kernel", "kernel-metadata.json"), "utf-8"),
      );
      expect(meta.dataset_sources).toContain("xPabloLI/cosyvoice3-wetext");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
