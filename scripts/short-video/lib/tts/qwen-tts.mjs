/**
 * Qwen3-TTS engine adapter — fallback TTS engine.
 *
 * Qwen3-TTS-12Hz-0.6B-Base: 3-second rapid voice clone with MPS support.
 * Fast on Apple Silicon, lower quality than CosyVoice 3 but reliable.
 * Batch mode: model loaded once for all scenes.
 *
 * Post-processing: silenceremove + resample.
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, getProsodyProfile } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const QWEN_BATCH_SCRIPT = join(ROOT_DIR, "qwen_tts_batch.py");
const QWEN_VENV = join(process.env.HOME || "", ".qwen-tts-env");
const QWEN_MODEL_DIR =
  process.env.QWEN_TTS_MODEL_DIR || "/tmp/qwen-tts-model";
const QWEN_LANGUAGE = process.env.QWEN_TTS_LANGUAGE || "English";
const QWEN_REF_AUDIO = join(ROOT_DIR, "assets", "voice-sample-24k.wav");
const QWEN_REF_TEXT_FILE = join(
  ROOT_DIR,
  "assets",
  "voice-sample-ref-text.txt",
);

/**
 * Check if Qwen3-TTS is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(QWEN_BATCH_SCRIPT)) return false;
  if (!existsSync(QWEN_VENV)) return false;
  if (!existsSync(QWEN_MODEL_DIR)) return false;
  if (!existsSync(QWEN_REF_AUDIO)) return false;
  try {
    await execAsync(
      `source ${QWEN_VENV}/bin/activate && python3 -c "import qwen_tts" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create Qwen3-TTS engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createQwenTTSEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "qwen-tts",
    info: `Qwen3-TTS (cloned from ${QWEN_REF_AUDIO}, lang=${QWEN_LANGUAGE})`,
    useSilenceFilter: true,
    resample: true,

    async generate(scenes, outputDir) {
      const { writeFileSync: writeSync } = await import("fs");
      const manifestPath = join(outputDir, "qwen-manifest.json");
      const manifest = scenes.map((s) => ({
        sceneId: s.id,
        text: s.voiceover,
        output: `scene-${s.id}.wav`,
      }));
      writeSync(manifestPath, JSON.stringify(manifest));

      const refText = readFileSync(QWEN_REF_TEXT_FILE, "utf-8").trim();

      console.log("  Loading Qwen3-TTS model (once for all scenes)...");
      const { stdout } = await execAsync(
        `source ${QWEN_VENV}/bin/activate && PYTHONUNBUFFERED=1 ` +
          `QWEN_TTS_MODEL_DIR="${QWEN_MODEL_DIR}" ` +
          `QWEN_TTS_REF_AUDIO="${QWEN_REF_AUDIO}" ` +
          `QWEN_TTS_REF_TEXT="${refText.replace(/"/g, '\\"')}" ` +
          `QWEN_TTS_LANGUAGE="${QWEN_LANGUAGE}" ` +
          `python3 "${QWEN_BATCH_SCRIPT}" ` +
          `--manifest "${manifestPath}" --output-dir "${outputDir}" ` +
          `--language "${QWEN_LANGUAGE}" 2>&1`,
      );

      // Parse results from stdout
      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse Qwen3-TTS JSON output:", e.message);
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No Qwen3-TTS results parsed from batch output");
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
          useSilenceFilter: true,
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
