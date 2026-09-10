/**
 * CosyVoice3 Modal CUDA engine adapter.
 *
 * Runs CosyVoice3 on Modal A100 GPU (paid, ~$30/mo) with full CUDA emotion fidelity.
 * Fallback for when Kaggle P100 quota (30h/week) is exhausted — same CUDA EP, same
 * emotion quality as Kaggle CUDA baseline.
 *
 * Workflow:
 *   1. Build manifest from scenes (text + instruct_text with <|endofprompt|>)
 *   2. Write manifest JSON to temp file
 *   3. Run `modal run cosyvoice3_cuda_modal.py --manifest-file ... --ref-audio ... --output-file ...`
 *   4. Parse output JSON (contains base64-encoded WAV per segment)
 *   5. Decode WAVs, post-process (resample 44.1kHz), return results
 *
 * Cost: ~$0.20-0.50/batch on A100 (first run downloads model ~10min, cached in volume after).
 * Inference: ~1-2 min for 6-8 segments on A100 (faster than Kaggle P100).
 *
 * Requirements:
 *   - Modal CLI installed + authenticated (`modal token new`)
 *   - Ref audio file at scripts/short-video/voice-samples/voice-sample-24k.wav
 *
 * License: Apache-2.0 (CosyVoice3) — commercial OK.
 */

import { exec } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, engineTtsText } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const MODAL_SCRIPT = join(ROOT_DIR, "modal", "cosyvoice3_cuda_modal.py");
const MODAL_TIMEOUT_MS = parseInt(process.env.COSYVOICE3_MODAL_TIMEOUT_MS || "1800000", 10); // 30 min default
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");

// ── Emotion instructions per visualType/refStyle ──
// CUDA (PyTorch) instruct format requires <|endofprompt|> suffix.
const INSTRUCT_MAP = {
  hook: "You are a helpful assistant. Speak with an excited and shocked tone, as if breaking incredible news.<|endofprompt|>",
  narrative:
    "You are a helpful assistant. Speak with a calm and measured tone, like a narrator.<|endofprompt|>",
  data: "You are a helpful assistant. Speak with a clear and informative tone, emphasizing key data points.<|endofprompt|>",
  cta: "You are a helpful assistant. Speak with an energetic and persuasive tone, encouraging the listener to act now.<|endofprompt|>",
};

/**
 * Resolve instruct_text for a scene based on visualType or refStyle.
 * @param {{visualType?: string, refStyle?: string}} scene
 * @returns {string|undefined}
 */
function resolveInstructForScene(scene) {
  const style = scene?.refStyle || scene?.visualType;
  if (!style) return undefined;
  return INSTRUCT_MAP[style];
}

/**
 * Build the CosyVoice3 batch manifest for CUDA (with <|endofprompt|>).
 * @param {Array<{id: number, voiceover: string, visualType?: string, refStyle?: string}>} scenes
 * @returns {Array<{sceneId: number, text: string, output: string, instruct_text?: string}>}
 */
function buildManifest(scenes) {
  return scenes.map((s) => {
    const entry = {
      sceneId: s.id,
      text: s.ttsText || engineTtsText(s.voiceover),
      output: `scene-${s.id}.wav`,
    };
    const instruct = resolveInstructForScene(s);
    if (instruct) {
      entry.instruct_text = instruct;
    }
    return entry;
  });
}

/**
 * Check if Modal CLI is available and authenticated.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(MODAL_SCRIPT)) return false;
  if (!existsSync(CV3_REF_AUDIO)) return false;
  try {
    await execAsync("modal --version 2>/dev/null");
    return true;
  } catch {
    return false;
  }
}

/**
 * Create CosyVoice3 Modal CUDA engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createCosyVoice3ModalCudaEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "cosyvoice3-modal-cuda",
    info: `CosyVoice3-Modal-CUDA (A100, cloned from ${CV3_REF_AUDIO})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const manifest = buildManifest(scenes);

      for (const s of scenes) {
        const instruct = resolveInstructForScene(s);
        if (instruct) {
          const style = s.refStyle || s.visualType;
          console.log(`  🎭 Scene ${s.id}: ${style} → emotion instruct (CUDA)`);
        }
      }

      // ── Prepare temp files ──
      const tempDir = join(outputDir, ".modal-run");
      mkdirSync(tempDir, { recursive: true });
      const manifestPath = join(tempDir, "manifest.json");
      const outputPath = join(tempDir, "output.json");
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // ── Run Modal script ──
      console.log(`  📤 Running Modal CosyVoice3 CUDA (${manifest.length} segments)...`);
      console.log(`  ⏳ Timeout: ${Math.round(MODAL_TIMEOUT_MS / 60000)}min (first run includes model download)`);

      const { stdout, stderr } = await execAsync(
        `modal run "${MODAL_SCRIPT}" --manifest-file "${manifestPath}" --ref-audio "${CV3_REF_AUDIO}" --output-file "${outputPath}"`,
        { timeout: MODAL_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
      );

      if (stdout) console.log(stdout.split("\n").slice(-5).join("\n"));

      // ── Read output ──
      if (!existsSync(outputPath)) {
        if (stderr) console.error(stderr.slice(-2000));
        throw new Error("Modal script did not produce output.json");
      }
      const summary = JSON.parse(readFileSync(outputPath, "utf-8"));
      const failed = summary.segments.filter((s) => s.error);
      if (failed.length > 0) {
        console.error(
          `  ⚠️ ${failed.length} segments failed: ${failed.map((f) => `scene-${f.sceneId}`).join(", ")}`,
        );
      }

      // ── Decode WAVs + post-process ──
      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const { writeFileSync: writeFs } = await import("fs");
      const finalResults = [];
      for (const s of summary.segments) {
        if (s.error) continue;
        const destPath = join(outputDir, s.output);
        const wavBuffer = Buffer.from(s.wav_b64, "base64");
        writeFs(destPath, wavBuffer);

        const duration = await postProcessBatch(destPath, {
          useSilenceFilter: false,
          resample: true,
          prosody: null,
        });
        finalResults.push({ sceneId: s.sceneId, audioPath: destPath, duration });
        console.log(`  Scene ${s.sceneId}: ${duration.toFixed(2)}s (RTF ${s.rtf || "?"}x)`);
      }

      if (finalResults.length === 0) {
        throw new Error("No successful TTS results from Modal CUDA");
      }

      return finalResults;
    },
  };
}