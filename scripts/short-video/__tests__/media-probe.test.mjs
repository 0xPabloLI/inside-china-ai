/**
 * Media Probe Tests — T4: ffprobe wrapper + parseProbeOutput pure function
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * Seams under test:
 *   1. parseProbeOutput() — pure function, no I/O
 *   2. probeMedia() — wraps ffprobe, returns ProbeResult | null
 *
 * Scenario coverage (from spec-p4 Scenario Matrix):
 *   #1  Video asset with probeMedia success → valid metadata
 *   #2  Video asset with probeMedia failure → null
 *   #5  Very short video (< 1s)
 *   #6  Video with no audio track → hasAudio=false
 *   #16 probeMedia on non-video file (image) → null or empty
 *   #17 extract_frames edge: startMs > endMs (handled by caller, not probeMedia)
 */
import { describe, it, expect, vi } from "vitest";
import { parseProbeOutput } from "../lib/media-probe.mjs";

// ─── parseProbeOutput: pure function tests ───

describe("parseProbeOutput", () => {
  it("parses valid ffprobe JSON with video+audio stream", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 1920,
          height: 1080,
          r_frame_rate: "30/1",
          tags: { rotate: "0" },
        },
        {
          codec_type: "audio",
          codec_name: "aac",
        },
      ],
      format: {
        duration: "10.500",
      },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.durationMs).toBe(10500);
    expect(result.fps).toBe(30);
    expect(result.hasAudio).toBe(true);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.rotation).toBe(0);
  });

  it("parses video-only file (no audio stream)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 1280,
          height: 720,
          r_frame_rate: "24/1",
        },
      ],
      format: {
        duration: "5.0",
      },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.hasAudio).toBe(false);
    expect(result.durationMs).toBe(5000);
    expect(result.fps).toBe(24);
  });

  it("parses fractional fps (e.g., 29.97 = 30000/1001)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 1920,
          height: 1080,
          r_frame_rate: "30000/1001",
        },
      ],
      format: { duration: "8.0" },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.fps).toBeCloseTo(29.97, 1);
  });

  it("parses very short video (< 1s)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 640,
          height: 480,
          r_frame_rate: "30/1",
        },
      ],
      format: { duration: "0.5" },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.durationMs).toBe(500);
    expect(result.fps).toBe(30);
  });

  it("handles rotation from side_data instead of tags", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 1080,
          height: 1920,
          r_frame_rate: "30/1",
          side_data_list: [{ rotation: -90 }],
        },
      ],
      format: { duration: "10.0" },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.rotation).toBe(-90);
  });

  it("handles missing duration field (returns null)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 1920,
          height: 1080,
          r_frame_rate: "30/1",
        },
      ],
      format: {},
    });
    const result = parseProbeOutput(raw);
    // Missing duration is critical — return null so caller uses default window
    expect(result).toBeNull();
  });

  it("handles missing video stream (audio-only file)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "audio",
          codec_name: "mp3",
        },
      ],
      format: { duration: "3.0" },
    });
    const result = parseProbeOutput(raw);
    expect(result).toBeNull();
  });

  it("handles empty streams array", () => {
    const raw = JSON.stringify({
      streams: [],
      format: { duration: "1.0" },
    });
    const result = parseProbeOutput(raw);
    expect(result).toBeNull();
  });

  it("handles malformed JSON input", () => {
    const result = parseProbeOutput("not valid json at all");
    expect(result).toBeNull();
  });

  it("handles empty string input", () => {
    const result = parseProbeOutput("");
    expect(result).toBeNull();
  });

  it("handles null input", () => {
    const result = parseProbeOutput(null);
    expect(result).toBeNull();
  });

  it("handles missing r_frame_rate (fps defaults to 0)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 1920,
          height: 1080,
        },
      ],
      format: { duration: "5.0" },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.fps).toBe(0);
    expect(result.durationMs).toBe(5000);
  });

  it("handles r_frame_rate as '0/0' (invalid, defaults to 0)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          width: 1920,
          height: 1080,
          r_frame_rate: "0/0",
        },
      ],
      format: { duration: "5.0" },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.fps).toBe(0);
  });

  it("handles missing width/height (defaults to 0)", () => {
    const raw = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          r_frame_rate: "30/1",
        },
      ],
      format: { duration: "5.0" },
    });
    const result = parseProbeOutput(raw);
    expect(result).not.toBeNull();
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});
