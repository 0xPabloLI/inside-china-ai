/**
 * edge-tts (Microsoft Neural TTS) engine adapter.
 *
 * Per-scene engine with network retry logic. Post-processing uses
 * silenceremove but does NOT resample (unlike other engines).
 */

import { exec } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { postProcessAudio, getDuration } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const EDGE_VOICE = "en-US-BrianNeural";
const EDGE_RATE = "+8%";

/**
 * Check if edge-tts is available.
 * @returns {Promise<string|null>} Command string if available, null otherwise.
 */
async function findCommand() {
  // Check for edge-tts CLI
  try {
    await execAsync("which edge-tts");
    return "edge-tts";
  } catch {
    // fall through
  }
  // Check for Python module
  try {
    await execAsync("python3 -m edge_tts --version");
    return "python3 -m edge_tts";
  } catch {
    return null;
  }
}

/**
 * Create edge-tts engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createEdgeTTSEngine() {
  const command = await findCommand();
  if (!command) return null;

  return {
    name: "edge-tts",
    info: `edge-tts (${EDGE_VOICE}, rate=${EDGE_RATE})`,
    useSilenceFilter: true,
    resample: false, // edge-tts path does NOT resample

    async generate(scenes, outputDir) {
      const results = [];
      const hasFfprobe = await isCommandAvailable("ffprobe");

      for (const scene of scenes) {
        const tempFile = join(tmpdir(), `tts-scene-${scene.id}.txt`);
        writeFileSync(tempFile, scene.voiceover);

        const rawPath = join(outputDir, `scene-${scene.id}-raw.mp3`);
        const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

        // Generate raw TTS audio (with retry for network instability)
        let ttsSuccess = false;
        for (let attempt = 1; attempt <= 3 && !ttsSuccess; attempt++) {
          try {
            await execAsync(
              `${command} --voice ${EDGE_VOICE} --rate=${EDGE_RATE} --file "${tempFile}" --write-media "${rawPath}"`,
            );
            ttsSuccess = true;
          } catch (e) {
            if (attempt < 3) {
              console.log(`    [retry ${attempt}/3] Scene ${scene.id} TTS failed, retrying...`);
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            } else {
              throw e;
            }
          }
        }

        // Post-process to compress silence gaps (no resample for edge-tts)
        await postProcessAudio(rawPath, audioPath, {
          useSilenceFilter: true,
          resample: false,
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
