/**
 * CosyVoice3 Kaggle CUDA engine adapter.
 *
 * Runs CosyVoice3 on Kaggle P100 GPU (free, 30h/week) via the Kaggle Kernels API.
 * CUDA ExecutionProvider gives full emotion fidelity — unlike MLX/MPS which have
 * emotion regression vs CUDA baseline (verified 2026-09-07).
 *
 * Workflow:
 *   1. Build manifest from scenes (text + instruct_text with <|endofprompt|>)
 *   2. Embed manifest into Kaggle kernel script
 *   3. Push kernel via `kaggle kernels push` (ref audio from Kaggle dataset)
 *   4. Poll `kaggle kernels status` until complete
 *   5. Download output via `kaggle kernels output`
 *   6. Post-process (resample 44.1kHz) and return results
 *
 * Setup overhead: ~5 min (pip install + clone + model download) per run.
 * Inference: ~2-3 min for 6-8 segments on P100.
 * Total: ~8-10 min per batch (acceptable — user confirmed no near-real-time needed).
 *
 * Requirements:
 *   - Kaggle CLI installed + ~/.kaggle/kaggle.json configured
 *   - Internet enabled on kernel (for pip install + model download)
 *   - GPU enabled (P100)
 *
 * License: Apache-2.0 (CosyVoice3) — commercial OK.
 */

import { exec } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, getProsodyProfile, engineTtsText } from "./post-process.mjs";
import { resolveSceneSpeed } from "./pacing.mjs";

const execAsync = promisify(exec);

// ── Config ──
const KAGGLE_KERNEL_TEMPLATE = join(ROOT_DIR, "kaggle", "cosyvoice3_cuda_kernel.py");
const KAGGLE_KERNEL_SLUG = process.env.COSYVOICE3_KAGGLE_SLUG || "cosyvoice3-cuda-batch";
const KAGGLE_KERNEL_ID = process.env.COSYVOICE3_KAGGLE_USER
  ? `${process.env.COSYVOICE3_KAGGLE_USER}/${KAGGLE_KERNEL_SLUG}`
  : null; // auto-detect from kaggle.json if not set
const KAGGLE_TIMEOUT_MS = parseInt(process.env.COSYVOICE3_KAGGLE_TIMEOUT_MS || "1200000", 10); // 20 min default
const KAGGLE_POLL_INTERVAL_MS = 15000; // 15s
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");

// ── Emotion instructions per visualType/refStyle ──
// Multi-dimensional best practice: Persona + Accent + Emotion + Pacing (#234)
// CUDA (PyTorch) instruct format requires <|endofprompt|> suffix.
const INSTRUCT_MAP = {
  hook: "You are a helpful assistant. You are a tech news anchor on short video. Speak in standard American English with an energetic, clear, and confident tone, breaking major news.<|endofprompt|>",
  narrative:
    "You are a helpful assistant. You are a tech documentary narrator. Speak in standard American English with a calm, engaging, and professional tone at a steady pace.<|endofprompt|>",
  data: "You are a helpful assistant. You are a tech analyst. Speak in standard American English with an authoritative, precise, and clear tone, emphasizing key metrics.<|endofprompt|>",
  cta: "You are a helpful assistant. You are a warm and engaging host. Speak in standard American English with an enthusiastic, persuasive, and welcoming tone.<|endofprompt|>",
};

/**
 * Resolve instruct_text for a scene based on visualType or refStyle.
 * Supports explicit scene.instruct override.
 * @param {{visualType?: string, refStyle?: string, instruct?: string}} scene
 * @returns {string|undefined}
 */
export function resolveInstructForScene(scene) {
  if (scene?.instruct) {
    return scene.instruct.endsWith("<|endofprompt|>")
      ? scene.instruct
      : `${scene.instruct}<|endofprompt|>`;
  }
  const style = scene?.refStyle || scene?.visualType;
  if (!style) return undefined;
  return INSTRUCT_MAP[style];
}

/**
 * Build the CosyVoice3 batch manifest for CUDA (with <|endofprompt|>).
 *
 * Baseline = the user-approved Kaggle P100 emotion samples
 * (assets/tts-comparison/cosyvoice3-kaggle-p100-cuda/, verified 2026-09-07):
 * inference_instruct2 with INSTRUCT_MAP text and ref audio, NO rubberband
 * post-processing — it distorts timbre away from the approved sound (hook
 * accent drift, CTA mismatch). Opt in via TTS_PROSODY=1.
 *
 * Per-scene native speed (#235): boost-eligible scenes (EN non-hook) carry a
 * manifest `speed` entry the kernel applies as mel interpolation — native, no
 * atempo step. Policy and clamp live in ./pacing.mjs; TTS_PROSODY=1 overrides.
 *
 * @param {Array<{id: number, voiceover?: string, ttsText?: string, visualType?: string, refStyle?: string}>} scenes
 * @returns {Array<{sceneId: number, text: string, output: string, instruct_text?: string, speed?: number}>}
 */
export function buildCV3CudaManifest(scenes) {
  const prosodyOptIn = process.env.TTS_PROSODY === "1";
  return scenes.map((s) => {
    const entry = {
      sceneId: s.id,
      text: s.ttsText || engineTtsText(s.voiceover || ""),
      output: `scene-${s.id}.wav`,
    };
    const instruct = resolveInstructForScene(s);
    if (instruct) {
      entry.instruct_text = instruct;
    }
    if (prosodyOptIn) {
      // TTS_PROSODY=1 takes manual control of per-scene pace (legacy opt-in) —
      // the pacing policy below does not apply in that mode.
      const prosody = getProsodyProfile(s.refStyle || s.visualType);
      if (prosody && prosody.tempo !== 1.0) {
        entry.speed = prosody.tempo;
      }
    } else {
      // Per-scene native pacing (#235): ZH 1.0 / EN hook 1.0 / other EN 1.2,
      // clamped ≤1.2. resolveSceneSpeed returns 1.0 for no-boost scenes.
      const speed = resolveSceneSpeed(s);
      if (speed !== 1.0) {
        entry.speed = speed;
      }
    }
    return entry;
  });
}

/**
 * Get Kaggle username from kaggle.json.
 * @returns {string|null}
 */
function getKaggleUsername() {
  if (process.env.COSYVOICE3_KAGGLE_USER) return process.env.COSYVOICE3_KAGGLE_USER;
  try {
    const kaggleJson = JSON.parse(
      readFileSync(join(process.env.HOME || "", ".kaggle", "kaggle.json"), "utf-8"),
    );
    return kaggleJson.username || null;
  } catch {
    return null;
  }
}

/**
 * Check if Kaggle CLI is available and configured.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(KAGGLE_KERNEL_TEMPLATE)) return false;
  if (!existsSync(CV3_REF_AUDIO)) return false;
  const username = getKaggleUsername();
  if (!username) return false;
  try {
    await execAsync("kaggle --version 2>/dev/null");
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll Kaggle kernel status until complete or timeout.
 * @param {string} kernelId - e.g. "username/cosyvoice3-cuda-batch"
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 * @throws {Error} on timeout or kernel failure
 */
async function pollKernelStatus(kernelId, timeoutMs) {
  const startTime = Date.now();
  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`Kaggle kernel timed out after ${Math.round(timeoutMs / 1000)}s`);
    }

    let status;
    try {
      const { stdout } = await execAsync(`kaggle kernels status ${kernelId} 2>&1`);
      status = stdout.trim();
    } catch (e) {
      status = e.stdout || e.message || "unknown";
    }

    if (status.toLowerCase().includes("complete")) {
      console.log("  ✓ Kaggle kernel complete");
      return;
    }
    if (status.toLowerCase().includes("error") || status.toLowerCase().includes("cancel")) {
      throw new Error(`Kaggle kernel failed: ${status}`);
    }

    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    console.log(
      `  ⏳ Kaggle kernel running... ${mins}m${secs}s elapsed (${status.split("\n")[0]})`,
    );
    await new Promise((r) => setTimeout(r, KAGGLE_POLL_INTERVAL_MS));
  }
}

/**
 * Create CosyVoice3 Kaggle CUDA engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createCosyVoice3KaggleCudaEngine() {
  if (!(await isAvailable())) return null;

  const username = getKaggleUsername();
  const kernelId = `${username}/${KAGGLE_KERNEL_SLUG}`;

  return {
    name: "cosyvoice3-kaggle-cuda",
    info: `CosyVoice3-Kaggle-CUDA (P100, cloned from ${CV3_REF_AUDIO})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const manifest = buildCV3CudaManifest(scenes);

      for (const s of scenes) {
        const instruct = resolveInstructForScene(s);
        if (instruct) {
          const style = s.refStyle || s.visualType;
          console.log(`  🎭 Scene ${s.id}: ${style} → emotion instruct (CUDA)`);
        }
      }

      // ── Prepare Kaggle kernel ──
      const template = readFileSync(KAGGLE_KERNEL_TEMPLATE, "utf-8");
      const manifestJson = JSON.stringify(manifest);

      const kernelScript = template
        .replaceAll("__MANIFEST_JSON__", manifestJson);

      const tempDir = join(outputDir, ".kaggle-kernel");
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(join(tempDir, "cosyvoice3_cuda_kernel.py"), kernelScript);
      writeFileSync(
        join(tempDir, "kernel-metadata.json"),
        JSON.stringify(
          {
            id: kernelId,
            title: KAGGLE_KERNEL_SLUG,
            code_file: "cosyvoice3_cuda_kernel.py",
            language: "python",
            kernel_type: "script",
            is_private: true,
            enable_gpu: true,
            enable_internet: true,
            dataset_sources: ["xPabloLI/tts-ref-audio", "xPabloLI/cosyvoice3-model"],
            competition_sources: [],
            kernel_sources: [],
          },
          null,
          2,
        ),
      );

      // ── Push kernel ──
      console.log(`  📤 Pushing Kaggle kernel (${manifest.length} segments)...`);
      await execAsync(`kaggle kernels push -p "${tempDir}" 2>&1`);

      // ── Poll status ──
      console.log(
        `  ⏳ Waiting for Kaggle kernel (timeout ${Math.round(KAGGLE_TIMEOUT_MS / 60000)}min)...`,
      );
      await pollKernelStatus(kernelId, KAGGLE_TIMEOUT_MS);

      // ── Download output ──
      const kaggleOutputDir = join(tempDir, "kaggle-output");
      mkdirSync(kaggleOutputDir, { recursive: true });
      console.log("  📥 Downloading Kaggle kernel output...");
      try {
        await execAsync(`kaggle kernels output ${kernelId} -p "${kaggleOutputDir}" 2>&1`);
      } catch (e) {
        throw new Error(`Failed to download Kaggle output: ${e.message}`);
      }

      // ── Read summary ──
      const summaryPath = join(kaggleOutputDir, "output", "summary.json");
      if (!existsSync(summaryPath)) {
        throw new Error("Kaggle kernel did not produce summary.json");
      }
      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
      const failed = summary.segments.filter((s) => s.error);
      if (failed.length > 0) {
        console.error(
          `  ⚠️ ${failed.length} segments failed: ${failed.map((f) => `scene-${f.sceneId}`).join(", ")}`,
        );
      }

      // ── Post-process ──
      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const finalResults = [];
      for (const s of summary.segments) {
        if (s.error) continue;
        const srcPath = join(kaggleOutputDir, "output", s.output);
        if (!existsSync(srcPath)) {
          console.error(`  Scene ${s.sceneId}: output file missing (${s.output})`);
          continue;
        }
        const destPath = join(outputDir, s.output);
        const { copyFileSync } = await import("fs");
        copyFileSync(srcPath, destPath);

        // Rubberband prosody OFF by default: the user-approved P100 samples
        // were plain instruct2 output. Pitch/tempo shifting audibly changes
        // timbre (hook accent drift, CTA mismatch vs approved baseline).
        // Opt back in with TTS_PROSODY=1; global pace stays available via
        // TTS_ATEMPO (post-process.mjs) without touching pitch.
        const scene = scenes.find((sc) => sc.id === s.sceneId);
        const prosody =
          process.env.TTS_PROSODY === "1" && scene
            ? getProsodyProfile(scene.refStyle || scene.visualType)
            : null;
        const duration = await postProcessBatch(destPath, {
          useSilenceFilter: false,
          resample: true,
          prosody,
        });
        finalResults.push({ sceneId: s.sceneId, audioPath: destPath, duration });
        console.log(`  Scene ${s.sceneId}: ${duration.toFixed(2)}s`);
      }

      if (finalResults.length === 0) {
        throw new Error("No successful TTS results from Kaggle kernel");
      }

      return finalResults;
    },
  };
}
