/**
 * edge-tts (Microsoft Neural TTS) engine adapter.
 *
 * Per-scene engine with network retry logic. Post-processing uses
 * silenceremove but does NOT resample (unlike other engines).
 */

import { execFile } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { postProcessAudio, getDuration } from "./post-process.mjs";
import { resolveSilenceFloorMs } from "./silence-trim.mjs";

const execFileAsync = promisify(execFile);

// ── Config ──
const EDGE_VOICE = "en-US-BrianNeural";
const EDGE_RATE = "+8%";

/**
 * Check if edge-tts is available.
 * @returns {Promise<{bin: string, args: string[]}|null>} argv prefix if available, null otherwise.
 */
async function findCommand() {
  // Check for edge-tts CLI
  try {
    await execFileAsync("which", ["edge-tts"]);
    return { bin: "edge-tts", args: [] };
  } catch {
    // fall through
  }
  // Check for Python module
  try {
    await execFileAsync("python3", ["-m", "edge_tts", "--version"]);
    return { bin: "python3", args: ["-m", "edge_tts"] };
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
  // One read per engine instance: the descriptor (cache key) and the post-process
  // call cannot disagree even if the env changes mid-run.
  const silenceFloorMs = resolveSilenceFloorMs();

  return {
    name: "edge-tts",
    info: `edge-tts (${EDGE_VOICE}, rate=${EDGE_RATE})`,
    useSilenceFilter: true,
    // #786: these engines already ran the silence filter; the floor comes from
    // the same resolver the production engine uses, so TTS_SILENCE_FLOOR_MS is
    // one lever for every engine and always matches the cache key.
    silenceFloorMs,
    resample: false, // edge-tts path does NOT resample

    async generate(scenes, outputDir) {
      const results = [];
      const hasFfprobe = await isCommandAvailable("ffprobe");

      for (const scene of scenes) {
        const tempFile = join(tmpdir(), `tts-scene-${scene.id}.txt`);
        writeFileSync(tempFile, scene.ttsText || scene.voiceover);

        const rawPath = join(outputDir, `scene-${scene.id}-raw.mp3`);
        const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

        // Generate raw TTS audio (with retry for network instability)
        let ttsSuccess = false;
        for (let attempt = 1; attempt <= 3 && !ttsSuccess; attempt++) {
          try {
            // #1598: argv — tempFile/rawPath are generated paths, never shell.
            await execFileAsync(command.bin, [
              ...command.args,
              "--voice",
              EDGE_VOICE,
              `--rate=${EDGE_RATE}`,
              "--file",
              tempFile,
              "--write-media",
              rawPath,
            ]);
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
          silenceFloorMs,
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
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}
