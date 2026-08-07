/**
 * Kokoro neural TTS engine adapter.
 *
 * Kokoro is a per-scene engine (no batch mode). Each scene's text is written
 * to a temp file, passed to the Kokoro Python script, and the output WAV is
 * post-processed to MP3 with silenceremove.
 */

import { exec } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessAudio, getDuration, getAtempo } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const KOKORO_SCRIPT = join(ROOT_DIR, "kokoro_tts.py");
const KOKORO_VENV_CANDIDATES = [join(process.env.HOME || "", ".tts-env"), "/tmp/tts-env"];
const KOKORO_VOICE = "am_michael"; // Clear, authoritative male
const KOKORO_SPEED = 1.1; // ~10% faster than normal

/**
 * Check if Kokoro is available.
 * @returns {Promise<string|null>} Venv path if available, null otherwise.
 */
async function findVenv() {
  if (!existsSync(KOKORO_SCRIPT)) return null;
  for (const venvPath of KOKORO_VENV_CANDIDATES) {
    if (!existsSync(venvPath)) continue;
    try {
      await execAsync(`source ${venvPath}/bin/activate && python3 -c "import kokoro" 2>/dev/null`);
      return venvPath;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Create Kokoro engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createKokoroEngine() {
  const venvPath = await findVenv();
  if (!venvPath) return null;

  return {
    name: "kokoro",
    info: `Kokoro neural TTS (${KOKORO_VOICE}, speed=${KOKORO_SPEED})`,
    useSilenceFilter: true,
    resample: true,

    async generate(scenes, outputDir) {
      const results = [];
      const atempo = getAtempo();
      const hasFfprobe = await isCommandAvailable("ffprobe");

      for (const scene of scenes) {
        const tempFile = join(tmpdir(), `tts-scene-${scene.id}.txt`);
        writeFileSync(tempFile, scene.voiceover);

        const wavPath = join(outputDir, `scene-${scene.id}-kokoro.wav`);
        const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

        // Generate WAV with Kokoro
        await execAsync(
          `source ${venvPath}/bin/activate && python3 "${KOKORO_SCRIPT}" ` +
            `--file "${tempFile}" --output "${wavPath}" ` +
            `--voice ${KOKORO_VOICE} --speed ${KOKORO_SPEED} 2>&1`,
        );

        // Convert WAV → MP3 with silenceremove + resample
        await postProcessAudio(wavPath, audioPath, {
          useSilenceFilter: true,
          resample: true,
        });

        // Get exact duration
        let duration;
        if (hasFfprobe) {
          duration = await getDuration(audioPath);
        } else {
          const wordCount = scene.voiceover.split(" ").length;
          duration = wordCount / 2.5;
        }

        results.push({ sceneId: scene.id, audioPath, duration });
        console.log(`  Scene ${scene.id}: ${duration.toFixed(2)}s`);
      }

      return results;
    },
  };
}

// ── Helpers ──

async function isCommandAvailable(cmd) {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}
