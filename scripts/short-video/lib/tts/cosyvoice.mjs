/**
 * CosyVoice 3 engine adapter — primary TTS engine.
 *
 * CosyVoice 3 (Fun-CosyVoice3-0.5B) uses LLM + Flow Matching architecture
 * for high-quality zero-shot voice cloning. Batch mode: model loaded once.
 *
 * Post-processing: silenceremove + resample (24kHz → 44.1kHz).
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, getProsodyProfile } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const COSYVOICE_BATCH_SCRIPT = join(ROOT_DIR, "cosyvoice_batch_tts.py");
const COSYVOICE_VENV = join(process.env.HOME || "", ".cosyvoice-env");
const COSYVOICE_SOURCE_DIR =
  process.env.COSYVOICE_SOURCE_DIR || join(process.env.HOME || "", ".cosyvoice-models", "CosyVoice");
const COSYVOICE_MODEL_DIR =
  process.env.COSYVOICE_MODEL_DIR ||
  join(COSYVOICE_SOURCE_DIR, "pretrained_models", "Fun-CosyVoice3-0.5B");
const COSYVOICE_SPEED = parseFloat(process.env.COSYVOICE_SPEED) || 1.0;
const COSYVOICE_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");
const COSYVOICE_REF_TEXT_FILE = join(
  ROOT_DIR,
  "voice-samples",
  "voice-sample-ref-text.txt",
);

/**
 * Check if CosyVoice 3 is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(COSYVOICE_BATCH_SCRIPT)) return false;
  if (!existsSync(COSYVOICE_VENV)) return false;
  if (!existsSync(COSYVOICE_MODEL_DIR)) return false;
  if (!existsSync(COSYVOICE_REF_AUDIO)) return false;
  try {
    await execAsync(
      `source ${COSYVOICE_VENV}/bin/activate && python3 -c "import torch, torchaudio" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create CosyVoice 3 engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createCosyVoiceEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "cosyvoice",
    info: `CosyVoice 3 (cloned from ${COSYVOICE_REF_AUDIO}, speed=${COSYVOICE_SPEED})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const { writeFileSync: writeSync } = await import("fs");
      const manifestPath = join(outputDir, "cosyvoice-manifest.json");
      const manifest = scenes.map((s) => ({
        sceneId: s.id,
        text: s.voiceover,
        output: `scene-${s.id}.wav`,
      }));
      writeSync(manifestPath, JSON.stringify(manifest));

      const refText = readFileSync(COSYVOICE_REF_TEXT_FILE, "utf-8").trim();

      console.log("  Loading CosyVoice 3 model (once for all scenes)...");
      const { stdout } = await execAsync(
        `source ${COSYVOICE_VENV}/bin/activate && PYTHONUNBUFFERED=1 ` +
          `COSYVOICE_SOURCE_DIR="${COSYVOICE_SOURCE_DIR}" ` +
          `COSYVOICE_MODEL_DIR="${COSYVOICE_MODEL_DIR}" ` +
          `COSYVOICE_REF_AUDIO="${COSYVOICE_REF_AUDIO}" ` +
          `COSYVOICE_REF_TEXT="${refText.replace(/"/g, '\\"')}" ` +
          `COSYVOICE_SPEED="${COSYVOICE_SPEED}" ` +
          `python3 "${COSYVOICE_BATCH_SCRIPT}" ` +
          `--manifest "${manifestPath}" --output-dir "${outputDir}" --speed ${COSYVOICE_SPEED} 2>&1`,
      );

      // Parse results from stdout
      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse CosyVoice JSON output:", e.message);
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No CosyVoice results parsed from batch output");
      }

      // Post-process each with silenceremove + per-scene prosody
      const finalResults = [];
      for (const r of batchResults) {
        const audioPath = r.audioPath;
        if (!audioPath) {
          console.error(`  Scene ${r.sceneId}: no output, skipping`);
          continue;
        }
        const scene = scenes.find((s) => s.id === r.sceneId);
        const prosody = getProsodyProfile(scene?.visualType);
        if (prosody) {
          console.log(`  Scene ${r.sceneId}: prosody=${prosody.label}`);
        }
        const duration = await postProcessBatch(audioPath, {
          useSilenceFilter: false,
          resample: true,
          prosody,
        });
        finalResults.push({ sceneId: r.sceneId, audioPath, duration });
        console.log(`  Scene ${r.sceneId}: ${duration.toFixed(2)}s`);
      }

      return finalResults;
    },
  };
}
