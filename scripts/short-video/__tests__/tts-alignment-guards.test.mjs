/**
 * Tests for post-alignment TTS guards (#232 — TTS 输出质量守卫).
 *
 * Two guards, both driven by the wav2vec2 forced-alignment word timings that
 * runForcedAlignment() already produces:
 *
 * 1. Tail hard-cut: speech-ending-based trim that kills hallucinated voice
 *    tails. silenceremove's threshold filter cannot catch them (the dh-pilot
 *    scene-7 tail was −21dB continuous voiced sound, never "silent"), but the
 *    alignment knows exactly where the last real word ends.
 * 2. Crushed-word sanity: an aligned word lasting far less than its syllable
 *    count allows was swallowed (dh-pilot scene-7 read "53.4" in 0.13s).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeTailCut,
  estimateSyllables,
  findCrushedWords,
  trimSceneTail,
  TAIL_PAD_SEC,
  TAIL_MIN_EXCESS_SEC,
  MIN_SEC_PER_SYLLABLE,
} from "../lib/tts/alignment-guards.mjs";

// promisify(exec) resolves via node's custom promisify — the mock may receive
// (cmd, cb) or (cmd, options, cb); derive the callback and command by shape.
const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn((...args) => {
    const cb = args.findLast((a) => typeof a === "function");
    cb(null, { stdout: "", stderr: "" });
  }),
}));
vi.mock("child_process", () => ({ exec: execMock, execSync: vi.fn() }));

describe("estimateSyllables", () => {
  it("counts vowel groups per word", () => {
    expect(estimateSyllables("fifty")).toBe(2);
    expect(estimateSyllables("point")).toBe(1);
    expect(estimateSyllables("four")).toBe(1);
  });

  it("floors at one syllable for vowelless tokens", () => {
    expect(estimateSyllables("hmm")).toBe(1);
    expect(estimateSyllables("53.4")).toBe(1);
  });
});

describe("findCrushedWords", () => {
  it("flags a word whose duration is far below its syllable budget", () => {
    const words = [
      { text: "fifty", start: 3.0, end: 3.06 }, // 2 syl → min 0.24s, got 0.06s
      { text: "three", start: 3.06, end: 3.1 },
      { text: "point", start: 3.1, end: 3.12 },
      { text: "four", start: 3.12, end: 3.13 },
    ];
    const crushed = findCrushedWords(words);
    expect(crushed).toHaveLength(4);
    expect(crushed[0]).toMatchObject({ text: "fifty", duration: 0.06 });
  });

  it("passes normally paced words", () => {
    const words = [
      { text: "fifty", start: 3.0, end: 3.3 },
      { text: "three", start: 3.3, end: 3.55 },
    ];
    expect(findCrushedWords(words)).toEqual([]);
  });

  it("treats a zero-duration word as maximally crushed", () => {
    expect(findCrushedWords([{ text: "four", start: 1.0, end: 1.0 }])).toHaveLength(1);
  });
});

describe("computeTailCut", () => {
  const pad = TAIL_PAD_SEC; // 0.15s decay allowance
  const excess = TAIL_MIN_EXCESS_SEC; // 0.5s minimum meaningful tail

  it("returns null when the audio ends within the pad + excess budget", () => {
    // last word ends at 3.29 → cut point 3.44; audio 3.71 → excess 0.27 < 0.5
    expect(computeTailCut(3.71, 3.29)).toBeNull();
  });

  it("returns the cut point when a phantom tail exceeds the budget", () => {
    // dh-pilot scene-7: last word 3.29s, raw take 6.1s → cut at 3.44s
    expect(computeTailCut(6.1, 3.29)).toBe(3.29 + pad);
  });

  it("returns null when there are no aligned words", () => {
    expect(computeTailCut(6.1, null)).toBeNull();
  });

  it("never cuts before the last word itself", () => {
    // pathological: duration just above the cut point
    expect(computeTailCut(3.29 + pad + excess + 0.01, 3.29)).toBeCloseTo(3.29 + pad, 5);
  });
});

describe("guard constants", () => {
  it("pins the documented decay allowance and excess budget", () => {
    expect(TAIL_PAD_SEC).toBe(0.15);
    expect(TAIL_MIN_EXCESS_SEC).toBe(0.5);
    expect(MIN_SEC_PER_SYLLABLE).toBe(0.12);
  });
});

describe("trimSceneTail", () => {
  // Braces matter: a hook that RETURNS a function (mockClear is chainable)
  // is treated by vitest as a teardown fn and invoked with no args.
  beforeEach(() => {
    execMock.mockClear();
  });

  it("moves the trimmed tmp over the original when the probe succeeds", async () => {
    execMock.mockImplementation((...args) => {
      const cb = args.findLast((a) => typeof a === "function");
      const cmd = args.find((a) => typeof a === "string") ?? "";
      cb(null, { stdout: cmd.includes("ffprobe") ? "1.350000\n" : "", stderr: "" });
    });
    const duration = await trimSceneTail("/out/scene-1.mp3", 1.35);
    expect(duration).toBe(1.35);
    const mvCalls = execMock.mock.calls.filter(([cmd]) => cmd.startsWith("mv "));
    expect(mvCalls).toHaveLength(1);
    expect(mvCalls[0][0]).toContain("scene-1-tailcut.mp3");
  });

  it("keeps the original untouched when the duration probe fails", async () => {
    // ffprobe returns garbage (empty stdout) → NaN → no mv, tmp cleaned up
    execMock.mockImplementation((...args) => {
      const cb = args.findLast((a) => typeof a === "function");
      cb(null, { stdout: "", stderr: "" });
    });
    expect(Number.isNaN(await trimSceneTail("/out/scene-1.mp3", 1.35))).toBe(true);
    expect(execMock.mock.calls.filter(([cmd]) => cmd.startsWith("mv "))).toHaveLength(0);
    expect(execMock.mock.calls.filter(([cmd]) => cmd.startsWith("rm -f"))).toHaveLength(1);
  });

  it("treats an exec rejection (broken ffprobe) the same as a NaN probe", async () => {
    execMock.mockImplementation((...args) => {
      const cb = args.findLast((a) => typeof a === "function");
      const cmd = args.find((a) => typeof a === "string") ?? "";
      if (cmd.includes("ffprobe")) cb(new Error("ffprobe missing"), null);
      else cb(null, { stdout: "", stderr: "" });
    });
    expect(Number.isNaN(await trimSceneTail("/out/scene-1.mp3", 1.35))).toBe(true);
    expect(execMock.mock.calls.filter(([cmd]) => cmd.startsWith("mv "))).toHaveLength(0);
  });
});
