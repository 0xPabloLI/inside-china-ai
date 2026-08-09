/**
 * Shared post-processing utilities for TTS engines.
 *
 * - buildFilter():      Build FFmpeg -af filter string based on engine config
 * - getDuration():      Probe exact audio duration with ffprobe
 * - postProcessAudio(): Apply FFmpeg post-processing (silenceremove + resample)
 * - postProcessBatch(): Post-process in-place + get duration (for batch engines)
 * - runWhisperAlignment(): Force-align subtitle timing via text-align.py
 *
 * Prosody enhancement (Phase 2):
 *   Per-scene pitch shift + tempo adjustment via FFmpeg rubberband filter.
 *   Based on web deep research (docs/research/voice-prosody-hook-optimization.md):
 *   - ReelForge AI (2026): pitch variation in hook → higher retention
 *   - Speaking.coach 5P framework: vary pitch/pace between segments
 *   - Camb.ai: prosody = pitch + stress + rhythm; flat prosody = robotic
 *   - Cambridge (Bakkouche 2026): local pitch-control is key naturalness correlate
 */

import { exec } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";

const execAsync = promisify(exec);

// Use ffmpeg-full for rubberband/libass support (same as assemble.mjs)
const FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const FFPROBE_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
const ffmpegCmd = existsSync(FFMPEG_FULL) ? FFMPEG_FULL : "ffmpeg";
const ffprobeCmd = existsSync(FFPROBE_FULL) ? FFPROBE_FULL : "ffprobe";

// ── Prosody profiles (per scene visualType) ──
//
// Research sources:
//   [1] ReelForge AI (2026): "Hooks that use clear pitch variation in the opening
//       seconds tend to feel more alive and hold attention better than a flat,
//       monotone read."
//   [2] Speaking.coach 5P: "Vary pitch between segments to give audio clues.
//       Faster pace = energy; slower pace = gravitas."
//   [3] Camb.ai (2026): "Prosody = pitch + stress + rhythm. Flat prosody = robotic."
//   [4] Cambridge (Bakkouche 2026): "Local pitch-control and prosodic timing are
//       key correlates of perceived naturalness."
//   [5] Resemble AI (2025): "Adjust pitch and tone to evoke excitement, calm, or
//       urgency. Control pauses and emphasis for dynamic delivery."
//
// pitch: semitone shift (1.08 = +8% pitch up; 0.96 = -4% pitch down)
// tempo: speed multiplier (1.12 = 12% faster; 0.92 = 8% slower)
//   rubberband uses: pitch=1.0 means no shift; tempo=1.0 means no change
//   We convert our ratios to rubberband's format below.

/**
 * @typedef {Object} ProsodyProfile
 * @property {number} pitch   - Pitch shift ratio (1.0 = no shift, 1.08 = +8% up)
 * @property {number} tempo   - Tempo ratio (1.0 = no change, 1.12 = 12% faster)
 * @property {number} volume  - Volume gain ratio (1.0 = no boost, 1.15 = +15% louder)
 * @property {string} label   - Human-readable label for logging
 */

/**
 * Per-scene prosody profiles, keyed by visualType.
 *
 * Hook:     +4% pitch, +6% tempo, +15% volume → urgency/energy + louder hook [1][2]
 * Data:    -2% pitch, -2% tempo,  0% volume  → authority/weight [2][3]
 * Quote:    0% pitch,  -3% tempo,  0% volume  → emphasis/deliberate [2][5]
 * CTA:     -2% pitch, -5% tempo,  0% volume  → warmth/invitation [2][5]
 * Default:  no change (baseline)
 *
 * Phase 2 tuning (2026-08-09): reduced prosody values after user feedback.
 * New ref audio (voice3.m4a) already has prosody variation, so rubberband
 * amplitude was halved to avoid over-processing and voice characteristic loss.
 *
 * Volume boost added 2026-08-09: hook scene gets +15% volume to stand out
 * in the opening seconds — the most critical attention window [1].
 */
const PROSODY_PROFILES = {
  hook: { pitch: 1.04, tempo: 1.06, volume: 1.15, label: "hook (urgent/energetic + louder)" },
  data: { pitch: 0.98, tempo: 0.98, volume: 1.0, label: "data (authoritative)" },
  quote: { pitch: 1.0, tempo: 0.97, volume: 1.0, label: "quote (deliberate/emphasis)" },
  cta: { pitch: 0.98, tempo: 0.95, volume: 1.0, label: "cta (warm/inviting)" },
};

/**
 * Get the prosody profile for a scene based on its visualType.
 * Returns null if no profile matches (baseline, no processing needed).
 *
 * @param {string} [visualType] - Scene visualType field (e.g. "hook", "data", "cta")
 * @returns {ProsodyProfile|null}
 */
export function getProsodyProfile(visualType) {
  if (!visualType) return null;
  return PROSODY_PROFILES[visualType] || null;
}

// ── Filter construction ──

/**
 * Build the FFmpeg audio filter string.
 *
 * @param {Object} opts
 * @param {boolean} [opts.useSilenceFilter=true] - If true, apply silenceremove;
 *                                                  if false, only apply atempo (F5 path).
 * @param {ProsodyProfile|null} [opts.prosody=null] - Per-scene prosody profile
 *   (pitch + tempo shift via rubberband filter).
 * @returns {string} Filter string (may be empty).
 */
export function buildFilter({ useSilenceFilter = true, prosody = null } = {}) {
  const filters = [];

  // 0. Cleanup chain: highpass + denoise (always first, before any other processing)
  //    Removes low-frequency hum and constant noise floor artifacts.
  //    Disable via TTS_HIGHPASS=0 or TTS_DENOISE=0
  const highpassFreq = parseFloat(process.env.TTS_HIGHPASS ?? "80");
  if (highpassFreq > 0) {
    filters.push(`highpass=f=${highpassFreq}`);
  }
  const denoiseNr = parseFloat(process.env.TTS_DENOISE ?? "5");
  if (denoiseNr > 0) {
    filters.push(`afftdn=nr=${denoiseNr}:nf=-25`);
  }

  // 1. Silenceremove (for non-F5 engines)
  if (useSilenceFilter) {
    filters.push(
      "silenceremove=stop_periods=-1:stop_duration=0.25:stop_silence=0.08:stop_threshold=0.018",
    );
  }

  // 2. Per-scene prosody: rubberband pitch shift + tempo adjustment
  //    rubberband=pitch=P:tempo=T where P and T are both ratios (not cents)
  //    pitch=1.08 means +8% pitch up; tempo=1.12 means 12% faster
  if (prosody && (prosody.pitch !== 1.0 || prosody.tempo !== 1.0)) {
    const pitchRatio = prosody.pitch.toFixed(4);
    const tempoRatio = prosody.tempo.toFixed(4);
    filters.push(`rubberband=pitch=${pitchRatio}:tempo=${tempoRatio}`);
  }

  // 2b. Per-scene volume boost (applied after rubberland, before atempo)
  //    volume=1.15 means +15% louder; only for scenes that need it (e.g. hook)
  if (prosody && prosody.volume && prosody.volume !== 1.0) {
    filters.push(`volume=${prosody.volume.toFixed(2)}`);
  }

  // 3. Global atempo (TTS_ATEMPO env, applied after prosody)
  const atempo = parseFloat(process.env.TTS_ATEMPO) || null;
  if (atempo) {
    filters.push(`atempo=${atempo}`);
  }

  return filters.join(",");
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
    `"${ffprobeCmd}" -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
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
 * @param {ProsodyProfile|null} [opts.prosody=null] - Per-scene prosody profile
 */
export async function postProcessAudio(
  inputPath,
  outputPath,
  { useSilenceFilter = true, resample = true, prosody = null } = {},
) {
  const filter = buildFilter({ useSilenceFilter, prosody });
  const afArg = filter ? `-af "${filter}"` : "";
  const resampleArg = resample ? "-ar 44100 -b:a 320k" : "";
  await execAsync(
    `"${ffmpegCmd}" -y -i "${inputPath}" ${afArg} ${resampleArg} "${outputPath}" 2>/dev/null`,
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
 * @param {ProsodyProfile|null} [opts.prosody=null] - Per-scene prosody profile
 * @returns {Promise<number>} Duration of the processed audio
 */
export async function postProcessBatch(audioPath, opts = {}) {
  // Support both .mp3 and .wav input (F5 now outputs WAV to avoid double lossy encoding)
  const isWav = audioPath.endsWith(".wav");
  const processedPath = isWav
    ? audioPath.replace(/\.wav$/, "-processed.wav")
    : audioPath.replace(/\.mp3$/, "-processed.mp3");
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
