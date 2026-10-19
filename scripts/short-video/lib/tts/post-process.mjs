/**
 * Shared post-processing utilities for TTS engines.
 *
 * - buildFilter():      Build FFmpeg -af filter string based on engine config
 * - getDuration():      Probe exact audio duration with ffprobe
 * - postProcessAudio(): Apply FFmpeg post-processing (silenceremove + resample)
 * - postProcessBatch(): Post-process in-place + get duration (for batch engines)
 * - runForcedAlignment(): Subtitle timing alignment via text-align.py
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
import { ffmpegCmd, getDuration } from "./ffmpeg-cmd.mjs";
import {
  DEFAULT_SILENCE_FLOOR_MS,
  buildTrimFilters,
  planSilenceTrim,
  probeSilences,
  verifySilenceFloor,
} from "./silence-trim.mjs";
import { runAlignmentGuards } from "./alignment-guards.mjs";
import { splitDigitUnits } from "../normalize-tts-text.mjs";
import { computeAlignmentSignature, alignmentCacheState, writeAlignmentMeta } from "./cache.mjs";
import { offlineEnvPrefix } from "./offline-env.mjs";
import { ALIGN_OFFLINE_MODELS, reportOfflineCacheMiss } from "./offline-model-hints.mjs";

const execAsync = promisify(exec);

// getDuration moved to ./ffmpeg-cmd.mjs (#232) — re-exported for the
// edge-tts / say adapters that import it from here.
export { getDuration };

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

// ── Engine input text (#227 number-splitting guard) ──

/**
 * Rewrite voiceover text into the safe form for TTS engine input.
 *
 * Strips thousands separators: "160,000" → "160000". Why: CosyVoice's
 * frontend normalizes English text through wetext, but when the wetext FST
 * resource fails to download (Kaggle run 2026-09-08, modelscope auth error
 * in the harvested log) it SILENTLY falls back to text_frontend='' and the
 * text reaches spell_out_number un-normalized — which splits digit runs at
 * the comma ("160" + "000") and reads them as separate numbers ("one
 * hundred sixty, zero"). With the comma stripped, the digit run stays a
 * single token: wetext TN reads it correctly when alive, and inflect's
 * number_to_words produces the same words when TN is dead.
 *
 * Comma-stripping preserves the numeric value digit-for-digit, so on-screen
 * texts and subtitles (built from scene.voiceover, NOT from this rewrite)
 * keep "160,000". Non-thousands comma patterns (decimals "62.5", "$1.4B")
 * contain no digit-comma-digit sequence and pass through untouched.
 *
 * #239 digit+unit splitting: compact digit+unit tokens ("720p", "4K",
 * "16GB") lose their trailing letter in CosyVoice3 speech, so the same
 * curated unit whitelist as step 0.6's normalize-tts-text (splitDigitUnits)
 * is applied here too. This is defense in depth: the engine adapters call
 * engineTtsText(voiceover) only when scene.ttsText is absent (normalize
 * step failed or was bypassed), but the fallback must be safe on its own.
 *
 * @param {string} text - scene voiceover text
 * @returns {string} engine-safe text
 */
export function engineTtsText(text) {
  if (typeof text !== "string") return text;
  return splitDigitUnits(text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1"));
}

// ── Filter construction ──

/**
 * Build the FFmpeg audio filter string.
 *
 * @param {Object} opts
 * @param {boolean} [opts.useSilenceFilter=true] - If true, the take is measured
 *   and internal pauses are capped at the floor (see silence-trim.mjs); the
 *   plan arrives as `silenceDrops` (the ranges to cut). If false, only the
 *   cleanup chain runs (F5/MLX path).
 * @param {ProsodyProfile|null} [opts.prosody=null] - Per-scene prosody profile
 *   (pitch + tempo shift via rubberband filter).
 * @param {Array<{start: number, end: number}>|null} [opts.silenceDrops=null] -
 *   dropped ranges from planSilenceTrim(); null means "nothing to trim".
 * @returns {string} Filter string (may be empty).
 */
export function buildFilter({ useSilenceFilter = true, prosody = null, silenceDrops = null } = {}) {
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

  // 1. Internal-pause cap (#786). The trim is a measured range mask, NOT
  //    silenceremove: silenceremove also eats the trailing silence, and the
  //    head/tail silences carry the scene transition.
  if (useSilenceFilter) {
    filters.push(...buildTrimFilters(silenceDrops));
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
// getDuration lives in ./ffmpeg-cmd.mjs now (shared with alignment-guards);
// re-exported above for existing importers.

// ── Post-processing ──

/** Bounded repair attempts after a trim under-delivered (#786). */
const MAX_TRIM_REPAIR_PASSES = 2;

/**
 * Run one pure trim pass: re-slice, mask the ranges out, re-stamp the timeline.
 *
 * Kept separate from `buildFilter` on purpose — a repair pass must NOT re-apply
 * prosody or `TTS_ATEMPO`, they already shaped the file on the first pass.
 *
 * @param {string} inPath
 * @param {string} outPath
 * @param {Array<{start: number, end: number}>} drops
 */
async function applyTrimPass(inPath, outPath, drops) {
  const chain = buildTrimFilters(drops).join(",");
  await execAsync(`"${ffmpegCmd}" -y -i "${inPath}" -af "${chain}" "${outPath}" 2>/dev/null`);
}

/**
 * Apply FFmpeg post-processing from one file to another.
 *
 * When `useSilenceFilter` is on, the take is measured first (`silencedetect`)
 * and its internal pauses are capped at `silenceFloorMs` (#786). The probe is
 * a separate measurement-only pass; its failure propagates — a take whose
 * pauses could not be measured must not be silently shipped untrimmed.
 *
 * The delivered pause is then MEASURED, and if it is still over the cap the
 * trim is re-planned against the trimmed file and re-applied (bounded by
 * `MAX_TRIM_REPAIR_PASSES`). This is not belt-and-braces: a pause's tail is a
 * sub-threshold ramp into the next word, and however tight the detector's
 * minimum length is, a ramp shorter than it stays invisible to the first pass
 * — silent-update scene 7 measured 273 ms, was planned to 225 ms, and landed at
 * 308 ms because 83 ms of ramp never appeared in the interval list. Repairing
 * from the measurement converges because every pass shortens the region.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {Object} opts
 * @param {boolean} [opts.useSilenceFilter=true]
 * @param {boolean} [opts.resample=true] - If true, add -ar 44100 -b:a 192k
 * @param {ProsodyProfile|null} [opts.prosody=null] - Per-scene prosody profile
 * @param {number} [opts.silenceFloorMs] - internal-pause cap (default 250 ms)
 * @param {(path: string) => Promise<{duration: number, silences: Array}>} [opts.probe]
 *   - measurement seam for tests (default: probeSilences)
 * @returns {Promise<{removedSec: number, pauseCount: number, pauseViolations: number, maxPauseMs: number, repairPasses: number}>}
 *   trim bookkeeping; `pauseViolations` is measured on the OUTPUT, not planned.
 */
export async function postProcessAudio(
  inputPath,
  outputPath,
  {
    useSilenceFilter = true,
    resample = true,
    prosody = null,
    silenceFloorMs = DEFAULT_SILENCE_FLOOR_MS,
    probe = probeSilences,
  } = {},
) {
  let plan = { keep: null, drops: [], removedSec: 0 };
  if (useSilenceFilter) {
    const { duration, silences } = await probe(inputPath);
    plan = planSilenceTrim({ silences, duration, floorMs: silenceFloorMs });
  }

  const filter = buildFilter({ useSilenceFilter, prosody, silenceDrops: plan.drops });
  const afArg = filter ? `-af "${filter}"` : "";
  const resampleArg = resample ? "-ar 44100 -b:a 320k" : "";
  await execAsync(
    `"${ffmpegCmd}" -y -i "${inputPath}" ${afArg} ${resampleArg} "${outputPath}" 2>/dev/null`,
  );
  let removedSec = plan.removedSec;
  let pauseCount = plan.drops.length;
  if (removedSec > 0) {
    console.log(
      `  ✂️ Internal pauses capped (#786): ${pauseCount} pause(s), -${removedSec.toFixed(2)}s`,
    );
  }

  let pauseViolations = 0;
  let maxPauseMs = 0;
  let repairPasses = 0;
  if (useSilenceFilter && removedSec > 0) {
    // Measure at the TOP of every iteration, so the numbers reported below are
    // the ones on disk after the last repair — not the ones that triggered it.
    for (let attempt = 0; ; attempt++) {
      const after = await probe(outputPath);
      const check = verifySilenceFloor({
        silences: after.silences,
        duration: after.duration,
        floorMs: silenceFloorMs,
      });
      pauseViolations = check.violations.length;
      maxPauseMs = check.maxMs;
      if (pauseViolations === 0) break;
      if (attempt >= MAX_TRIM_REPAIR_PASSES) break;

      const repair = planSilenceTrim({
        silences: after.silences,
        duration: after.duration,
        floorMs: silenceFloorMs,
      });
      if (repair.removedSec <= 0) break;
      // Keep the extension: ffmpeg picks the muxer from it.
      const dot = outputPath.lastIndexOf(".");
      const ext = dot > 0 ? outputPath.slice(dot) : "";
      const tmp = `${outputPath}.trim${attempt + 1}${ext}`;
      await applyTrimPass(outputPath, tmp, repair.drops);
      await execAsync(`mv "${tmp}" "${outputPath}"`);
      removedSec += repair.removedSec;
      pauseCount += repair.drops.length;
      repairPasses += 1;
    }
    if (pauseViolations > 0) {
      console.log(
        `  ⚠️ Pause cap not fully delivered on "${outputPath}": ${pauseViolations} pause(s) over ${silenceFloorMs}ms (worst ${maxPauseMs}ms) after ${repairPasses} repair pass(es)`,
      );
    } else if (repairPasses > 0) {
      console.log(
        `  ✂️ Trim repaired (#786): ${repairPasses} extra pass(es), ${pauseCount} pause(s), -${removedSec.toFixed(2)}s total`,
      );
    }
  }

  return { removedSec, pauseCount, pauseViolations, maxPauseMs, repairPasses };
}

/**
 * Post-process a batch engine's audio in-place (temp file + mv).
 *
 * Used by the batch engines (CosyVoice3-Kaggle-CUDA, CosyVoice3-MLX,
 * CosyVoice3-Modal-CUDA, F5-MLX): the generated audio is post-processed into a
 * -processed file (same extension as input), then moved back over the original.
 *
 * Returns the trim bookkeeping alongside the duration so the caller can report
 * a take whose pauses did not come out under the cap (#786 AC — the cap is
 * measured, and a measurement nobody looks at is not a check).
 *
 * @param {string} audioPath
 * @param {Object} opts - Same as postProcessAudio
 * @param {ProsodyProfile|null} [opts.prosody=null] - Per-scene prosody profile
 * @returns {Promise<{duration: number, removedSec: number, pauseCount: number, pauseViolations: number, maxPauseMs: number, repairPasses: number}>}
 */
export async function postProcessBatch(audioPath, opts = {}) {
  // Support both .mp3 and .wav input (F5 now outputs WAV to avoid double lossy encoding)
  const isWav = audioPath.endsWith(".wav");
  const processedPath = isWav
    ? audioPath.replace(/\.wav$/, "-processed.wav")
    : audioPath.replace(/\.mp3$/, "-processed.mp3");
  const trim = await postProcessAudio(audioPath, processedPath, opts);
  await execAsync(`mv "${processedPath}" "${audioPath}"`);
  const duration = await getDuration(audioPath);
  return { duration, ...trim };
}

// ── Subtitle alignment ──

/**
 * Subtitle timing alignment using text-align.py (wav2vec2).
 *
 * Output: {outputDir}/subtitle-timing.json — used by lib/subtitles/generate.mjs.
 * Gracefully skips if the alignment script is not found.
 *
 * Cross-run cache (#198 Item 2): when subtitle-timing.json exists and its
 * stored signature matches the current (scene text, scene audio bytes), the
 * GPU alignment is skipped. Repair paths that intentionally retry a bad
 * alignment pass {force:true} to recompute.
 *
 * @param {Array} scenes
 * @param {TTSResult[]} ttsResults
 * @param {string} outputDir
 * @param {object} [options]
 * @param {boolean} [options.force=false] - skip the cache and realign
 * @returns {Promise<{skipped: boolean, reason?: string}>}
 */
export async function runForcedAlignment(scenes, ttsResults, outputDir, options = {}) {
  const { force = false } = options;
  const alignScript = join(ROOT_DIR, "text-align.py");

  if (!force) {
    const signature = computeAlignmentSignature(scenes, ttsResults);
    if (signature && alignmentCacheState(outputDir, signature) === "valid") {
      console.log("  💾 Alignment cache hit — subtitle-timing.json reused (#198)");
      return { skipped: true, reason: "cache hit" };
    }
  }

  if (!existsSync(alignScript)) {
    console.log("  ⚠️ text-align.py not found, skipping");
    return { skipped: true, reason: "text-align.py not found" };
  }

  console.log("  🎯 Running text-align subtitle timing...");

  // Align against the SPOKEN track (ttsText): the audio reads the spoken form
  // and wav2vec2's dictionary has no digit tokens, so "V4.1" cannot align.
  // Display stays on the voiceover track — restore-tokens maps the aligned
  // spoken words back to the original tokens before the timing is persisted.
  const manifest = ttsResults.map((r) => {
    const scene = scenes.find((s) => s.id === r.sceneId);
    return {
      sceneId: r.sceneId,
      text: scene?.ttsText || scene?.voiceover || "",
      audioPath: r.audioPath,
    };
  });
  const manifestPath = join(outputDir, "whisper-manifest.json");
  const timingPath = join(outputDir, "subtitle-timing.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));

  try {
    await execAsync(
      `${offlineEnvPrefix({ transformers: true })} ~/.video-tts-env/bin/python3 "${alignScript}" ` +
        `--manifest "${manifestPath}" --output "${timingPath}" 2>&1`,
    );
    // Map spoken-form words back to display tokens (V four point one → V4.1)
    // BEFORE persisting, so every downstream consumer (buildCues, verify,
    // repair paths) reads display-correct timing.
    const { restoreTimingTokens } = await import("../subtitles/restore-tokens.mjs");
    const { readFileSync: rf } = await import("fs");
    const timingData = JSON.parse(rf(timingPath, "utf8"));
    // Guards BEFORE restore + cache-meta (#232): the crushed-word check needs
    // the RAW spoken-form words (restore replaces them with display tokens),
    // and the tail cut changes the audio bytes, so the alignment signature
    // must be computed over the cut files — the next run cache-hits instead
    // of re-cutting.
    // `scenes` supplies the reference text so a provisional tail cut is read
    // back before it is committed (#232 verified-cut).
    const guards = await runAlignmentGuards(ttsResults, timingData, scenes);
    writeFileSync(timingPath, JSON.stringify(restoreTimingTokens(timingData, scenes), null, 2));
    writeAlignmentMeta(outputDir, computeAlignmentSignature(scenes, ttsResults));
    console.log("  ✅ Subtitle timing saved (wav2vec2-large-960h-lv60-self aligned)");
    return { skipped: false, guards };
  } catch (e) {
    console.log(`  ⚠️ Force-align failed: ${e.message.substring(0, 100)}`);
    // #394: a missing/partial HF cache under offline mode is the incident's
    // opaque failure — name the model and the one-time fetch command. The
    // render boundary (#421) still fails closed if no valid timing exists.
    reportOfflineCacheMiss(e, ALIGN_OFFLINE_MODELS);
    return { skipped: true, reason: `force-align failed: ${e.message.substring(0, 100)}` };
  }
}

/**
 * Backward-compatible alias for runForcedAlignment.
 * @deprecated Use runForcedAlignment instead — will be removed in a future release.
 */
export const runWhisperAlignment = runForcedAlignment;
