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
  runAlignmentGuards,
  tailCutDecision,
  trimSceneTail,
  TAIL_PAD_SEC,
  TAIL_MIN_EXCESS_SEC,
  MIN_SEC_PER_SYLLABLE,
} from "../lib/tts/alignment-guards.mjs";

// promisify(exec) resolves via node's custom promisify — the mock may receive
// (cmd, cb) or (cmd, options, cb); derive the callback and command by shape.
// The duration probe goes through execFile since the #319 deferred class sweep.
const { execMock, execFileMock, existsSyncMock } = vi.hoisted(() => ({
  execMock: vi.fn((...args) => {
    const cb = args.findLast((a) => typeof a === "function");
    cb(null, { stdout: "", stderr: "" });
  }),
  execFileMock: vi.fn((cmd, args, cb) => cb(null, { stdout: "", stderr: "" })),
  existsSyncMock: vi.fn(() => true),
}));
vi.mock("child_process", () => ({ exec: execMock, execSync: vi.fn(), execFile: execFileMock }));
vi.mock("fs", async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: existsSyncMock,
}));

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

describe("tailCutDecision (#629)", () => {
  // #629: scene 8's alignment under-reported where the speech ended, and the
  // trim derived from it cut "2027" down to "2000" in the published take.
  // The scene had already logged 4 crushed words before the cut ran.
  const scene8 = { durationSec: 5.06, lastWordEnd: 3.83 };

  it("skips the cut when the alignment is suspect (crushed words)", () => {
    expect(tailCutDecision({ ...scene8, crushedCount: 4 })).toEqual({
      cut: false,
      reason: "alignment-suspect",
    });
  });

  it("cuts when the alignment is clean and a phantom tail exceeds the budget", () => {
    expect(tailCutDecision({ ...scene8, crushedCount: 0 })).toEqual({
      cut: true,
      cutPoint: 3.83 + TAIL_PAD_SEC,
    });
  });

  it("reports no-excess rather than alignment-suspect when nothing is wrong", () => {
    expect(tailCutDecision({ durationSec: 4.0, lastWordEnd: 3.83, crushedCount: 0 })).toEqual({
      cut: false,
      reason: "no-excess",
    });
  });

  it("treats a suspect alignment as decisive: it wins over a large phantom tail", () => {
    // The whole point — a big excess is what tempts the cut, and it is also
    // what the untrusted lastWordEnd would cut wrongly into.
    const decision = tailCutDecision({ durationSec: 6.1, lastWordEnd: 3.29, crushedCount: 1 });
    expect(decision.cut).toBe(false);
    expect(decision.reason).toBe("alignment-suspect");
  });
});

describe("runAlignmentGuards — the cut is gated on alignment trust (#629)", () => {
  // Faithful to the shipped scene 8: two crushed words and a lastWordEnd that
  // under-reported where the speech actually ended.
  const suspectWords = [
    { text: "is", start: 1.0, end: 1.1 }, // 0.10s < 0.12s floor → crushed
    { text: "early", start: 3.61, end: 3.83 }, // 0.22s < 0.24s floor → crushed
  ];
  const cleanWords = [{ text: "hundred", start: 3.0, end: 3.29 }]; // 0.29s ≥ 0.24s

  const scenes = (sceneId, words) => ({ scenes: [{ sceneId, segments: [{ words }] }] });

  beforeEach(() => {
    execMock.mockClear();
    execFileMock.mockClear();
    existsSyncMock.mockClear();
    existsSyncMock.mockReturnValue(true);
    // ffprobe answers with the cut point, so a trim reports a real duration.
    execFileMock.mockImplementation((cmd, args, cb) =>
      cb(null, { stdout: "3.440000\n", stderr: "" }),
    );
  });

  it("skips the cut, leaves the audio alone, and reports why when alignment is suspect", async () => {
    const ttsResults = [{ sceneId: 8, audioPath: "/out/scene-8.mp3", duration: 5.06 }];
    const result = await runAlignmentGuards(ttsResults, scenes(8, suspectWords));

    expect(result.cuts).toEqual([]);
    expect(result.skippedCuts).toEqual([{ sceneId: 8, reason: "alignment-suspect" }]);
    expect(result.crushedWords).toHaveLength(2);
    // The audio is untouched and the duration downstream still sees is the
    // gate-approved one — not a silently shortened take.
    expect(execMock.mock.calls.filter(([cmd]) => String(cmd).startsWith("mv "))).toHaveLength(0);
    expect(ttsResults[0].duration).toBe(5.06);
  });

  it("still cuts a clean-alignment phantom tail (#232 behaviour preserved)", async () => {
    const ttsResults = [{ sceneId: 7, audioPath: "/out/scene-7.mp3", duration: 6.1 }];
    const result = await runAlignmentGuards(ttsResults, scenes(7, cleanWords));

    expect(result.skippedCuts).toEqual([]);
    expect(result.cuts).toHaveLength(1);
    expect(result.cuts[0]).toMatchObject({ sceneId: 7, from: 6.1, to: 3.44 });
    expect(ttsResults[0].duration).toBe(3.44);
    expect(execMock.mock.calls.filter(([cmd]) => String(cmd).startsWith("mv "))).toHaveLength(1);
  });

  it("gates per scene: a suspect scene does not block a clean scene's cut", async () => {
    const ttsResults = [
      { sceneId: 8, audioPath: "/out/scene-8.mp3", duration: 5.06 },
      { sceneId: 7, audioPath: "/out/scene-7.mp3", duration: 6.1 },
    ];
    const timingData = {
      scenes: [
        { sceneId: 8, segments: [{ words: suspectWords }] },
        { sceneId: 7, segments: [{ words: cleanWords }] },
      ],
    };
    const result = await runAlignmentGuards(ttsResults, timingData);

    expect(result.cuts.map((c) => c.sceneId)).toEqual([7]);
    expect(result.skippedCuts).toEqual([{ sceneId: 8, reason: "alignment-suspect" }]);
  });
});

describe("trimSceneTail", () => {
  // Braces matter: a hook that RETURNS a function (mockClear is chainable)
  // is treated by vitest as a teardown fn and invoked with no args.
  beforeEach(() => {
    execMock.mockClear();
    execFileMock.mockClear();
    // mockClear keeps implementations, so re-arm the probe default per test:
    // ffprobe answers nothing → NaN duration → no mv.
    execFileMock.mockImplementation((cmd, args, cb) => cb(null, { stdout: "", stderr: "" }));
  });

  it("moves the trimmed tmp over the original when the probe succeeds", async () => {
    execFileMock.mockImplementationOnce((cmd, args, cb) =>
      cb(null, { stdout: "1.350000\n", stderr: "" }),
    );
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

  it("treats a probe rejection (broken ffprobe) the same as a NaN probe", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => cb(new Error("ffprobe missing"), null));
    expect(Number.isNaN(await trimSceneTail("/out/scene-1.mp3", 1.35))).toBe(true);
    expect(execMock.mock.calls.filter(([cmd]) => cmd.startsWith("mv "))).toHaveLength(0);
  });
});
