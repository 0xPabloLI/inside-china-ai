import { describe, it, expect, vi } from "vitest";

// Mock process.exit
const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

import { runCanonicalTextGateWithRepair } from "../lib/verify-canonical-text.mjs";

const scenes = [
  {
    id: 1,
    voiceover: "ByteDance launched Doubao Work today.",
  },
];

const keyEntities = {
  companies: ["bytedance", "doubao"],
  models: ["doubao-work"],
};

// Timing that matches scene-data
const matchingTiming = [
  {
    sceneId: 1,
    segments: [
      {
        words: [
          { text: "ByteDance", start: 0, end: 0.5 },
          { text: "launched", start: 0.5, end: 0.8 },
          { text: "Doubao", start: 0.8, end: 1.0 },
          { text: "Work", start: 1.0, end: 1.2 },
          { text: "today.", start: 1.2, end: 1.5 },
        ],
      },
    ],
  },
];

// Modified scenes (scene-data changed, timing stale)
const modifiedScenes = JSON.parse(JSON.stringify(scenes));
modifiedScenes[0].voiceover = "Tencent launched Doubao Work today.";

// Timing that matches modifiedScenes (after re-running text-align.py)
const repairedTiming = [
  {
    sceneId: 1,
    segments: [
      {
        words: [
          { text: "Tencent", start: 0, end: 0.5 },
          { text: "launched", start: 0.5, end: 0.8 },
          { text: "Doubao", start: 0.8, end: 1.0 },
          { text: "Work", start: 1.0, end: 1.2 },
          { text: "today.", start: 1.2, end: 1.5 },
        ],
      },
    ],
  },
];

describe("T5: canonical-text repair strategy", () => {
  it("passes through when canonical text matches (no repair needed)", async () => {
    exitSpy.mockClear();
    const realignFn = vi.fn();
    const reloadTimingFn = vi.fn();

    const result = await runCanonicalTextGateWithRepair(matchingTiming, scenes, keyEntities, {
      label: "Gate 1",
      realignFn,
      reloadTimingFn,
    });

    expect(result.passed).toBe(true);
    expect(realignFn).not.toHaveBeenCalled(); // No repair needed
  });

  it("attempts repair (re-run text-align.py) on canonical-text mismatch, passes after repair", async () => {
    exitSpy.mockClear();
    const realignFn = vi.fn(async () => {});
    const reloadTimingFn = vi.fn(() => repairedTiming);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runCanonicalTextGateWithRepair(matchingTiming, modifiedScenes, keyEntities, {
      label: "Gate 1",
      realignFn,
      reloadTimingFn,
    });

    expect(result.passed).toBe(true);
    expect(realignFn).toHaveBeenCalledTimes(1); // text-align.py was re-run
    expect(reloadTimingFn).toHaveBeenCalledTimes(1); // timing was re-read
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("repair"));
    logSpy.mockRestore();
  });

  it("hard fails when repair still produces mismatch", async () => {
    exitSpy.mockClear();
    // After re-running text-align.py, timing STILL matches the old scenes, not modifiedScenes
    const realignFn = vi.fn(async () => {});
    const reloadTimingFn = vi.fn(() => matchingTiming); // stale timing

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runCanonicalTextGateWithRepair(matchingTiming, modifiedScenes, keyEntities, {
        label: "Gate 1",
        realignFn,
        reloadTimingFn,
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FAIL after repair"));
    errorSpy.mockRestore();
  });

  it("hard fails when realignFn throws", async () => {
    exitSpy.mockClear();
    const realignFn = vi.fn(async () => {
      throw new Error("text-align.py crashed");
    });
    const reloadTimingFn = vi.fn(() => matchingTiming);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runCanonicalTextGateWithRepair(matchingTiming, modifiedScenes, keyEntities, {
        label: "Gate 1",
        realignFn,
        reloadTimingFn,
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("repair failed"));
    errorSpy.mockRestore();
  });

  it("falls back to hard exit (no repair) when realignFn is not provided", async () => {
    exitSpy.mockClear();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runCanonicalTextGateWithRepair(matchingTiming, modifiedScenes, keyEntities, {
        label: "Gate 1",
        // no realignFn / reloadTimingFn
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FAIL"));
    errorSpy.mockRestore();
  });
});
