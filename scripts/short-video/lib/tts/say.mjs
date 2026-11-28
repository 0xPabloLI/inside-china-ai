/**
 * macOS `say` command engine adapter.
 *
 * Last-resort per-scene engine. Uses the built-in macOS `say` command
 * with the Daniel voice. Post-processing uses silenceremove + resample.
 */

import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { postProcessAudio, getDuration } from "./post-process.mjs";
import { estimateDurationSeconds } from "./ffmpeg-cmd.mjs";
import { FFPROBE_BIN, binaryUsable } from "../ffmpeg-bins.mjs";
import { resolveSilenceFloorMs } from "./silence-trim.mjs";

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
  // One read per engine instance: the descriptor (cache key) and the post-process
  // call cannot disagree even if the env changes mid-run.
  const silenceFloorMs = resolveSilenceFloorMs();

  return {
    name: "say",
    info: `macOS say (${SAY_VOICE}, rate=${SAY_RATE})`,
    useSilenceFilter: true,
    // #786: these engines already ran the silence filter; the floor comes from
    // the same resolver the production engine uses, so TTS_SILENCE_FLOOR_MS is
    // one lever for every engine and always matches the cache key.
    silenceFloorMs,
    resample: true,

    async generate(scenes, outputDir) {
      const results = [];
      // #1599: FFPROBE_BIN is an absolute path that works without Homebrew on
      // PATH — `which ffprobe` would silently report it missing.
      const canProbe = binaryUsable(FFPROBE_BIN);

      for (const scene of scenes) {
        const tempFile = join(tmpdir(), `tts-scene-${scene.id}.txt`);
        writeFileSync(tempFile, scene.ttsText || scene.voiceover);

        const rawPath = join(outputDir, `scene-${scene.id}-raw.aiff`);
        const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

        // #1598: argv — tempFile/rawPath are generated paths, never shell.
        execFileSync("say", [
          "-v",
          SAY_VOICE,
          "-r",
          String(SAY_RATE),
          "-f",
          tempFile,
          "-o",
          rawPath,
        ]);
        await postProcessAudio(rawPath, audioPath, {
          useSilenceFilter: true,
          silenceFloorMs,
          resample: true,
        });

        // Get exact duration
        let duration;
        let durationMethod;
        if (canProbe) {
          duration = await getDuration(audioPath);
          durationMethod = "ffprobe";
        } else {
          duration = estimateDurationSeconds(scene.voiceover);
          durationMethod = "word-estimate";
          console.warn(
            `  ⚠️ Scene ${scene.id}: ffprobe unusable (FFPROBE_BIN=${FFPROBE_BIN}) — ` +
              `duration estimated from voiceover text; timeline may drift`,
          );
        }

        results.push({ sceneId: scene.id, audioPath, duration, durationMethod });
        console.log(`  Scene ${scene.id}: ${duration.toFixed(2)}s`);
      }

      return results;
    },
  };
}
