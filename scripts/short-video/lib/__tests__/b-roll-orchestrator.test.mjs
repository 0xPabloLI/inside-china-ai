import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  planScenes,
  runBrollStage,
  scenesRequiringGeneration,
  shouldSourceStock,
} from "../b-roll/orchestrator.mjs";
import { writeReport, emptyReport, readReport, reportPath, promptHash } from "../b-roll/report.mjs";

// ─── fixtures ───

function scene(overrides = {}) {
  return {
    id: "6",
    voiceover: "混合架构把记忆分三层",
    aiVideo: { prompt: "eight-dimension prompt" },
    ...overrides,
  };
}

function okGenerateMock() {
  const calls = [];
  const generate = async ({ jobs }) => {
    calls.push(jobs);
    return {
      ok: true,
      fatal: null,
      results: jobs.map((j) => ({ label: j.label, ok: true, file: j.output_path, error: null })),
    };
  };
  return { generate, calls };
}

function analyzerFor(scoreByPath) {
  return async (path) => ({
    relevance: scoreByPath[path] ?? null,
    relevanceReason: `scored ${scoreByPath[path] ?? "null"} for ${path}`,
  });
}

describe("planScenes routing (scenarios #1, #6, #7, #8, #9, #10, #28)", () => {
  test("#1/#2 no mediaStrategy anywhere -> everything skipped", () => {
    const plans = planScenes([scene({ aiVideo: undefined }), scene({ id: "7" })]);
    expect(plans.every((p) => p.action === "skip")).toBe(true);
  });

  test("#6 aiVideo present but strategy 'asset' -> ignored", () => {
    const plans = planScenes([scene({ mediaStrategy: "asset" })]);
    expect(plans[0].action).toBe("skip");
    expect(plans[0].reason).toMatch(/asset/);
  });

  test("#7 mediaOptOut beats b-roll strategy -> skip with warning", () => {
    const plans = planScenes([scene({ mediaStrategy: "b-roll", mediaOptOut: true })]);
    expect(plans[0].action).toBe("skip");
    expect(plans[0].reason).toMatch(/opt-out/);
    expect(plans[0].warn).toBe(true);
  });

  test("#8 'b-roll' strategy -> generate", () => {
    const plans = planScenes([scene({ mediaStrategy: "b-roll" })]);
    expect(plans[0].action).toBe("generate");
  });

  test("#9 asset-then-broll with sourced media -> skip", () => {
    const plans = planScenes([
      scene({ mediaStrategy: "asset-then-broll", media: { type: "image", path: "assets/x.png" } }),
    ]);
    expect(plans[0].action).toBe("skip");
    expect(plans[0].reason).toMatch(/has-media/);
  });

  test("#10 asset-then-broll without media -> generate", () => {
    const plans = planScenes([scene({ mediaStrategy: "asset-then-broll" })]);
    expect(plans[0].action).toBe("generate");
  });

  test("#28 planScenes never mutates its inputs", () => {
    const scenes = [
      scene({ mediaStrategy: "b-roll" }),
      scene({ id: "8", mediaStrategy: "asset-then-broll" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(scenes));

    planScenes(scenes);

    expect(scenes).toEqual(snapshot);
  });
});

describe("pipeline glue helpers (scenarios #1, #2, #8)", () => {
  test("#8 pure b-roll scenes are never sent to stock sourcing", () => {
    expect(shouldSourceStock(scene({ mediaStrategy: "b-roll" }))).toBe(false);
  });

  test("#8 asset-then-broll and strategy-free scenes still source stock", () => {
    expect(shouldSourceStock(scene({ mediaStrategy: "asset-then-broll" }))).toBe(true);
    expect(shouldSourceStock(scene({ mediaStrategy: "asset" }))).toBe(true);
    expect(shouldSourceStock(scene({ mediaStrategy: undefined, aiVideo: undefined }))).toBe(true);
  });

  test("#1/#2 content without any strategy has no B-roll work list", () => {
    expect(
      scenesRequiringGeneration([
        scene({ mediaStrategy: undefined, aiVideo: undefined }),
        scene({ id: "7", mediaStrategy: "asset", aiVideo: undefined }),
      ]),
    ).toEqual([]);
  });

  test("work list keeps scene order and honors sceneFilter / maxScenes", () => {
    const scenes = [
      scene({ id: "5", mediaStrategy: "b-roll" }),
      scene({ id: "6", mediaStrategy: "asset-then-broll" }),
      scene({ id: "8", mediaStrategy: "b-roll" }),
    ];
    expect(scenesRequiringGeneration(scenes).map((s) => s.id)).toEqual(["5", "6", "8"]);
    expect(scenesRequiringGeneration(scenes, "6").map((s) => s.id)).toEqual(["6"]);
    expect(scenesRequiringGeneration(scenes, null, 2).map((s) => s.id)).toEqual(["5", "6"]);
  });
});

describe("runBrollStage", () => {
  let root;
  let caseIndex = 0;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "broll-stage-"));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // Each test gets isolated content/output dirs so report state never leaks.
  function stageDirs() {
    caseIndex += 1;
    const contentDir = join(root, `case-${caseIndex}`, "content", "demo");
    const outputDir = join(root, `case-${caseIndex}`, "output", "demo");
    mkdirSync(contentDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    return { contentDir, outputDir };
  }

  function baseOpts(dirs, overrides = {}) {
    return {
      scenes: [],
      contentSlug: "demo",
      contentDir: dirs.contentDir,
      outputDir: dirs.outputDir,
      fileExists: () => true,
      generate: async () => ({ ok: true, fatal: null, results: [] }),
      resolveDeps: () => ({ ok: true, repo: "/repo", python: "/py", missing: [], message: null }),
      analyzer: async () => ({ relevance: 99, relevanceReason: "great" }),
      ...overrides,
    };
  }

  test("#2 zero generate scenes -> no report file, no dep probing, no generation", async () => {
    const dirs = stageDirs();
    let depsCalled = 0;
    let generateCalled = 0;
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene()],
        resolveDeps: () => {
          depsCalled += 1;
          return { ok: true, repo: "/r", python: "/p", missing: [], message: null };
        },
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(depsCalled).toBe(0);
    expect(generateCalled).toBe(0);
    expect(existsSync(reportPath(dirs.outputDir))).toBe(false);
    expect(result.counts.generated).toBe(0);
  });

  test("#25 multiple scenes go out as a single batch with distinct seeds", async () => {
    const dirs = stageDirs();
    const { generate, calls } = okGenerateMock();
    const scenes = [
      scene({ id: "5", mediaStrategy: "b-roll" }),
      scene({ id: "6", mediaStrategy: "b-roll" }),
    ];
    await runBrollStage(baseOpts(dirs, { scenes, generate }));
    expect(calls.length).toBe(1);
    const jobs = calls[0];
    expect(jobs.length).toBe(4);
    const scene5 = jobs.filter((j) => j.label.startsWith("scene-5-seed"));
    expect(scene5.length).toBe(2);
    expect(scene5[0].seed).not.toBe(scene5[1].seed);
    expect(jobs.every((j) => j.output_path.startsWith(dirs.contentDir))).toBe(true);
  });

  test("winner gets in-memory media per contract", async () => {
    const dirs = stageDirs();
    const { generate } = okGenerateMock();
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll" })];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate,
        analyzer: analyzerFor({
          [join(dirs.contentDir, "assets/b-roll/scene-6-seed1024.mp4")]: 72,
          [join(dirs.contentDir, "assets/b-roll/scene-6-seed1025.mp4")]: 31,
        }),
      }),
    );
    expect(result.counts.generated).toBe(1);
    const media = scenes[0].media;
    expect(media).toMatchObject({
      type: "video",
      path: "assets/b-roll/scene-6-seed1024.mp4",
      source: "AI-generated (FastVideo FastMetal-1.3B-QAD)",
      animation: "fade",
      overlay: 0.7,
      volume: 0,
      // Tier A output is 480×832, which checkResolution() flags as sub-720p.
      // Without this flag render-remotion.mjs would run per-frame Real-ESRGAN
      // on it (spec: a generated clip never reaches Real-ESRGAN).
      upscale: false,
    });

    const report = readReport(reportPath(dirs.outputDir));
    const entry = report.scenes["6"];
    expect(entry.status).toBe("won");
    expect(entry.round).toBe(1);
    expect(entry.promptHash).toBe(promptHash("eight-dimension prompt"));
    expect(entry.candidates.length).toBe(2);
    expect(entry.winner.file).toBe("scene-6-seed1024.mp4");
  });

  test("#15 all candidates fail the gate -> no assignment, failed entry with reasons", async () => {
    const dirs = stageDirs();
    const { generate } = okGenerateMock();
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll" })];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate,
        analyzer: async () => ({ relevance: 25, relevanceReason: "abstract glow" }),
      }),
    );
    expect(result.counts.failed).toBe(1);
    expect(scenes[0].media).toBeUndefined();
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.status).toBe("failed");
    expect(entry.candidates.every((c) => c.relevance === 25)).toBe(true);
    expect(entry.winner).toBeNull();
  });

  test("#18 cache hit: won entry + file present + unchanged prompt -> no generation", async () => {
    const dirs = stageDirs();
    const file = "scene-6-seed9999.mp4";
    const report = emptyReport("demo", 60);
    report.scenes["6"] = {
      strategy: "b-roll",
      promptHash: promptHash("cached prompt"),
      round: 1,
      status: "won",
      prompt: "cached prompt",
      voiceover: "v",
      candidates: [{ seed: 9999, file, relevance: 88, reason: "ok" }],
      winner: { seed: 9999, file },
    };
    writeReport(reportPath(dirs.outputDir), report);

    let generateCalled = 0;
    const scenes = [
      scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: "cached prompt" } }),
    ];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
        fileExists: () => true,
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.cached).toBe(1);
    expect(scenes[0].media.path).toBe(`assets/b-roll/${file}`);
  });

  test("#19 won entry but winner file deleted -> regenerated", async () => {
    const dirs = stageDirs();
    const report = emptyReport("demo", 60);
    report.scenes["6"] = {
      strategy: "b-roll",
      promptHash: promptHash("p"),
      round: 1,
      status: "won",
      prompt: "p",
      voiceover: "v",
      candidates: [],
      winner: { seed: 1, file: "scene-6-seed1.mp4" },
    };
    writeReport(reportPath(dirs.outputDir), report);

    const { generate, calls } = okGenerateMock();
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: "p" } })];
    await runBrollStage(baseOpts(dirs, { scenes, generate, fileExists: () => false }));
    expect(calls.length).toBe(1);
  });

  test("#20 force bypasses a valid cache", async () => {
    const dirs = stageDirs();
    const report = emptyReport("demo", 60);
    report.scenes["6"] = {
      strategy: "b-roll",
      promptHash: promptHash("p2"),
      round: 1,
      status: "won",
      prompt: "p2",
      voiceover: "v",
      candidates: [],
      winner: { seed: 2, file: "scene-6-seed2.mp4" },
    };
    writeReport(reportPath(dirs.outputDir), report);

    const { generate, calls } = okGenerateMock();
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: "p2" } })];
    await runBrollStage(baseOpts(dirs, { scenes, generate, force: true, fileExists: () => true }));
    expect(calls.length).toBe(1);
  });

  test("#22 exhausted rounds -> escalated, no generation, history kept", async () => {
    const dirs = stageDirs();
    const report = emptyReport("demo", 60);
    const history = [
      { seed: 11, file: "scene-6-seed11.mp4", relevance: 20, reason: "bad" },
      { seed: 12, file: "scene-6-seed12.mp4", relevance: 30, reason: "bad" },
    ];
    report.scenes["6"] = {
      strategy: "b-roll",
      promptHash: promptHash("old"),
      round: 3,
      status: "failed",
      prompt: "old",
      voiceover: "v",
      candidates: history,
      winner: null,
    };
    writeReport(reportPath(dirs.outputDir), report);

    let generateCalled = 0;
    const scenes = [
      scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: "new attempt" } }),
    ];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.escalated).toBe(1);
    expect(scenes[0].media).toBeUndefined();
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.status).toBe("escalated");
    expect(entry.candidates).toEqual(history);
  });

  test("#11 dependency probe failure -> clear error, nothing generated", async () => {
    const dirs = stageDirs();
    let generateCalled = 0;
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll" })];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        resolveDeps: () => ({
          ok: false,
          repo: "/missing",
          python: "/missing-py",
          missing: ["repo"],
          message: "FastVideo repo not found at /missing",
        }),
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(scenes[0].media).toBeUndefined();
    expect(result.depsError).toMatch(/repo not found/);
  });

  test("#159 pinned model paths resolved by deps reach the runner", async () => {
    const dirs = stageDirs();
    const calls = [];
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll" })];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        env: { HF_HUB_OFFLINE: "1" },
        resolveDeps: () => ({
          ok: true,
          repo: "/repo",
          python: "/py",
          modelRoot: "/models/root",
          mlxCheckpoint: "/models/ckpt",
          missing: [],
          message: null,
        }),
        generate: async (opts) => {
          calls.push(opts);
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].modelRoot).toBe("/models/root");
    expect(calls[0].mlxCheckpoint).toBe("/models/ckpt");
    expect(calls[0].env).toEqual({ HF_HUB_OFFLINE: "1" });
  });

  test("#159 unpinned models -> runner receives nulls (HF-cache default)", async () => {
    const dirs = stageDirs();
    const calls = [];
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll" })];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        resolveDeps: () => ({
          ok: true,
          repo: "/repo",
          python: "/py",
          modelRoot: null,
          mlxCheckpoint: null,
          missing: [],
          message: null,
        }),
        generate: async (opts) => {
          calls.push(opts);
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].modelRoot).toBeNull();
    expect(calls[0].mlxCheckpoint).toBeNull();
  });

  test("winner never overwrites existing scene.media", async () => {
    const dirs = stageDirs();
    const { generate } = okGenerateMock();
    const existing = { type: "image", path: "assets/manual.png" };
    const scenes = [scene({ id: "7", mediaStrategy: "b-roll", media: { ...existing } })];
    await runBrollStage(baseOpts(dirs, { scenes, generate }));
    expect(scenes[0].media).toEqual(existing);
  });
});
