/**
 * Real audio fixtures shared by the post-process suites.
 *
 * The TTS stage ships scene audio as mp3; several suites build a WAV source
 * and let ffmpeg encode it so the downstream decoder/probe sees the same
 * container as production. One helper keeps the codec, quality and quiet
 * stdio from drifting across copies.
 */
import { execFileSync } from "node:child_process";
import { FFMPEG_BIN } from "../../lib/ffmpeg-bins.mjs";

/**
 * Encode a WAV source to mp3 with the production TTS settings.
 *
 * @param {string} srcWav - existing PCM wav path
 * @param {string} mp3Path - destination mp3 path
 * @returns {string} the destination path
 */
export function transcodeWavToMp3(srcWav, mp3Path) {
  execFileSync(FFMPEG_BIN, ["-y", "-i", srcWav, "-codec:a", "libmp3lame", "-q:a", "4", mp3Path], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  return mp3Path;
}
