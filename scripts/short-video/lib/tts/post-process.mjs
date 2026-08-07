/**
 * Shared post-processing utilities for TTS engines.
 *
 * - buildFilter():      Build FFmpeg -af filter string based on engine config
 * - getDuration():      Probe exact audio duration with ffprobe
 * - postProcessAudio(): Apply FFmpeg post-processing (silenceremove + resample)
 * - postProcessBatch(): Post-process in-place + get duration (for batch engines)
 * - runWhisperAlignment(): Force-align subtitle timing via text-align.py
 */

import { exec } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";

const execAsync = promisify(exec);

// ── Filter construction ──

/**
 * Build the FFmpeg audio filter string.
 *
 * @param {Object} opts
 * @param {boolean} [opts.useSilenceFilter=true] - If true, apply silenceremove;
 *                                                  if false, only apply atempo (F5 path).
 * @returns {string} Filter string (may be empty).
 */
export function buildFilter({ useSilenceFilter = true } = {}) {
  const atempo = parseFloat(process.env.TTS_ATEMPO) || null;
  if (useSilenceFilter) {
    return (
      "silenceremove=stop_periods=-1:stop_duration=0.25:stop_silence=0.08:stop_threshold=0.018" +
      (atempo ? `,atempo=${atempo}` : "")
    );
  }
  // F5 path: no silenceremove, only atempo if set
  return atempo ? `atempo=${atempo}` : "";
}

/**
 * Get the current atempo value (for logging).
 * @returns {number|null}
 */
export function getAtempo() {
  return parseFloat(process.env.TTS_ATEMPO) || null;
}

// ── Duration probing ──

/**
 * Get exact audio duration using ffprobe.
 * @param {string} audioPath
 * @returns {Promise<number>}
 */
export async function getDuration(audioPath) {
  const { stdout } = await execAsync(
    `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
  );
  return parseFloat(stdout.trim());
}

// ── Post-processing ──

/**
 * Apply FFmpeg post-processing from one file to another.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {Object} opts
 * @param {boolean} [opts.useSilenceFilter=true]
 * @param {boolean} [opts.resample=true] - If true, add -ar 44100 -b:a 192k
 */
export async function postProcessAudio(
  inputPath,
  outputPath,
  { useSilenceFilter = true, resample = true } = {},
) {
  const filter = buildFilter({ useSilenceFilter });
  const afArg = filter ? `-af "${filter}"` : "";
  const resampleArg = resample ? "-ar 44100 -b:a 192k" : "";
  await execAsync(
    `ffmpeg -y -i "${inputPath}" ${afArg} ${resampleArg} "${outputPath}" 2>/dev/null`,
  );
}

/**
 * Post-process a batch engine's audio in-place (temp file + mv) and return duration.
 *
 * Used by F5-MLX and XTTS batch engines: the generated .mp3 is post-processed
 * into a -processed.mp3 temp file, then moved back over the original.
 *
 * @param {string} audioPath
 * @param {Object} opts - Same as postProcessAudio
 * @returns {Promise<number>} Duration of the processed audio
 */
export async function postProcessBatch(audioPath, opts = {}) {
  const processedPath = audioPath.replace(".mp3", "-processed.mp3");
  await postProcessAudio(audioPath, processedPath, opts);
  await execAsync(`mv "${processedPath}" "${audioPath}"`);
  const duration = await getDuration(audioPath);
  return duration;
}

// ── Subtitle alignment ──

/**
 * Force-align subtitle timing using text-align.py (wav2vec2).
 *
 * Output: {outputDir}/subtitle-timing.json — used by lib/subtitles/generate.mjs.
 * Gracefully skips if the alignment script is not found.
 *
 * @param {Array} scenes
 * @param {TTSResult[]} ttsResults
 * @param {string} outputDir
 */
export async function runWhisperAlignment(scenes, ttsResults, outputDir) {
  const alignScript = join(ROOT_DIR, "text-align.py");
  if (!existsSync(alignScript)) {
    console.log("  ⚠️ Force-align script not found, skipping");
    return;
  }

  console.log("  🎯 Running force-align subtitle timing...");

  const manifest = ttsResults.map((r) => ({
    sceneId: r.sceneId,
    text: scenes.find((s) => s.id === r.sceneId)?.voiceover || "",
    audioPath: r.audioPath,
  }));
  const manifestPath = join(outputDir, "whisper-manifest.json");
  const timingPath = join(outputDir, "subtitle-timing.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));

  try {
    await execAsync(
      `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ~/.f5-tts-env/bin/python3 "${alignScript}" ` +
        `--manifest "${manifestPath}" --output "${timingPath}" 2>&1`,
    );
    console.log("  ✅ Subtitle timing saved (WhisperX wav2vec2 aligned)");
  } catch (e) {
    console.log(`  ⚠️ Force-align failed: ${e.message.substring(0, 100)}`);
  }
}
