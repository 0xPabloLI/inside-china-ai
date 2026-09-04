import { describe, it, expect } from "vitest";
import { applyDriftCorrection } from "../lib/verify-retry.mjs";

// Spec: applyDriftCorrection(cues, driftMap) → new cues with timestamps shifted
// Pure: input not mutated, returns new array

describe("applyDriftCorrection — basic shifting", () => {
  it("shifts cue start and end by the scene's drift", () => {
    const cues = [
      {
        sceneId: 1,
        start: 0.04,
        end: 1.52,
        text: "Hello",
        words: [{ text: "Hello", onset: 0.04, fill: 0.2 }],
      },
      {
        sceneId: 2,
        start: 4.73,
        end: 6.0,
        text: "World",
        words: [{ text: "World", onset: 4.73, fill: 0.2 }],
      },
    ];
    const driftMap = { 1: 0.02, 2: -0.157 };

    const result = applyDriftCorrection(cues, driftMap);

    expect(result[0].start).toBeCloseTo(0.06, 6);
    expect(result[0].end).toBeCloseTo(1.54, 6);
    expect(result[0].words[0].onset).toBeCloseTo(0.06, 6);

    expect(result[1].start).toBeCloseTo(4.573, 6);
    expect(result[1].end).toBeCloseTo(5.843, 6);
    expect(result[1].words[0].onset).toBeCloseTo(4.573, 6);
  });

  it("handles negative drift (audio early → subtitles earlier)", () => {
    const cues = [
      {
        sceneId: 1,
        start: 1.0,
        end: 2.0,
        text: "Test",
        words: [{ text: "Test", onset: 1.0, fill: 0.2 }],
      },
    ];
    const driftMap = { 1: -0.2 };

    const result = applyDriftCorrection(cues, driftMap);

    expect(result[0].start).toBeCloseTo(0.8, 6);
    expect(result[0].end).toBeCloseTo(1.8, 6);
    expect(result[0].words[0].onset).toBeCloseTo(0.8, 6);
  });
});

describe("applyDriftCorrection — purity", () => {
  it("does not mutate the input array", () => {
    const cues = [
      {
        sceneId: 1,
        start: 1.0,
        end: 2.0,
        text: "A",
        words: [{ text: "A", onset: 1.0, fill: 0.2 }],
      },
    ];
    const driftMap = { 1: 0.1 };

    applyDriftCorrection(cues, driftMap);

    expect(cues[0].start).toBe(1.0);
    expect(cues[0].end).toBe(2.0);
    expect(cues[0].words[0].onset).toBe(1.0);
  });

  it("returns a new array (different reference)", () => {
    const cues = [{ sceneId: 1, start: 1.0, end: 2.0, text: "A", words: [] }];
    const result = applyDriftCorrection(cues, { 1: 0.1 });
    expect(result).not.toBe(cues);
    expect(result[0]).not.toBe(cues[0]);
  });
});

describe("applyDriftCorrection — edge cases", () => {
  it("returns shallow copy when driftMap is empty", () => {
    const cues = [
      {
        sceneId: 1,
        start: 1.0,
        end: 2.0,
        text: "A",
        words: [{ text: "A", onset: 1.0, fill: 0.2 }],
      },
    ];
    const result = applyDriftCorrection(cues, {});
    expect(result).not.toBe(cues);
    expect(result[0].start).toBe(1.0);
    expect(result[0].words[0].onset).toBe(1.0);
  });

  it("returns empty array for empty cues", () => {
    expect(applyDriftCorrection([], { 1: 0.1 })).toEqual([]);
  });

  it("leaves cues with no scene in driftMap unchanged", () => {
    const cues = [
      {
        sceneId: 1,
        start: 1.0,
        end: 2.0,
        text: "A",
        words: [{ text: "A", onset: 1.0, fill: 0.2 }],
      },
      {
        sceneId: 99,
        start: 3.0,
        end: 4.0,
        text: "B",
        words: [{ text: "B", onset: 3.0, fill: 0.2 }],
      },
    ];
    const driftMap = { 1: 0.1 };

    const result = applyDriftCorrection(cues, driftMap);

    expect(result[0].start).toBeCloseTo(1.1, 6);
    expect(result[1].start).toBe(3.0); // unchanged
  });

  it("handles zero drift (no change)", () => {
    const cues = [
      {
        sceneId: 1,
        start: 1.0,
        end: 2.0,
        text: "A",
        words: [{ text: "A", onset: 1.0, fill: 0.2 }],
      },
    ];
    const result = applyDriftCorrection(cues, { 1: 0 });
    expect(result[0].start).toBe(1.0);
    expect(result[0].words[0].onset).toBe(1.0);
  });

  it("handles cue with no words array", () => {
    const cues = [{ sceneId: 1, start: 1.0, end: 2.0, text: "No words here" }];
    const result = applyDriftCorrection(cues, { 1: 0.05 });
    expect(result[0].start).toBeCloseTo(1.05, 6);
    expect(result[0].end).toBeCloseTo(2.05, 6);
  });
});
