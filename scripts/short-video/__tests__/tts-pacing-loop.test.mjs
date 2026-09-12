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
const makeHook = () => ({ id: 1, visualType: "hook", voiceover: "China just dropped a model that beats GPT." });
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
      scenes.map((s) => ({ sceneId: s.id, audioPath: join(dir, `scene-${s.id}.wav`), duration: 5 })),
    );
    return engine;
  }

  it("in-range scenes generate exactly once — no compensation, no reroll", async () => {
    const engine = engineReturningAudio();
    stubGate((id) => (id === 1 ? 150 : 145));

    await generateTTSWithEngine([makeHook(), makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(engine.generate).toHaveBeenCalledTimes(1);
    expect(engine.generate.mock.calls[0][0].map((s) => s.id)).toEqual([1, 2]);
    expect(runTtsQualityGate).toHaveBeenCalledTimes(1);
  });

  it("compensates a slow hook (116 WPM) with a single-scene regeneration at ttsSpeed 1.2", async () => {
    const engine = engineReturningAudio();
    // First pass: hook 116 (slow), narrative 150 (fine). Compensation take: 142.
    stubGate((id, call) => (id === 1 ? (call === 0 ? 116 : 142) : 150));

    await generateTTSWithEngine([makeHook(), makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(engine.generate).toHaveBeenCalledTimes(2);
    // The retry call carries ONLY the slow scene, mutated with the override.
    const retryScenes = engine.generate.mock.calls[1][0];
    expect(retryScenes.map((s) => s.id)).toEqual([1]);
    expect(retryScenes[0].ttsSpeed).toBe(1.2); // 150/116 = 1.29 → clamp
  });

  it("keeps a proportional compensation speed (134 WPM → ≈1.119)", async () => {
    const engine = engineReturningAudio();
    stubGate((id, call) => (call === 0 ? 134 : 149));

    await generateTTSWithEngine([makeNarrative()], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    const retryScene = engine.generate.mock.calls[1][0][0];
    expect(retryScene.ttsSpeed).toBeCloseTo(150 / 134, 5);
  });

  it("falls back to the original audio and drops the override when the compensation take fails the gate", async () => {
    const engine = engineReturningAudio();
    // Call-1 take fails the gate (e.g. truncation on the new take).
    stubGate((id, call) => (call === 0 ? 116 : 142), (id, call) => call === 0);

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
      generateTTSWithEngine([makeNarrative()], dir, engine, { useCache: false, runAlignment: false }),
    ).rejects.toThrow(/TTS_PACING_HARD_BLOCK/);
    expect(engine.generate).toHaveBeenCalledTimes(2); // baseline + one reroll
  });

  it("hard block carries the measured WPM and write-side guidance in the message", async () => {
    const engine = engineReturningAudio();
    stubGate(() => 257);

    await expect(
      generateTTSWithEngine([makeNarrative()], dir, engine, { useCache: false, runAlignment: false }),
    ).rejects.toThrow(/257/);
  });

  it("skips the whole loop when the Quality Gate is skipped (TTS_SKIP_QUALITY_GATE=1)", async () => {
    process.env.TTS_SKIP_QUALITY_GATE = "1";
    const engine = engineReturningAudio();

    await generateTTSWithEngine([makeHook()], dir, engine, { useCache: false, runAlignment: false });

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
