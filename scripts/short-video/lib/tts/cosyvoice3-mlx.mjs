/**
 * CosyVoice3-MLX engine adapter.
 *
 * CosyVoice3-MLX is a multilingual TTS model on Apple Silicon that supports
 * voice cloning (ref_audio) + emotion control (instruct_text) + speed control
 * simultaneously. Apache-2.0 license (commercial OK).
 *
 * Key differences from F5-TTS-MLX:
 * - Supports instruct_text for emotion/style control (F5 has no emotion control)
 * - No duration parameter needed (CosyVoice3 auto-determines length)
 * - MLX version auto-appends <|endofprompt|> — do NOT include it in instruct_text
 * - Same venv as F5 (~/.video-tts-env, Python 3.12)
 *
 * Post-processing: same as F5 — resample only, no silenceremove/prosody/denoise.
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, engineTtsText } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const CV3_MLX_BATCH_SCRIPT = join(ROOT_DIR, "cosyvoice3_mlx_batch_tts.py");
const CV3_MLX_VENV = join(process.env.HOME || "", ".video-tts-env");
const CV3_MLX_SPEED = parseFloat(process.env.COSYVOICE3_SPEED) || 1.0;
const CV3_MLX_MODEL_DIR =
  process.env.COSYVOICE3_MLX_MODEL_DIR || join(process.env.HOME || "", ".cosyvoice3-mlx-model");
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");
const CV3_REF_TEXT_FILE = join(ROOT_DIR, "voice-samples", "voice-sample-ref-text.txt");

// ── Emotion instructions per visualType/refStyle ──
// CosyVoice3 MLX instruct format: "You are a helpful assistant. <emotion instruction>."
// Do NOT add <|endofprompt|> — MLX version auto-appends it.
const INSTRUCT_MAP = {
  hook: "You are a helpful assistant. Speak with an excited and shocked tone, as if breaking incredible news.",
  narrative: "You are a helpful assistant. Speak with a calm and measured tone, like a narrator.",
  data: "You are a helpful assistant. Speak with a clear and informative tone, emphasizing key data points.",
  cta: "You are a helpful assistant. Speak with an energetic and persuasive tone, encouraging the listener to act now.",
};

/**
 * Resolve instruct_text for a scene based on visualType or refStyle.
 * @param {{visualType?: string, refStyle?: string}} scene
 * @returns {string|undefined} instruct_text, or undefined for plain clone.
 */
export function resolveInstructForScene(scene) {
  const style = scene?.refStyle || scene?.visualType;
  if (!style) return undefined;
  return INSTRUCT_MAP[style];
}

/**
 * Build the CosyVoice3 batch manifest. Each entry carries instruct_text
 * when the scene has a recognized visualType/refStyle.
 *
 * @param {Array<{id: number, voiceover: string, visualType?: string, refStyle?: string}>} scenes
 * @returns {Array<{sceneId: number, text: string, output: string, instruct_text?: string}>}
 */
export function buildCV3Manifest(scenes) {
  return scenes.map((s) => {
    const entry = {
      sceneId: s.id,
      text: engineTtsText(s.voiceover),
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
 * Check if CosyVoice3-MLX is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(CV3_MLX_BATCH_SCRIPT)) return false;
  if (!existsSync(CV3_MLX_VENV)) return false;
  if (!existsSync(CV3_REF_AUDIO)) return false;
  if (!existsSync(CV3_MLX_MODEL_DIR)) return false;
  try {
    await execAsync(
      `source ${CV3_MLX_VENV}/bin/activate && python3 -c "import mlx_audio" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create CosyVoice3-MLX engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createCosyVoice3MLXEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "cosyvoice3-mlx",
    info: `CosyVoice3-MLX (cloned from ${CV3_REF_AUDIO}, speed=${CV3_MLX_SPEED})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const manifestPath = join(outputDir, "cv3-manifest.json");
      const manifest = buildCV3Manifest(scenes);
      for (const s of scenes) {
        const instruct = resolveInstructForScene(s);
        if (instruct) {
          const style = s.refStyle || s.visualType;
          console.log(`  🎭 Scene ${s.id}: ${style} → emotion instruct`);
        }
      }
      const { writeFileSync: writeSync } = await import("fs");
      writeSync(manifestPath, JSON.stringify(manifest));

      const refText = readFileSync(CV3_REF_TEXT_FILE, "utf-8").trim();

      console.log("  Loading CosyVoice3-MLX model (once for all scenes)...");
      const { stdout } = await execAsync(
        `source ${CV3_MLX_VENV}/bin/activate && HF_HUB_OFFLINE=1 HF_HUB_DISABLE_XET=1 PYTHONUNBUFFERED=1 ` +
          `python3 "${CV3_MLX_BATCH_SCRIPT}" ` +
          `--manifest "${manifestPath}" --output-dir "${outputDir}" ` +
          `--ref-audio "${CV3_REF_AUDIO}" --ref-text "${refText.replace(/"/g, '\\"')}" ` +
          `--speed ${CV3_MLX_SPEED} --model-dir "${CV3_MLX_MODEL_DIR}" 2>&1`,
      );

      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse CosyVoice3-MLX JSON output:", e.message);
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No CosyVoice3-MLX results parsed from batch output");
      }

      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const finalResults = [];
      for (const r of batchResults) {
        const audioPath = r.audioPath;
        if (!audioPath) {
          console.error(`  Scene ${r.sceneId}: no output, skipping`);
          continue;
        }
        const duration = await postProcessBatch(audioPath, {
          useSilenceFilter: false,
          resample: true,
          prosody: null,
        });
        finalResults.push({ sceneId: r.sceneId, audioPath, duration });
        console.log(`  Scene ${r.sceneId}: ${duration.toFixed(2)}s`);
      }

      return finalResults;
    },
  };
}
