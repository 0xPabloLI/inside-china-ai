/**
 * Tests for the measured-WPM pacing feedback loop in generateTTSWithEngine
 * (#252).
 *
 * Behaviour under test (issue #252 + review comment 2026-09-11):
 *  - after the Quality Gate pass, scenes are classified by MEASURED WPM:
 *      measured < 135  → regenerate that scene alone with scene.ttsSpeed =
 *                        clamp(150/measured, 1.0, 1.2) (compensation);
 *      measured > 225  → regenerate once at baseline (take drift ±10-20%,
 *                        #234); still > 225 → hard block (TTS_PACING_HARD_BLOCK)
 *                        — never warning-and-continue (#246 shipped 257 WPM);
 *      in between      → keep, no extra generation;
 *  - compensation + reroll scenes share ONE regeneration round and ONE gate
 *    evaluation; a passing take replaces the original audio (and persists its
 *    ttsSpeed in the cache meta); a failed compensation take falls back to the
 *    original audio and drops the override;
 *  - the whole loop is skipped together with the Quality Gate
 *    (fake engine / TTS_SKIP_QUALITY_GATE=1).
 *
 * Quality gate is mocked (its own behaviour is covered by
 * tts-quality-gate.test.mjs); no real engines, no real Kaggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";

vi.mock("../lib/tts/quality-gate.mjs", () => ({
  runTtsQualityGate: vi.fn(),
}));

vi.mock("../lib/tts/post-process.mjs", () => ({
  runForcedAlignment: vi.fn(),
  getAtempo: vi.fn(() => null),
}));

vi.mock("../lib/tts/cache.mjs", () => ({
  planTtsScenes: vi.fn((_dir, scenes) => ({ approved: [], candidates: [], pending: [...scenes] })),
  writeSceneMeta: vi.fn(),
  writeCandidateSceneMeta: vi.fn(),
  refreshApprovedSceneMeta: vi.fn(() => false),
  refreshCandidateSceneMeta: vi.fn(() => false),
  sceneCacheKey: vi.fn(() => "test-key"),
  computeSceneKey: vi.fn(() => "test-key"),
  resolveSceneInstruct: vi.fn((_engine, _scene) => ""),
}));

import { generateTTSWithEngine } from "../lib/tts/registry.mjs";
import { runTtsQualityGate } from "../lib/tts/quality-gate.mjs";
import { writeSceneMeta } from "../lib/tts/cache.mjs";

function fakeEngine() {
  return {
    name: "mock-kaggle-cuda",
    info: "Mock engine (test)",
    generate: vi.fn(),
  };
}

/** Fresh scene objects per test — the loop mutates ttsSpeed on them. */
const makeHook = () => ({
  id: 1,
  visualType: "hook",
  voiceover: "China just dropped a model that beats GPT.",
});
const makeNarrative = () => ({
  id: 2,
  visualType: "narrative",
  voiceover: "DeepSeek announced V4.1 Flash on September tenth and the API routes changed.",
});

/**
 * Gate stub driven by gate-call index: call 0 = first pass, call 1 = the
 * single regeneration round (compensations + rerolls batched together).
 * @param {(sceneId: number, gateCall: number) => number} wpmById
 * @param {(sceneId: number, gateCall: number) => boolean} [passById]
 */
function stubGate(wpmById, passById = () => true) {
  let gateCall = 0;
  runTtsQualityGate.mockImplementation(async (_scenes, results) => {
    const call = gateCall++;
    const evaluations = results.map((r) => {
      const passed = passById(r.sceneId, call);
      return {
        sceneId: r.sceneId,
        passed,
        wpm: wpmById(r.sceneId, call),
        issues: passed ? [] : ["Pacing too slow"],
        warnings: [],
      };
    });
    return {
      passed: evaluations.every((e) => e.passed),
      failedCount: evaluations.filter((e) => !e.passed).length,
      evaluations,
    };
  });
}

describe("pacing feedback loop (#252)", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-pacing-loop-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
  });

  function engineReturningAudio() {
    const engine = fakeEngine();
    engine.generate.mockImplementation(async (scenes) =>
      scenes.map((s) => ({
        sceneId: s.id,
        audioPath: join(dir, `scene-${s.id}.wav`),
        duration: 5,
      })),
    );
    return engine;
  }

  it("in-band narrative generates exactly once — no compensation, no reroll", async () => {
    const engine = engineReturningAudio();
    stubGate(() => 160);

    await generateTTSWithEngine([makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(engine.generate).toHaveBeenCalledTimes(1);
    expect(runTtsQualityGate).toHaveBeenCalledTimes(1);
  });

  it("floors an in-band hook at ttsSpeed 1.1 (#244) — single-scene regeneration, no re-plan loop", async () => {
    const engine = engineReturningAudio();
    // First pass: hook 165 (in band), narrative 160 (in band). The floor
    // compensates the hook; the floored take re-measures 165 and is accepted
    // as-is (the loop never re-plans a compensated take, so no infinite floor).
    stubGate((id, call) => (id === 1 ? (call === 0 ? 165 : 165) : 160));

    await generateTTSWithEngine([makeHook(), makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(engine.generate).toHaveBeenCalledTimes(2);
    // The retry call carries ONLY the hook, mutated with the floor override.
    const retryScenes = engine.generate.mock.calls[1][0];
    expect(retryScenes.map((s) => s.id)).toEqual([1]);
    expect(retryScenes[0].ttsSpeed).toBe(1.1);
  });

  it("compensates a slow hook (116 WPM) with a single-scene regeneration at ttsSpeed 1.2", async () => {
    const engine = engineReturningAudio();
    // First pass: hook 116 (slow), narrative 160 (fine). Compensation take: 165.
    stubGate((id, call) => (id === 1 ? (call === 0 ? 116 : 165) : 160));

    await generateTTSWithEngine([makeHook(), makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(engine.generate).toHaveBeenCalledTimes(2);
    // The retry call carries ONLY the slow scene, mutated with the override.
    const retryScenes = engine.generate.mock.calls[1][0];
    expect(retryScenes.map((s) => s.id)).toEqual([1]);
    expect(retryScenes[0].ttsSpeed).toBe(1.2); // 165/116 = 1.42 → clamp
  });

  it("keeps a proportional compensation speed (140 WPM → ≈1.179)", async () => {
    const engine = engineReturningAudio();
    stubGate((id, call) => (call === 0 ? 140 : 168));

    await generateTTSWithEngine([makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    const retryScene = engine.generate.mock.calls[1][0][0];
    expect(retryScene.ttsSpeed).toBeCloseTo(165 / 140, 5);
  });

  it("falls back to the original audio and drops the override when the compensation take fails the gate", async () => {
    const engine = engineReturningAudio();
    // Call-1 take fails the gate (e.g. truncation on the new take).
    stubGate(
      (id, call) => (call === 0 ? 116 : 142),
      (id, call) => call === 0,
    );

    const results = await generateTTSWithEngine([makeHook()], dir, engine, {
      useCache: true,
      runAlignment: false,
    });

    // Original audio kept, override dropped → meta must record the 1.0 speed.
    expect(results.map((r) => r.sceneId)).toEqual([1]);
    const metaCall = writeSceneMeta.mock.calls.find(([, id]) => id === 1);
    expect(metaCall).toBeTruthy();
    expect(metaCall[2].ttsSpeed).toBe(1.0);
  });

  it("rerolls a >225 scene once and accepts the healed take", async () => {
    const engine = engineReturningAudio();
    // First pass 257 WPM (the #246 Scene-5 number); reroll take lands at 195.
    stubGate((id, call) => (call === 0 ? 257 : 195));

    const results = await generateTTSWithEngine([makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(engine.generate).toHaveBeenCalledTimes(2);
    const rerollScenes = engine.generate.mock.calls[1][0];
    expect(rerollScenes.map((s) => s.id)).toEqual([2]);
    expect(rerollScenes[0].ttsSpeed).toBeUndefined(); // baseline take, no speed knob
    expect(results.map((r) => r.sceneId)).toEqual([2]);
  });

  it("HARD-BLOCKS (non-strict default) when the reroll take still measures >225", async () => {
    const engine = engineReturningAudio();
    // Both takes > 225 → must throw even without strict mode (#246 regression).
    stubGate(() => 250);

    await expect(
      generateTTSWithEngine([makeNarrative()], dir, engine, {
        useCache: false,
        runAlignment: false,
      }),
    ).rejects.toThrow(/TTS_PACING_HARD_BLOCK/);
    expect(engine.generate).toHaveBeenCalledTimes(2); // baseline + one reroll
  });

  it("hard block carries the measured WPM and write-side guidance in the message", async () => {
    const engine = engineReturningAudio();
    stubGate(() => 257);

    await expect(
      generateTTSWithEngine([makeNarrative()], dir, engine, {
        useCache: false,
        runAlignment: false,
      }),
    ).rejects.toThrow(/257/);
  });

  it("skips the whole loop when the Quality Gate is skipped (TTS_SKIP_QUALITY_GATE=1)", async () => {
    process.env.TTS_SKIP_QUALITY_GATE = "1";
    const engine = engineReturningAudio();

    await generateTTSWithEngine([makeHook()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(runTtsQualityGate).not.toHaveBeenCalled();
    expect(engine.generate).toHaveBeenCalledTimes(1);
  });

  it("persists the compensation ttsSpeed in the cache meta of the accepted take", async () => {
    const engine = engineReturningAudio();
    stubGate((id, call) => (call === 0 ? 116 : 142));

    await generateTTSWithEngine([makeHook()], dir, engine, { useCache: true, runAlignment: false });

    const metaCall = writeSceneMeta.mock.calls.find(([, id]) => id === 1);
    expect(metaCall).toBeTruthy();
    expect(metaCall[2].ttsSpeed).toBe(1.2);
  });
});

/**
 * #925 — a compensation round that produces NO take is an infrastructure
 * failure, not a decision that compensation is unnecessary.
 *
 * Before this ticket the `catch` around `engine.generate` only warned, then the
 * "no new takes" branch dropped the `ttsSpeed` override and shipped the old
 * 1.0x take whenever the source take had passed the gate. A Kaggle timeout
 * therefore published a 1.0x hook (unitree-h2x-guardian, 2026-10-24) with no
 * warning anywhere in the log. The ticket's verdict: generation failures fail
 * closed — including the partial-batch hole, where a missing scene never
 * entered the result loop at all.
 */
describe("#925 compensation generation failure is fail-closed", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-925-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
  });

  function engineReturningAudio() {
    const engine = fakeEngine();
    engine.generate.mockImplementation(async (scenes) =>
      scenes.map((s) => ({
        sceneId: s.id,
        audioPath: join(dir, `scene-${s.id}.wav`),
        duration: 5,
      })),
    );
    return engine;
  }

  /** First (baseline) round succeeds; every regeneration round throws. */
  function engineWithFailingRegen(error = "Kaggle kernel timed out after 30m5s") {
    const engine = fakeEngine();
    let calls = 0;
    engine.generate.mockImplementation(async (scenes) => {
      calls += 1;
      if (calls > 1) throw new Error(error);
      return scenes.map((s) => ({
        sceneId: s.id,
        audioPath: join(dir, `scene-${s.id}.wav`),
        duration: 5,
      }));
    });
    return engine;
  }

  it("RED: an in-band hook (179 WPM, 1.1x floor) blocks instead of shipping 1.0x", async () => {
    const engine = engineWithFailingRegen();
    stubGate(() => 179);

    const promise = generateTTSWithEngine([makeHook()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    await expect(promise).rejects.toMatchObject({ code: "TTS_PACING_COMPENSATION_BLOCK" });
    await expect(promise).rejects.toThrow(/scene 1/);
    expect(engine.generate).toHaveBeenCalledTimes(2);
  });

  it("RED: a 140 WPM narrative (below the trigger) blocks instead of shipping the slow take", async () => {
    const engine = engineWithFailingRegen();
    stubGate(() => 140);

    const promise = generateTTSWithEngine([makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    await expect(promise).rejects.toMatchObject({ code: "TTS_PACING_COMPENSATION_BLOCK" });
    await expect(promise).rejects.toThrow(/scene 2/);
  });

  it("drops the planned override before blocking (meta stays keyed to the shipped 1.0x take)", async () => {
    const engine = engineWithFailingRegen();
    stubGate(() => 179);
    const hook = makeHook();

    await expect(
      generateTTSWithEngine([hook], dir, engine, { useCache: true, runAlignment: false }),
    ).rejects.toMatchObject({ code: "TTS_PACING_COMPENSATION_BLOCK" });

    expect(hook.ttsSpeed).toBeUndefined();
    const metaCall = writeSceneMeta.mock.calls.find(([, id]) => id === 1);
    expect(metaCall).toBeTruthy();
    expect(metaCall[2].ttsSpeed).toBe(1.0);
  });

  it("keeps the >225 reroll hard block for a reroll that produced no take", async () => {
    const engine = engineWithFailingRegen();
    stubGate(() => 257);

    await expect(
      generateTTSWithEngine([makeNarrative()], dir, engine, {
        useCache: false,
        runAlignment: false,
      }),
    ).rejects.toMatchObject({ code: "TTS_PACING_HARD_BLOCK" });
  });

  it("RED: a partial batch that drops a planned compensation blocks (missing scene never entered the loop)", async () => {
    const engine = fakeEngine();
    let calls = 0;
    engine.generate.mockImplementation(async (scenes) => {
      calls += 1;
      // Round 2 returns only the hook; the narrative's take is missing.
      const returned = calls === 1 ? scenes : scenes.filter((s) => s.id === 1);
      return returned.map((s) => ({
        sceneId: s.id,
        audioPath: join(dir, `scene-${s.id}.wav`),
        duration: 5,
      }));
    });
    // First pass: hook 165 (floor 1.1), narrative 140 (compensate).
    stubGate((id, call) => (call === 0 ? (id === 1 ? 165 : 140) : 160));

    const promise = generateTTSWithEngine([makeHook(), makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    await expect(promise).rejects.toMatchObject({ code: "TTS_PACING_COMPENSATION_BLOCK" });
    await expect(promise).rejects.toThrow(/scene 2/);
    await expect(promise).rejects.not.toThrow(/scene 1/);
  });

  it("a missing compensation of a gate-REJECTED take stays TTS_PACING_FLOOR_BLOCK (F5 may repair it)", async () => {
    const engine = fakeEngine();
    let calls = 0;
    engine.generate.mockImplementation(async (scenes) => {
      calls += 1;
      const returned = calls === 1 ? scenes : scenes.filter((s) => s.id === 2);
      return returned.map((s) => ({
        sceneId: s.id,
        audioPath: join(dir, `scene-${s.id}.wav`),
        duration: 5,
      }));
    });
    // Gate 0: scene 1 failed pacing (100 WPM), scene 2 passed at 140.
    stubGate(
      (id, call) => (id === 1 ? (call === 0 ? 100 : 160) : 140),
      (id, call) => !(id === 1 && call === 0),
    );
    // The failing verdict needs its pacing class for the compensation plan.
    const base = runTtsQualityGate.getMockImplementation();
    runTtsQualityGate.mockImplementation(async (scenes, results, opts) => {
      const report = await base(scenes, results, opts);
      for (const e of report.evaluations) {
        if (!e.passed) e.failureClass = "pacing";
      }
      return report;
    });

    await expect(
      generateTTSWithEngine([makeNarrative(), makeHook()], dir, engine, {
        useCache: false,
        runAlignment: false,
      }),
    ).rejects.toMatchObject({ code: "TTS_PACING_FLOOR_BLOCK" });
  });

  it("#925×#820: the normal path warns when an in-band hook still ships below its 1.1x floor", async () => {
    const engine = engineReturningAudio();
    // 165 WPM hook: in band, but the #244 floor plans 1.1x. The compensation
    // take is rejected, so the original 1.0x audio ships — previously silent.
    stubGate(
      (id, call) => (call === 0 ? 165 : 142),
      (id, call) => call === 0,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateTTSWithEngine([makeHook()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    const text = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(text).toMatch(/still ship below/);
    expect(text).toMatch(/scene 1/);
    warn.mockRestore();
  });

  /** Gate: first pass in-band, the compensation take fails acoustically. */
  function stubAcousticCompensationFailure() {
    let gateCall = 0;
    runTtsQualityGate.mockImplementation(async (_scenes, results) => {
      const call = gateCall++;
      const evaluations = results.map((r) => ({
        sceneId: r.sceneId,
        passed: call === 0,
        wpm: call === 0 ? 165 : 142,
        issues: call === 0 ? [] : ["Audio file missing or zero bytes"],
        failureClass: call === 0 ? null : "acoustic",
        warnings: [],
      }));
      return {
        passed: evaluations.every((e) => e.passed),
        failedCount: evaluations.filter((e) => !e.passed).length,
        evaluations,
      };
    });
  }

  it("RED (#925): a returned take with no audio bytes blocks — it was never produced", async () => {
    const engine = engineReturningAudio(); // returns paths, writes no bytes
    stubAcousticCompensationFailure();
    const hook = makeHook();

    const promise = generateTTSWithEngine([hook], dir, engine, {
      useCache: true,
      runAlignment: false,
    });

    await expect(promise).rejects.toMatchObject({ code: "TTS_PACING_COMPENSATION_BLOCK" });
    expect(hook.ttsSpeed).toBeUndefined();
  });

  it("a gate-rejected compensation WITH audio bytes still falls back to the original take (#252)", async () => {
    const engine = fakeEngine();
    engine.generate.mockImplementation(async (scenes) => {
      const batch = scenes.map((s) => ({
        sceneId: s.id,
        audioPath: join(dir, `scene-${s.id}.wav`),
        duration: 5,
      }));
      for (const res of batch) writeFileSync(res.audioPath, "audio-bytes");
      return batch;
    });
    stubAcousticCompensationFailure();

    const results = await generateTTSWithEngine([makeHook()], dir, engine, {
      useCache: true,
      runAlignment: false,
    });

    expect(results.map((r) => r.sceneId)).toEqual([1]);
    const metaCall = writeSceneMeta.mock.calls.find(([, id]) => id === 1);
    expect(metaCall[2].ttsSpeed).toBe(1.0);
  });
});
