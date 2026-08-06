import { describe, it, expect } from "vitest";
import {
  FPS,
  SCENE_BUFFER,
  sceneClipFrames,
  sceneClipDuration,
  sceneTimeline,
  findScene,
} from "../lib/timeline.mjs";

// The video timeline is defined in FRAMES, not floating-point seconds.
// assemble.mjs encodes each scene at exactly `sceneClipFrames()` frames, and the
// subtitle generator offsets each scene by exactly `sceneClipDuration()`. Both
// derive from this module, so they cannot disagree.

describe("sceneClipFrames", () => {
  it("rounds a scene up to the next whole frame", () => {
    // 4.022676 + 0.5 = 4.522676s -> 135.68 frames -> 136 frames
    expect(sceneClipFrames(4.022676)).toBe(136);
  });

  it("does not add a spurious frame when the duration lands exactly on a frame boundary", () => {
    // 4.0 + 0.5 = 4.5s -> exactly 135 frames at 30fps
    expect(sceneClipFrames(4.0)).toBe(135);
  });

  it("never returns fewer than one frame", () => {
    expect(sceneClipFrames(0)).toBe(15); // 0 + 0.5s buffer
  });
});

describe("sceneClipDuration", () => {
  it("returns the frame-aligned clip length in seconds", () => {
    expect(sceneClipDuration(4.022676)).toBeCloseTo(136 / FPS, 9);
  });

  it("is always at least the audio duration plus the recording buffer", () => {
    const tts = 6.828005;
    expect(sceneClipDuration(tts)).toBeGreaterThanOrEqual(tts + SCENE_BUFFER);
  });
});

describe("sceneTimeline", () => {
  const sceneDurations = [
    { sceneId: 1, duration: 4.022676 },
    { sceneId: 2, duration: 6.828005 },
    { sceneId: 3, duration: 7.222676 },
  ];

  it("accumulates scene offsets from frame-aligned clip durations", () => {
    const timeline = sceneTimeline(sceneDurations);
    // scene 1: ceil(4.522676 * 30) = 136 frames
    // scene 2: ceil(7.328005 * 30) = 220 frames
    // scene 3: ceil(7.722676 * 30) = 232 frames
    expect(timeline.map((s) => s.clipFrames)).toEqual([136, 220, 232]);
    expect(timeline[0].offset).toBe(0);
    expect(timeline[1].offset).toBeCloseTo(136 / FPS, 9);
    expect(timeline[2].offset).toBeCloseTo((136 + 220) / FPS, 9);
  });

  it("reports the total timeline length as whole frames", () => {
    const timeline = sceneTimeline(sceneDurations);
    const last = timeline[timeline.length - 1];
    expect(last.offset + last.clipDuration).toBeCloseTo((136 + 220 + 232) / FPS, 9);
  });

  it("returns an empty timeline for no scenes", () => {
    expect(sceneTimeline([])).toEqual([]);
  });
});

describe("findScene", () => {
  const timeline = sceneTimeline([{ sceneId: 1, duration: 4.0 }]);

  it("returns the timeline entry for a known scene", () => {
    expect(findScene(timeline, 1).clipFrames).toBe(135);
  });

  it("throws for an unknown scene instead of silently treating it as zero-length", () => {
    expect(() => findScene(timeline, 99)).toThrow(/scene 99/i);
  });
});
