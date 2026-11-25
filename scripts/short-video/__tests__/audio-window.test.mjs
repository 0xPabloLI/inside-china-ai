/**
 * #1525 — source-audio window and narration ducking contracts.
 *
 * The curve is pure math in `lib/audio-envelope.mjs`, so the window edges,
 * fades and duck multiplier are asserted behaviourally without a render. The
 * schema half is asserted next to the field declarations; the still/render
 * evidence lives in the ticket comment.
 */
import { describe, it, expect } from "vitest";
import { resolveMediaAudio, videoVolumeAt } from "../lib/audio-envelope.mjs";
import { checkMediaFieldSchema } from "../lib/media-field-schema.mjs";

const envelope = {
  baseVolume: 1,
  inFrames: 30,
  outFrames: 30,
  outStart: 90,
  totalFrames: 120,
  fadeFrames: 8,
};

const windowAt = (over = {}) => ({
  startFrame: 30,
  endFrame: 90,
  fadeInFrames: 10,
  fadeOutFrames: 10,
  ...over,
});

const volume = (frame, over = {}) => videoVolumeAt({ frame, ...envelope, ...over });

const mediaScene = (media) => ({
  id: 7,
  visualType: "narrative",
  layout: "media-first",
  media: { type: "video", path: "assets/original.mp4", ...media },
});

const failures = (results) => results.filter((r) => r.level === "fail");

describe("source-audio window (#1525)", () => {
  it("is silent before audioIn and after audioOut", () => {
    expect(volume(20, { audioWindow: windowAt() })).toBe(0);
    expect(volume(95, { audioWindow: windowAt() })).toBe(0);
  });

  it("fades in, holds, and fades out inside the window", () => {
    expect(volume(35, { audioWindow: windowAt() })).toBeCloseTo(0.5, 10);
    expect(volume(50, { audioWindow: windowAt() })).toBeCloseTo(1, 10);
    expect(volume(85, { audioWindow: windowAt() })).toBeCloseTo(0.5, 10);
  });

  it("uses the default scene envelope when no window is declared", () => {
    expect(volume(15)).toBeCloseTo(0.5, 10);
    expect(volume(60)).toBeCloseTo(1, 10);
    expect(volume(105)).toBeCloseTo(0.5, 10);
  });

  it("clamps an audioOut beyond the scene end instead of stretching it", () => {
    const farOut = windowAt({ endFrame: 500 });
    expect(volume(119, { audioWindow: farOut })).toBeGreaterThan(0);
    expect(volume(120, { audioWindow: farOut })).toBe(0);
  });

  it("applies duck as a gain multiplier only inside the audible region", () => {
    expect(volume(50, { audioWindow: windowAt(), duck: 0.25 })).toBeCloseTo(0.25, 10);
    expect(volume(20, { audioWindow: windowAt(), duck: 0.25 })).toBe(0);
    expect(volume(50, { duck: 0 })).toBe(0);
  });

  it("resolves seconds to frames and keeps an untouched clip window-free", () => {
    const resolved = resolveMediaAudio({
      media: { audioIn: 2, audioOut: 5, audioFadeIn: 0.25, audioFadeOut: 0.25 },
      fps: 30,
      totalFrames: 240,
      narrationActive: false,
    });
    expect(resolved.audioWindow).toEqual({
      startFrame: 60,
      endFrame: 150,
      fadeInFrames: 8,
      fadeOutFrames: 8,
    });
    expect(resolved.duck).toBe(1);

    const untouched = resolveMediaAudio({
      media: { volume: 1 },
      fps: 30,
      totalFrames: 120,
      narrationActive: true,
    });
    expect(untouched.audioWindow).toBeNull();
    expect(untouched.duck).toBe(1);
  });

  it("ducks only when the declaration opts in and narration is present", () => {
    const ducked = resolveMediaAudio({
      media: { duckUnderNarration: true, duckLevel: 0.25 },
      fps: 30,
      totalFrames: 120,
      narrationActive: true,
    });
    expect(ducked.duck).toBe(0.25);

    const noNarration = resolveMediaAudio({
      media: { duckUnderNarration: true, duckLevel: 0.25 },
      fps: 30,
      totalFrames: 120,
      narrationActive: false,
    });
    expect(noNarration.duck).toBe(1);
  });

  it("accepts a full source-audio declaration on a video", () => {
    const results = checkMediaFieldSchema([
      mediaScene({
        volume: 1,
        audioIn: 2,
        audioOut: 5.5,
        audioFadeIn: 0.4,
        audioFadeOut: 0.5,
        duckUnderNarration: true,
        duckLevel: 0.25,
      }),
    ]);
    expect(failures(results)).toHaveLength(0);
  });

  it("rejects an audio window on an image, a reversed window, and an inert duckLevel", () => {
    const image = checkMediaFieldSchema([
      mediaScene({ type: "image", path: "assets/still.png", audioIn: 1 }),
    ]);
    expect(
      failures(image)
        .map((r) => r.check)
        .join("\n"),
    ).toContain("audio window is on a video");

    const reversed = checkMediaFieldSchema([mediaScene({ audioIn: 5, audioOut: 2 })]);
    expect(
      failures(reversed)
        .map((r) => r.check)
        .join("\n"),
    ).toContain("audioOut follows audioIn");

    const inert = checkMediaFieldSchema([mediaScene({ duckLevel: 0.25 })]);
    expect(
      failures(inert)
        .map((r) => r.check)
        .join("\n"),
    ).toContain("duckLevel has an effect");

    const outOfRange = checkMediaFieldSchema([
      mediaScene({ duckUnderNarration: true, duckLevel: 1.5 }),
    ]);
    expect(
      failures(outOfRange)
        .map((r) => r.check)
        .join("\n"),
    ).toContain("duckLevel is in [0, 1]");

    const negative = checkMediaFieldSchema([mediaScene({ audioIn: -1 })]);
    expect(
      failures(negative)
        .map((r) => r.check)
        .join("\n"),
    ).toContain("audioIn is a non-negative number");
  });

  it("rejects audio fields that are not numbers", () => {
    const results = checkMediaFieldSchema([mediaScene({ audioIn: "2" })]);
    expect(
      failures(results)
        .map((r) => r.detail)
        .join("\n"),
    ).toContain("finite number");
  });
});
