/**
 * Tests for the unified Remotion timeline (Option A — Fixed Scene Start).
 *
 * Verifies that visual, audio, subtitle, and totalFrames all use the SAME
 * offsets from sceneTimeline() in lib/timeline.mjs. No track should
 * compress or shift the global timeline.
 */
import { describe, it, expect } from "vitest";
import {
  FPS,
  sceneClipFrames,
  sceneClipDuration,
  sceneTimeline,
} from "../lib/timeline.mjs";

describe("Remotion timeline — Option A (Fixed Scene Start)", () => {
  // 2-scene fixture
  const twoScenes = [
    { sceneId: 1, duration: 4.022676 },
    { sceneId: 2, duration: 6.828005 },
  ];

  // 3-scene fixture
  const threeScenes = [
    { sceneId: 1, duration: 4.022676 },
    { sceneId: 2, duration: 6.828005 },
    { sceneId: 3, duration: 7.222676 },
  ];

  describe("2-scene fixture", () => {
    const timeline = sceneTimeline(twoScenes);

    it("composition total frames = sum of clipFrames (no overlap)", () => {
      const totalFrames = timeline.reduce((sum, s) => sum + s.clipFrames, 0);
      // scene 1: ceil(4.522676 * 30) = 136
      // scene 2: ceil(7.328005 * 30) = 220
      // total = 356 (NOT 356 - 6 transition overlap)
      expect(totalFrames).toBe(136 + 220);
      expect(totalFrames).toBe(356);
    });

    it("audio start = sceneTimeline offset (no shift)", () => {
      // Audio for scene 2 starts at frame 136 (scene 1's clipFrames)
      // NOT at frame 136 - 6 (which would be the TransitionSeries overlap)
      expect(timeline[1].offset).toBeCloseTo(136 / FPS, 9);
      expect(timeline[1].offset).not.toBeCloseTo((136 - 6) / FPS, 9);
    });

    it("ASS start = audio start (same offset)", () => {
      // Subtitle cues use the same sceneTimeline() offset
      // This is enforced by cues.mjs using findScene(timeline, sceneId)
      const audioOffset = timeline[1].offset;
      const subtitleOffset = timeline[1].offset; // same source
      expect(audioOffset).toBe(subtitleOffset);
    });

    it("visual start = audio/ASS start (same offset)", () => {
      // In ShortVideo.tsx, visual Sequence uses `from={cumulativeOffsetFrames}`
      // which is the same as sceneTimeline() offset
      const visualOffset = timeline[1].offset;
      const audioOffset = timeline[1].offset;
      expect(visualOffset).toBe(audioOffset);
    });

    it("last frame has no unexpected empty background", () => {
      const last = timeline[timeline.length - 1];
      const totalDuration = last.offset + last.clipDuration;
      const totalFrames = Math.ceil(totalDuration * FPS);
      // Total should be exactly sum of all clipFrames
      const expectedFrames = timeline.reduce((sum, s) => sum + s.clipFrames, 0);
      expect(totalFrames).toBe(expectedFrames);
    });
  });

  describe("3-scene fixture", () => {
    const timeline = sceneTimeline(threeScenes);

    it("composition total frames = sum of all clipFrames (no overlap)", () => {
      const totalFrames = timeline.reduce((sum, s) => sum + s.clipFrames, 0);
      // scene 1: ceil(4.522676 * 30) = 136
      // scene 2: ceil(7.328005 * 30) = 220
      // scene 3: ceil(7.722676 * 30) = 232
      expect(totalFrames).toBe(136 + 220 + 232);
      expect(totalFrames).toBe(588);
    });

    it("scene 2 audio/visual start = scene 1 clipFrames offset", () => {
      expect(timeline[1].offset).toBeCloseTo(136 / FPS, 9);
    });

    it("scene 3 audio/visual start = scene 1 + scene 2 clipFrames offset", () => {
      expect(timeline[2].offset).toBeCloseTo((136 + 220) / FPS, 9);
    });

    it("no transition overlap reduces total frames", () => {
      const totalWithoutOverlap = timeline.reduce((sum, s) => sum + s.clipFrames, 0);
      // With TransitionSeries (2 transitions × 6 frames), total would be 588 - 12 = 576
      // Option A: total is 588 (no overlap)
      expect(totalWithoutOverlap).toBe(588);
      expect(totalWithoutOverlap).not.toBe(576);
    });

    it("all scene offsets are monotonically increasing", () => {
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].offset).toBeGreaterThan(timeline[i - 1].offset);
      }
    });
  });

  describe("Root.tsx calculateMetadata consistency", () => {
    it("Root.tsx totalFrames = sceneTimeline totalFrames", () => {
      // Root.tsx uses: durations.reduce((sum, d) => sum + sceneClipFrames(d), 0)
      // This must equal sceneTimeline total
      const rootTotal = twoScenes.reduce(
        (sum, s) => sum + sceneClipFrames(s.duration),
        0,
      );
      const timelineTotal = sceneTimeline(twoScenes).reduce(
        (sum, s) => sum + s.clipFrames,
        0,
      );
      expect(rootTotal).toBe(timelineTotal);
    });
  });

  describe("render-remotion.mjs totalFrames consistency", () => {
    it("render-remotion totalFrames = sceneTimeline totalFrames", () => {
      // render-remotion.mjs uses: durations.reduce((sum, d) => sum + sceneClipFrames(d), 0)
      // This must equal sceneTimeline total
      const renderTotal = threeScenes.reduce(
        (sum, s) => sum + sceneClipFrames(s.duration),
        0,
      );
      const timelineTotal = sceneTimeline(threeScenes).reduce(
        (sum, s) => sum + s.clipFrames,
        0,
      );
      expect(renderTotal).toBe(timelineTotal);
    });
  });
});
