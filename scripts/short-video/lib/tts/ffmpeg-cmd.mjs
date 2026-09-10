/**
 * FFmpeg/ffprobe command resolution + duration probing — shared bottom layer
 * for the TTS post-processing modules (#232 extracted so the alignment guards
 * can probe/trim without importing post-process.mjs, which imports them).
 *
 * Use ffmpeg-full when present for rubberband/libass support (same choice as
 * assemble.mjs).
 */

import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const FFPROBE_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
export const ffmpegCmd = existsSync(FFMPEG_FULL) ? FFMPEG_FULL : "ffmpeg";
export const ffprobeCmd = existsSync(FFPROBE_FULL) ? FFPROBE_FULL : "ffprobe";

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
