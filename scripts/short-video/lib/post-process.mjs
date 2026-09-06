/**
 * Post-processing functions — shared between Playwright and Remotion paths.
 *
 * Extracted from assemble.mjs (T1 prefactor) so both rendering paths
 * call the same subtitle burn-in, BGM mixing, and loudness normalization.
 *
 * Each function is a pure side-effect: it reads the input file, writes the
 * output file, and returns the output path. Callers manage temp file cleanup.
 */

import { execSync, execFileSync } from "child_process";
import { existsSync, renameSync, unlinkSync } from "fs";
import { measureAudioDrift } from "./audio/sync.mjs";

/** Path to ffmpeg-full (has libass support for ASS subtitle burn-in). */
const FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";

/**
 * Burn ASS subtitles into a video file using ffmpeg-full (libass).
 *
 * Renames videoPath → temp, burns subtitles → outputPath, deletes temp.
 * If assPath doesn't exist or is null, this is a no-op (returns videoPath).
 *
 * @param {string} videoPath - Input MP4 (no subtitles)
 * @param {string|null} assPath - ASS subtitle file, or null to skip
 * @param {string} outputPath - Output MP4 (with subtitles burned in)
 * @returns {string} Path to the output file (outputPath if burned, videoPath if skipped)
 */
export function burnSubtitles(videoPath, assPath, outputPath) {
  if (!assPath || !existsSync(assPath)) {
    return videoPath;
  }

  // Move input to temp name, burn subtitles to the original output path
  const tempPath = videoPath.replace(".mp4", "-nosubs.mp4");
  renameSync(videoPath, tempPath);

  const subFilter = `ass=${assPath}`;
  execFileSync(FFMPEG_FULL, ["-y", "-i", tempPath, "-vf", subFilter, "-c:a", "copy", outputPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  try {
    unlinkSync(tempPath);
  } catch {}

  console.log("  Subtitles burned in (FFmpeg native)");
  return outputPath;
}

/**
 * Mix background music into a video at a given volume.
 *
 * BGM starts immediately (0.1s fade-in), loops infinitely to cover videos
 * longer than the BGM file, and fades out in the last 3 seconds.
 *
 * @param {string} videoPath - Input MP4 (with voiceover audio)
 * @param {string} bgmPath - BGM audio file
 * @param {string} outputPath - Output MP4 (mixed audio)
 * @param {number} [volume=0.12] - BGM volume (0-1)
 * @returns {string} Path to the output file
 */
export function mixBgm(videoPath, bgmPath, outputPath, volume = 0.12) {
  // Get video duration for BGM fade-out timing
  let videoDuration = 180;
  try {
    const info = execSync(
      `ffprobe -i "${videoPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString();
    videoDuration = parseFloat(info.trim());
  } catch {}

  const bgmFadeOutStart = Math.max(videoDuration - 3, 1).toFixed(2);
  const filterComplex =
    `[1:a]afade=t=in:st=0:d=0.1,afade=t=out:st=${bgmFadeOutStart}:d=3,volume=${volume}[bgm];` +
    `[0:a]volume=1.0[tts];[tts][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`;

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-stream_loop",
      "-1", // loop BGM infinitely (stopped by amix duration=first)
      "-i",
      bgmPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      outputPath,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  console.log(
    `  Background music mixed in (instant start, ${Math.round(volume * 100)}% volume, looped)`,
  );
  return outputPath;
}

/**
 * Normalize audio loudness to EBU R128 target using FFmpeg loudnorm.
 *
 * Applies a single-pass loudnorm filter. For production use, a two-pass
 * approach gives more precise results, but single-pass is sufficient
 * for short-form video (30-90s) where dynamic range variation is minimal.
 *
 * @param {string} videoPath - Input MP4
 * @param {string} outputPath - Output MP4 (normalized audio)
 * @param {number} [target=-16] - Target loudness in LUFS (EBU R128 broadcast standard)
 * @returns {string} Path to the output file
 */
export function normalizeLoudness(videoPath, outputPath, target = -16) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-af",
      `loudnorm=I=${target}:TP=-1.5:LRA=11`,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  console.log(`  Loudness normalized to ${target} LUFS`);
  return outputPath;
}

/**
 * Build the argv for the single-pass finalize command (#198 Item 1).
 *
 * Collapses the former 4-pass chain (burnSubtitles → mixBgm →
 * normalizeLoudness → realignAudioToTimeline) into one -filter_complex pass:
 * ass burn + BGM amix + loudnorm + #176 head trim. Pure — no I/O — so the
 * filter graph composition is unit-testable without ffmpeg.
 *
 * Video handling mirrors the old chain: subtitles force one video re-encode
 * (default libx264, like burnSubtitles); without them the video stream is
 * bit-copied, as mixBgm/normalizeLoudness did.
 *
 * @param {object} options
 * @param {string} options.videoPath - Input MP4 (the raw render output)
 * @param {string|null} options.assPath - ASS subtitle file, or null to skip
 * @param {string|null} options.bgmPath - BGM audio file, or null to skip
 * @param {string} options.outputPath - Output MP4
 * @param {string|null} [options.audioFilter] - Head trim/pad filter prepended
 *   on [0:a] (from measureAudioDrift), or null
 * @param {number} [options.bgmFadeOutStart] - Seconds; required with bgmPath
 * @param {number} [options.bgmVolume=0.12]
 * @param {number} [options.loudnessTarget=-16]
 * @returns {string[]} ffmpeg argv (without the binary)
 */
export function buildFinalizeArgs({
  videoPath,
  assPath,
  bgmPath,
  outputPath,
  audioFilter = null,
  bgmFadeOutStart,
  bgmVolume = 0.12,
  loudnessTarget = -16,
}) {
  const args = ["-y", "-i", videoPath];
  const useBgm = Boolean(bgmPath);
  if (useBgm) args.push("-stream_loop", "-1", "-i", bgmPath);

  const chains = [];
  if (assPath) chains.push(`[0:v]ass=${assPath}[vout]`);

  // The TTS branch label: [0:a] passes through untouched when there is no
  // head filter, otherwise the filter output feeds the mix.
  const ttsIn = audioFilter ? "[tts]" : "[0:a]";
  if (audioFilter) chains.push(`[0:a]${audioFilter}[tts]`);
  const loudnorm = `loudnorm=I=${loudnessTarget}:TP=-1.5:LRA=11`;
  if (useBgm) {
    const fade =
      `afade=t=in:st=0:d=0.1,afade=t=out:st=${bgmFadeOutStart.toFixed(2)}:d=3,volume=${bgmVolume}`;
    chains.push(`[1:a]${fade}[bgm]`);
    chains.push(`${ttsIn}[bgm]amix=inputs=2:duration=first:dropout_transition=0[mix]`);
    chains.push(`[mix]${loudnorm}[aout]`);
  } else {
    chains.push(`${ttsIn}${loudnorm}[aout]`);
  }

  args.push("-filter_complex", chains.join(";"));
  if (assPath) {
    args.push("-map", "[vout]", "-map", "[aout]");
  } else {
    args.push("-map", "0:v", "-map", "[aout]", "-c:v", "copy");
  }
  args.push("-c:a", "aac", "-b:a", "192k", "-ar", "44100", outputPath);
  return args;
}

/**
 * Finalize the raw render output in a single ffmpeg pass.
 *
 * Subtitle burn-in, BGM mix, loudness normalization and the #176 audio head
 * trim run as one -filter_complex command. When `realign` is supplied, the
 * head drift is measured on the input (audio decode only — the post chain
 * preserves timestamps) and folded into this pass, eliminating the separate
 * realign re-encode.
 *
 * ASS burn-in requires ffmpeg-full (libass); other combinations use system
 * ffmpeg, matching the binaries the old per-step chain picked.
 *
 * @param {object} options
 * @param {string} options.videoPath - Input MP4 (the raw render output)
 * @param {string|null} options.assPath - ASS subtitle file, or null to skip
 * @param {string|null} options.bgmPath - BGM audio file, or null to skip
 * @param {string} options.outputPath - Output MP4
 * @param {object|null} [options.realign] - { outputDir, sceneDurations,
 *   audioPaths } for measureAudioDrift; null to skip the head trim entirely
 * @param {number} [options.bgmVolume=0.12]
 * @param {number} [options.loudnessTarget=-16]
 * @returns {string} outputPath
 */
export function finalizeRenderedVideo({
  videoPath,
  assPath,
  bgmPath,
  outputPath,
  realign = null,
  bgmVolume = 0.12,
  loudnessTarget = -16,
}) {
  let audioFilter = null;
  if (realign) {
    const m = measureAudioDrift({
      videoPath,
      outputDir: realign.outputDir,
      sceneDurations: realign.sceneDurations,
      audioPaths: realign.audioPaths,
    });
    audioFilter = m.filter;
    if (m.filter) {
      console.log(
        `  🔊 Head trim ${m.driftMsBefore.toFixed(1)}ms folded into finalize pass (#176)`,
      );
    } else if (m.driftMsBefore != null && Math.abs(m.driftMsBefore) > 20) {
      // Measurable but not corrected — surface why instead of failing silently.
      console.log(
        `  ⚠️ Audio drift ${m.driftMsBefore.toFixed(1)}ms NOT corrected: ${m.reason}`,
      );
    }
  }

  const useAss = Boolean(assPath && existsSync(assPath));

  let bgmFadeOutStart;
  if (bgmPath) {
    let videoDuration = 180;
    try {
      const info = execSync(
        `ffprobe -i "${videoPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
      ).toString();
      videoDuration = parseFloat(info.trim());
    } catch {}
    bgmFadeOutStart = Math.max(videoDuration - 3, 1);
  }

  const args = buildFinalizeArgs({
    videoPath,
    assPath: useAss ? assPath : null,
    bgmPath: bgmPath || null,
    outputPath,
    audioFilter,
    bgmFadeOutStart,
    bgmVolume,
    loudnessTarget,
  });

  const parts = [
    useAss ? "subtitles burned" : null,
    bgmPath ? "BGM mixed" : null,
    "loudness normalized",
    audioFilter ? "head trimmed" : null,
  ].filter(Boolean);
  execFileSync(useAss ? FFMPEG_FULL : "ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
  console.log(`  Finalized in 1 ffmpeg pass (${parts.join(" + ")})`);
  return outputPath;
}
