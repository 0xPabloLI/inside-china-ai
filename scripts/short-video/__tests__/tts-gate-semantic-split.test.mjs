/**
 * Tests for the #271 semantic split of Quality-Gate failures.
 *
 * Behaviour under test (issue #271 + triage verdict 2026-09-14, direction 3):
 *  - gate failures are split by family: "pacing" (take is phonetically clean,
 *    measured WPM out of band) vs "acoustic" (words cannot be trusted —
 *    truncation / missing tokens / low similarity / missing audio);
 *  - PACING failures are routed to the #252 compensation loop with a
 *    `scene.ttsSpeed` override — the acoustic reroll loop must NOT burn its
 *    budget regenerating them at the same speed;
 *  - a pacing failure whose compensated take still fails is FAIL-CLOSED
 *    (TTS_PACING_FLOOR_BLOCK): the original take had already been rejected, so
 *    there is nothing shippable left and 1.2x is the spectral-flux ceiling;
 *  - the #252 fallback ("keep the original take") still applies when the source
 *    take had PASSED the gate — that take is shippable by definition;
 *  - ACOUSTIC failures are rerolled up to the retry budget and then FAIL-CLOSED
 *    (TTS_ACOUSTIC_HARD_BLOCK) even in non-strict mode: the old
 *    warn-and-continue path is exactly how a garbled take reached rendering.
 *
 * Quality gate is mocked (its own behaviour is covered by
 * tts-quality-gate.test.mjs); no real engines, no real Kaggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

vi.mock("../lib/tts/quality-gate.mjs", () => ({
  runTtsQualityGate: vi.fn(),
}));

vi.mock("../lib/tts/post-process.mjs", () => ({
  runForcedAlignment: vi.fn(),
  getAtempo: vi.fn(() => null),
}));

vi.mock("../lib/tts/cache.mjs", () => ({
  planTtsScenes: vi.fn((_dir, scenes) => ({ cached: [], pending: [...scenes] })),
  writeSceneMeta: vi.fn(),
  computeSceneKey: vi.fn(() => "test-key"),
  resolveSceneInstruct: vi.fn(() => ""),
}));

import { generateTTSWithEngine } from "../lib/tts/registry.mjs";
import { runTtsQualityGate } from "../lib/tts/quality-gate.mjs";

const PACING_ISSUE = "Pacing too slow: 100 WPM (minimum acceptable: 115 WPM)";
const ACOUSTIC_ISSUE = "Low text similarity: 12.0% (threshold: 75%)";

/** A phonetically clean but slow take — the #271 pacing family. */
const makeSlowScene = () => ({
  id: 1,
  visualType: "hook",
  voiceover: "China just dropped a model that beats GPT.",
});

/**
 * Narrative scenes isolate the acoustic path: a hook would additionally trip
 * the #244 hook speed floor, which is a second, unrelated regeneration round.
 */
const makeNarrativeScene = () => ({
  id: 1,
  visualType: "narrative",
  voiceover: "DeepSeek announced V4.1 Flash on September tenth.",
});

function fakeEngine(dir) {
  return {
    name: "mock-kaggle-cuda",
    info: "Mock engine (test)",
    generate: vi.fn(async (scenes) =>
      scenes.map((s) => ({
        sceneId: s.id,
        audioPath: join(dir, `scene-${s.id}.wav`),
        duration: 5,
      })),
    ),
  };
}

/**
 * Gate stub driven by gate-call index.
 * @param {(call: number) => {passed: boolean, failureClass?: string|null, wpm: number, issues?: string[]}} plan
 */
function stubGate(plan) {
  let gateCall = 0;
  runTtsQualityGate.mockImplementation(async (_scenes, results) => {
    const call = gateCall++;
    const spec = plan(call);
    const evaluations = results.map((r) => ({
      sceneId: r.sceneId,
      passed: spec.passed,
      failureClass: spec.passed ? null : (spec.failureClass ?? null),
      wpm: spec.wpm,
      issues: spec.passed ? [] : (spec.issues ?? []),
      warnings: [],
    }));
    return {
      passed: evaluations.every((e) => e.passed),
      failedCount: evaluations.filter((e) => !e.passed).length,
      evaluations,
    };
  });
}

describe("#270 the registry hands the gate the engine's instruct resolver", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-gate-split-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
    delete process.env.TTS_RETRY_COUNT;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes engine.instructForScene through so the gate can re-validate the resolved text", async () => {
    const resolve = (scene) => `standard instruct for ${scene.visualType}`;
    const engine = { ...fakeEngine(dir), instructForScene: resolve };
    stubGate(() => ({ passed: true, wpm: 150 }));

    await generateTTSWithEngine([makeNarrativeScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(runTtsQualityGate).toHaveBeenCalled();
    for (const call of runTtsQualityGate.mock.calls) {
      expect(call[2]?.instructForScene).toBe(resolve);
    }
  });

  it("passes null when the engine has no instruct concept (f5/edge/say)", async () => {
    const engine = fakeEngine(dir);
    stubGate(() => ({ passed: true, wpm: 150 }));

    await generateTTSWithEngine([makeNarrativeScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(runTtsQualityGate.mock.calls[0][2]?.instructForScene).toBeNull();
  });
});

describe("#271 pacing family → compensation loop, fail-closed on residual", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-gate-split-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
    delete process.env.TTS_RETRY_COUNT;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: a gate-FAILED slow take is compensated instead of shipped, and skips the acoustic reroll", async () => {
    const engine = fakeEngine(dir);
    // call 0 = initial gate (fail, pacing); call 1 = compensated take (healed).
    stubGate((call) =>
      call === 0
        ? { passed: false, failureClass: "pacing", wpm: 100, issues: [PACING_ISSUE] }
        : { passed: true, wpm: 128 },
    );

    const results = await generateTTSWithEngine([makeSlowScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    // Exactly TWO generation rounds: the initial batch + ONE compensation pass.
    // A third call would mean the acoustic reroll loop wasted a take on a
    // scene that speed compensation is responsible for.
    expect(engine.generate).toHaveBeenCalledTimes(2);
    const compensationScenes = engine.generate.mock.calls[1][0];
    expect(compensationScenes.map((s) => s.id)).toEqual([1]);
    expect(compensationScenes[0].ttsSpeed).toBe(1.2); // 150/100 → clamp at ceiling
    expect(results.map((r) => r.sceneId)).toEqual([1]);
  });

  it("RED: fail-closed (TTS_PACING_FLOOR_BLOCK) when compensation cannot reach the floor", async () => {
    const engine = fakeEngine(dir);
    // Both takes are far below the floor: 1.2x cannot rescue them, and the
    // original take had already been rejected by the gate.
    stubGate((call) => ({
      passed: false,
      failureClass: "pacing",
      wpm: call === 0 ? 60 : 72,
      issues: [PACING_ISSUE],
    }));

    const promise = generateTTSWithEngine([makeSlowScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    await expect(promise).rejects.toMatchObject({ code: "TTS_PACING_FLOOR_BLOCK" });
    await expect(promise).rejects.toThrow(/TTS_PACING_FLOOR_BLOCK/);
    expect(engine.generate).toHaveBeenCalledTimes(2); // initial + one compensation
  });

  it("keeps the #252 fallback for a compensation of a gate-PASSED take (shippable source)", async () => {
    const engine = fakeEngine(dir);
    // call 0 passes at 116 WPM (in-band but below the 135 compensation trigger),
    // call 1 = the compensated take which fails the gate.
    stubGate((call) =>
      call === 0
        ? { passed: true, wpm: 116 }
        : { passed: false, failureClass: "pacing", wpm: 140, issues: [PACING_ISSUE] },
    );

    const results = await generateTTSWithEngine([makeSlowScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    // No hard block: the source take passed the gate, so falling back to it is
    // sound. The override is dropped so the cache meta matches the audio.
    expect(results.map((r) => r.sceneId)).toEqual([1]);
    expect(engine.generate).toHaveBeenCalledTimes(2);
  });

  it("reports the ACOUSTIC family when the compensated take comes back truncated", async () => {
    const engine = fakeEngine(dir);
    // The original take was pacing-failed; the 1.2x take fails acoustically.
    // Blocking is still required (neither take is shippable), but the code must
    // name the family that actually failed — "trim the script" is the wrong
    // remedy for a truncated take.
    stubGate((call) =>
      call === 0
        ? { passed: false, failureClass: "pacing", wpm: 100, issues: [PACING_ISSUE] }
        : { passed: false, failureClass: "acoustic", wpm: 128, issues: [ACOUSTIC_ISSUE] },
    );

    const promise = generateTTSWithEngine([makeSlowScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    await expect(promise).rejects.toMatchObject({ code: "TTS_ACOUSTIC_HARD_BLOCK" });
    await expect(promise).rejects.toThrow(/TTS_ACOUSTIC_HARD_BLOCK/);
  });
});

describe("#271 acoustic family → reroll budget, then fail-closed", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-gate-split-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
    delete process.env.TTS_RETRY_COUNT;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: an unhealable acoustic failure blocks the run even in non-strict mode", async () => {
    const engine = fakeEngine(dir);
    stubGate(() => ({
      passed: false,
      failureClass: "acoustic",
      wpm: 150,
      issues: [ACOUSTIC_ISSUE],
    }));

    const promise = generateTTSWithEngine([makeNarrativeScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    await expect(promise).rejects.toMatchObject({ code: "TTS_ACOUSTIC_HARD_BLOCK" });
    // Initial take + the default 2 rerolls, and never a speed compensation.
    expect(engine.generate).toHaveBeenCalledTimes(3);
    for (const call of engine.generate.mock.calls) {
      expect(call[0][0].ttsSpeed).toBeUndefined();
    }
  });

  it("heals an acoustic failure within the reroll budget without a hard block", async () => {
    const engine = fakeEngine(dir);
    stubGate((call) =>
      call === 0
        ? { passed: false, failureClass: "acoustic", wpm: 150, issues: [ACOUSTIC_ISSUE] }
        : { passed: true, wpm: 150 },
    );

    const results = await generateTTSWithEngine([makeNarrativeScene()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(engine.generate).toHaveBeenCalledTimes(2);
    expect(engine.generate.mock.calls[1][0][0].ttsSpeed).toBeUndefined();
    expect(results.map((r) => r.sceneId)).toEqual([1]);
  });
});
