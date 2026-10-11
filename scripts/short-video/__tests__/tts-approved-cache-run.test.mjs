/**
 * End-to-end cache trust behaviour of `generateTTSWithEngine` (#423).
 *
 * The Quality Gate and the aligner are mocked (their own behaviour is covered
 * by tts-quality-gate.test.mjs / tts-cache.test.mjs); the cache layer under
 * test is REAL. Behaviour pinned here:
 *
 *  - an aborted run keeps the takes that already passed: the next run reuses
 *    them as approved hits and never pays for their GPU generation again;
 *  - a compensation/reroll take that fails the gate is never promoted, never
 *    overwrites the existing audio (regen rounds run in staging) and leaves
 *    the original take + its record intact;
 *  - gate-skipped takes are explicit candidates, never approved;
 *  - a legacy meta is re-verified locally (no GPU) and upgraded to approved;
 *  - infra-unverifiable takes become candidates while passed scenes stay
 *    approved, then the run still fails closed;
 *  - the alignment tail-cut re-binds an approved entry to the cut bytes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
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
  SCENE_META_VERSION,
  computeAudioDigest,
  computeSceneKey,
  planTtsScenes,
  writeCandidateSceneMeta,
} from "../lib/tts/cache.mjs";

const ENGINE = { name: "mock-kaggle-cuda", info: "Mock engine (#423 test)" };

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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("approved cache survives aborted runs (#423)", () => {
  let dir;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "tts-423-"));
    delete process.env.TTS_SKIP_QUALITY_GATE;
    runForcedAlignment.mockResolvedValue({ skipped: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TTS_SKIP_QUALITY_GATE;
  });

  it("keeps gate-passed takes of an aborted run; the next run reuses them with zero GPU", async () => {
    const engine = makeEngine();
    const scenes = [
      { id: 1, voiceover: "Scene one is fine." },
      { id: 2, voiceover: "Scene two will fail." },
    ];
    runTtsQualityGate.mockImplementation(async (_scenes, results) => ({
      passed: results.every((r) => r.sceneId === 1),
      failedCount: results.filter((r) => r.sceneId !== 1).length,
      evaluations: results.map((r) => ({
        sceneId: r.sceneId,
        passed: r.sceneId === 1,
        wpm: 150,
        issues: r.sceneId === 1 ? [] : ["Truncation detected: missing tail word(s) [two]"],
        failureClass: r.sceneId === 1 ? null : "acoustic",
      })),
    }));

    await expect(
      generateTTSWithEngine(scenes, dir, engine, {
        useCache: true,
        runAlignment: false,
        maxRetries: 0,
      }),
    ).rejects.toThrow(/TTS_ACOUSTIC_HARD_BLOCK/);

    // Scene 1 passed → approved before the block; scene 2 → candidate only.
    const meta1 = readJson(join(dir, "scene-1.tts-meta.json"));
    expect(meta1.status).toBe("approved");
    expect(meta1.metaVersion).toBe(SCENE_META_VERSION);
    expect(meta1.audioDigest).toBe(computeAudioDigest(join(dir, "scene-1.wav")));
    expect(existsSync(join(dir, "scene-2.tts-meta.json"))).toBe(false);
    expect(readJson(join(dir, "scene-2.tts-candidate.json")).reason).toBe("gate-failed:acoustic");

    // Second run: scene 1 is an approved hit (zero GPU); scene 2 is
    // re-verified locally and still fails — no generation at all.
    engine.generatedSceneIds.length = 0;
    await expect(
      generateTTSWithEngine(scenes, dir, engine, {
        useCache: true,
        runAlignment: false,
        maxRetries: 0,
      }),
    ).rejects.toThrow(/TTS_ACOUSTIC_HARD_BLOCK/);
    expect(engine.generatedSceneIds).toEqual([]);
  });

  it("does not promote a compensation take that fails the gate, and keeps the original bytes", async () => {
    const engine = makeEngine();
    const scenes = [
      { id: 2, visualType: "narrative", voiceover: "A slow narrative line that needs speed." },
    ];
    let call = 0;
    runTtsQualityGate.mockImplementation(async (_scenes, results) => {
      const c = call++;
      return {
        passed: false,
        failedCount: results.length,
        evaluations: results.map((r) =>
          c === 0
            ? {
                sceneId: r.sceneId,
                passed: false,
                wpm: 120,
                issues: ["Pacing too slow: 120 WPM (minimum acceptable: 135 WPM)"],
                failureClass: "pacing",
              }
            : {
                sceneId: r.sceneId,
                passed: false,
                wpm: 130,
                issues: ["Truncation detected: missing tail word(s) [speed]"],
                failureClass: "acoustic",
              },
        ),
      };
    });

    await expect(
      generateTTSWithEngine(scenes, dir, engine, {
        useCache: true,
        runAlignment: false,
      }),
    ).rejects.toThrow(/TTS_ACOUSTIC_HARD_BLOCK/);

    // The initial take (written in the audio dir) is untouched: the failed
    // compensation take went to staging and never landed.
    expect(readFileSync(join(dir, "scene-2.wav"), "utf8")).toBe("take-2-1");
    expect(existsSync(join(dir, "scene-2.tts-meta.json"))).toBe(false);
    expect(readJson(join(dir, "scene-2.tts-candidate.json")).reason).toBe("gate-failed:pacing");
  });

  it("a failed self-heal reroll never overwrites the take it was retrying", async () => {
    const engine = makeEngine();
    const scenes = [{ id: 3, voiceover: "A take whose words cannot be trusted." }];
    runTtsQualityGate.mockImplementation(async (_scenes, results) => ({
      passed: false,
      failedCount: results.length,
      evaluations: results.map((r) => ({
        sceneId: r.sceneId,
        passed: false,
        wpm: 150,
        issues: ["Low text similarity: 42.0% (threshold: 55%)"],
        failureClass: "acoustic",
      })),
    }));

    await expect(
      generateTTSWithEngine(scenes, dir, engine, {
        useCache: true,
        runAlignment: false,
        maxRetries: 1,
      }),
    ).rejects.toThrow(/TTS_ACOUSTIC_HARD_BLOCK/);

    // Original take intact; the reroll take (take-3-2) never entered the dir.
    expect(readFileSync(join(dir, "scene-3.wav"), "utf8")).toBe("take-3-1");
    expect(existsSync(join(dir, "scene-3.tts-meta.json"))).toBe(false);
    expect(readJson(join(dir, "scene-3.tts-candidate.json")).reason).toBe("gate-failed:acoustic");
  });

  it("records skip-gate takes as candidates (never approved) and re-verifies them next run", async () => {
    process.env.TTS_SKIP_QUALITY_GATE = "1";
    const engine = makeEngine();
    const scenes = [{ id: 1, voiceover: "第一句" }];

    await generateTTSWithEngine(scenes, dir, engine, { useCache: true, runAlignment: false });
    expect(existsSync(join(dir, "scene-1.tts-meta.json"))).toBe(false);
    expect(readJson(join(dir, "scene-1.tts-candidate.json")).reason).toBe("gate-skipped");

    engine.generatedSceneIds.length = 0;
    await generateTTSWithEngine(scenes, dir, engine, { useCache: true, runAlignment: false });
    expect(engine.generatedSceneIds).toEqual([]);
    // Skip-gate runs can never bless a take.
    expect(existsSync(join(dir, "scene-1.tts-meta.json"))).toBe(false);
  });

  it("upgrades a legacy meta through local re-verification without regenerating", async () => {
    const scene = { id: 1, voiceover: "Legacy take." };
    writeFileSync(join(dir, "scene-1.wav"), "legacy-bytes");
    // Pre-#423 on-disk shape: no status/version/digest.
    writeFileSync(
      join(dir, "scene-1.tts-meta.json"),
      JSON.stringify({
        key: computeSceneKey(ENGINE, scene.voiceover),
        duration: 3.5,
        engine: ENGINE.name,
        audioPath: join(dir, "scene-1.wav"),
      }),
    );
    passAll();
    const engine = makeEngine();

    const results = await generateTTSWithEngine([scene], dir, engine, {
      useCache: true,
      runAlignment: false,
    });

    expect(engine.generatedSceneIds).toEqual([]);
    expect(results.map((r) => r.sceneId)).toEqual([1]);
    const meta = readJson(join(dir, "scene-1.tts-meta.json"));
    expect(meta.status).toBe("approved");
    expect(meta.metaVersion).toBe(SCENE_META_VERSION);
    expect(meta.audioDigest).toBe(computeAudioDigest(join(dir, "scene-1.wav")));
    expect(existsSync(join(dir, "scene-1.tts-candidate.json"))).toBe(false);
  });

  it("promotes passed scenes, records infra-unverifiable takes as candidates, then fails closed", async () => {
    const engine = makeEngine();
    const scenes = [
      { id: 1, voiceover: "Scene one is fine." },
      { id: 2, voiceover: "Scene two cannot be verified." },
    ];
    runTtsQualityGate.mockImplementation(async (_scenes, results) => ({
      passed: false,
      failedCount: results.length,
      evaluations: results.map((r) => ({
        sceneId: r.sceneId,
        passed: r.sceneId === 1,
        wpm: 150,
        issues:
          r.sceneId === 1
            ? []
            : ["ASR unavailable (asr_unavailable): back-transcription could not run"],
        failureClass: r.sceneId === 1 ? null : "infra",
      })),
    }));

    await expect(
      generateTTSWithEngine(scenes, dir, engine, {
        useCache: true,
        runAlignment: false,
        maxRetries: 1,
      }),
    ).rejects.toThrow(/could not verify/);

    expect(readJson(join(dir, "scene-1.tts-meta.json")).status).toBe("approved");
    expect(existsSync(join(dir, "scene-2.tts-meta.json"))).toBe(false);
    expect(readJson(join(dir, "scene-2.tts-candidate.json")).reason).toBe("gate-failed:infra");
  });

  it("re-binds an approved entry to the bytes the alignment tail-cut produced", async () => {
    passAll();
    const engine = makeEngine();
    const scenes = [{ id: 1, voiceover: "Scene one is fine." }];
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

    await generateTTSWithEngine(scenes, dir, engine, { useCache: true, runAlignment: true });

    const meta = readJson(join(dir, "scene-1.tts-meta.json"));
    expect(meta.audioDigest).toBe(computeAudioDigest(join(dir, "scene-1.wav")));
    expect(meta.duration).toBe(2.0);
    expect(planTtsScenes(dir, scenes, engine).approved).toHaveLength(1);
  });

  it("keeps a compensated candidate's speed through re-verification (#252 interaction)", async () => {
    const scene = {
      id: 1,
      visualType: "hook",
      voiceover: "China just dropped a model that beats GPT.",
    };
    writeFileSync(join(dir, "scene-1.wav"), "compensated-take");
    writeCandidateSceneMeta(dir, 1, {
      key: computeSceneKey(ENGINE, scene.voiceover, 1.2),
      duration: 3.0,
      engine: ENGINE.name,
      reason: "gate-failed:pacing",
      ttsSpeed: 1.2,
    });
    passAll();
    const engine = makeEngine();

    await generateTTSWithEngine([scene], dir, engine, { useCache: true, runAlignment: false });

    // The hook floor plans 1.1x for an in-band hook, but the take on disk is
    // already 1.2x — the loop must not pay for a SLOWER take.
    expect(engine.generatedSceneIds).toEqual([]);
    const meta = readJson(join(dir, "scene-1.tts-meta.json"));
    // The take on disk IS the 1.2x compensation — relabelling it 1.0x would
    // make a later hand-set ttsSpeed=1.2 regenerate audio that already exists.
    expect(meta.ttsSpeed).toBe(1.2);
    expect(planTtsScenes(dir, [scene], engine).approved).toHaveLength(1);
  });

  it("still floors a candidate take the hook rule plans ABOVE its current speed", async () => {
    const scene = {
      id: 1,
      visualType: "hook",
      voiceover: "China just dropped a model that beats GPT.",
    };
    writeFileSync(join(dir, "scene-1.wav"), "uncompensated-take");
    writeCandidateSceneMeta(dir, 1, {
      key: computeSceneKey(ENGINE, scene.voiceover, 1.0),
      duration: 3.0,
      engine: ENGINE.name,
      reason: "infra:asr-unavailable",
      ttsSpeed: 1.0,
    });
    passAll();
    const engine = makeEngine();

    await generateTTSWithEngine([scene], dir, engine, { useCache: true, runAlignment: false });

    // Planned 1.1x > current 1.0x → the floor is enforced with a real take.
    expect(engine.generatedSceneIds).toEqual([1]);
    const meta = readJson(join(dir, "scene-1.tts-meta.json"));
    expect(meta.ttsSpeed).toBe(1.1);
    expect(meta.audioDigest).toBe(computeAudioDigest(join(dir, "scene-1.wav")));
  });

  it("hands the PRIMARY round the audio dir (engine identity, #267) and regen rounds a staging dir (#423)", async () => {
    const scene = { id: 2, visualType: "narrative", voiceover: "A slow narrative line." };
    const calls = [];
    const engine = makeEngine();
    const baseGenerate = engine.generate.bind(engine);
    engine.generate = async (scenes, outputDir) => {
      calls.push(outputDir);
      return baseGenerate(scenes, outputDir);
    };
    let call = 0;
    runTtsQualityGate.mockImplementation(async (_scenes, results) => {
      const c = call++;
      return {
        passed: c > 0,
        failedCount: c > 0 ? 0 : results.length,
        evaluations: results.map((r) => ({
          sceneId: r.sceneId,
          passed: c > 0,
          wpm: c > 0 ? 150 : 120,
          issues: c > 0 ? [] : ["Pacing too slow: 120 WPM (minimum acceptable: 135 WPM)"],
          failureClass: c > 0 ? null : "pacing",
        })),
      };
    });

    await generateTTSWithEngine([scene], dir, engine, { useCache: true, runAlignment: false });

    // First (primary) call writes straight into the audio dir — the Kaggle
    // slug derives from it (#267) and `.kaggle-kernel` bookkeeping lives
    // there (#420). The compensation round stages instead.
    expect(calls[0]).toBe(dir);
    expect(calls[1]).toContain(".regen-staging-");
  });

  it("cleans the reroll staging dir when the retry gate itself throws (no paid bytes left behind)", async () => {
    const engine = makeEngine();
    const scenes = [{ id: 3, voiceover: "A take that will fail acoustically." }];
    let call = 0;
    runTtsQualityGate.mockImplementation(async (_scenes, results) => {
      const c = call++;
      if (c === 1) throw new Error("verifier crashed mid-gate");
      return {
        passed: false,
        failedCount: results.length,
        evaluations: results.map((r) => ({
          sceneId: r.sceneId,
          passed: false,
          wpm: 150,
          issues: ["Truncation detected: missing tail word(s) [fail]"],
          failureClass: "acoustic",
        })),
      };
    });

    // A gate crash mid-retry keeps the pre-existing non-strict semantics
    // (warn-and-continue); what must hold is that the reroll take generated
    // into staging does not leak into the audio output.
    await generateTTSWithEngine(scenes, dir, engine, {
      useCache: true,
      runAlignment: false,
      maxRetries: 1,
    });

    const leftovers = readdirSync(dir).filter((f) => f.includes(".regen-staging-"));
    expect(leftovers).toEqual([]);
    // The take on disk is the FIRST take; the crashed reroll never landed.
    expect(readFileSync(join(dir, "scene-3.wav"), "utf8")).toBe("take-3-1");
    expect(readJson(join(dir, "scene-3.tts-candidate.json")).reason).toBe("gate-failed:acoustic");
  });
  it("records skip-gate takes as candidates even when the run aborts on missing audio (#241 guard)", async () => {
    process.env.TTS_SKIP_QUALITY_GATE = "1";
    delete process.env.TTS_ALLOW_PARTIAL_TTS;
    const engine = makeEngine();
    // Simulates a kernel that produced only scene 1 (scene 2 timed out).
    engine.generate = async (scenes, outputDir) =>
      scenes
        .filter((s) => s.id === 1)
        .map((s) => {
          const audioPath = join(outputDir, `scene-${s.id}.wav`);
          writeFileSync(audioPath, "partial-take");
          return { sceneId: s.id, audioPath, duration: 4.0 };
        });
    const scenes = [
      { id: 1, voiceover: "Scene one landed." },
      { id: 2, voiceover: "Scene two timed out." },
    ];

    await expect(
      generateTTSWithEngine(scenes, dir, engine, { useCache: true, runAlignment: false }),
    ).rejects.toThrow(/produced no audio for scene\(s\) 2/);

    // The take that WAS paid for must be re-verifiable next run, not lost.
    expect(readJson(join(dir, "scene-1.tts-candidate.json")).reason).toBe("gate-skipped");
    expect(existsSync(join(dir, "scene-1.tts-meta.json"))).toBe(false);
    delete process.env.TTS_SKIP_QUALITY_GATE;
  });
});
