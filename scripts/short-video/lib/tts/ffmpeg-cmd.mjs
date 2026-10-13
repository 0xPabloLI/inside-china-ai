/**
 * FFmpeg/ffprobe command resolution + duration probing — shared bottom layer
 * for the TTS post-processing modules (#232 extracted so the alignment guards
 * can probe/trim without importing post-process.mjs, which imports them).
 *
 * Use ffmpeg-full when present for rubberband/libass support (same choice as
 * assemble.mjs).
 */

import { existsSync } from "fs";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const FFPROBE_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
export const ffmpegCmd = existsSync(FFMPEG_FULL) ? FFMPEG_FULL : "ffmpeg";
export const ffprobeCmd = existsSync(FFPROBE_FULL) ? FFPROBE_FULL : "ffprobe";

/**
 * Measurement-only ffmpeg: PATH-resolved, never ffmpeg-full.
 *
 * Analysis filters (volumedetect, silencedetect, the loudnorm read-back)
 * behave identically on both builds, so the smaller PATH binary is the right
 * dependency for a pass that writes no output file. One policy, one place —
 * post-process.mjs, bgm.mjs and verify-subtitles.mjs all measure through this.
 */
export const ffmpegMeasureCmd = "ffmpeg";

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
