/**
 * Tests for the self-heal retry granularity and missing-audio fail-closed
 * guard (#241).
 *
 * Behaviour under test (issue #241 + review comment 2026-09-11):
 *  - when only some scenes fail the Quality Gate, the retry generation call
 *    receives ONLY the failed scenes (single-scene manifest, not a full
 *    re-push of the batch);
 *  - a scene that ends up with NO audio after generation + retries must fail
 *    the run — the old non-strict behaviour silently dropped the scene and
 *    rendered a video with a missing voiceover segment (ant-lingbot-world-13b
 *    run: kernel timeout → non-strict skip). TTS_ALLOW_PARTIAL_TTS=1 restores
 *    the old partial-run behaviour explicitly;
 *  - an engine-level generation error (kernel failed / timed out) propagates
 *    — fail-closed, never swallowed into a partial result set.
 *
 * Quality gate is mocked (its own behaviour is covered by
 * tts-quality-gate.test.mjs); no real engines, no real Kaggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/tts/quality-gate.mjs", () => ({
  runTtsQualityGate: vi.fn(),
}));

vi.mock("../lib/tts/post-process.mjs", () => ({
  runForcedAlignment: vi.fn(),
  getAtempo: vi.fn(() => null),
}));

vi.mock("../lib/tts/cache.mjs", () => ({
  planTtsScenes: vi.fn(),
  writeSceneMeta: vi.fn(),
  computeSceneKey: vi.fn(),
}));

import { generateTTSWithEngine } from "../lib/tts/registry.mjs";
import { runTtsQualityGate } from "../lib/tts/quality-gate.mjs";

const SCENES = [
  { id: 1, voiceover: "First scene text." },
  { id: 2, voiceover: "Second scene text." },
];

function fakeEngine() {
  return {
    name: "mock-kaggle",
    info: "Mock engine (test)",
    generate: vi.fn(),
  };
}

describe("self-heal retry granularity (#241 review)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TTS_ALLOW_PARTIAL_TTS;
  });
  afterEach(() => {
    delete process.env.TTS_ALLOW_PARTIAL_TTS;
  });

  it("retry generation receives ONLY the failed scenes, not the full batch", async () => {
    const engine = fakeEngine();
    engine.generate.mockImplementation(async (scenes) =>
      scenes.map((s) => ({
        sceneId: s.id,
        audioPath: `/tmp/scene-${s.id}.wav`,
        duration: 3.0,
      })),
    );

    let gateCall = 0;
    runTtsQualityGate.mockImplementation(async (_scenes, results) => ({
      passed: gateCall++ > 0,
      failedCount: gateCall > 1 ? 0 : 1,
      evaluations: results.map((r) => ({
        sceneId: r.sceneId,
        passed: gateCall > 1 || r.sceneId !== 2,
        issues: gateCall > 1 || r.sceneId !== 2 ? [] : ["Pacing too slow"],
      })),
    }));

    const results = await generateTTSWithEngine(SCENES, "/tmp/unused", engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 2,
    });

    // Initial batch call got both scenes; the retry got ONLY scene 2.
    expect(engine.generate).toHaveBeenCalledTimes(2);
    expect(engine.generate.mock.calls[0][0].map((s) => s.id)).toEqual([1, 2]);
    expect(engine.generate.mock.calls[1][0].map((s) => s.id)).toEqual([2]);
    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
  });
});

describe("missing-audio fail-closed guard (#241)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TTS_ALLOW_PARTIAL_TTS;
  });
  afterEach(() => {
    delete process.env.TTS_ALLOW_PARTIAL_TTS;
  });

  function stubGateAlwaysFailsScene2() {
    runTtsQualityGate.mockImplementation(async (_scenes, results) => ({
      passed: false,
      failedCount: 1,
      evaluations: results.map((r) => ({
        sceneId: r.sceneId,
        passed: r.sceneId !== 2,
        issues: r.sceneId !== 2 ? [] : ["Audio file missing or zero bytes"],
      })),
    }));
  }

  it("RED (#241): a scene with no audio after retries fails the run instead of being silently dropped", async () => {
    const engine = fakeEngine();
    // Kernel skips scene 2 every time (segment error on the kernel side).
    engine.generate.mockImplementation(async (scenes) =>
      scenes
        .filter((s) => s.id !== 2)
        .map((s) => ({ sceneId: s.id, audioPath: "/tmp/scene-1.wav", duration: 3.0 })),
    );
    stubGateAlwaysFailsScene2();

    await expect(
      generateTTSWithEngine(SCENES, "/tmp/unused", engine, {
        useCache: false,
        runAlignment: false,
        maxRetries: 1,
      }),
    ).rejects.toThrow(/no audio for scene\(s\) 2.*TTS_ALLOW_PARTIAL_TTS/s);
  });

  it("TTS_ALLOW_PARTIAL_TTS=1 explicitly restores the old partial-run behaviour", async () => {
    process.env.TTS_ALLOW_PARTIAL_TTS = "1";
    const engine = fakeEngine();
    engine.generate.mockImplementation(async (scenes) =>
      scenes
        .filter((s) => s.id !== 2)
        .map((s) => ({ sceneId: s.id, audioPath: "/tmp/scene-1.wav", duration: 3.0 })),
    );
    stubGateAlwaysFailsScene2();

    const results = await generateTTSWithEngine(SCENES, "/tmp/unused", engine, {
      useCache: false,
      runAlignment: false,
      maxRetries: 1,
    });
    expect(results.map((r) => r.sceneId)).toEqual([1]);
  });

  it("an engine-level generation error (kernel failed/timed out) propagates — never swallowed", async () => {
    const engine = fakeEngine();
    engine.generate.mockRejectedValue(new Error("Kaggle kernel timed out after 30m0s of RUNNING"));

    await expect(
      generateTTSWithEngine(SCENES, "/tmp/unused", engine, {
        useCache: false,
        runAlignment: false,
      }),
    ).rejects.toThrow(/Kaggle kernel timed out/);
    expect(engine.generate).toHaveBeenCalledTimes(1); // no retry on hard engine error
  });
});
