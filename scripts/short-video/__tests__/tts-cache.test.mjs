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
  writeSceneMeta,
  alignmentCacheState,
  computeAlignmentSignature,
} from "../lib/tts/cache.mjs";
import { generateTTSWithEngine } from "../lib/tts/registry.mjs";
import { runForcedAlignment } from "../lib/tts/post-process.mjs";

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
    const qwen = { name: "qwen-tts", info: "Qwen3-TTS (voice=Serene)" };
    expect(computeSceneKey(engine, "文本")).not.toBe(computeSceneKey(qwen, "文本"));
    expect(computeSceneKey(engine, "文本")).not.toBe(
      computeSceneKey({ ...engine, info: "...speed=1.2)" }, "文本"),
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

  it("plans every scene as pending when no meta exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-"));
    dirs.push(dir);
    const scenes = [{ id: 1, voiceover: "第一句" }, { id: 2, voiceover: "第二句" }];

    const plan = planTtsScenes(dir, scenes, engine);
    expect(plan.pending).toHaveLength(2);
    expect(plan.cached).toHaveLength(0);
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
    expect(plan.cached).toEqual([
      { sceneId: 1, audioPath: join(dir, "scene-1.wav"), duration: 3.21, cached: true },
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
    expect(plan.cached).toHaveLength(0);
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
    expect(plan.cached).toHaveLength(0);
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
    expect(second).toEqual(first);
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

    const edited = [{ id: 1, voiceover: "第一句" }, { id: 2, voiceover: "改写后的第二句" }];
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

  it("writes sidecar meta next to the generated audio", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cache-meta-"));
    dirs.push(dir);
    const engine = makeEngine();
    const scenes = [{ id: 4, voiceover: "第一句" }];
    await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    const meta = JSON.parse(readFileSync(join(dir, "scene-4.tts-meta.json"), "utf8"));
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

    execSync(`ffmpeg -y -f lavfi -i sine=frequency=500:duration=0.3 "${results[0].audioPath}" 2>/dev/null`);
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
    writeFileSync(join(dir, "subtitle-timing.meta.json"), JSON.stringify({
      signature: computeAlignmentSignature(scenes, results),
    }));

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
    writeFileSync(join(dir, "subtitle-timing.meta.json"), JSON.stringify({
      signature: "stale-signature",
    }));

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
    expect(plan.cached[0].audioPath).toBe(join(dir, "scene-1.mp3"));
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
    await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    const second = await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    expect(engine.calls).toBe(1);
    expect(second[0].audioPath).toBe(join(dir, "scene-1.mp3"));
  });
});
