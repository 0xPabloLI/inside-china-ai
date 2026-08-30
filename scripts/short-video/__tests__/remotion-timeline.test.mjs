/**
 * Tests for the shared scene schedule (timeline option A2 — Compensated Start).
 *
 * A2: every non-final scene allocates `clipFrames + transitionOverlap` frames to
 * its visual Sequence. TransitionSeries then subtracts `transitionOverlap` per
 * transition when it overlaps them, so each scene's visual starts exactly where
 * its audio and subtitles start — no cumulative drift, no black tail.
 *
 * Expected values come from INDEPENDENT sources, never from the module under
 * test: the rendered qwen4-preview mp4 (1953 frames @30fps) for the real fixture,
 * and hand-computed small fixtures. (The previous version of this file asserted
 * `timeline[1].offset === timeline[1].offset` — tautological, always green.)
 */
import { describe, it, expect } from "vitest";
import { FPS, sceneClipFrames, sceneTimeline, scheduleTotalFrames } from "../lib/timeline.mjs";

/** Real qwen4-preview TTS durations (seconds) — see content/qwen4-preview. */
const QWEN4 = [
  { sceneId: 1, duration: 5.686667 },
  { sceneId: 2, duration: 5.27068 },
  { sceneId: 3, duration: 6.7 },
  { sceneId: 4, duration: 7.414671 },
  { sceneId: 5, duration: 4.758685 },
  { sceneId: 6, duration: 6.188005 },
  { sceneId: 7, duration: 6.081338 },
  { sceneId: 8, duration: 6.55068 },
  { sceneId: 9, duration: 6.188005 },
  { sceneId: 10, duration: 5.121338 },
];

/** clipFrames for the above: ceil((duration + 0.5) * 30). */
const QWEN4_FRAMES = [186, 174, 216, 238, 158, 201, 198, 212, 201, 169];

/** Visual start of each scene under A2 = running sum of clipFrames. */
const QWEN4_STARTS = [0, 186, 360, 576, 814, 972, 1173, 1371, 1583, 1784];

describe("scene schedule — A2 (Compensated Start), Remotion path", () => {
  const schedule = sceneTimeline(QWEN4, { transitionOverlap: 10 });

  it("allocates the transition frames to every non-final scene", () => {
    schedule.forEach((entry, i) => {
      const isLast = i === schedule.length - 1;
      expect(entry.visualFrames).toBe(QWEN4_FRAMES[i] + (isLast ? 0 : 10));
    });
  });

  it("starts every scene's visual exactly where its audio starts", () => {
    // The bug this replaces: visuals ran 10*i frames early (TransitionSeries
    // overlap) while audio ran on the plain sum — 90 frames of drift by the CTA.
    schedule.forEach((entry, i) => {
      expect(entry.visualStartFrames).toBe(QWEN4_STARTS[i]);
      expect(Math.round(entry.offset * FPS)).toBe(QWEN4_STARTS[i]);
    });
  });

  it("ends the composition exactly when the final scene's visual ends", () => {
    const last = schedule[schedule.length - 1];
    const visualEnd = last.visualStartFrames + last.visualFrames;
    // 1953 frames = 65.1s, the length of the shipped qwen4-preview mp4.
    expect(visualEnd).toBe(1953);
    expect(visualEnd).toBe(scheduleTotalFrames(schedule));
  });

  it("keeps the CTA on screen for its whole clip, ending on the last frame", () => {
    const cta = schedule[schedule.length - 1];
    expect(cta.visualStartFrames).toBe(1784);
    expect(cta.visualStartFrames + cta.visualFrames).toBe(1953);
  });

  it("conserves total frames: sum(visualFrames) - transitions = sum(clipFrames)", () => {
    const sumVisual = schedule.reduce((s, e) => s + e.visualFrames, 0);
    const transitions = (schedule.length - 1) * 10;
    expect(sumVisual - transitions).toBe(1953);
  });
});

describe("scene schedule — Playwright path (no transitions)", () => {
  const schedule = sceneTimeline(QWEN4, { transitionOverlap: 0 });

  it("keeps today's timing: visual frames equal clip frames", () => {
    schedule.forEach((entry, i) => {
      expect(entry.visualFrames).toBe(QWEN4_FRAMES[i]);
      expect(entry.visualStartFrames).toBe(QWEN4_STARTS[i]);
    });
  });

  it("totals the same composition length as the Remotion path", () => {
    expect(scheduleTotalFrames(schedule)).toBe(1953);
  });
});

describe("scene schedule — hand-computed 2-scene fixture", () => {
  // scene 1: ceil(4.522676 * 30) = 136
  // scene 2: ceil(7.328005 * 30) = 220
  // overlap 6 → scene 1 gets 142 visual frames, scene 2 keeps 220
  const two = [
    { sceneId: 1, duration: 4.022676 },
    { sceneId: 2, duration: 6.828005 },
  ];

  it("starts scene 2 at frame 136 and ends the video at 356", () => {
    const schedule = sceneTimeline(two, { transitionOverlap: 6 });
    expect(schedule[0].visualFrames).toBe(142);
    expect(schedule[1].visualFrames).toBe(220);
    expect(schedule[1].visualStartFrames).toBe(136);
    expect(schedule[1].visualStartFrames + schedule[1].visualFrames).toBe(356);
    expect(scheduleTotalFrames(schedule)).toBe(356);
  });

  it("defaults to no overlap so existing callers are unaffected", () => {
    const schedule = sceneTimeline(two);
    expect(schedule[0].visualFrames).toBe(sceneClipFrames(4.022676));
    expect(schedule[1].visualFrames).toBe(sceneClipFrames(6.828005));
    expect(schedule[1].visualStartFrames).toBe(136);
  });
});

describe("scene schedule — clip duration passed to scene components", () => {
  it("reports the visual duration, not the TTS duration, for non-final scenes", () => {
    const schedule = sceneTimeline(QWEN4, { transitionOverlap: 10 });
    // A non-final scene is on screen for its clip plus the transition that
    // overlaps it, so in-scene loops (e.g. ScanSweep) cover the whole presence.
    expect(schedule[0].visualDuration).toBeCloseTo((186 + 10) / FPS, 9);
    // The final scene is never overlapped.
    expect(schedule[9].visualDuration).toBeCloseTo(169 / FPS, 9);
  });
});
