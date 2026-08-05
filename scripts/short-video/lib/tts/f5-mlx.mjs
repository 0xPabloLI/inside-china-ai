/**
 * F5-TTS-MLX engine adapter.
 *
 * F5-TTS-MLX is the highest-quality engine on Apple Silicon (voice cloning
 * via reference audio). It uses batch mode: the model is loaded once and
 * processes all scenes from a single manifest.
 *
 * Post-processing: F5 generates clean audio — silenceremove is SKIPPED.
 * Only atempo (TTS_ATEMPO) is applied if set.
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const F5_MLX_BATCH_SCRIPT = join(ROOT_DIR, "f5_mlx_batch_tts.py");
const F5_MLX_VENV = join(process.env.HOME || "", ".f5-tts-env");
const F5_MLX_SPEED = parseFloat(process.env.F5_SPEED) || 1.0;
const F5_REF_AUDIO = join(ROOT_DIR, "assets", "voice-sample-24k.wav");
const F5_REF_TEXT_FILE = join(ROOT_DIR, "assets", "voice-sample-ref-text.txt");

/**
 * Check if F5-TTS-MLX is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(F5_MLX_BATCH_SCRIPT)) return false;
  if (!existsSync(F5_MLX_VENV)) return false;
  if (!existsSync(F5_REF_AUDIO)) return false;
  try {
    await execAsync(
      `source ${F5_MLX_VENV}/bin/activate && python3 -c "import f5_tts_mlx" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create F5-TTS-MLX engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createF5MLXEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "f5-mlx",
    info: `F5-TTS-MLX (cloned from ${F5_REF_AUDIO}, speed=${F5_MLX_SPEED})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const manifestPath = join(outputDir, "f5-manifest.json");
      const manifest = scenes.map((s) => ({
        sceneId: s.id,
        text: s.voiceover,
        output: `scene-${s.id}.mp3`,
      }));
      // writeFileSync imported at top
      const { writeFileSync: writeSync } = await import("fs");
      writeSync(manifestPath, JSON.stringify(manifest));

      const refText = readFileSync(F5_REF_TEXT_FILE, "utf-8").trim();

      console.log("  Loading F5-TTS-MLX model (once for all scenes)...");
      const { stdout } = await execAsync(
        `source ${F5_MLX_VENV}/bin/activate && HF_HUB_DISABLE_XET=1 PYTHONUNBUFFERED=1 F5_REF_AUDIO="${F5_REF_AUDIO}" F5_REF_TEXT="${refText.replace(/"/g, '\\"')}" python3 "${F5_MLX_BATCH_SCRIPT}" ` +
          `--manifest "${manifestPath}" --output-dir "${outputDir}" --speed ${F5_MLX_SPEED} 2>&1`,
      );

      // Parse results from stdout
      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse F5-MLX JSON output:", e.message);
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No F5-MLX results parsed from batch output");
      }

      // Post-process each: F5 generates clean audio, no silenceremove needed.
      // Only apply atempo if TTS_ATEMPO is set (for speed-up).
      const finalResults = [];
      for (const r of batchResults) {
        const audioPath = r.audioPath;
        const duration = await postProcessBatch(audioPath, {
          useSilenceFilter: false,
          resample: true,
        });
        finalResults.push({ sceneId: r.sceneId, audioPath, duration });
        console.log(`  Scene ${r.sceneId}: ${duration.toFixed(2)}s`);
      }

      return finalResults;
    },
  };
}
