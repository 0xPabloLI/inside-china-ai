/**
 * Minimal mono s16 PCM WAV read/write — the audio working format for the
 * voiceover track builder and the end-to-end audio sync verifier.
 *
 * Everything the pipeline hands to ffmpeg is decoded to this shape first, so
 * the JS side always deals with plain sample arrays and never with container
 * quirks (the very class of bug this subsystem exists to eliminate).
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const HEADER_SIZE = 44;

/**
 * Serialise samples as a mono 16-bit PCM WAV buffer.
 *
 * @param {Float32Array|Array<number>} samples - values in [-1, 1]
 * @param {number} sampleRate
 * @returns {Buffer}
 */
export function buildWavBuffer(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(HEADER_SIZE + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // audio format: PCM
  buf.writeUInt16LE(1, 22); // channels: mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    let v = Math.round(samples[i] * 32767);
    v = Math.max(-32768, Math.min(32767, v));
    buf.writeInt16LE(v, HEADER_SIZE + i * 2);
  }
  return buf;
}

/**
 * Write samples as a mono 16-bit PCM WAV file.
 *
 * @param {string} path
 * @param {Float32Array|Array<number>} samples
 * @param {number} sampleRate
 */
export function writeWavPcm(path, samples, sampleRate) {
  writeFileSync(path, buildWavBuffer(samples, sampleRate));
}

/**
 * Read a mono 16-bit PCM WAV file.
 *
 * @param {string} path
 * @returns {{sampleRate: number, samples: Float32Array}}
 */
export function readWavPcm(path) {
  const buf = readFileSync(path);

  if (
    buf.length < HEADER_SIZE ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error(`Not a RIFF/WAVE file: ${path}`);
  }

  let fmt = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") fmt = { offset: offset + 8, size };
    else if (id === "data") data = { offset: offset + 8, size };
    offset += 8 + size + (size % 2); // chunks are padded to even sizes
  }

  if (!fmt || !data) {
    throw new Error(`WAV is missing fmt/data chunks: ${path}`);
  }

  const audioFormat = buf.readUInt16LE(fmt.offset);
  const channels = buf.readUInt16LE(fmt.offset + 2);
  const sampleRate = buf.readUInt32LE(fmt.offset + 4);
  const bits = buf.readUInt16LE(fmt.offset + 14);

  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV audio format ${audioFormat} (PCM only): ${path}`);
  }
  if (bits !== 16) {
    throw new Error(`Unsupported WAV bit depth ${bits} (16-bit only): ${path}`);
  }
  if (channels !== 1) {
    throw new Error(`Expected mono WAV, got ${channels} channels: ${path}`);
  }

  const count = data.size / 2;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = buf.readInt16LE(data.offset + i * 2) / 32768;
  }

  return { sampleRate, samples };
}

/**
 * Decode any ffmpeg-readable media file to a mono s16 PCM WAV at `sampleRate`.
 * This is the single ffmpeg bridge for the subsystem: track building and sync
 * verification both go through here so decode flags never drift apart.
 *
 * Throws if ffmpeg fails (unreadable file, no audio stream).
 *
 * @param {string} inputPath - any media file ffmpeg can read
 * @param {string} outputPath - where to write the .wav
 * @param {number} sampleRate
 */
export function decodeToWavFile(inputPath, outputPath, sampleRate) {
  execSync(
    `ffmpeg -y -i "${inputPath}" -ac 1 -ar ${sampleRate} -c:a pcm_s16le "${outputPath}" 2>/dev/null`,
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}
