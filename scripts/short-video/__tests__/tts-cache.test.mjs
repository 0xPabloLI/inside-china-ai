/**
 * Tests for TTS + forced-alignment cross-run caching (#198 Item 2).
 *
 * Every pipeline run used to re-run GPU TTS for ALL scenes and re-run
 * wav2vec2 forced alignment even when scene text and voice config were
 * unchanged. The cache keys scene audio by (engine, engine config, text)
 * and alignment by (scene text, audio content) signatures; repair paths
 * pass force:true so a retry genuinely retries.
 */
import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  computeSceneKey,
  planTtsScenes,
  ttsCacheEnabled,
  writeSceneMeta,
  alignmentCacheState,
  computeAlignmentSignature,
} from "../lib/tts/cache.mjs";
import { generateTTSWithEngine } from "../lib/tts/registry.mjs";
import { runForcedAlignment } from "../lib/tts/post-process.mjs";
import { resolveSceneSpeed } from "../lib/tts/pacing.mjs";

describe("computeSceneKey", () => {
  const engine = { name: "f5-mlx", info: "F5-TTS-MLX (cloned from ref.wav, speed=1)" };

  it("is stable for the same engine + text", () => {
    const a = computeSceneKey(engine, "你好世界");
    const b = computeSceneKey(engine, "你好世界");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it("changes when the scene text changes", () => {
    expect(computeSceneKey(engine, "你好世界")).not.toBe(computeSceneKey(engine, "你好世界！"));
  });

  it("changes when the engine or its config changes", () => {
    const other = { name: "edge-tts", info: "edge-tts (Brian)" };
    expect(computeSceneKey(engine, "文本")).not.toBe(computeSceneKey(other, "文本"));
    expect(computeSceneKey(engine, "文本")).not.toBe(
      computeSceneKey({ ...engine, info: "...speed=1.2)" }, "文本"),
    );
  });

  it("keeps the legacy key when speed is 1.0 or omitted (#235)", () => {
    expect(computeSceneKey(engine, "同一句", 1.0)).toBe(computeSceneKey(engine, "同一句"));
    expect(computeSceneKey(engine, "同一句")).toBe(computeSceneKey(engine, "同一句", 1.0));
  });

  it("changes when a non-1.0 speed is given (#235)", () => {
    expect(computeSceneKey(engine, "同一句", 1.2)).not.toBe(computeSceneKey(engine, "同一句"));
    expect(computeSceneKey(engine, "同一句", 1.2)).not.toBe(
      computeSceneKey(engine, "同一句", 1.15),
    );
  });
});

describe("planTtsScenes / writeSceneMeta", () => {
  const engine = { name: "f5-mlx", info: "F5-TTS-MLX (cloned from ref.wav, speed=1)" };
  let dirs = [];

  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };

  it("pins the plan/write key invariant for speed-resolved EN scenes (#235)", () => {
    // cache.mjs (planTtsScenes) and registry.mjs (writeSceneMeta) resolve the
    // per-scene speed independently — this roundtrip fails if the two sites
    // ever disagree: a 1.2-speed scene must hit the cache its own write wrote.
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scene = {
      id: 1,
      visualType: "narrative",
      voiceover: "Alibaba revealed the weights for free.",
    };
    // Audio first: promotion (#423) refuses to bless a missing file.
    writeFileSync(join(dir, "scene-1.wav"), "fake audio");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover, resolveSceneSpeed(scene)),
      duration: 1.5,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
    });
    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(1);
    expect(plan.pending).toHaveLength(0);
  });

  it("plans every scene as pending when no meta exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scenes = [
      { id: 1, voiceover: "第一句" },
      { id: 2, voiceover: "第二句" },
    ];

    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending).toHaveLength(2);
    expect(plan.approved).toHaveLength(0);
    cleanup();
  });

  it("returns cached results when meta matches and the audio file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scenes = [{ id: 1, voiceover: "第一句" }];
    const key = computeSceneKey(engine, "第一句");
    writeFileSync(join(dir, "scene-1.wav"), "fake-wav-bytes");
    writeSceneMeta(dir, 1, { key, duration: 3.21, engine: engine.name });

    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending).toHaveLength(0);
    expect(plan.approved).toEqual([
      {
        sceneId: 1,
        audioPath: join(dir, "scene-1.wav"),
        duration: 3.21,
        cached: true,
        ttsSpeed: 1,
      },
    ]);
    cleanup();
  });

  it("plans pending when the text changed (key mismatch)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scenes = [{ id: 1, voiceover: "改过的句子" }];
    writeFileSync(join(dir, "scene-1.wav"), "fake-wav-bytes");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, "原来的句子"),
      duration: 2.5,
      engine: engine.name,
    });

    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending).toHaveLength(1);
    expect(plan.approved).toHaveLength(0);
    cleanup();
  });

  it("plans pending when the cached audio file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scenes = [{ id: 7, voiceover: "第一句" }];
    writeSceneMeta(dir, 7, {
      key: computeSceneKey(engine, "第一句"),
      duration: 2.5,
      engine: engine.name,
    });

    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending).toHaveLength(1);
    expect(plan.approved).toHaveLength(0);
    cleanup();
  });

  it("handles corrupt meta as pending (fail-open to regeneration)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scenes = [{ id: 1, voiceover: "第一句" }];
    writeFileSync(join(dir, "scene-1.tts-meta.json"), "{not json");

    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending).toHaveLength(1);
    cleanup();
  });

  it("reuses loop-compensated audio via meta.ttsSpeed when the scene resolves to baseline (#252)", () => {
    // #252: the pacing loop writes compensated audio at ttsSpeed=1.2. A fresh
    // scene object resolves to 1.0 — without the stored-speed fallback every
    // re-run would regenerate the compensated take and re-compensate.
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scene = {
      id: 1,
      visualType: "hook",
      voiceover: "China just dropped a model that beats GPT.",
    };
    writeFileSync(join(dir, "scene-1.wav"), "compensated-audio");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover, 1.2),
      duration: 4.2,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
      ttsSpeed: 1.2,
    });

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(1);
    expect(plan.pending).toHaveLength(0);
  });

  it("an explicit scene/env speed override beats the stored compensation speed (#252)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scene = {
      id: 1,
      visualType: "hook",
      voiceover: "China just dropped a model that beats GPT.",
    };
    writeFileSync(join(dir, "scene-1.wav"), "compensated-audio");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover, 1.2),
      duration: 4.2,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
      ttsSpeed: 1.2,
    });

    // Operator override active → resolved ≠ 1.0 → stored speed must NOT win.
    process.env.TTS_SPEED = "1.15";
    try {
      const plan = planTtsScenes(dir, [scene], engine);
      expect(plan.pending).toHaveLength(1);
      expect(plan.approved).toHaveLength(0);
    } finally {
      delete process.env.TTS_SPEED;
    }

    // Scene-level override likewise.
    const withOverride = { ...scene, ttsSpeed: 1.1 };
    const plan2 = planTtsScenes(dir, [withOverride], engine);
    expect(plan2.pending).toHaveLength(1);
  });

  it("legacy meta without ttsSpeed keeps the baseline key behaviour (#252)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scene = {
      id: 1,
      visualType: "narrative",
      voiceover: "Alibaba revealed the weights for free.",
    };
    writeFileSync(join(dir, "scene-1.wav"), "legacy-audio");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover), // 1.0 → legacy key shape
      duration: 4.2,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
    });

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(1);
  });
});

describe("ttsCacheEnabled (#953)", () => {
  it("single-sources the TTS_NO_CACHE switch for the run and the preview", () => {
    expect(ttsCacheEnabled({})).toBe(true);
    expect(ttsCacheEnabled({ TTS_NO_CACHE: "0" })).toBe(true);
    expect(ttsCacheEnabled({ TTS_NO_CACHE: "1" })).toBe(false);
  });
});

describe("planTtsScenes miss reasons (#953)", () => {
  // The spend preview is only useful if a pending scene names WHY it missed.
  // These cases pin one reason per branch of the planner's decision tree.
  const engine = { name: "f5-mlx", info: "F5-TTS-MLX (cloned from ref.wav, speed=1)" };
  let dirs = [];
  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };
  const newDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-miss-"));
    dirs.push(dir);
    return dir;
  };

  it("reports missing-audio when no sidecar exists (never generated)", () => {
    const dir = newDir();
    const plan = planTtsScenes(dir, [{ id: 1, voiceover: "第一句" }], engine);
    expect(plan.misses).toEqual([{ sceneId: 1, reason: "missing-audio" }]);
    cleanup();
  });

  it("reports text-changed when the key drifted within the same engine and speed", () => {
    const dir = newDir();
    writeFileSync(join(dir, "scene-1.wav"), "fake-wav-bytes");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, "原来的句子"),
      duration: 2.5,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
    });
    const plan = planTtsScenes(dir, [{ id: 1, voiceover: "改过的句子" }], engine);
    expect(plan.misses).toEqual([{ sceneId: 1, reason: "text-changed" }]);
    cleanup();
  });

  it("reports engine-changed when the approved take came from another engine", () => {
    const dir = newDir();
    const otherEngine = { name: "cosyvoice3-kaggle-cuda", info: "CosyVoice3-Kaggle-CUDA" };
    writeFileSync(join(dir, "scene-1.wav"), "fake-wav-bytes");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(otherEngine, "第一句"),
      duration: 2.5,
      engine: otherEngine.name,
      audioPath: join(dir, "scene-1.wav"),
    });
    const plan = planTtsScenes(dir, [{ id: 1, voiceover: "第一句" }], engine);
    expect(plan.misses).toEqual([{ sceneId: 1, reason: "engine-changed" }]);
    cleanup();
  });

  it("reports speed-changed when an operator override moves the resolved speed", () => {
    const dir = newDir();
    // English text: resolveSceneSpeed never lifts Chinese scenes, so a speed
    // override only exists on the EN path.
    const text = "the hook line";
    writeFileSync(join(dir, "scene-1.wav"), "fake-wav-bytes");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, text, 1.2),
      duration: 2.5,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
      ttsSpeed: 1.2,
    });
    const priorSpeed = process.env.TTS_SPEED;
    process.env.TTS_SPEED = "1.15";
    try {
      const plan = planTtsScenes(dir, [{ id: 1, voiceover: text }], engine);
      expect(plan.misses).toEqual([{ sceneId: 1, reason: "speed-changed" }]);
    } finally {
      if (priorSpeed === undefined) delete process.env.TTS_SPEED;
      else process.env.TTS_SPEED = priorSpeed;
    }
    cleanup();
  });

  it("reports missing-audio when a matching sidecar points at a deleted take", () => {
    const dir = newDir();
    writeFileSync(
      join(dir, "scene-7.tts-meta.json"),
      JSON.stringify({
        key: computeSceneKey(engine, "第一句"),
        duration: 2.5,
        engine: engine.name,
        audioPath: join(dir, "scene-7.wav"),
      }),
    );
    const plan = planTtsScenes(dir, [{ id: 7, voiceover: "第一句" }], engine);
    expect(plan.misses).toEqual([{ sceneId: 7, reason: "missing-audio" }]);
    cleanup();
  });

  it("reports missing-meta when audio exists but no sidecar survives", () => {
    const dir = newDir();
    writeFileSync(join(dir, "scene-9.wav"), "orphan-take");
    const plan = planTtsScenes(dir, [{ id: 9, voiceover: "第一句" }], engine);
    expect(plan.misses).toEqual([{ sceneId: 9, reason: "missing-meta" }]);
    cleanup();
  });

  it("reports corrupt-meta when the sidecar exists but cannot be parsed", () => {
    const dir = newDir();
    writeFileSync(join(dir, "scene-8.tts-meta.json"), "{not json");
    const plan = planTtsScenes(dir, [{ id: 8, voiceover: "第一句" }], engine);
    expect(plan.misses).toEqual([{ sceneId: 8, reason: "corrupt-meta" }]);
    cleanup();
  });

  it("reports speed-changed for a legacy 1.0x take when the scene now resolves a speed", () => {
    const dir = newDir();
    const text = "the hook line";
    writeFileSync(join(dir, "scene-1.wav"), "fake-wav-bytes");
    // Legacy meta: approved at 1.0x, no ttsSpeed recorded. The scene now
    // resolves 1.1x, so the key misses — the text did not change.
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, text),
      duration: 2.5,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
    });
    const plan = planTtsScenes(dir, [{ id: 1, voiceover: text, ttsSpeed: 1.1 }], engine);
    expect(plan.misses).toEqual([{ sceneId: 1, reason: "speed-changed" }]);
    cleanup();
  });

  it("keeps misses aligned with pending in scene order", () => {
    const dir = newDir();
    const scenes = [
      { id: 1, voiceover: "第一句" },
      { id: 2, voiceover: "第二句" },
      { id: 3, voiceover: "第三句" },
    ];
    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(plan.misses.map((m) => m.sceneId)).toEqual([1, 2, 3]);
    cleanup();
  });
});

describe("generateTTSWithEngine caching (fake engine, no GPU)", () => {
  /** Fresh engine per test — generatedSceneIds must not leak across tests. */
  function makeEngine() {
    return {
      name: "fake",
      info: "Fake engine (speed=1)",
      generatedSceneIds: [],
      async generate(scenes, outputDir) {
        this.generatedSceneIds.push(...scenes.map((s) => s.id));
        return scenes.map((s) => {
          const audioPath = join(outputDir, `scene-${s.id}.wav`);
          writeFileSync(audioPath, `wav-for-${s.id}`);
          return { sceneId: s.id, audioPath, duration: 1.5 + s.id };
        });
      },
    };
  }
  const engine = makeEngine();

  let dirs = [];
  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };

  it("generates all scenes on the first run and skips GPU on the second", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-run-"));
    dirs.push(dir);
    const engine = makeEngine();
    const scenes = [
      { id: 1, voiceover: "第一句" },
      { id: 2, voiceover: "第二句" },
      { id: 3, voiceover: "第三句" },
    ];

    const first = await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    expect(engine.generatedSceneIds).toEqual([1, 2, 3]);
    expect(first.map((r) => r.sceneId)).toEqual([1, 2, 3]);

    const second = await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    expect(engine.generatedSceneIds).toEqual([1, 2, 3]); // no new generation
    // The fake engine's name makes the Quality Gate a no-op, so its takes are
    // recorded as candidates (#423), never approved. The second run still
    // reuses the audio without touching the engine — via candidate
    // re-verification, not via an approved cache hit.
    const stripCached = (rs) => rs.map(({ cached, ...rest }) => rest);
    expect(stripCached(second)).toEqual(stripCached(first));
    expect(second.some((r) => r.cached === true)).toBe(false);
    expect(first.some((r) => "cached" in r)).toBe(false);
    cleanup();
  });

  it("regenerates only the scene whose text changed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-edit-"));
    dirs.push(dir);
    const engine = makeEngine();
    const scenes = [
      { id: 1, voiceover: "第一句" },
      { id: 2, voiceover: "第二句" },
    ];
    await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });

    const edited = [
      { id: 1, voiceover: "第一句" },
      { id: 2, voiceover: "改写后的第二句" },
    ];
    const results = await generateTTSWithEngine(edited, dir, engine, { runAlignment: false });
    expect(engine.generatedSceneIds).toEqual([1, 2, 2]);
    expect(results.map((r) => r.sceneId)).toEqual([1, 2]);
    cleanup();
  });

  it("bypasses the cache with useCache:false", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-nocache-"));
    dirs.push(dir);
    const engine = makeEngine();
    const scenes = [{ id: 1, voiceover: "第一句" }];
    await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false, useCache: false });
    expect(engine.generatedSceneIds).toEqual([1, 1]);
    cleanup();
  });

  it("writes a candidate sidecar next to the generated audio (skip-gate take)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-meta-"));
    dirs.push(dir);
    const engine = makeEngine();
    const scenes = [{ id: 4, voiceover: "第一句" }];
    await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    // The fake engine's name skips the gate, so the take cannot be approved
    // (#423) — it is recorded as a candidate for local re-verification.
    expect(existsSync(join(dir, "scene-4.tts-meta.json"))).toBe(false);
    const meta = JSON.parse(readFileSync(join(dir, "scene-4.tts-candidate.json"), "utf8"));
    expect(meta.status).toBe("candidate");
    expect(meta.reason).toBe("gate-skipped");
    expect(meta.engine).toBe("fake");
    expect(meta.duration).toBeCloseTo(5.5, 5);
    expect(meta.key).toBe(computeSceneKey(engine, "第一句"));
    cleanup();
  });
});

describe("forced-alignment cache", () => {
  const engine = { name: "fake", info: "Fake engine (speed=1)" };
  let dirs = [];
  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };

  /** Real wav scene audio so the signature hashes real bytes. */
  function makeSceneAudio(dir, sceneId, text) {
    const audioPath = join(dir, `scene-${sceneId}.wav`);
    execSync(
      `ffmpeg -y -f lavfi -i sine=frequency=${300 + sceneId}:duration=0.3 -ar 44100 "${audioPath}" 2>/dev/null`,
    );
    return { sceneId, text, audioPath };
  }

  it("signature changes when scene audio or text changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "align-cache-"));
    dirs.push(dir);
    const results = [makeSceneAudio(dir, 1, "第一句")];
    const scenes = [{ id: 1, voiceover: "第一句" }];

    const s1 = computeAlignmentSignature(scenes, results);
    const s2 = computeAlignmentSignature(scenes, results);
    expect(s1).toBe(s2);

    writeFileSync(results[0].audioPath, "different bytes now");
    expect(computeAlignmentSignature(scenes, results)).not.toBe(s1);

    execSync(
      `ffmpeg -y -f lavfi -i sine=frequency=500:duration=0.3 "${results[0].audioPath}" 2>/dev/null`,
    );
    expect(computeAlignmentSignature(scenes, results)).not.toBe(s1);
    cleanup();
  });

  it("runForcedAlignment skips (no GPU) when the cached timing matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "align-cache-skip-"));
    dirs.push(dir);
    const results = [makeSceneAudio(dir, 1, "第一句")];
    const scenes = [{ id: 1, voiceover: "第一句" }];

    const timingPath = join(dir, "subtitle-timing.json");
    writeFileSync(timingPath, JSON.stringify({ cues: [] }));
    writeFileSync(
      join(dir, "subtitle-timing.meta.json"),
      JSON.stringify({
        signature: computeAlignmentSignature(scenes, results),
      }),
    );

    const result = await runForcedAlignment(scenes, results, dir);
    expect(result.skipped).toBe(true);
    expect(existsSync(timingPath)).toBe(true);
    cleanup();
  });

  it("reports stale instead of skipping when the signature drifted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "align-cache-stale-"));
    dirs.push(dir);
    const results = [makeSceneAudio(dir, 1, "第一句")];
    const scenes = [{ id: 1, voiceover: "第一句" }];

    writeFileSync(join(dir, "subtitle-timing.json"), JSON.stringify({ cues: [] }));
    writeFileSync(
      join(dir, "subtitle-timing.meta.json"),
      JSON.stringify({
        signature: "stale-signature",
      }),
    );

    expect(alignmentCacheState(dir, computeAlignmentSignature(scenes, results))).toBe("stale");
    cleanup();
  });
});

// ─── Review fixes (#198): mp3 engines must hit the cache too ───
describe("planTtsScenes with mp3 engines (edge-tts / say)", () => {
  let dirs = [];
  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };
  afterEach(cleanup);

  it("hits the cache when meta records the actual (mp3) audio file", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-mp3-"));
    dirs.push(dir);
    const engine = { name: "edge-tts", info: "edge-tts (voice=zh-CN)" };
    const scenes = [{ id: 1, voiceover: "第一句" }];
    writeFileSync(join(dir, "scene-1.mp3"), "fake-mp3-bytes");
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, "第一句"),
      duration: 2.0,
      engine: engine.name,
      audioPath: join(dir, "scene-1.mp3"),
    });

    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending).toHaveLength(0);
    expect(plan.approved[0].audioPath).toBe(join(dir, "scene-1.mp3"));
  });

  it("caches across runs when a fake engine writes mp3 output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-mp3run-"));
    dirs.push(dir);
    const engine = {
      name: "edge-tts",
      info: "edge-tts (voice=zh-CN)",
      calls: 0,
      async generate(scenes, outputDir) {
        this.calls += 1;
        return scenes.map((s) => {
          const audioPath = join(outputDir, `scene-${s.id}.mp3`);
          writeFileSync(audioPath, `mp3-for-${s.id}`);
          return { sceneId: s.id, audioPath, duration: 2.0 };
        });
      },
    };
    const scenes = [{ id: 1, voiceover: "第一句" }];
    const { generateTTSWithEngine } = await import("../lib/tts/registry.mjs");
    // skipQualityGate: this test only checks cache reuse across runs, and the
    // engine writes placeholder mp3 bytes no verifier could transcribe. The
    // gate would report "ASR unavailable" — now fail-closed per #415 ① — so
    // opt out explicitly instead of depending on the old warn-and-continue.
    const opts = { runAlignment: false, skipQualityGate: true };
    await generateTTSWithEngine(scenes, dir, engine, opts);
    const second = await generateTTSWithEngine(scenes, dir, engine, opts);
    expect(engine.calls).toBe(1);
    expect(second[0].audioPath).toBe(join(dir, "scene-1.mp3"));
  });
});

describe("per-scene instruct in the cache key (#244, 2026-09-13)", () => {
  const engine = {
    name: "cosyvoice3-kaggle-cuda",
    info: "CosyVoice3-Kaggle-CUDA (P100, cloned from ref.wav)",
  };

  it("mixes the per-scene emotion instruct into the key when provided", () => {
    const a = computeSceneKey(engine, "same text", 1.0, "anchor instruct");
    expect(computeSceneKey(engine, "same text", 1.0, "anchor instruct")).toBe(a);
    // An INSTRUCT_STANDARD edit (the #270 single source in lib/tts/instruct.mjs)
    // must not replay audio generated under the old instruct — same trap as the
    // #235 speed key.
    expect(computeSceneKey(engine, "same text", 1.0, "anchor instruct v2")).not.toBe(a);
    expect(computeSceneKey(engine, "same text", 1.2, "anchor instruct")).not.toBe(a);
  });

  it("omitting the instruct keeps the legacy key shape (engines without instruct)", () => {
    expect(computeSceneKey(engine, "同一句", 1.0, "")).toBe(computeSceneKey(engine, "同一句"));
    expect(computeSceneKey(engine, "同一句", 1.0, undefined)).toBe(
      computeSceneKey(engine, "同一句"),
    );
  });

  it("pins the plan/write key invariant for instruct-resolved scenes", () => {
    const dirs = [];
    try {
      const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
      dirs.push(dir);
      const cv3 = {
        ...engine,
        instructForScene: (scene) => (scene.visualType === "hook" ? "anchor instruct" : undefined),
      };
      const scene = { id: 1, visualType: "hook", voiceover: "DeepSeek just dropped a bombshell!" };
      const speed = resolveSceneSpeed(scene);
      const instruct = cv3.instructForScene(scene) ?? "";
      writeFileSync(join(dir, "scene-1.wav"), "fake audio");
      writeSceneMeta(dir, 1, {
        key: computeSceneKey(cv3, scene.voiceover, speed, instruct),
        duration: 1.5,
        engine: cv3.name,
        audioPath: join(dir, "scene-1.wav"),
      });
      // Same instruct → hit.
      expect(planTtsScenes(dir, [scene], cv3).approved).toHaveLength(1);
      // Instruct change → miss (regenerate, never replay the stale emotion).
      const changed = { ...cv3, instructForScene: () => "anchor instruct v2" };
      expect(planTtsScenes(dir, [scene], changed).pending).toHaveLength(1);
      // Engines without instructForScene (f5/edge/say) keep the legacy shape.
      const legacy = { name: engine.name, info: engine.info };
      const legacyScene = { id: 1, voiceover: "plain text" };
      writeFileSync(join(dir, "scene-1.wav"), "fake audio");
      writeSceneMeta(dir, 1, {
        key: computeSceneKey(legacy, legacyScene.voiceover),
        duration: 1.5,
        engine: legacy.name,
        audioPath: join(dir, "scene-1.wav"),
      });
      expect(planTtsScenes(dir, [legacyScene], legacy).approved).toHaveLength(1);
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });
});
