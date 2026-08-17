/**
 * End-to-end tests for lib/upscale.mjs — Real-ESRGAN super-resolution integration.
 *
 * Unlike the mock-based unit tests, these tests run the FULL pipeline:
 *   1. Generate a low-res test video with ffmpeg (480x854, 3s, 25fps, with audio)
 *   2. Run upscaleVideo() (ffprobe → extract frames → Real-ESRGAN → reassemble + audio)
 *   3. Verify output: resolution upscaled, duration preserved, frame count preserved,
 *      framerate preserved, audio stream present with matching duration
 *
 * Automatically skipped when Real-ESRGAN binary or ffmpeg is not available
 * (e.g. CI environments without GPU).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync, spawnSync } from "child_process";
import { tmpdir } from "os";
import { upscaleVideo, REALESRGAN_PATH, FFMPEG_PATH, FFPROBE_PATH } from "../lib/upscale.mjs";

// Skip all tests if Real-ESRGAN binary doesn't exist
const hasRealesrgan = existsSync(REALESRGAN_PATH);
const hasFfmpeg = existsSync(FFMPEG_PATH);

describe.skipIf(!hasRealesrgan || !hasFfmpeg)("upscaleVideo e2e", () => {
  let inputPath;
  let outputPath;
  let tmpDir;

  // Parse ffprobe JSON output
  function probeStreams(filePath) {
    const result = spawnSync(
      FFPROBE_PATH,
      ["-v", "quiet", "-show_streams", "-of", "json", filePath],
      { encoding: "utf8", timeout: 10000 },
    );
    const data = JSON.parse(result.stdout);
    const video =
      data.streams.find((/** @type {Record<string, string>} */ s) => s.codec_type === "video") ||
      {};
    const audio =
      data.streams.find((/** @type {Record<string, string>} */ s) => s.codec_type === "audio") ||
      null;
    return { video, audio };
  }

  beforeAll(() => {
    // Create temp directory
    tmpDir = join(tmpdir(), `upscale-e2e-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    inputPath = join(tmpDir, "input.mp4");
    outputPath = join(tmpDir, "output.mp4");

    // Generate a 3-second 480x854 test video at 25fps with 440Hz audio
    execSync(
      [
        `"${FFMPEG_PATH}"`,
        "-f lavfi -i testsrc=duration=3:size=480x854:rate=25",
        "-f lavfi -i sine=frequency=440:duration=3",
        "-c:v libx264 -c:a aac",
        `-y "${inputPath}"`,
      ].join(" "),
      { encoding: "utf8", timeout: 30000 },
    );
  });

  afterAll(() => {
    // Clean up temp files
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("upscales video from 480x854 to 720p", { timeout: 120000 }, () => {
    const result = upscaleVideo(inputPath, outputPath);
    expect(result.success).toBe(true);
    expect(result.path).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const { video } = probeStreams(outputPath);
    const width = parseInt(video.width, 10);
    const height = parseInt(video.height, 10);
    // Short side should be ~720 (may be off by 1px due to even-alignment)
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(719);
    expect(Math.min(width, height)).toBeLessThanOrEqual(720);
  });

  it("preserves video duration (no frames dropped or added)", () => {
    const inputProbe = probeStreams(inputPath);
    const outputProbe = probeStreams(outputPath);

    const inputDuration = parseFloat(inputProbe.video.duration);
    const outputDuration = parseFloat(outputProbe.video.duration);

    // Duration must match within 0.01s (rounding tolerance)
    expect(Math.abs(outputDuration - inputDuration)).toBeLessThan(0.01);
  });

  it("preserves frame count", () => {
    const inputProbe = probeStreams(inputPath);
    const outputProbe = probeStreams(outputPath);

    // nb_frames should be identical (75 frames for 3s @ 25fps)
    expect(outputProbe.video.nb_frames).toBe(inputProbe.video.nb_frames);
  });

  it("preserves framerate", () => {
    const inputProbe = probeStreams(inputPath);
    const outputProbe = probeStreams(outputPath);

    expect(outputProbe.video.r_frame_rate).toBe(inputProbe.video.r_frame_rate);
  });

  it("preserves audio stream with matching duration", () => {
    const outputProbe = probeStreams(outputPath);

    // Audio stream must exist
    expect(outputProbe.audio).not.toBeNull();

    // Audio duration must match video duration
    const audioDuration = parseFloat(outputProbe.audio.duration);
    const videoDuration = parseFloat(outputProbe.video.duration);
    expect(Math.abs(audioDuration - videoDuration)).toBeLessThan(0.05);
  });

  it("audio starts at same time as video (no offset)", () => {
    const outputProbe = probeStreams(outputPath);

    const audioStart = parseFloat(outputProbe.audio.start_time ?? "0");
    const videoStart = parseFloat(outputProbe.video.start_time ?? "0");

    // Both should start at 0 (or within 0.01s)
    expect(Math.abs(audioStart - videoStart)).toBeLessThan(0.01);
  });
});
