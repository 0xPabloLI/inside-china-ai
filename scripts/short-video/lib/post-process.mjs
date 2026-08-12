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
