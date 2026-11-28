/**
 * FFmpeg/ffprobe command resolution + duration probing — shared bottom layer
 * for the TTS post-processing modules (#232 extracted so the alignment guards
 * can probe/trim without importing post-process.mjs, which imports them).
 *
 * Use ffmpeg-full when present for rubberband/libass support (same choice as
 * assemble.mjs).
 */

import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { FFMPEG_BIN, FFPROBE_BIN } from "../ffmpeg-bins.mjs";

const execFileAsync = promisify(execFile);

/**
 * Encode/probe binaries, resolved once by `lib/ffmpeg-bins.mjs` (#1118):
 * ffmpeg-full when installed, else PATH, with `FFMPEG_BIN`/`FFPROBE_BIN` as an
 * explicit override. This module used to carry its own copy of that rule.
 */
export const ffmpegCmd = FFMPEG_BIN;
const ffprobeCmd = FFPROBE_BIN;

/**
 * Word-count fallback for engine duration, used only when probing is
 * impossible (#1599). Callers must warn and record the estimate: a silent
 * fallback shifts the scene timeline without leaving a trace.
 *
 * 2.5 words/second is the same budget rate the TikTok profile uses
 * (`voiceoverEstimateWps`); this low-level TTS module deliberately does not
 * import the platform registry just for one number.
 *
 * @param {string} voiceover
 * @returns {number} seconds
 */
export function estimateDurationSeconds(voiceover) {
  const words = String(voiceover ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return words / 2.5;
}

/**
 * Measurement-only ffmpeg: the same resolved binary as `ffmpegCmd` (#1582).
 *
 * Analysis filters (volumedetect, silencedetect, the loudnorm read-back)
 * behave identically on every build, so measurement does not need libass — but
 * it does need a binary that exists. Resolving it through the shared seam
 * (`FFMPEG_BIN` → ffmpeg-full → PATH) is what makes subtitles verification,
 * post-processing read-back and the BGM/cut detectors work on an agent shell
 * or clean worktree whose PATH has no Homebrew. A literal "ffmpeg" here only
 * worked because the interactive shell carried that PATH.
 *
 * post-process.mjs, bgm.mjs and verify-subtitles.mjs all measure through this.
 */
export const ffmpegMeasureCmd = FFMPEG_BIN;

/**
 * Get exact audio duration using ffprobe.
 *
 * argv, never a shell string (#319 deferred class sweep): the audio path is
 * data, and a path carrying shell metacharacters must not be executed. Same
 * probe arguments as the synchronous `getDurationSync` below.
 *
 * @param {string} audioPath
 * @returns {Promise<number>} duration in seconds (NaN when ffprobe reports none)
 */
export async function getDuration(audioPath) {
  const { stdout } = await execFileAsync(ffprobeCmd, [
    "-i",
    audioPath,
    "-show_entries",
    "format=duration",
    "-v",
    "quiet",
    "-of",
    "csv=p=0",
  ]);
  return parseFloat(stdout.trim());
}

/**
 * Same probe, synchronous — for the pre-render staging gates, which run
 * synchronously (they copy assets before the Remotion CLI is invoked) and so
 * cannot await `getDuration`.
 *
 * @param {string} mediaPath - audio or video file
 * @returns {number} duration in seconds
 * @throws when ffprobe cannot read a duration
 */
export function getDurationSync(mediaPath) {
  const raw = execFileSync(
    ffprobeCmd,
    ["-i", mediaPath, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"],
    { stdio: ["pipe", "pipe", "pipe"] },
  )
    .toString()
    .trim();
  return parseFloat(raw);
}
