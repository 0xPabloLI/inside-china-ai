/**
 * Media Probe — ffprobe wrapper for video metadata extraction.
 *
 * Wraps ffprobe calls to extract structured media metadata (duration, fps,
 * audio presence, dimensions, rotation). Returns null on any failure so
 * callers can gracefully fall back to default values.
 *
 * API:
 *   probeMedia(videoPath)       → Promise<ProbeResult | null>
 *   parseProbeOutput(rawOutput) → ProbeResult | null  (pure function)
 *
 * ffprobe path: /opt/homebrew/opt/ffmpeg-full/bin/ffprobe
 * (same as upscale.mjs and tts/post-process.mjs)
 *
 * @module media-probe
 */

import { execSync } from "child_process";
import { existsSync } from "fs";

// ─── Constants ───

const FFPROBE_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
const ffprobeCmd = existsSync(FFPROBE_FULL) ? FFPROBE_FULL : "ffprobe";

/**
 * @typedef {Object} ProbeResult
 * @property {number} durationMs - Duration in milliseconds
 * @property {number} fps - Frames per second (0 if unavailable)
 * @property {boolean} hasAudio - Whether an audio stream is present
 * @property {number} width - Video width in pixels (0 if unavailable)
 * @property {number} height - Video height in pixels (0 if unavailable)
 * @property {number} rotation - Rotation in degrees (0 if none)
 */

// ─── Pure function: parse ffprobe JSON output ───

/**
 * Parse raw ffprobe JSON output into a ProbeResult.
 *
 * Expects JSON with `streams` array and `format.duration` string.
 * Finds the first video stream for width/height/fps/rotation.
 * Checks for any audio stream to set hasAudio.
 *
 * Returns null if:
 *   - Input is null/empty/malformed
 *   - No video stream found
 *   - Duration is missing (critical for window computation)
 *
 * @param {string|null|undefined} rawOutput - Raw ffprobe JSON output
 * @returns {ProbeResult|null}
 */
export function parseProbeOutput(rawOutput) {
  if (!rawOutput || typeof rawOutput !== "string" || !rawOutput.trim()) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(rawOutput);
  } catch {
    return null;
  }

  if (!data || !Array.isArray(data.streams) || data.streams.length === 0) {
    return null;
  }

  // Find first video stream
  const videoStream = data.streams.find((s) => s.codec_type === "video");
  if (!videoStream) {
    // No video stream — likely audio-only file
    return null;
  }

  // Duration is critical — must be present
  const durationStr = data.format?.duration;
  if (!durationStr) {
    return null;
  }
  const durationSec = parseFloat(durationStr);
  if (isNaN(durationSec)) {
    return null;
  }

  // Parse fps from "num/den" format (e.g., "30/1", "30000/1001")
  let fps = 0;
  const rFrameRate = videoStream.r_frame_rate;
  if (rFrameRate && typeof rFrameRate === "string") {
    const parts = rFrameRate.split("/");
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (den !== 0 && !isNaN(num) && !isNaN(den)) {
        fps = num / den;
      }
    } else if (parts.length === 1) {
      const val = parseFloat(parts[0]);
      if (!isNaN(val)) fps = val;
    }
  }

  // Check for audio stream
  const hasAudio = data.streams.some((s) => s.codec_type === "audio");

  // Parse rotation — check tags.rotate first, then side_data_list[].rotation
  let rotation = 0;
  if (videoStream.tags?.rotate) {
    rotation = parseInt(videoStream.tags.rotate, 10) || 0;
  } else if (Array.isArray(videoStream.side_data_list)) {
    for (const sd of videoStream.side_data_list) {
      if (typeof sd.rotation === "number") {
        rotation = sd.rotation;
        break;
      }
    }
  }

  return {
    durationMs: Math.round(durationSec * 1000),
    fps: Math.round(fps * 100) / 100, // round to 2 decimal places
    hasAudio,
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    rotation,
  };
}

// ─── I/O function: run ffprobe ───

/**
 * Probe a video file using ffprobe to extract metadata.
 *
 * Returns structured ProbeResult or null on any failure (file not found,
 * ffprobe error, corrupt file, etc.). Never throws.
 *
 * @param {string} videoPath - Absolute path to the video file
 * @returns {ProbeResult|null}
 */
export function probeMedia(videoPath) {
  if (!videoPath || !existsSync(videoPath)) {
    return null;
  }

  try {
    const raw = execSync(
      `"${ffprobeCmd}" -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
      { encoding: "utf8", timeout: 10000 },
    );
    return parseProbeOutput(raw);
  } catch {
    return null;
  }
}
