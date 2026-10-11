/**
 * #421: a full TTS cache hit must still run the forced-alignment tail.
 *
 * The bug this pins: `generateTTSWithEngine` returned the cached results
 * BEFORE the alignment tail, so the second full run of a pipeline (10/10
 * cache hits) never produced subtitle-timing.json and main.mjs rendered a
 * video without burned-in subtitles — the channel's hard requirement.
 *
 * The aligner is mocked (its own behaviour is covered by tts-cache.test.mjs /
 * tts-alignment*.test.mjs); the cache layer under test is REAL. Pinned here:
 *
 *  - a full hit still calls runForcedAlignment over the cached takes in scene
 *    order (its signature cache decides reuse vs recompute);
 *  - `runAlignment: false` stays the explicit low-level escape hatch;
 *  - partial hits are reassembled in scene order regardless of the order the
 *    engine returns its takes;
 *  - a tail cut during a full-hit alignment re-binds the approved entries to
 *    the cut bytes (the #423 refresh, now reachable on the full-hit path).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../lib/tts/quality-gate.mjs", () => ({
  runTtsQualityGate: vi.fn(),
}));

vi.mock("../lib/tts/post-process.mjs", () => ({
  runForcedAlignment: vi.fn(),
  getAtempo: vi.fn(() => null),
}));

import { generateTTSWithEngine } from "../lib/tts/registry.mjs";
import { runTtsQualityGate } from "../lib/tts/quality-gate.mjs";
import { runForcedAlignment } from "../lib/tts/post-process.mjs";
import {
  computeAudioDigest,
  computeSceneKey,
  planTtsScenes,
  writeSceneMeta,
} from "../lib/tts/cache.mjs";

const ENGINE = { name: "mock-kaggle-cuda", info: "Mock engine (#421 test)" };

/** Fake engine writing deterministic take bytes; counters are test-visible. */
function makeEngine() {
  return {
    name: ENGINE.name,
    info: ENGINE.info,
    generatedSceneIds: [],
    takeCounter: 0,
    async generate(scenes, outputDir) {
      this.generatedSceneIds.push(...scenes.map((s) => s.id));
      return scenes.map((s) => {
        const audioPath = join(outputDir, `scene-${s.id}.wav`);
        writeFileSync(audioPath, `take-${s.id}-${++this.takeCounter}`);
        return { sceneId: s.id, audioPath, duration: 4.0 };
      });
    },
  };
}

function passAll() {
  runTtsQualityGate.mockImplementation(async (_scenes, results) => ({
    passed: true,
    failedCount: 0,
    evaluations: results.map((r) => ({
      sceneId: r.sceneId,
      passed: true,
      wpm: 150,
      issues: [],
      failureClass: null,
    })),
  }));
}

/** Write a take's bytes + an approved meta bound to them. */
function approveTake(dir, scene, duration = 4.0, engine = ENGINE) {
  const audioPath = join(dir, `scene-${scene.id}.wav`);
  writeFileSync(audioPath, `approved-${scene.id}`);
  const ok = writeSceneMeta(dir, scene.id, {
    key: computeSceneKey(engine, scene.voiceover),
    duration,
    engine: engine.name,
    audioPath,
  });
  expect(ok).toBe(true);
}

describe("full cache hit runs the alignment tail (#421)", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-421-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    runForcedAlignment.mockResolvedValue({ skipped: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TTS_SKIP_QUALITY_GATE;
  });

  it("still runs forced alignment when every scene is an approved cache hit", async () => {
    const engine = makeEngine();
    const scenes = [
      { id: 1, voiceover: "Scene one." },
      { id: 2, voiceover: "Scene two." },
    ];
    approveTake(dir, scenes[0]);
    approveTake(dir, scenes[1]);
    // Pre-condition: the plan really is a full hit (no pending/candidates).
    expect(planTtsScenes(dir, scenes, engine).approved).toHaveLength(2);

    const results = await generateTTSWithEngine(scenes, dir, engine, { useCache: true });

    // Zero generation, but the alignment tail ran over the cached takes.
    expect(engine.generatedSceneIds).toEqual([]);
    expect(runForcedAlignment).toHaveBeenCalledTimes(1);
    const [alignScenes, alignResults, alignDir] = runForcedAlignment.mock.calls[0];
    expect(alignScenes).toBe(scenes);
    expect(alignDir).toBe(dir);
    expect(alignResults.map((r) => r.sceneId)).toEqual([1, 2]);
    expect(alignResults.every((r) => r.cached === true)).toBe(true);
    // Results stay in scene order.
    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
  });

  it("keeps the explicit runAlignment:false escape hatch on a full hit", async () => {
    const engine = makeEngine();
    const scenes = [{ id: 1, voiceover: "Scene one." }];
    approveTake(dir, scenes[0]);

    await generateTTSWithEngine(scenes, dir, engine, { useCache: true, runAlignment: false });

    expect(runForcedAlignment).not.toHaveBeenCalled();
  });

  it("reassembles partial hits in scene order regardless of engine return order", async () => {
    passAll();
    const engine = makeEngine();
    const scenes = [
      { id: 1, voiceover: "Scene one." },
      { id: 2, voiceover: "Scene two." },
    ];
    approveTake(dir, scenes[0]); // scene 1 = hit; scene 2 = pending
    engine.generate = async (scenesIn, outputDir) =>
      scenesIn
        .map((s) => {
          const audioPath = join(outputDir, `scene-${s.id}.wav`);
          writeFileSync(audioPath, `take-${s.id}`);
          return { sceneId: s.id, audioPath, duration: 4.0 };
        })
        .reverse(); // deliberately out of order

    const results = await generateTTSWithEngine(scenes, dir, engine, {
      useCache: true,
      runAlignment: false,
    });

    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
    expect(results[0].cached).toBe(true);
    expect(results[1].cached).toBeUndefined();
  });

  it("re-binds approved entries to the bytes the full-hit alignment tail-cut produced", async () => {
    const engine = makeEngine();
    const scenes = [{ id: 1, voiceover: "Scene one." }];
    approveTake(dir, scenes[0], 4.0);
    runForcedAlignment.mockImplementation(async (_scenes, results) => {
      for (const r of results) {
        writeFileSync(r.audioPath, "cut-bytes");
        r.duration = 2.0;
      }
      return {
        skipped: false,
        guards: { cuts: [{ sceneId: 1, from: 4.0, to: 2.0 }], crushedWords: [] },
      };
    });

    const results = await generateTTSWithEngine(scenes, dir, engine, { useCache: true });

    const meta = JSON.parse(readFileSync(join(dir, "scene-1.tts-meta.json"), "utf8"));
    expect(meta.duration).toBe(2.0);
    expect(meta.audioDigest).toBe(computeAudioDigest(join(dir, "scene-1.wav")));
    // The refreshed entry still satisfies a cache hit on the next run.
    expect(planTtsScenes(dir, scenes, engine).approved).toHaveLength(1);
    expect(results[0].duration).toBe(2.0);
  });
});
