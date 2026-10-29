import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  planScenes,
  assignWinner,
  buildGenerationPlan,
  runBrollStage,
  scenesRequiringGeneration,
  shouldSourceStock,
} from "../b-roll/orchestrator.mjs";
import { writeReport, emptyReport, readReport, reportPath, promptHash } from "../b-roll/report.mjs";
import {
  BRAND_BASE_PROMPT,
  PROMPT_INJECTION_VERSION,
  composeGenerationPrompt,
} from "../b-roll/prompt-injection.mjs";

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
  test("#355 no mediaStrategy / legacy 'asset' -> default chain (approval-gated later)", () => {
    const noStrategy = scene({ aiVideo: undefined });
    const legacyAsset = scene({ id: "7", mediaStrategy: "asset", aiVideo: undefined });
    const plans = planScenes([noStrategy, legacyAsset]);
    expect(plans.map((p) => p.action)).toEqual(["generate", "generate"]);
    expect(plans.every((p) => p.reason === "chain-fallback")).toBe(true);
    expect(plans.every((p) => p.plan.auto === true && p.plan.form === "auto")).toBe(true);
  });

  test("#355 the chain is not runnable without approval", () => {
    const scenes = [scene({ aiVideo: undefined })];
    expect(scenesRequiringGeneration(scenes)).toEqual([]);
    expect(scenesRequiringGeneration(scenes, null, Infinity, { approveAuto: true })).toEqual(
      scenes,
    );
  });

  test("#355 source-only sources but never generates", () => {
    const plans = planScenes([scene({ mediaStrategy: "source-only" })]);
    expect(plans[0].action).toBe("skip");
    expect(plans[0].reason).toBe("source-only-strategy");
    expect(shouldSourceStock(scene({ mediaStrategy: "source-only" }))).toBe(true);
  });

  test("#355 chain eligibility mirrors sourcing eligibility (hook / CSS-only never auto-generate)", () => {
    const plans = planScenes([
      scene({ id: "1", visualType: "hook", aiVideo: undefined }),
      scene({ id: "2", layout: "stacked-cards", aiVideo: undefined }),
      scene({ id: "3", visualType: "cta", aiVideo: undefined }),
    ]);
    expect(plans.every((p) => p.action === "skip" && p.reason === "not-media-eligible")).toBe(true);
  });

  test("#355 explicit b-roll is not auto and does not need approval", () => {
    const plans = planScenes([scene({ mediaStrategy: "b-roll" })]);
    expect(plans[0].action).toBe("generate");
    expect(plans[0].plan.auto).toBe(false);
    expect(scenesRequiringGeneration([scene({ mediaStrategy: "b-roll" })])).toHaveLength(1);
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

  test("#299 explicit media:null wins over a generation strategy -> skip (no warning)", () => {
    const plans = planScenes([scene({ mediaStrategy: "b-roll", media: null })]);
    expect(plans[0].action).toBe("skip");
    expect(plans[0].reason).toBe("explicit-no-media");
    expect(plans[0].warn).toBeUndefined();
  });

  test("#299 explicit media:null is checked before mediaOptOut", () => {
    const plans = planScenes([
      scene({ mediaStrategy: "asset-then-broll", media: null, mediaOptOut: true }),
    ]);
    expect(plans[0].action).toBe("skip");
    expect(plans[0].reason).toBe("explicit-no-media");
  });

  test("#299 assignWinner never replaces an explicit media:null waiver", () => {
    const sceneWithWaiver = scene({ mediaStrategy: "b-roll", media: null });
    expect(
      assignWinner(
        sceneWithWaiver,
        "scene-6-seed1024.mp4",
        false,
        "AI-generated (FastVideo FastMetal-5B-QAD)",
      ),
    ).toBeNull();
    expect(sceneWithWaiver.media).toBeNull();
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

describe("#355 chain budget, form selection and approval", () => {
  test("unapproved chain candidates are planned, never generated", () => {
    const plan = buildGenerationPlan([scene({ aiVideo: undefined })]);
    expect(plan.entries[0].action).toBe("approval-required");
    expect(plan.summary.approvalRequired).toBe(1);
    expect(plan.summary.generate).toBe(0);
  });

  test("auto scene budget caps the implicit rung; explicit overrides are not capped", () => {
    const scenes = [
      scene({ id: "1", aiVideo: undefined }),
      scene({ id: "2", aiVideo: undefined }),
      scene({ id: "3", mediaStrategy: "b-roll" }),
    ];
    const plan = buildGenerationPlan(scenes, { approveAuto: true, autoBudget: 1 });
    const byId = Object.fromEntries(plan.entries.map((e) => [e.scene.id, e]));
    expect(byId["1"].action).toBe("generate");
    expect(byId["1"].form).toBe("image");
    expect(byId["2"].action).toBe("budget-skipped");
    expect(byId["3"].action).toBe("generate");
    expect(plan.summary.budgetSkipped).toBe(1);
  });

  test("T2I is the default form; a declared video prompt spends the video budget", () => {
    const scenes = [
      scene({ id: "1", aiVideo: { prompt: "a camera dolly shot" }, voiceover: "v" }),
      scene({ id: "2", aiVideo: { prompt: "another dolly shot" }, voiceover: "v" }),
      scene({ id: "3", voiceover: "v" }),
    ];
    const oneVideo = buildGenerationPlan(scenes, { approveAuto: true, videoBudget: 1 });
    const forms = Object.fromEntries(
      oneVideo.entries.filter((e) => e.action === "generate").map((e) => [e.scene.id, e.form]),
    );
    expect(forms).toEqual({ 1: "video", 2: "image", 3: "image" });

    const noVideo = buildGenerationPlan(scenes, { approveAuto: true, videoBudget: 0 });
    expect(
      noVideo.entries.filter((e) => e.action === "generate").every((e) => e.form === "image"),
    ).toBe(true);
  });

  test("the chain derives its still prompt from assetNeed, then voiceover", () => {
    const plan = buildGenerationPlan(
      [
        scene({ id: "1", aiVideo: undefined, assetNeed: "a robot arm on a factory line" }),
        scene({ id: "2", aiVideo: undefined }),
      ],
      { approveAuto: true },
    );
    const byId = Object.fromEntries(plan.entries.map((e) => [e.scene.id, e]));
    expect(byId["1"].prompt).toBe("a robot arm on a factory line");
    expect(byId["1"].promptSource).toBe("assetNeed");
    expect(byId["2"].promptSource).toBe("voiceover");
    expect(byId["2"].prompt).toBe("混合架构把记忆分三层");
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

  test("#240 same-prompt seeds stay scene-adjacent so one batch encode covers both", async () => {
    // Reviewer scheduling rule (#240): jobs sharing a prompt must execute
    // consecutively so the batch's prompt cache/dedup amortizes one text
    // encoder pass over every seed of that prompt.
    const dirs = stageDirs();
    const { generate, calls } = okGenerateMock();
    const scenes = [
      scene({ id: "5", mediaStrategy: "b-roll", aiVideo: { prompt: "scene five visual" } }),
      scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: "scene six visual" } }),
    ];
    await runBrollStage(baseOpts(dirs, { scenes, generate }));
    expect(calls.length).toBe(1);
    const jobs = calls[0];
    // Two seeds per scene share ONE composed prompt...
    const scene5Prompts = new Set(
      jobs.filter((j) => j.label.startsWith("scene-5-")).map((j) => j.prompt),
    );
    const scene6Prompts = new Set(
      jobs.filter((j) => j.label.startsWith("scene-6-")).map((j) => j.prompt),
    );
    expect(scene5Prompts.size).toBe(1);
    expect(scene6Prompts.size).toBe(1);
    expect(scene5Prompts).not.toEqual(scene6Prompts);
    // ...and the two seed jobs of each prompt are adjacent, so scanning the
    // batch in order groups all work for a prompt before moving on.
    const promptRun = jobs.map((j) => j.prompt);
    expect(promptRun).toEqual([jobs[0].prompt, jobs[0].prompt, jobs[2].prompt, jobs[2].prompt]);
  });

  test("#240 one scene's failed jobs do not drag down the other scenes", async () => {
    // Fault-isolation contract across the whole stack: the python batch marks
    // per-job failures in its results payload (the batch continues), and the
    // orchestrator must land winners for the healthy scenes while recording
    // the failed scene's candidates.
    const dirs = stageDirs();
    const generate = async ({ jobs }) => ({
      ok: true,
      fatal: null,
      results: jobs.map((j) =>
        j.label.startsWith("scene-7-")
          ? { label: j.label, ok: false, file: j.output_path, error: "denoise: OOM" }
          : { label: j.label, ok: true, file: j.output_path, error: null },
      ),
    });
    const scenes = [
      scene({ id: "6", mediaStrategy: "b-roll" }),
      scene({ id: "7", mediaStrategy: "b-roll" }),
    ];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate,
        analyzer: analyzerFor({
          [join(dirs.contentDir, "assets/b-roll/scene-6-seed1024.mp4")]: 84,
          [join(dirs.contentDir, "assets/b-roll/scene-6-seed1025.mp4")]: 40,
        }),
      }),
    );
    expect(result.counts.generated).toBe(1);
    expect(result.counts.failed).toBe(1);
    // Healthy scene landed its winner in memory.
    expect(scenes[0].media?.path).toBe("assets/b-roll/scene-6-seed1024.mp4");
    // Failed scene recorded per-candidate errors, no media assignment.
    expect(scenes[1].media).toBeUndefined();
    const report = readReport(reportPath(dirs.outputDir));
    expect(report.scenes["6"].status).toBe("won");
    expect(report.scenes["7"].status).toBe("failed");
    expect(report.scenes["7"].winner).toBeNull();
    expect(report.scenes["7"].candidates).toHaveLength(2);
    expect(report.scenes["7"].candidates.every((c) => /OOM/.test(c.reason))).toBe(true);
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
      source: "AI-generated (FastVideo FastMetal-5B-QAD)",
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
    // #166: the hash covers the COMPOSED prompt (declared + injected
    // constants); the entry records both surfaces plus the injection version
    // so cache decisions can survive constant changes.
    expect(entry.promptHash).toBe(promptHash(composeGenerationPrompt(scenes[0], "wan2.2")));
    expect(entry.prompt).toBe("eight-dimension prompt");
    expect(entry.generationPrompt).toContain(BRAND_BASE_PROMPT);
    expect(entry.generationPrompt).toContain("no text");
    expect(entry.injectionVersion).toBe(PROMPT_INJECTION_VERSION);
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

  test("#159 pinned model paths reach the runner; an explicit env opt-out survives", async () => {
    const dirs = stageDirs();
    const calls = [];
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll" })];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        // Non-default on purpose — the default lives in the runner, so a "1"
        // here would only echo this test's own input back.
        env: { HF_HUB_OFFLINE: "0" },
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
    expect(calls[0].env).toEqual({ HF_HUB_OFFLINE: "0" });
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

  test("#156 winner under existing media lands as backdrop (primary never overwritten)", async () => {
    const dirs = stageDirs();
    const { generate } = okGenerateMock();
    const existing = { type: "image", path: "assets/manual.png" };
    const scenes = [scene({ id: "7", mediaStrategy: "b-roll", media: { ...existing } })];
    await runBrollStage(baseOpts(dirs, { scenes, generate }));
    expect(scenes[0].media.path).toBe(existing.path);
    expect(scenes[0].media.type).toBe(existing.type);
    expect(scenes[0].media.backdrop?.path).toMatch(/^assets\/b-roll\//);
  });

  // ─── #156: backdrop landing — a b-roll winner under real media is not discarded ───

  test("#156 b-roll strategy + existing media: cached winner lands as media.backdrop", async () => {
    const dirs = stageDirs();
    const file = "scene-8-seed7777.mp4";
    const report = emptyReport("demo", 60);
    report.scenes["8"] = {
      strategy: "b-roll",
      promptHash: promptHash("cached prompt"),
      round: 1,
      status: "won",
      prompt: "cached prompt",
      voiceover: "v",
      candidates: [{ seed: 7777, file, relevance: 90, reason: "ok" }],
      winner: { seed: 7777, file },
    };
    writeReport(reportPath(dirs.outputDir), report);

    const scenes = [
      scene({
        id: "8",
        mediaStrategy: "b-roll",
        aiVideo: { prompt: "cached prompt" },
        media: { type: "image", path: "assets/qwen-throughput.png", source: "Pexels" },
      }),
    ];
    const result = await runBrollStage(baseOpts(dirs, { scenes }));

    expect(result.counts.cached).toBe(1);
    // Primary media untouched; winner becomes the backdrop
    expect(scenes[0].media.path).toBe("assets/qwen-throughput.png");
    expect(scenes[0].media.backdrop).toEqual({
      type: "video",
      path: "assets/b-roll/scene-8-seed7777.mp4",
      source: "AI-generated (FastVideo FastMetal-5B-QAD)",
      animation: "fade",
      volume: 0,
      upscale: false,
    });
  });

  test("#156 fresh generation with existing media lands backdrop (not discarded)", async () => {
    const dirs = stageDirs();
    const scenes = [
      scene({
        id: "8",
        mediaStrategy: "b-roll",
        media: { type: "image", path: "assets/qwen-throughput.png" },
      }),
    ];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: okGenerateMock().generate,
      }),
    );
    expect(result.counts.generated).toBe(1);
    expect(scenes[0].media.path).toBe("assets/qwen-throughput.png");
    expect(scenes[0].media.backdrop?.path).toMatch(/^assets\/b-roll\/scene-8-.*\.mp4$/);
    // Report records where the winner landed
    expect(readReport(reportPath(dirs.outputDir)).scenes["8"].landedOn).toBe("backdrop");
  });

  test("#156 scene without media still lands primary media (existing contract)", async () => {
    const dirs = stageDirs();
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll" })];
    await runBrollStage(baseOpts(dirs, { scenes, generate: okGenerateMock().generate }));
    expect(scenes[0].media.backdrop).toBeUndefined();
    expect(scenes[0].media.path).toMatch(/^assets\/b-roll\//);
  });
});

// ─── #355 default chain stage behavior ───

describe("runBrollStage #355 default chain", () => {
  let root;
  let caseIndex = 0;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "broll-chain-"));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

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
      generate: okGenerateMock().generate,
      resolveDeps: () => ({ ok: true, repo: "/repo", python: "/py", missing: [], message: null }),
      resolveImageDeps: () => ({
        ok: true,
        bin: "/bin/mflux",
        backend: "mflux-boogu",
        missing: [],
        message: null,
      }),
      analyzer: async () => ({ relevance: 99, relevanceReason: "great" }),
      ...overrides,
    };
  }

  test("unapproved chain scenes write the plan file and spend nothing", async () => {
    const dirs = stageDirs();
    let generateCalled = 0;
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [{ id: 1, voiceover: "a robot arm assembles a phone" }],
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.approvalRequired).toBe(1);
    expect(result.planFile).toBe(join(dirs.outputDir, "media-chain-plan.json"));
    const plan = JSON.parse(readFileSync(result.planFile, "utf8"));
    expect(plan.approved).toBe(false);
    expect(plan.entries[0]).toMatchObject({
      sceneId: 1,
      action: "approval-required",
      auto: true,
    });
    expect(existsSync(reportPath(dirs.outputDir))).toBe(false);
  });

  test("approved chain scene generates a T2I fast-path image from the derived claim", async () => {
    const dirs = stageDirs();
    const claims = [];
    const { generate, calls } = okGenerateMock();
    const scene = { id: 2, voiceover: "A humanoid robot stacks boxes in a warehouse." };
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene],
        approveAuto: true,
        generate,
        analyzer: async (path, opts) => {
          claims.push(opts.claim.assetNeed);
          return { relevance: 99, relevanceReason: "great" };
        },
      }),
    );
    expect(result.counts.generated).toBe(1);
    expect(result.counts.approvalRequired).toBe(0);
    // T2I is the default form; the chain derives the subject from voiceover.
    const jobs = calls[0];
    expect(jobs).toHaveLength(2);
    expect(jobs[0].label).toMatch(/scene-2-seed\d+\.png$/);
    expect(jobs[0].prompt).toContain("A humanoid robot stacks boxes in a warehouse");
    for (const claim of claims) expect(claim).toBe("A humanoid robot stacks boxes in a warehouse.");
    expect(scene.media).toMatchObject({
      type: "image",
      animation: "ken-burns",
      path: expect.stringMatching(/^assets\/b-roll\/scene-2-seed\d+\.png$/),
    });
    const entry = readReport(reportPath(dirs.outputDir)).scenes["2"];
    expect(entry).toMatchObject({
      strategy: "auto",
      auto: true,
      form: "image",
      promptSource: "voiceover",
      status: "won",
    });
  });

  test("a declared video prompt spends the video budget; the next chain scene stays T2I", async () => {
    const dirs = stageDirs();
    const { generate, calls } = okGenerateMock();
    const scenes = [
      { id: 3, voiceover: "v3", aiVideo: { prompt: "a slow dolly shot through a server aisle" } },
      { id: 4, voiceover: "v4" },
    ];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        approveAuto: true,
        videoBudget: 1,
        generate,
      }),
    );
    expect(result.counts.generated).toBe(2);
    const files = calls.flat().map((j) => j.output_path);
    expect(files.some((f) => f.endsWith(".mp4"))).toBe(true);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
    const report = readReport(reportPath(dirs.outputDir));
    expect(report.scenes["3"].form).toBe("video");
    expect(report.scenes["4"].form).toBe("image");
  });

  test("auto budget spills the excess into budget-skipped, not a failure", async () => {
    const dirs = stageDirs();
    const { generate, calls } = okGenerateMock();
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [
          { id: 5, voiceover: "v5" },
          { id: 6, voiceover: "v6" },
        ],
        approveAuto: true,
        autoBudget: 1,
        generate,
      }),
    );
    expect(result.counts.generated).toBe(1);
    expect(result.counts.budgetSkipped).toBe(1);
    expect(calls[0]).toHaveLength(2);
    expect(result.counts.failed).toBe(0);
  });

  test("an explicit override still runs without approval", async () => {
    const dirs = stageDirs();
    const { generate, calls } = okGenerateMock();
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "7", mediaStrategy: "b-roll" })],
        generate,
      }),
    );
    expect(result.counts.generated).toBe(1);
    expect(calls[0].length).toBe(2);
  });
});

// ─── #166 constant injection wiring ───

describe("runBrollStage #166 wiring", () => {
  let root;
  let caseIndex = 0;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "broll-inject-"));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

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

  test("generation jobs receive the COMPOSED prompt, the gate claim the RAW one", async () => {
    const dirs = stageDirs();
    const claims = [];
    const { generate, calls } = okGenerateMock();
    const scenes = [
      scene({
        id: "6",
        mediaStrategy: "b-roll",
        voiceover: "DeepSeek trained it for less.",
        aiVideo: { prompt: "One tall glowing bar shrinking beside a short one" },
      }),
    ];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate,
        analyzer: async (path, opts) => {
          claims.push(opts.claim.assetNeed);
          return { relevance: 99, relevanceReason: "great" };
        },
      }),
    );

    // Jobs carry the injected constants (brand base + entity + negatives).
    for (const job of calls[0]) {
      expect(job.prompt).toContain(BRAND_BASE_PROMPT);
      expect(job.prompt).toContain("#4d8bff");
      expect(job.prompt).toContain("no text");
      expect(job.prompt).toContain("no watermark");
      expect(job.prompt).not.toBe(scenes[0].aiVideo.prompt);
    }
    // The VLM claim stays the declared prompt — negative clauses must not
    // leak into the positive assetNeed.
    expect(claims.length).toBe(2);
    for (const assetNeed of claims) {
      expect(assetNeed).toBe("One tall glowing bar shrinking beside a short one");
    }
  });

  test("report and claim split: claim gets the raw prompt, report the composed one (#922)", async () => {
    const dirs = stageDirs();
    const claims = [];
    const { generate } = okGenerateMock();
    const raw = "One tall glowing bar shrinking beside a short one";
    const scenes = [scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: raw } })];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate,
        analyzer: async (path, opts) => {
          claims.push(opts.claim.assetNeed);
          return { relevance: 99, relevanceReason: "great" };
        },
      }),
    );

    // Gate separation: the VLM claim never sees BRAND / NEGATIVE.
    expect(claims.length).toBe(2);
    for (const assetNeed of claims) {
      expect(assetNeed).toBe(raw);
      expect(assetNeed).not.toContain(BRAND_BASE_PROMPT);
      expect(assetNeed).not.toContain("no text");
    }
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.prompt).toBe(raw);
    expect(entry.generationPrompt).toContain(BRAND_BASE_PROMPT);
    expect(entry.generationPrompt).toContain("no text");
    expect(entry.generationPrompt).toContain("no watermark");
  });

  test("success entry records the prompt family resolved from the tier (#922)", async () => {
    const dirs = stageDirs();
    await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "6", mediaStrategy: "b-roll" })],
        generate: okGenerateMock().generate,
        env: {},
      }),
    );
    expect(readReport(reportPath(dirs.outputDir)).scenes["6"].promptFamily).toBe("wan2.2");
  });

  test("the 1.3B escape hatch records its own family (#922)", async () => {
    const dirs = stageDirs();
    await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "6", mediaStrategy: "b-roll" })],
        generate: okGenerateMock().generate,
        env: { BROLL_MODEL: "fastmetal-1.3b" },
      }),
    );
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.promptFamily).toBe("wan2.1");
    expect(entry.winner.source).toBe("AI-generated (FastVideo FastMetal-1.3B-QAD)");
  });

  test("image entries carry no promptFamily — T2I does not ride a T2V family (#922)", async () => {
    const dirs = stageDirs();
    await runBrollStage(
      baseOpts(dirs, {
        scenes: [
          scene({
            id: "11",
            mediaStrategy: "ai-image",
            aiVideo: undefined,
            aiImage: { prompt: "abstract transformer memory channels, high detail" },
          }),
        ],
        generate: okGenerateMock().generate,
        resolveImageDeps: () => ({
          ok: true,
          bin: "/bin/mflux",
          backend: "mflux-boogu",
          missing: [],
          message: null,
        }),
      }),
    );
    const entry = readReport(reportPath(dirs.outputDir)).scenes["11"];
    expect(entry.status).toBe("won");
    expect(entry.promptFamily).toBeUndefined();
    expect("promptFamily" in entry).toBe(false);
  });

  test("a prompt that covers every dimension generates unchanged (idempotent)", async () => {
    const dirs = stageDirs();
    const { generate, calls } = okGenerateMock();
    const raw = "Two lanes of glowing particles, dark studio, no text, no watermark, no hands";
    await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "8", mediaStrategy: "b-roll", aiVideo: { prompt: raw } })],
        generate,
      }),
    );
    expect(calls[0].every((j) => j.prompt === raw)).toBe(true);
  });

  test("legacy won entry with unchanged declared prompt migrates in place and stays cached", async () => {
    const dirs = stageDirs();
    const raw = "eight-dimension prompt";
    const legacy = {
      strategy: "b-roll",
      promptHash: promptHash(raw), // pre-injection: hash of the declared prompt
      round: 1,
      status: "won",
      prompt: raw,
      voiceover: "v",
      candidates: [{ seed: 1024, file: "scene-6-seed1024.mp4", relevance: 72, reason: "ok" }],
      winner: { seed: 1024, file: "scene-6-seed1024.mp4" },
    };
    writeReport(reportPath(dirs.outputDir), emptyReport("demo", 60));
    writeReport(reportPath(dirs.outputDir), {
      ...emptyReport("demo", 60),
      scenes: { 6: legacy },
    });

    let generateCalled = 0;
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: raw } })],
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );

    // The ~235s clip is NOT regenerated — the winner predates injection and
    // already passed the gate; injection only changes future generations.
    expect(generateCalled).toBe(0);
    expect(result.counts.cached).toBe(1);
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.injectionVersion).toBe(PROMPT_INJECTION_VERSION);
    expect(entry.promptHash).toBe(
      promptHash(composeGenerationPrompt({ aiVideo: { prompt: raw } }, "wan2.2")),
    );
  });

  test("legacy won entry whose prompt only dropped covered NEGATIVE clauses stays cached (#166 migration)", async () => {
    const dirs = stageDirs();
    // What a pre-#166 qwen4-preview scene-8 entry looked like: full
    // hand-written NEGATIVE coverage, art-directed prompt.
    const prior = "Two lanes of glowing particles, dark studio, no text, no watermark, no hands";
    const raw = "Two lanes of glowing particles, dark studio"; // #166 stripped the clauses
    const legacy = {
      strategy: "b-roll",
      promptHash: promptHash(prior),
      round: 2,
      status: "won",
      prompt: prior,
      voiceover: "v",
      candidates: [{ seed: 1124, file: "scene-8-seed1124.mp4", relevance: 81, reason: "ok" }],
      winner: { seed: 1124, file: "scene-8-seed1124.mp4" },
    };
    writeReport(reportPath(dirs.outputDir), { ...emptyReport("demo", 60), scenes: { 8: legacy } });

    let generateCalled = 0;
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "8", mediaStrategy: "b-roll", aiVideo: { prompt: raw } })],
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.cached).toBe(1);
    const entry = readReport(reportPath(dirs.outputDir)).scenes["8"];
    expect(entry.injectionVersion).toBe(PROMPT_INJECTION_VERSION);
    expect(entry.promptHash).toBe(
      promptHash(composeGenerationPrompt({ aiVideo: { prompt: raw } }, "wan2.2")),
    );
  });

  test("a legacy entry whose prompt changed beyond NEGATIVE stripping regenerates", async () => {
    const dirs = stageDirs();
    const prior = "A glowing bar, dark studio, no text, no watermark, no hands";
    const raw = "A completely different subject, dark studio"; // art direction changed too
    const legacy = {
      strategy: "b-roll",
      promptHash: promptHash(prior),
      round: 1,
      status: "won",
      prompt: prior,
      voiceover: "v",
      candidates: [],
      winner: { seed: 1024, file: "scene-6-seed1024.mp4" },
    };
    writeReport(reportPath(dirs.outputDir), { ...emptyReport("demo", 60), scenes: { 6: legacy } });

    const { generate, calls } = okGenerateMock();
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: raw } })],
        generate,
      }),
    );
    expect(calls.length).toBe(1);
    expect(result.counts.generated).toBe(1);
  });

  test("an over-budget composed prompt is refused before generation, not silently truncated", async () => {
    const dirs = stageDirs();
    let generateCalled = 0;
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [
          scene({
            id: "6",
            mediaStrategy: "b-roll",
            aiVideo: { prompt: "glowing bar ".repeat(600) },
          }),
        ],
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.failed).toBe(1);
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.status).toBe("failed");
    expect(entry.reason).toContain("wan2.2");
    expect(entry.reason).toContain("over the 480-token budget");
    expect(entry.generationPrompt).toBeNull();
    expect(entry.promptFamily).toBe("wan2.2");
    expect(entry.winner).toBeNull();
    // The composed prompt never existed — a raw-prompt hash would collide
    // with cache decisions that hash the composed string.
    expect(entry.promptHash).toBeNull();
  });

  test("a declared prompt under budget is refused once the injected constants push composition over", async () => {
    const dirs = stageDirs();
    let generateCalled = 0;
    // ~475 tokens declared (< 480) — only BRAND + NEGATIVE injection pushes
    // the composed string over the family budget.
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [
          scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: "a ".repeat(475) } }),
        ],
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.failed).toBe(1);
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.status).toBe("failed");
    expect(entry.reason).toContain("wan2.2 composed prompt");
    expect(entry.reason).toContain("over the 480-token budget");
    expect(typeof entry.generationPrompt).toBe("string");
    expect(entry.promptHash).toBe(promptHash(entry.generationPrompt));
  });

  test("an unknown BROLL_MODEL is rejected, never silently defaulted (#922 AC2)", async () => {
    const dirs = stageDirs();
    await expect(
      runBrollStage(baseOpts(dirs, { scenes: [scene()], env: { BROLL_MODEL: "fastmetal-99b" } })),
    ).rejects.toThrow(/Unknown BROLL_MODEL "fastmetal-99b"/);
    expect(readReport(reportPath(dirs.outputDir))).toBeNull();
  });

  test("non-budget composition errors surface instead of becoming a report refusal", async () => {
    const dirs = stageDirs();
    // The orchestrator's own rawPrompt read touches aiVideo first — that read
    // must succeed, and the getter must throw only from the read inside
    // composeGenerationPrompt, so the TypeError provably enters the
    // PromptBudgetError discrimination guard instead of failing earlier.
    let aiVideoReads = 0;
    const throwingScene = {
      id: "6",
      mediaStrategy: "b-roll",
      get aiVideo() {
        aiVideoReads += 1;
        if (aiVideoReads > 1) throw new TypeError("boom");
        return { prompt: "a rack" };
      },
    };
    await expect(runBrollStage(baseOpts(dirs, { scenes: [throwingScene] }))).rejects.toThrow(
      TypeError,
    );
    expect(aiVideoReads).toBeGreaterThan(1);
    expect(readReport(reportPath(dirs.outputDir))).toBeNull();
  });

  test("a legacy cached winner keeps reusing even when the declared prompt reads over the family budget", async () => {
    const dirs = stageDirs();
    const overBudget = "glowing bar ".repeat(600);
    writeReport(reportPath(dirs.outputDir), {
      content: "demo",
      threshold: 85,
      scenes: {
        6: {
          status: "won",
          round: 1,
          prompt: overBudget,
          promptHash: promptHash(overBudget),
          winner: {
            file: "scene-6-seed1024.mp4",
            source: "AI-generated (FastVideo FastMetal-5B-QAD)",
          },
        },
      },
      updatedAt: null,
    });
    let generateCalled = 0;
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [scene({ id: "6", mediaStrategy: "b-roll", aiVideo: { prompt: overBudget } })],
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.cached).toBe(1);
    expect(result.counts.failed).toBe(0);
    const entry = readReport(reportPath(dirs.outputDir)).scenes["6"];
    expect(entry.status).toBe("won");
    expect(entry.winner.file).toBe("scene-6-seed1024.mp4");
  });
});
