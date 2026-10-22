/**
 * Tests for the #704 local fallback: when the CosyVoice3-MLX main engine
 * produces takes that fail the Quality Gate acoustically or drop below the
 * pacing floor after native speed compensation, ONLY the failed scenes are
 * regenerated once on the local F5-TTS-MLX engine.
 *
 * Contract under test:
 *  - the trigger surface is exactly `TTS_ACOUSTIC_HARD_BLOCK` +
 *    `TTS_PACING_FLOOR_BLOCK` on a `cosyvoice3-mlx` main engine — pacing-hard
 *    (>225 WPM), infra blocks, other engines and `TTS_DISABLE_LOCAL_FALLBACK=1`
 *    keep the original fail-closed error;
 *  - only scenes named by the block error are regenerated, into staging;
 *  - the fallback batch is accepted only when it covers every failed scene AND
 *    every fallback take passes the gate; otherwise the original error stands
 *    and no take is promoted;
 *  - an accepted fallback take records its real engine (`f5-mlx` /
 *    `fallbackFrom: cosyvoice3-mlx`) in the cache meta, keyed with the F5
 *    engine and at ttsSpeed 1.0;
 *  - after the takes are promoted, the pacing ladder RE-RUNS over the merged
 *    set (#820): a scene that passed the gate below the compensation trigger is
 *    still compensated, the #244 hook floor still applies, and the fallback's
 *    own takes are left alone (F5 speaks at its natural pace and does not
 *    consume scene.ttsSpeed);
 *  - a take that still ships below the trigger after that re-run is reported
 *    with its reason — an f5-mlx take cannot be lifted at all.
 *
 * Quality gate, cache, post-process and the F5 engine are mocked; no model is
 * loaded, nothing touches the network or the repository.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
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
  writeSceneMeta: vi.fn(() => true),
  writeCandidateSceneMeta: vi.fn(),
  refreshApprovedSceneMeta: vi.fn(() => false),
  refreshCandidateSceneMeta: vi.fn(() => false),
  sceneCacheKey: vi.fn((engine) => `key-${engine.name}`),
  computeSceneKey: vi.fn(() => "test-key"),
  resolveSceneInstruct: vi.fn(() => ""),
}));

vi.mock("../lib/tts/f5-mlx.mjs", () => ({
  createF5MLXEngine: vi.fn(),
}));

import {
  generateTTSWithEngine,
  shouldAttemptLocalFallback,
  selectLocalFallbackTargets,
} from "../lib/tts/registry.mjs";
import { runTtsQualityGate } from "../lib/tts/quality-gate.mjs";
import { writeSceneMeta, sceneCacheKey, planTtsScenes } from "../lib/tts/cache.mjs";
import { createF5MLXEngine } from "../lib/tts/f5-mlx.mjs";
import { FAILURE_CLASS } from "../lib/tts/failure-class.mjs";

// ─── Helpers ───

/** Fresh scene objects per test — the pacing loop mutates ttsSpeed on them. */
function makeScenes() {
  return [
    { id: 1, visualType: "hook", voiceover: "First scene text goes here." },
    {
      id: 2,
      visualType: "narrative",
      voiceover: "Second scene text goes here and it is long enough for a stable WPM reading.",
    },
  ];
}

/** Only a narrative scene — used by the pacing tests. */
function makeNarrative() {
  return {
    id: 2,
    visualType: "narrative",
    voiceover: "DeepSeek announced V4.1 Flash on September tenth and the API routes changed.",
  };
}

function primaryMlxEngine() {
  return {
    name: "cosyvoice3-mlx",
    info: "CosyVoice3-MLX (test)",
    instructForScene: vi.fn(() => "mlx-instruct"),
    generate: vi.fn(async (scenes, outDir) =>
      scenes.map((s) => ({
        sceneId: s.id,
        audioPath: join(outDir, `scene-${s.id}.wav`),
        duration: 5,
      })),
    ),
  };
}

function f5Engine() {
  return {
    name: "f5-mlx",
    info: "F5-TTS-MLX (test)",
    generate: vi.fn(async (scenes, outDir) =>
      scenes.map((s) => {
        const audioPath = join(outDir, `scene-${s.id}.wav`);
        writeFileSync(audioPath, "RIFF"); // lets acceptRegenTake promote it
        return { sceneId: s.id, audioPath, duration: 6 };
      }),
    ),
  };
}

const pass = (sceneId, wpm = 160) => ({
  sceneId,
  passed: true,
  wpm,
  issues: [],
  warnings: [],
});

const failAcoustic = (sceneId, issues = ["Transcription differs from the script"]) => ({
  sceneId,
  passed: false,
  failureClass: FAILURE_CLASS.ACOUSTIC,
  wpm: 60,
  issues,
  warnings: [],
});

const failPacing = (sceneId, wpm) => ({
  sceneId,
  passed: false,
  failureClass: FAILURE_CLASS.PACING,
  wpm,
  issues: [`Pacing ${wpm} WPM below the floor`],
  warnings: [],
});

/**
 * Gate stub driven by call index: step 0 = first gate pass, step 1 = self-heal
 * / compensation round, step 2 = fallback gate. The last step repeats.
 * @param {Array<(sceneId: number) => object>} steps
 */
function stubGateSequence(steps) {
  let call = 0;
  runTtsQualityGate.mockImplementation(async (_scenes, results) => {
    const step = steps[Math.min(call++, steps.length - 1)];
    const evaluations = results.map((r) => step(r.sceneId));
    return {
      passed: evaluations.every((e) => e.passed),
      failedCount: evaluations.filter((e) => !e.passed).length,
      evaluations,
    };
  });
}

/** Run the generator and capture the thrown error (or undefined). */
async function runCapturingError(scenes, outputDir, engine, options) {
  try {
    await generateTTSWithEngine(scenes, outputDir, engine, options);
    return null;
  } catch (err) {
    return err;
  }
}

// ─── Suite ───

describe("TTS local fallback (#704)", () => {
  let dir;
  let warnSpy;
  let logSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-local-fallback-"));
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    vi.mocked(writeSceneMeta).mockReturnValue(true);
    delete process.env.TTS_DISABLE_LOCAL_FALLBACK;
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    logSpy?.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TTS_DISABLE_LOCAL_FALLBACK;
    delete process.env.TTS_SKIP_QUALITY_GATE;
    delete process.env.TTS_STRICT_QUALITY_GATE;
  });

  const warnText = () => warnSpy.mock.calls.flat().join(" ");
  const logText = () => logSpy.mock.calls.flat().join(" ");

  it("acoustic failure: ONLY the failed scene is regenerated by F5, then the ladder lifts the hook", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    stubGateSequence([(id) => (id === 2 ? failAcoustic(2) : pass(1)), (id) => pass(id)]);

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    // Main engine generated the whole batch, then the #820 re-run paid for ONE
    // more round; F5 got ONLY scene 2.
    expect(engine.generate.mock.calls[0][0].map((s) => s.id)).toEqual([1, 2]);
    expect(f5.generate).toHaveBeenCalledTimes(1);
    expect(f5.generate.mock.calls[0][0].map((s) => s.id)).toEqual([2]);
    expect(f5.generate.mock.calls[0][1]).toContain(".regen-staging-");
    // #820: the acoustic block short-circuited the ladder, so the re-run is the
    // first place the #244 hook floor can apply — scene 1 is a hook that passed
    // at 1.0x and must not ship there.
    expect(engine.generate).toHaveBeenCalledTimes(2);
    expect(engine.generate.mock.calls[1][0].map((s) => s.id)).toEqual([1]);
    expect(engine.generate.mock.calls[1][0][0].ttsSpeed).toBe(1.1);

    // The fallback take replaced the failed one, in scene order.
    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
    const scene2 = results.find((r) => r.sceneId === 2);
    expect(scene2.engine).toBe(f5);
    expect(scene2.fallbackFrom).toBe("cosyvoice3-mlx");
    expect(scene2.ttsSpeed).toBe(1.0);
    expect(scene2.audioPath).toBe(join(dir, "scene-2.wav")); // promoted out of staging

    // The fallback gate must not reuse the MLX instruct resolver (#270).
    const fallbackGateCall = runTtsQualityGate.mock.calls[1];
    expect(fallbackGateCall[0].map((s) => s.id)).toEqual([2]);
    expect(fallbackGateCall[2].instructForScene).toBeNull();
    expect(runTtsQualityGate.mock.calls[0][2].instructForScene).toBe(engine.instructForScene);

    expect(warnText()).toMatch(/Voice may differ from the rest of the video/);
  });

  it("#820: a scene that passed below the trigger is compensated after the fallback", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Scene 2 clears the gate at 140 WPM — below the 150 WPM compensation
    // trigger, so the normal path would have sped it up. The acoustic block on
    // scene 1 fires before the ladder, and #704 used to drop that plan: scene 2
    // shipped at 1.0x. The re-run must still lift it (#820).
    stubGateSequence([(id) => (id === 1 ? failAcoustic(1) : pass(2, 140)), (id) => pass(id)]);

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
    expect(results.find((r) => r.sceneId === 1).engine).toBe(f5);
    // The re-run ladder compensated scene 2 on the MAIN engine.
    expect(engine.generate).toHaveBeenCalledTimes(2);
    expect(engine.generate.mock.calls[1][0].map((s) => s.id)).toEqual([2]);
    expect(engine.generate.mock.calls[1][0][0].ttsSpeed).toBeCloseTo(165 / 140, 6);
    expect(scenes[1].ttsSpeed).toBeCloseTo(165 / 140, 6);
    // Nothing is left below the trigger, so the stranded warning stays silent.
    expect(warnText()).not.toMatch(/still ship below/);
  });

  it("#820: mixed pacing-floor block + a surviving 140 WPM scene — the survivor is compensated", async () => {
    const scenes = [
      {
        id: 1,
        visualType: "narrative",
        voiceover: "DeepSeek opened the inference stack and the API routes changed.",
      },
      makeNarrative(),
    ];
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // The issue's exact scenario: scene 1 fails pacing, its compensated take
    // still fails → TTS_PACING_FLOOR_BLOCK; scene 2 PASSED at 140 WPM and its
    // compensation was planned in the same round, but the block aborted the
    // ladder before its accepted take was recorded. F5 repairs scene 1; the
    // re-run ladder must then compensate scene 2, not ship it at 1.0x.
    stubGateSequence([
      (id) => (id === 1 ? failPacing(1, 100) : pass(2, 140)),
      (id) => (id === 1 ? failPacing(1, 110) : pass(2, 160)),
      (id) => pass(id, 160),
    ]);

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    // Round 1: initial batch, then the ladder's compensation attempt for BOTH
    // scenes (the block aborts that round). Round 2: the re-run, scene 2 only.
    expect(engine.generate.mock.calls[0][0].map((s) => s.id)).toEqual([1, 2]);
    expect(engine.generate.mock.calls[1][0].map((s) => s.id)).toEqual([1, 2]);
    expect(engine.generate).toHaveBeenCalledTimes(3);
    expect(engine.generate.mock.calls[2][0].map((s) => s.id)).toEqual([2]);

    expect(f5.generate.mock.calls[0][0].map((s) => s.id)).toEqual([1]);
    expect(results.find((r) => r.sceneId === 1).engine).toBe(f5);
    expect(scenes[1].ttsSpeed).toBeCloseTo(165 / 140, 6);
    expect(warnText()).not.toMatch(/still ship below/);
  });

  it("#820: the re-run reuses an accepted compensation instead of paying for it twice", async () => {
    const scenes = [
      {
        id: 1,
        visualType: "narrative",
        voiceover: "Scene one text that is long enough for a stable WPM reading.",
      },
      makeNarrative(),
    ];
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Round 1 compensates scene 1 and ACCEPTS that take (145 WPM — engine
    // variance keeps it under the trigger) before scene 2's compensated take
    // throws the pacing-floor block. The re-run must read scene 1 as already
    // compensated: regenerating it again would burn a GPU round for a take
    // that is already faster than the plan.
    stubGateSequence([
      (id) => (id === 1 ? pass(1, 140) : failPacing(2, 100)),
      (id) => (id === 1 ? pass(1, 145) : failPacing(2, 110)),
      (id) => pass(id, 160),
    ]);

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    // Initial batch + the round-1 compensation batch; the re-run adds none.
    expect(engine.generate).toHaveBeenCalledTimes(2);
    expect(engine.generate.mock.calls[1][0].map((s) => s.id)).toEqual([1, 2]);
    expect(f5.generate.mock.calls[0][0].map((s) => s.id)).toEqual([2]);
    expect(scenes[0].ttsSpeed).toBeCloseTo(165 / 140, 6);
    expect(results.find((r) => r.sceneId === 2).engine).toBe(f5);
    expect(logText()).toMatch(/Scene 1 take already at 1\.18x/);
    // The take still ships under 150 WPM, so the run must say so out loud
    // instead of reporting a clean re-run.
    expect(warnText()).toMatch(/scene 1 \(145 WPM, already at 1\.18x\)/);
  });

  it("#820: an f5-mlx take below the trigger still warns — F5 has no per-scene speed", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Scene 1's F5 repair passes the gate at 130 WPM. F5 speaks at its natural
    // pace and never consumes scene.ttsSpeed, so the ladder cannot lift it —
    // that must not be silent. Scene 2 is in band; the ladder has nothing to do.
    stubGateSequence([(id) => (id === 1 ? failAcoustic(1) : pass(2, 160)), (id) => pass(id, 130)]);

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(results.find((r) => r.sceneId === 1).engine).toBe(f5);
    expect(engine.generate).toHaveBeenCalledTimes(1);
    expect(warnText()).toMatch(/scene 1 \(130 WPM, f5-mlx take/);
    expect(warnText()).toMatch(/still ship below the 150 WPM compensation trigger/);
  });

  it("F5 also failing rethrows the ORIGINAL acoustic block and promotes nothing", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    stubGateSequence([
      (id) => (id === 2 ? failAcoustic(2) : pass(1)),
      (id) => failAcoustic(id, ["Still truncated"]),
    ]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err).toBeTruthy();
    expect(err.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    // The original block keeps its structured failure list.
    expect(err.failedScenes).toEqual([
      { sceneId: 2, issues: ["Transcription differs from the script"] },
    ]);
    expect(f5.generate).toHaveBeenCalledTimes(1);
    // No take was promoted: no approved F5 meta for scene 2.
    const f5Approved = writeSceneMeta.mock.calls.filter(
      ([, sceneId, meta]) => sceneId === 2 && meta.engine === "f5-mlx",
    );
    expect(f5Approved).toHaveLength(0);
  });

  it("an F5 take that passes the gate but exceeds 225 WPM is NOT promoted", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Scene 2 fails acoustically on the main engine. The F5 repair clears the
    // Quality Gate but speaks at 250 WPM — over the 225 hard ceiling that the
    // pacing ladder enforces on the main path. The fallback path skips that
    // ladder, so acceptance itself must reject the rushed take (#246/#704).
    stubGateSequence([(id) => (id === 2 ? failAcoustic(2) : pass(1)), (id) => pass(id, 250)]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    // The original acoustic block stands; the F5 take was never promoted.
    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(f5.generate).toHaveBeenCalledTimes(1);
    expect(existsSync(join(dir, "scene-2.wav"))).toBe(false);
    expect(warnText()).toMatch(/225/);
    expect(warnText()).toMatch(/hard ceiling/);
    expect(warnText()).not.toMatch(/Voice may differ from the rest of the video/);
  });

  it("a gate-PASSED take over 225 WPM vetoes the fallback — no F5 attempt", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Gate 0: scene 1 fails acoustically while scene 2 PASSES at 250 WPM. The
    // acoustic block fires BEFORE the pacing ladder, so repairing scene 1 on F5
    // would ship scene 2 at 250 WPM — the #246/#704 fail-open. The fallback must
    // refuse the whole attempt and leave the original block standing.
    stubGateSequence([(id) => (id === 1 ? failAcoustic(1) : pass(2, 250)), (id) => pass(id, 160)]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
    expect(f5.generate).not.toHaveBeenCalled();
  });

  it("F5 unavailable (factory returns null) rethrows the original error", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    stubGateSequence([(id) => (id === 2 ? failAcoustic(2) : pass(1))]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(createF5MLXEngine).toHaveBeenCalledTimes(1);
    expect(warnText()).toMatch(/f5-mlx is not available/);
  });

  it("a non-MLX main engine never attempts the fallback", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    engine.name = "cosyvoice3-kaggle-cuda";
    stubGateSequence([(id) => (id === 2 ? failAcoustic(2) : pass(1))]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  it("TTS_DISABLE_LOCAL_FALLBACK=1 skips the fallback entirely", async () => {
    process.env.TTS_DISABLE_LOCAL_FALLBACK = "1";
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    stubGateSequence([(id) => (id === 2 ? failAcoustic(2) : pass(1))]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
    expect(f5.generate).not.toHaveBeenCalled();
  });

  it("pacing-floor failure is repaired by F5 (no throw)", async () => {
    const scene = makeNarrative();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // 0: slow take → compensation planned; 1: compensated take still slow →
    // TTS_PACING_FLOOR_BLOCK; 2: F5 take passes.
    stubGateSequence([
      (id) => failPacing(id, 100),
      (id) => failPacing(id, 110),
      (id) => pass(id, 160),
    ]);

    const results = await generateTTSWithEngine([scene], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    // Compensation round ran on the main engine, then F5 got the same scene.
    expect(engine.generate.mock.calls[1][0].map((s) => s.id)).toEqual([2]);
    expect(f5.generate).toHaveBeenCalledTimes(1);
    expect(f5.generate.mock.calls[0][0].map((s) => s.id)).toEqual([2]);

    const scene2 = results.find((r) => r.sceneId === 2);
    expect(scene2.engine).toBe(f5);
    expect(scene2.fallbackFrom).toBe("cosyvoice3-mlx");
    expect(scene2.ttsSpeed).toBe(1.0);
  });

  it("mixed acoustic + pacing-floor failures: BOTH scenes are repaired by F5", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Gate 0: scene 1 acoustic, scene 2 slow (80 WPM). The acoustic block is
    // raised BEFORE the pacing loop, so repairing only scene 1 would let the
    // uncompensated slow take ship. Gate 1: both F5 takes pass.
    stubGateSequence([
      (id) => (id === 1 ? failAcoustic(1) : failPacing(2, 80)),
      (id) => pass(id, 160),
    ]);

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    // F5 must repair the UNION of both failures, not just the acoustic scene.
    expect(f5.generate).toHaveBeenCalledTimes(1);
    expect(f5.generate.mock.calls[0][0].map((s) => s.id)).toEqual([1, 2]);

    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
    for (const res of results) {
      expect(res.engine).toBe(f5);
      expect(res.fallbackFrom).toBe("cosyvoice3-mlx");
      expect(res.ttsSpeed).toBe(1.0);
    }
  });

  it("a scene repaired by the pacing loop is NOT sent to F5 (stale gate report)", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Gate 0: both scenes slow → both compensated. Gate 1 (compensation round):
    // scene 1 healed, scene 2 still slow → TTS_PACING_FLOOR_BLOCK naming scene 2
    // only. gateReport still holds gate 0, where scene 1 had failed too — the
    // fallback must trust the LATEST verdict and leave scene 1 alone.
    stubGateSequence([
      (id) => failPacing(id, 100),
      (id) => (id === 2 ? failPacing(2, 110) : pass(1, 160)),
      (id) => pass(id, 160),
    ]);

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(f5.generate).toHaveBeenCalledTimes(1);
    expect(f5.generate.mock.calls[0][0].map((s) => s.id)).toEqual([2]);

    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
    const scene1 = results.find((r) => r.sceneId === 1);
    const scene2 = results.find((r) => r.sceneId === 2);
    // Scene 1 keeps the compensation take the main engine produced (the test
    // engine writes no bytes, so acceptRegenTake leaves the staged path as is).
    expect(scene1.engine).toBeUndefined();
    expect(scene1.audioPath).toMatch(/scene-1\.wav$/);
    // Scene 2 is the F5 repair.
    expect(scene2.engine).toBe(f5);
    expect(scene2.fallbackFrom).toBe("cosyvoice3-mlx");
  });

  it("mixed acoustic + pacing-hard failures: no F5 attempt, the acoustic block stands", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5Engine());
    // Scene 2 is rushing at 300 WPM — only a script change repairs that, so
    // repairing scene 1 alone would let the rushed take ship.
    stubGateSequence([(id) => (id === 1 ? failAcoustic(1) : failPacing(2, 300))]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  it("pacing-hard (>225 WPM) is NOT repairable locally — the hard block stands", async () => {
    const scene = makeNarrative();
    const engine = primaryMlxEngine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5Engine());
    // Passing but rushed take → reroll; reroll still rushed → hard block.
    stubGateSequence([(id) => pass(id, 250), (id) => pass(id, 250)]);

    const err = await runCapturingError([scene], dir, engine, {
      useCache: false,
      runAlignment: false,
    });

    expect(err?.code).toBe("TTS_PACING_HARD_BLOCK");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  it("a short F5 batch (missing scene) is rejected — original error stands", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = {
      name: "f5-mlx",
      info: "F5-TTS-MLX (test)",
      // Returns scene 1 (not even a failed scene) and drops the failed scene 2.
      generate: vi.fn(async (_scenes, outDir) => [
        { sceneId: 1, audioPath: join(outDir, "scene-1.wav"), duration: 6 },
      ]),
    };
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    stubGateSequence([(id) => (id === 2 ? failAcoustic(2) : pass(1))]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(warnText()).toMatch(/returned 1\/1 scene/);
  });

  it("an approved cached take over 225 WPM vetoes the fallback — no F5 attempt", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    // Scene 2 is an APPROVED cache hit speaking 250 WPM (15 tokens / 3.6s).
    // Approved takes never enter the gate report; their measured WPM only lives
    // in `cachedPacing.evaluations` (#786). Committing to a repair of scene 1
    // would skip the pacing ladder that would reroll the rushed cached take.
    vi.mocked(planTtsScenes).mockReturnValueOnce({
      approved: [{ sceneId: 2, audioPath: join(dir, "scene-2.wav"), duration: 3.6, ttsSpeed: 1.0 }],
      candidates: [],
      pending: [scenes[0]],
    });
    stubGateSequence([(id) => failAcoustic(id)]);

    const err = await runCapturingError(scenes, dir, engine, {
      useCache: true,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(err?.code).toBe("TTS_ACOUSTIC_HARD_BLOCK");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
    expect(f5.generate).not.toHaveBeenCalled();
    // Only the pending scene went to the main engine.
    expect(engine.generate.mock.calls[0][0].map((s) => s.id)).toEqual([1]);
  });

  it("accepted fallback meta records engine f5-mlx + fallbackFrom, keyed by the F5 engine", async () => {
    const scenes = makeScenes();
    const engine = primaryMlxEngine();
    const f5 = f5Engine();
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);
    stubGateSequence([(id) => (id === 2 ? failAcoustic(2) : pass(1)), (id) => pass(id)]);

    await generateTTSWithEngine(scenes, dir, engine, {
      useCache: true, // cache settling is what writes the meta under test
      runAlignment: false,
      maxRetries: 0,
    });

    const metaCall = writeSceneMeta.mock.calls.find(([, sceneId]) => sceneId === 2);
    expect(metaCall).toBeTruthy();
    expect(metaCall[2]).toMatchObject({
      key: "key-f5-mlx",
      engine: "f5-mlx",
      fallbackFrom: "cosyvoice3-mlx",
      ttsSpeed: 1.0,
    });
    // The key must be composed from the take's real engine, not the main one.
    expect(sceneCacheKey).toHaveBeenCalledWith(f5, scenes[1], 1.0);
    // Scene 1 keeps the main engine's identity — and, since #820, carries the
    // 1.1x the re-run ladder's hook floor applied to its replacement take.
    expect(sceneCacheKey).toHaveBeenCalledWith(engine, scenes[0], 1.1);
    expect(writeSceneMeta).toHaveBeenCalledWith(
      dir,
      1,
      expect.objectContaining({ engine: "cosyvoice3-mlx" }),
    );
  });
});

describe("shouldAttemptLocalFallback (#704)", () => {
  const err = (overrides = {}) => ({
    failClosed: true,
    code: "TTS_ACOUSTIC_HARD_BLOCK",
    failedScenes: [{ sceneId: 2 }],
    ...overrides,
  });

  it("accepts exactly the acoustic/pacing-floor fail-closed pair on cosyvoice3-mlx", () => {
    expect(shouldAttemptLocalFallback({ engineName: "cosyvoice3-mlx", err: err(), env: {} })).toBe(
      true,
    );
    expect(
      shouldAttemptLocalFallback({
        engineName: "cosyvoice3-mlx",
        err: err({ code: "TTS_PACING_FLOOR_BLOCK" }),
        env: {},
      }),
    ).toBe(true);
  });

  it("refuses pacing-hard, infra and unmarked errors", () => {
    for (const code of ["TTS_PACING_HARD_BLOCK", "TTS_INFRA_BLOCK", "SOMETHING_ELSE"]) {
      expect(
        shouldAttemptLocalFallback({ engineName: "cosyvoice3-mlx", err: err({ code }), env: {} }),
      ).toBe(false);
    }
    expect(
      shouldAttemptLocalFallback({
        engineName: "cosyvoice3-mlx",
        err: err({ failClosed: false }),
        env: {},
      }),
    ).toBe(false);
  });

  it("refuses non-MLX engines, missing/empty failedScenes and the kill switch", () => {
    expect(
      shouldAttemptLocalFallback({ engineName: "cosyvoice3-kaggle-cuda", err: err(), env: {} }),
    ).toBe(false);
    expect(
      shouldAttemptLocalFallback({
        engineName: "cosyvoice3-mlx",
        err: err({ failedScenes: undefined }),
        env: {},
      }),
    ).toBe(false);
    expect(
      shouldAttemptLocalFallback({
        engineName: "cosyvoice3-mlx",
        err: err({ failedScenes: [] }),
        env: {},
      }),
    ).toBe(false);
    expect(
      shouldAttemptLocalFallback({
        engineName: "cosyvoice3-mlx",
        err: err(),
        env: { TTS_DISABLE_LOCAL_FALLBACK: "1" },
      }),
    ).toBe(false);
  });
});

describe("selectLocalFallbackTargets (#704)", () => {
  const report = (evaluations) => ({ passed: false, evaluations });
  const gateErr = (sceneIds) => ({ failedScenes: sceneIds.map((sceneId) => ({ sceneId })) });
  const verdicts = (entries) =>
    new Map(entries.map(([id, passed]) => [id, { evaluation: passed }]));

  it("drops scenes whose LATEST verdict passes — stale gate failures are not regenerated", () => {
    const out = selectLocalFallbackTargets({
      gateReport: report([failAcoustic(1), failAcoustic(2)]),
      gateErr: gateErr([1]),
      // Scene 2 was repaired after the report was taken. Verdicts are full
      // gate evaluations (real ones always are), not bare {passed} stubs.
      verdictByScene: verdicts([
        [1, failAcoustic(1)],
        [2, pass(2)],
      ]),
    });
    expect(out).toEqual({ ok: true, sceneIds: [1] });
  });

  it("vetoes the whole attempt when ANY take — passed or not — exceeds the hard ceiling", () => {
    // Scene 1 blocks acoustically; scene 2 cleared the gate but measures
    // 250 WPM. The acoustic block precedes the pacing ladder, so the fallback
    // is the only place that can still enforce the 225 red line.
    expect(
      selectLocalFallbackTargets({
        gateReport: report([failAcoustic(1), pass(2, 250)]),
        gateErr: gateErr([1]),
        verdictByScene: verdicts([]),
      }),
    ).toEqual({ ok: false, sceneIds: [] });
  });

  it("vetoes an extra (cached) take over the hard ceiling that never entered the report", () => {
    // Approved cache hits are measured into `cachedPacing.evaluations` (#786),
    // not into gateReport. The acoustic block precedes the pacing ladder, so an
    // unvetted 250 WPM cached take would ship if the fallback ignored it.
    expect(
      selectLocalFallbackTargets({
        gateReport: report([failAcoustic(1)]),
        gateErr: gateErr([1]),
        verdictByScene: verdicts([]),
        extraEvaluations: [pass(2, 250)],
      }),
    ).toEqual({ ok: false, sceneIds: [] });
  });

  it("a newer passing verdict outranks an extra take's stale high WPM", () => {
    // The cached scene was later replaced by an accepted 160 WPM compensation:
    // the newest verdict wins over both extraEvaluations and the report, so
    // only the still-failing scene 1 is a fallback target.
    expect(
      selectLocalFallbackTargets({
        gateReport: report([failAcoustic(1)]),
        gateErr: gateErr([1]),
        verdictByScene: verdicts([[2, pass(2, 160)]]),
        extraEvaluations: [pass(2, 250)],
      }),
    ).toEqual({ ok: true, sceneIds: [1] });
  });

  it("a stale high-WPM failure repaired to a passing take does not veto", () => {
    // The report still holds scene 2 failing at 250 WPM, but the LATEST verdict
    // is a passing 160 WPM take (accepted compensation). Only the still-failing
    // scene 1 is a fallback target.
    const out = selectLocalFallbackTargets({
      gateReport: report([failAcoustic(1), failPacing(2, 250)]),
      gateErr: gateErr([1]),
      verdictByScene: verdicts([
        [1, { passed: false, failureClass: FAILURE_CLASS.ACOUSTIC, wpm: 60 }],
        [2, { passed: true, wpm: 160 }],
      ]),
    });
    expect(out).toEqual({ ok: true, sceneIds: [1] });
  });

  it("refuses unrepairable failures: pacing > hard ceiling, infra and unclassified", () => {
    const cases = [
      failPacing(1, 300),
      { sceneId: 1, passed: false, failureClass: FAILURE_CLASS.INFRA, wpm: 160, issues: [] },
      { sceneId: 1, passed: false, wpm: 160, issues: [] }, // no failureClass
    ];
    for (const evaluation of cases) {
      expect(
        selectLocalFallbackTargets({
          gateReport: report([evaluation]),
          gateErr: gateErr([1]),
          verdictByScene: verdicts([]),
        }),
      ).toEqual({ ok: false, sceneIds: [] });
    }
    // The same pacing failure under the ceiling stays repairable.
    expect(
      selectLocalFallbackTargets({
        gateReport: report([failPacing(1, 300)]),
        gateErr: gateErr([1]),
        verdictByScene: verdicts([]),
        hardCeiling: 400,
      }),
    ).toEqual({ ok: true, sceneIds: [1] });
  });

  it("merges scenes named only by the block error (no verdict = conservative keep)", () => {
    const out = selectLocalFallbackTargets({
      gateReport: report([failPacing(1, 100)]),
      gateErr: gateErr([7]),
      verdictByScene: verdicts([]),
    });
    expect(out.ok).toBe(true);
    expect(out.sceneIds.sort()).toEqual([1, 7]);
    // Deduped when both sources name the same scene.
    expect(
      selectLocalFallbackTargets({
        gateReport: report([failAcoustic(2)]),
        gateErr: gateErr([2]),
        verdictByScene: verdicts([]),
      }).sceneIds,
    ).toEqual([2]);
  });

  it("refuses an empty report, a report with no failures, and a fully repaired report", () => {
    const empty = { ok: false, sceneIds: [] };
    expect(
      selectLocalFallbackTargets({
        gateReport: null,
        gateErr: gateErr([2]),
        verdictByScene: verdicts([]),
      }),
    ).toEqual(empty);
    expect(
      selectLocalFallbackTargets({
        gateReport: report([pass(1)]),
        gateErr: gateErr([2]),
        verdictByScene: verdicts([]),
      }),
    ).toEqual(empty);
    // Every failing scene has a passing latest verdict → nothing left to repair.
    expect(
      selectLocalFallbackTargets({
        gateReport: report([failAcoustic(2)]),
        gateErr: gateErr([2]),
        verdictByScene: verdicts([[2, { passed: true }]]),
      }),
    ).toEqual(empty);
  });
});
