/**
 * Tests for the TTS cache & cost preview (#953).
 *
 * The plan itself is stated before the spend: what will regenerate, WHY each
 * scene missed, how much text that is, and — per engine — roughly how long
 * the batch will take. One formatter feeds all three surfaces (the pipeline
 * log before engine.generate, `main.mjs --tts-plan`, `verify-video.mjs --pre`)
 * so they cannot drift into describing different plans.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildTtsPlan,
  estimateSpeechSeconds,
  estimateTtsSpend,
  formatPendingGenerationLog,
  formatTtsPlan,
  prepareScenesForPlan,
} from "../lib/tts/plan-report.mjs";
import { computeSceneKey, writeSceneMeta } from "../lib/tts/cache.mjs";
import { previewTtsPlan } from "../lib/tts/preview.mjs";
import { generateTTSWithEngine } from "../lib/tts/registry.mjs";

const scene = (id, voiceover = "one two three four") => ({
  id,
  voiceover,
  visualType: "narrative",
});

describe("estimateTtsSpend (#953)", () => {
  it("uses the documented Kaggle batch baseline plus a per-scene term", () => {
    const scenes = [scene(1), scene(2), scene(3)];
    const spend = estimateTtsSpend("cosyvoice3-kaggle-cuda", scenes);
    expect(spend.kind).toBe("batch");
    // runbook: Kaggle ~8-10 min/batch; per-scene term comes from the issue's
    // measured batch shape (~15 s/scene).
    expect(spend.minSeconds).toBe(480 + 3 * 15);
    expect(spend.maxSeconds).toBe(600 + 3 * 15);
  });

  it("derives local-engine time from the documented RTF and estimated speech", () => {
    // 6 latin words at the documented 2.4 words/s floor → 2.5 s of speech.
    const scenes = [scene(1, "one two three four"), scene(2, "one two")];
    expect(estimateSpeechSeconds(scenes)).toBeCloseTo(6 / 2.4, 5);
    const spend = estimateTtsSpend("cosyvoice3-mlx", scenes);
    expect(spend.kind).toBe("rtf");
    expect(spend.minSeconds).toBeCloseTo((6 / 2.4) * 0.64, 5);
    expect(spend.maxSeconds).toBeCloseTo((6 / 2.4) * 0.87, 5);
  });

  it("estimates F5 with its measured RTF", () => {
    const scenes = [scene(1, "one two three four")];
    const spend = estimateTtsSpend("f5-mlx", scenes);
    expect(spend.kind).toBe("rtf");
    expect(spend.minSeconds).toBeCloseTo((4 / 2.4) * 1.78, 5);
  });

  it("does not invent a number for an engine without a baseline", () => {
    const spend = estimateTtsSpend("edge-tts", [scene(1)]);
    expect(spend.kind).toBe("unknown");
    expect(spend.minSeconds).toBeNull();
    expect(spend.maxSeconds).toBeNull();
    expect(spend.note).toMatch(/no published baseline/i);
  });
});

describe("buildTtsPlan / formatTtsPlan (#953)", () => {
  const engine = { name: "cosyvoice3-kaggle-cuda", info: "CosyVoice3-Kaggle-CUDA (P100)" };
  const plan = {
    approved: [{ sceneId: 1, duration: 3.2, ttsSpeed: 1 }],
    candidates: [{ sceneId: 4, reason: "gate-failed:asr" }],
    pending: [scene(2), scene(3, "one two")],
    misses: [
      { sceneId: 2, reason: "text-changed" },
      { sceneId: 3, reason: "missing-audio" },
    ],
  };
  const scenes = [scene(1), scene(2), scene(3, "one two"), { id: 4, voiceover: "three four" }];

  it("reports counts, per-scene miss reasons and pending text size", () => {
    const report = buildTtsPlan({ engine, scenes, plan });
    expect(report.totalScenes).toBe(4);
    expect(report.approvedCount).toBe(1);
    expect(report.candidateCount).toBe(1);
    expect(report.pendingCount).toBe(2);
    expect(report.pending).toEqual([
      { sceneId: 2, reason: "text-changed", chars: "one two three four".length },
      { sceneId: 3, reason: "missing-audio", chars: "one two".length },
    ]);
    expect(report.pendingChars).toBe("one two three four".length + "one two".length);
  });

  it("formats one line per pending scene with reason and estimated spend", () => {
    const text = formatTtsPlan(buildTtsPlan({ engine, scenes, plan }));
    expect(text).toContain("TTS Cache & Cost Plan");
    expect(text).toContain("scene 2 (text-changed, 18 chars)");
    expect(text).toContain("scene 3 (missing-audio, 7 chars)");
    expect(text).toContain("1 approved");
    expect(text).toContain("1 candidate");
    expect(text).toMatch(/estimated TTS cost/i);
  });

  it("says nothing will generate when every scene is approved", () => {
    const fullHit = { approved: plan.approved, candidates: [], pending: [], misses: [] };
    const text = formatTtsPlan(buildTtsPlan({ engine, scenes: [scene(1)], plan: fullHit }));
    expect(text).toMatch(/nothing to generate/i);
  });

  it("treats a missing misses array as unknown reasons instead of crashing (mocked plans)", () => {
    const mocked = { approved: [], candidates: [], pending: [scene(9)] };
    const report = buildTtsPlan({ engine, scenes: [scene(9)], plan: mocked });
    expect(report.pending).toEqual([
      { sceneId: 9, reason: "unknown", chars: "one two three four".length },
    ]);
  });

  it("surfaces the pacing precheck when given one", () => {
    const pacing = {
      compensations: [
        {
          scene: { id: 1 },
          speed: 1.1,
          measuredWpm: 132,
          reason: "132 WPM < 150",
          originalPassed: true,
        },
      ],
      rerolls: [],
      advisory: [],
    };
    const report = buildTtsPlan({ engine, scenes, plan, pacing });
    const text = formatTtsPlan(report);
    expect(text).toMatch(/pacing precheck/i);
    expect(text).toContain("scene 1");
    expect(text).toContain("132 WPM");
    expect(text).toContain("1.1x");
  });

  it("marks a cache-disabled run as regenerating everything", () => {
    const report = buildTtsPlan({ engine, scenes, plan: null, useCache: false });
    expect(report.pendingCount).toBe(4);
    const lines = formatPendingGenerationLog(report);
    expect(lines.join("\n")).toMatch(/cache disabled/i);
    expect(lines.join("\n")).toContain("scene 1");
  });
});

describe("formatPendingGenerationLog (#953)", () => {
  const engine = { name: "cosyvoice3-kaggle-cuda", info: "CosyVoice3-Kaggle-CUDA (P100)" };

  it("lists each pending scene with reason before the batch", () => {
    const plan = {
      approved: [],
      candidates: [],
      pending: [scene(5), scene(6)],
      misses: [
        { sceneId: 5, reason: "missing-audio" },
        { sceneId: 6, reason: "text-changed" },
      ],
    };
    const report = buildTtsPlan({ engine, scenes: [scene(5), scene(6)], plan });
    const lines = formatPendingGenerationLog(report);
    expect(lines.some((l) => /scene 5\b.*missing-audio/.test(l))).toBe(true);
    expect(lines.some((l) => /scene 6\b.*text-changed/.test(l))).toBe(true);
    expect(lines.join("\n")).toMatch(/merge/i);
  });
});

describe("prepareScenesForPlan (#953)", () => {
  it("clones and applies the same in-memory normalizations as the pipeline", async () => {
    const scenes = [
      {
        id: 1,
        voiceover: "DeepSeek just dropped V4.1 Flash for ¥445.",
        texts: { subject: "DeepSeek" },
      },
    ];
    const prepared = await prepareScenesForPlan(scenes, {});
    // Clone, not a mutation: verify-video's scene checks must see authored text.
    expect(scenes[0].ttsText).toBeUndefined();
    expect(scenes[0].voiceover).toContain("¥445");
    // TTS normalization writes the spoken track; currency normalization
    // inserts the USD dual annotation.
    expect(prepared[0].ttsText).toContain("V four point one");
    expect(prepared[0].voiceover).toContain("¥445");
    expect(prepared[0].voiceover).toContain("$");
  });
});

describe("generateTTSWithEngine logs the plan before the batch (#953)", () => {
  it("prints pending scene ids + reasons before engine.generate runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-plan-log-"));
    let logsAtGenerate = -1;
    const engine = {
      name: "fake",
      info: "Fake engine (speed=1)",
      generatedSceneIds: [],
      async generate(scenes, outputDir) {
        logsAtGenerate = logs.length;
        this.generatedSceneIds.push(...scenes.map((s) => s.id));
        return scenes.map((s) => {
          const audioPath = join(outputDir, `scene-${s.id}.wav`);
          writeFileSync(audioPath, `wav-for-${s.id}`);
          return { sceneId: s.id, audioPath, duration: 1.5 };
        });
      },
    };
    const scenes = [scene(1, "first line"), scene(2, "second line")];

    const logs = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      await generateTTSWithEngine(scenes, dir, engine, { runAlignment: false });
    } finally {
      spy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }

    const planLines = logs.filter((l) => /TTS spend plan|scene [12]\b/.test(l));
    // Empty cache → both miss for a concrete reason; "unknown" would mean the
    // misses wiring broke, so it must not satisfy the assertion.
    expect(planLines.join("\n")).toMatch(/scene 1\b.*missing-audio/);
    expect(planLines.join("\n")).toMatch(/scene 2\b.*missing-audio/);
    // The log is a PRE-generation notice: every plan line already exists when
    // engine.generate() is entered (it writes the audio the plan priced).
    expect(logsAtGenerate).toBeGreaterThan(0);
    const headerIdx = logs.findIndex((l) => l.includes("TTS spend plan"));
    const sceneIdx = logs.findIndex((l) => /scene 1\b.*missing-audio/.test(l));
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(sceneIdx).toBeGreaterThanOrEqual(0);
    expect(headerIdx).toBeLessThan(logsAtGenerate);
    expect(sceneIdx).toBeLessThan(logsAtGenerate);
  });
});

describe("keys match the real cache after preview normalization", () => {
  it("planning with prepared scenes hits a take approved from authored text", async () => {
    const engine = { name: "cosyvoice3-mlx", info: "CosyVoice3-MLX (speed=1)" };
    const dir = mkdtempSync(join(tmpdir(), "tts-plan-normalize-"));
    try {
      const authored = [
        { id: 1, voiceover: "DeepSeek just dropped V4.1 Flash today.", visualType: "narrative" },
      ];
      const prepared = await prepareScenesForPlan(authored, {});
      // Pin the normalization itself: both write + plan use prepared.ttsText,
      // so a no-op prepareScenesForPlan would otherwise stay green.
      expect(prepared[0].ttsText).toContain("V four point one");
      expect(computeSceneKey(engine, prepared[0].ttsText)).not.toBe(
        computeSceneKey(engine, authored[0].voiceover),
      );
      const key = computeSceneKey(engine, prepared[0].ttsText);
      writeFileSync(join(dir, "scene-1.wav"), "fake wav");
      writeSceneMeta(dir, 1, {
        key,
        duration: 3.2,
        engine: engine.name,
        audioPath: join(dir, "scene-1.wav"),
      });

      const { planTtsScenes } = await import("../lib/tts/cache.mjs");
      const plan = planTtsScenes(dir, prepared, engine);
      expect(plan.approved.map((a) => a.sceneId)).toEqual([1]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("previewTtsPlan mirrors the real run (#953)", () => {
  const engine = { name: "fake", info: "Fake engine (speed=1)" };

  it("honours TTS_NO_CACHE=1 instead of reporting cache hits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-preview-nocache-"));
    try {
      const scenes = [scene(1), scene(2)];
      const { report } = await previewTtsPlan({
        scenes,
        audioDir: dir,
        engine,
        env: { TTS_NO_CACHE: "1" },
      });
      expect(report.useCache).toBe(false);
      expect(report.pendingCount).toBe(2);
      expect(report.pacing).toBeNull();
      expect(report.pacingSkipped).toMatch(/TTS_NO_CACHE/);
      expect(formatTtsPlan(report)).toMatch(/cache disabled/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips the pacing precheck when the run would skip the quality gate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-preview-skipgate-"));
    try {
      const hook = {
        id: 1,
        visualType: "hook",
        voiceover: "one two three four five six seven eight nine ten",
      };
      writeFileSync(join(dir, "scene-1.wav"), "fake wav");
      writeSceneMeta(dir, 1, {
        key: computeSceneKey(engine, hook.voiceover, 1.0),
        duration: 3.0,
        engine: engine.name,
        audioPath: join(dir, "scene-1.wav"),
      });
      const { report } = await previewTtsPlan({
        scenes: [hook],
        audioDir: dir,
        engine,
        env: { TTS_SKIP_QUALITY_GATE: "1" },
      });
      expect(report.pacing).toBeNull();
      expect(report.pacingSkipped).toMatch(/quality gate skipped/i);
      expect(formatTtsPlan(report)).toMatch(/pacing precheck: skipped/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("judges approved takes at the speed recorded on disk, not the baseline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-preview-speed-"));
    try {
      const hook = {
        id: 1,
        visualType: "hook",
        voiceover: "one two three four five six seven eight nine ten",
      };
      writeFileSync(join(dir, "scene-1.wav"), "compensated-take");
      writeSceneMeta(dir, 1, {
        key: computeSceneKey(engine, hook.voiceover, 1.2),
        duration: 3.0,
        engine: engine.name,
        audioPath: join(dir, "scene-1.wav"),
        ttsSpeed: 1.2,
      });
      const { report } = await previewTtsPlan({ scenes: [hook], audioDir: dir, engine, env: {} });
      expect(report.approvedCount).toBe(1);
      expect(report.pacing.compensations).toHaveLength(1);
      // Without seeding scene.ttsSpeed from the take, the hook floor would
      // print 1.1x; the run plans 1.2x because that is what is on disk.
      expect(report.pacing.compensations[0].speed).toBe(1.2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds the static one-breath hint for pending scenes (no prosody probe)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-preview-breath-"));
    try {
      const longLine = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
      const scenes = [scene(1, longLine)];
      const { report } = await previewTtsPlan({ scenes, audioDir: dir, engine, env: {} });
      expect(report.hints).toHaveLength(1);
      expect(report.hints[0]).toMatch(/one-breath/i);
      expect(formatTtsPlan(report)).toContain("📏");
      // The authored array is never mutated.
      expect(scenes[0].ttsText).toBeUndefined();
      expect(scenes[0].ttsSpeed).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
