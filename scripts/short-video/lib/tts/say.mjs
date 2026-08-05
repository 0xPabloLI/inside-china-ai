/**
 * macOS `say` command engine adapter.
 *
 * Last-resort per-scene engine. Uses the built-in macOS `say` command
 * with the Daniel voice. Post-processing uses silenceremove + resample.
 */

import { execSync, exec } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { postProcessAudio, getDuration } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const SAY_VOICE = "Daniel";
const SAY_RATE = "190";

/**
 * Check if macOS `say` is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  return process.platform === "darwin";
}

/**
 * Create macOS `say` engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createSayEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "say",
    info: `macOS say (${SAY_VOICE}, rate=${SAY_RATE})`,
    useSilenceFilter: true,
    resample: true,

    async generate(scenes, outputDir) {
      const results = [];
  const hasFfprobe = await isCommandAvailable("ffprobe");

      for (const scene of scenes) {
        const tempFile = join(tmpdir(), `tts-scene-${scene.id}.txt`);
        writeFileSync(tempFile, scene.voiceover);

        const rawPath = join(outputDir, `scene-${scene.id}-raw.aiff`);
        const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

        execSync(`say -v ${SAY_VOICE} -r ${SAY_RATE} -f "${tempFile}" -o "${rawPath}"`);
        await postProcessAudio(rawPath, audioPath, {
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
