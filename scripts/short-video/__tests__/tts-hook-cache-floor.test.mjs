/**
 * #786 — the hook floor must reach FINISHED (cache-hit) takes.
 *
 * #244 requires every English hook to ship at ≥ 1.1x. Until this ticket the
 * pacing ladder only judged takes generated in the current run: `planTtsScenes`
 * routed approved audio straight to `cachedResults`, which never entered
 * `verifyScenes`, so a 1.0x hook stayed 1.0x forever (v41-flash-1017:
 * `ttsSpeed:1`, 163 WPM, `9/10 scenes reused`).
 *
 * The cache layer is REAL here; the Quality Gate and the aligner are mocked.
 * Also pinned: the trim policy is part of the cache key, so audio approved
 * under the old untrimmed policy demotes to pending (regenerated once) instead
 * of being replayed as if it had been trimmed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
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
import { planTtsScenes, sceneCacheKey, writeSceneMeta } from "../lib/tts/cache.mjs";

/** Production-shaped engine: trims pauses, so the key carries the trim token. */
function makeEngine({ useSilenceFilter = true } = {}) {
  return {
    name: "cosyvoice3-kaggle-cuda",
    info: "CosyVoice3-Kaggle-CUDA (P100, #786 test)",
    useSilenceFilter,
    ...(useSilenceFilter ? { silenceFloorMs: 250 } : {}),
    generated: [],
    take: 0,
    async generate(scenes, outputDir) {
      this.generated.push(...scenes.map((s) => ({ id: s.id, ttsSpeed: s.ttsSpeed })));
      return scenes.map((s) => {
        const audioPath = join(outputDir, `scene-${s.id}.wav`);
        writeFileSync(audioPath, `regen-take-${s.id}-${++this.take}`);
        return { sceneId: s.id, audioPath, duration: 4.0 };
      });
    },
  };
}

/**
 * 13 tokens → 162 WPM over 4.8 s: in the keep band (>= 150), so the hook floor
 * is the repair path under test (not the low-WPM compensation).
 * A factory, never a shared object: the pacing loop writes `scene.ttsSpeed`.
 */
function hookScene() {
  return {
    id: 1,
    visualType: "hook",
    voiceover: "China just dropped a model that beats GPT on nine public benchmarks today.",
  };
}

function gatePassing(wpm) {
  runTtsQualityGate.mockImplementation(async (_scenes, results) => ({
    passed: true,
    failedCount: 0,
    evaluations: results.map((r) => ({
      sceneId: r.sceneId,
      passed: true,
      wpm,
      issues: [],
      failureClass: null,
    })),
  }));
}

/** Seed an APPROVED 1.0x take, exactly as a pre-#786 run would have left it. */
function seedApprovedTake(dir, engine, scene, { speed = 1.0, duration = 4.8 } = {}) {
  const audioPath = join(dir, `scene-${scene.id}.wav`);
  writeFileSync(audioPath, `approved-take-${scene.id}-${speed}`);
  writeSceneMeta(dir, scene.id, {
    key: sceneCacheKey(engine, scene, speed),
    duration,
    engine: engine.name,
    audioPath,
    ttsSpeed: speed,
  });
}

describe("#786 hook floor reaches cached approved takes", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-786-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    runForcedAlignment.mockResolvedValue({ skipped: true });
    gatePassing(178);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TTS_SKIP_QUALITY_GATE;
  });

  it("regenerates a cache-hit 1.0x hook at the 1.1 floor and ships the new take", async () => {
    const engine = makeEngine();
    seedApprovedTake(dir, engine, hookScene());

    const results = await generateTTSWithEngine([hookScene()], dir, engine, {
      useCache: true,
      runAlignment: false,
      maxRetries: 0,
    });

    // The hook was regenerated, at the floor — not at 1.0.
    expect(engine.generated).toEqual([{ id: 1, ttsSpeed: 1.1 }]);
    // The stale approved hit must not win the merge after paying for a regen.
    expect(results).toHaveLength(1);
    expect(results[0].duration).toBe(4.0);
    expect(results[0].cached).toBeUndefined();

    // And the promoted meta now records 1.1x, so the next run is stable.
    const plan = planTtsScenes(dir, [hookScene()], engine);
    expect(plan.approved).toHaveLength(1);
    expect(plan.approved[0].ttsSpeed).toBe(1.1);
  });

  it("does not touch a cached hook that is already at the floor", async () => {
    const engine = makeEngine();
    seedApprovedTake(dir, engine, hookScene(), { speed: 1.1, duration: 4.0 });

    const results = await generateTTSWithEngine([hookScene()], dir, engine, {
      useCache: true,
      runAlignment: false,
      maxRetries: 0,
    });

    expect(engine.generated).toEqual([]);
    expect(results[0].cached).toBe(true);
  });

  it("leaves cached takes alone when the gate is skipped (operator escape hatch)", async () => {
    const engine = makeEngine();
    seedApprovedTake(dir, engine, hookScene());

    const results = await generateTTSWithEngine([hookScene()], dir, engine, {
      useCache: true,
      runAlignment: false,
      skipQualityGate: true,
    });

    expect(engine.generated).toEqual([]);
    expect(results[0].cached).toBe(true);
  });
});

describe("#786 trim policy is part of the cache key", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-786-key-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("demotes audio approved under the untrimmed policy to pending", () => {
    const trimming = makeEngine();
    const legacy = makeEngine({ useSilenceFilter: false });
    const audioPath = join(dir, "scene-1.wav");
    writeFileSync(audioPath, "untrimmed-take");
    // Key written by a pre-#786 engine: no trim token.
    writeSceneMeta(dir, 1, {
      key: sceneCacheKey(legacy, hookScene(), 1.0),
      duration: 4.8,
      engine: trimming.name,
      audioPath,
      ttsSpeed: 1.0,
    });

    const plan = planTtsScenes(dir, [hookScene()], trimming);
    expect(plan.approved).toHaveLength(0);
    expect(plan.pending).toHaveLength(1);
  });

  it("keeps the legacy key shape for engines that do not trim", () => {
    const legacy = makeEngine({ useSilenceFilter: false });
    const audioPath = join(dir, "scene-1.wav");
    writeFileSync(audioPath, "untrimmed-take");
    writeSceneMeta(dir, 1, {
      key: sceneCacheKey(legacy, hookScene(), 1.0),
      duration: 4.8,
      engine: legacy.name,
      audioPath,
      ttsSpeed: 1.0,
    });
    expect(planTtsScenes(dir, [hookScene()], legacy).approved).toHaveLength(1);
  });
});
