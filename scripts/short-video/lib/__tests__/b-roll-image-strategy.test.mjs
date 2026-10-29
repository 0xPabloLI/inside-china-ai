import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { planScenes, runBrollStage, shouldSourceStock } from "../b-roll/orchestrator.mjs";
import { writeReport, emptyReport, readReport, reportPath, promptHash } from "../b-roll/report.mjs";
import {
  BRAND_BASE_PROMPT,
  PROMPT_INJECTION_VERSION,
  composeImagePrompt,
} from "../b-roll/prompt-injection.mjs";

// ─── fixtures ───

function imageScene(overrides = {}) {
  return {
    id: 11,
    voiceover: "混合注意力把记忆压缩进三层宽通道。",
    mediaStrategy: "ai-image",
    aiImage: { prompt: "abstract transformer memory channels folding inward, high detail" },
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

function cachedImageReport(file, winnerSource) {
  const report = emptyReport("demo", 60);
  report.scenes["11"] = {
    strategy: "ai-image",
    promptHash: promptHash(composeImagePrompt(imageScene())),
    injectionVersion: PROMPT_INJECTION_VERSION,
    round: 1,
    status: "won",
    prompt: "abstract transformer memory channels folding inward, high detail",
    voiceover: "v",
    candidates: [{ seed: 9999, file, relevance: 84, reason: "ok" }],
    winner: {
      seed: 9999,
      file,
      ...(winnerSource === undefined ? {} : { source: winnerSource }),
    },
  };
  return report;
}

// ─── routing ───

describe("image strategy routing (#155)", () => {
  test("'ai-image' plans generation", () => {
    const plans = planScenes([imageScene()]);
    expect(plans[0].action).toBe("generate");
    expect(plans[0].reason).toBe("strategy-ai-image");
  });

  test("'asset-then-ai-image' with sourced media skips (asset wins, no GPU spent)", () => {
    const plans = planScenes([
      imageScene({
        mediaStrategy: "asset-then-ai-image",
        media: { type: "image", path: "assets/x.png" },
      }),
    ]);
    expect(plans[0].action).toBe("skip");
    expect(plans[0].reason).toMatch(/has-media/);
  });

  test("'asset-then-ai-image' without media generates", () => {
    const plans = planScenes([imageScene({ mediaStrategy: "asset-then-ai-image" })]);
    expect(plans[0].action).toBe("generate");
  });

  test("pure 'ai-image' scenes never go to stock sourcing (mirrors b-roll)", () => {
    expect(shouldSourceStock(imageScene())).toBe(false);
  });

  test("'asset-then-ai-image' and plain scenes still source stock", () => {
    expect(shouldSourceStock(imageScene({ mediaStrategy: "asset-then-ai-image" }))).toBe(true);
    expect(shouldSourceStock(imageScene({ mediaStrategy: "asset" }))).toBe(true);
  });
});

// ─── stage behavior ───

describe("runBrollStage image strategy (#155)", () => {
  let root;
  let caseIndex = 0;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "broll-t2i-"));
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

  test("image jobs carry .png files, the composed IMAGE prompt, and skip video deps", async () => {
    const dirs = stageDirs();
    const { generate, calls } = okGenerateMock();
    let videoDepsProbed = 0;
    const scenes = [imageScene()];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate,
        resolveDeps: () => {
          videoDepsProbed += 1;
          return { ok: true, repo: "/repo", python: "/py", missing: [], message: null };
        },
      }),
    );
    expect(videoDepsProbed).toBe(0); // no FastVideo probing for an image-only run
    expect(calls.length).toBe(1);
    const jobs = calls[0];
    expect(jobs.length).toBe(2); // same 2-candidates-per-scene rule
    for (const job of jobs) {
      expect(job.label).toMatch(/^scene-11-seed\d+\.png$/);
      expect(job.file).toMatch(/\.png$/);
      // Composed image prompt: declared + BRAND base + entity accent + NEGATIVE
      expect(job.prompt).toContain("abstract transformer memory channels");
      expect(job.prompt).toContain(BRAND_BASE_PROMPT);
      expect(job.prompt).toContain("no text");
      // No CAMERA/MOTION defaults leak into a still image prompt
      expect(job.prompt).not.toMatch(/dolly|push-in|tracking camera/i);
    }
  });

  test("image winner assigns type 'image' media with upscale:false (no volume)", async () => {
    const dirs = stageDirs();
    const { generate } = okGenerateMock();
    const scenes = [imageScene()];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate,
        analyzer: async (path, opts) => ({
          relevance: 88,
          relevanceReason: "on-topic",
          claimSeen: opts.claim,
        }),
      }),
    );
    expect(result.counts.generated).toBe(1);
    expect(scenes[0].media).toMatchObject({
      type: "image",
      path: "assets/b-roll/scene-11-seed1024.png",
      // #985: provenance follows the backend that ran — the default T2I
      // backend is Boogu Turbo, not the old Z-Image hardcode.
      source: "AI-generated (mflux Boogu Turbo)",
      animation: "fade",
      upscale: false,
    });
    expect(scenes[0].media.volume).toBeUndefined();
    expect(scenes[0].media.overlay).toBe(0.7); // primary-media landing, same as video
  });

  test("the VLM gate claim uses the RAW aiImage.prompt (assetNeed), never the composed one", async () => {
    const dirs = stageDirs();
    const claims = [];
    const scenes = [
      imageScene({
        voiceover: "Qwen ships it free.",
        aiImage: { prompt: "abstract memory channels, high detail" },
      }),
    ];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: okGenerateMock().generate,
        analyzer: async (path, opts) => {
          claims.push(opts.claim);
          return { relevance: 90, relevanceReason: "ok" };
        },
      }),
    );
    expect(claims.length).toBe(2);
    for (const claim of claims) {
      expect(claim.voiceover).toBe("Qwen ships it free.");
      expect(claim.assetNeed).toBe("abstract memory channels, high detail");
      expect(claim.assetNeed).not.toContain("no text");
    }
  });

  test("report entry hashes the composed IMAGE prompt and records the strategy", async () => {
    const dirs = stageDirs();
    const scenes = [imageScene({ mediaStrategy: "asset-then-ai-image" })];
    await runBrollStage(baseOpts(dirs, { scenes, generate: okGenerateMock().generate }));
    const entry = readReport(reportPath(dirs.outputDir)).scenes["11"];
    expect(entry.strategy).toBe("asset-then-ai-image");
    expect(entry.promptHash).toBe(promptHash(composeImagePrompt(scenes[0])));
    expect(entry.injectionVersion).toBe(PROMPT_INJECTION_VERSION);
    expect(entry.status).toBe("won");
    expect(entry.winner.file).toMatch(/\.png$/);
  });

  test("#985 report winner.source records the image model, never the video tier label", async () => {
    const dirs = stageDirs();
    const scenes = [imageScene()];
    await runBrollStage(baseOpts(dirs, { scenes, generate: okGenerateMock().generate }));
    const entry = readReport(reportPath(dirs.outputDir)).scenes["11"];
    expect(entry.winner.source).toBe("AI-generated (mflux Boogu Turbo)");
  });

  test("#985 AI_IMAGE_MODEL drives both the landing label and winner.source", async () => {
    const dirs = stageDirs();
    const scenes = [imageScene()];
    const model = "filipstrand/Z-Image-Turbo-mflux-4bit";
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: okGenerateMock().generate,
        env: { AI_IMAGE_MODEL: model },
      }),
    );
    expect(scenes[0].media.source).toBe(`AI-generated (mflux ${model})`);
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].winner.source).toBe(
      `AI-generated (mflux ${model})`,
    );
  });

  test("#985 AI_IMAGE_BACKEND alone must not re-label the winner (it only gates the negative prompt)", async () => {
    const dirs = stageDirs();
    const scenes = [imageScene()];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: okGenerateMock().generate,
        env: { AI_IMAGE_BACKEND: "mflux-z-image" },
      }),
    );
    expect(scenes[0].media.source).toBe("AI-generated (mflux Boogu Turbo)");
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].winner.source).toBe(
      "AI-generated (mflux Boogu Turbo)",
    );
  });

  test("cache hit on an unchanged image prompt assigns the winner without generation", async () => {
    const dirs = stageDirs();
    const file = "scene-11-seed9999.png";
    writeReport(reportPath(dirs.outputDir), cachedImageReport(file));

    let generateCalled = 0;
    const scenes = [imageScene()];
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
    expect(result.counts.cached).toBe(1);
    expect(scenes[0].media).toMatchObject({
      type: "image",
      path: `assets/b-roll/${file}`,
      // Pre-#985 entries stored no source; the reused label must still be the
      // image backend's, not the video tier's.
      source: "AI-generated (mflux Boogu Turbo)",
    });
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].winner.source).toBe(
      "AI-generated (mflux Boogu Turbo)",
    );
  });

  test("#985 a cached image entry polluted with a video label is repaired on reuse", async () => {
    const dirs = stageDirs();
    const file = "scene-11-seed9999.png";
    const report = cachedImageReport(file, "AI-generated (FastVideo FastMetal-5B-QAD)");
    writeReport(reportPath(dirs.outputDir), report);

    const scenes = [imageScene()];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: async () => {
          throw new Error("cache reuse must not generate");
        },
      }),
    );
    expect(result.counts.cached).toBe(1);
    expect(scenes[0].media.source).toBe("AI-generated (mflux Boogu Turbo)");
    // The stored provenance is repaired too, so the report stops disagreeing
    // with the scene — no regeneration needed.
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].winner.source).toBe(
      "AI-generated (mflux Boogu Turbo)",
    );
  });

  test("#985 a cached image label from an earlier image backend is preserved (#298 semantics)", async () => {
    const dirs = stageDirs();
    const file = "scene-11-seed9999.png";
    writeReport(
      reportPath(dirs.outputDir),
      cachedImageReport(file, "AI-generated (mflux Z-Image Turbo)"),
    );

    const scenes = [imageScene()];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: async () => {
          throw new Error("cache reuse must not generate");
        },
        env: { AI_IMAGE_BACKEND: "mflux-boogu" },
      }),
    );
    // Provenance follows the backend that actually generated the file.
    expect(scenes[0].media.source).toBe("AI-generated (mflux Z-Image Turbo)");
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].winner.source).toBe(
      "AI-generated (mflux Z-Image Turbo)",
    );
  });

  test("#985 a repaired report is persisted when cached and generated scenes coexist", async () => {
    const dirs = stageDirs();
    writeReport(
      reportPath(dirs.outputDir),
      cachedImageReport("scene-11-seed9999.png", "AI-generated (FastVideo FastMetal-5B-QAD)"),
    );
    const scenes = [
      imageScene(),
      imageScene({ id: 12, aiImage: { prompt: "second diagram folding memory channels" } }),
    ];
    const result = await runBrollStage(
      baseOpts(dirs, { scenes, generate: okGenerateMock().generate }),
    );
    expect(result.counts.cached).toBe(1);
    expect(result.counts.generated).toBe(1);
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].winner.source).toBe(
      "AI-generated (mflux Boogu Turbo)",
    );
  });

  test("#985 an unmapped model's label survives cache reuse instead of re-labelling", async () => {
    const dirs = stageDirs();
    const file = "scene-11-seed9999.png";
    const label = "AI-generated (mflux some-org/some-future-model)";
    writeReport(reportPath(dirs.outputDir), cachedImageReport(file, label));

    const scenes = [imageScene()];
    await runBrollStage(
      baseOpts(dirs, {
        scenes,
        generate: async () => {
          throw new Error("cache reuse must not generate");
        },
        env: { AI_IMAGE_MODEL: "some-other/checkpoint" },
      }),
    );
    expect(scenes[0].media.source).toBe(label);
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].winner.source).toBe(label);
  });

  test("image rounds escalate past 3 like video (same report semantics)", async () => {
    const dirs = stageDirs();
    const report = emptyReport("demo", 60);
    report.scenes["11"] = {
      strategy: "ai-image",
      promptHash: promptHash("old"),
      injectionVersion: PROMPT_INJECTION_VERSION,
      round: 3,
      status: "failed",
      prompt: "old",
      voiceover: "v",
      candidates: [],
      winner: null,
    };
    writeReport(reportPath(dirs.outputDir), report);

    let generateCalled = 0;
    const scenes = [imageScene({ aiImage: { prompt: "new attempt" } })];
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
    expect(readReport(reportPath(dirs.outputDir)).scenes["11"].status).toBe("escalated");
  });

  test("image dependency probe failure -> depsError, nothing generated", async () => {
    const dirs = stageDirs();
    let generateCalled = 0;
    const scenes = [imageScene()];
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes,
        resolveImageDeps: () => ({
          ok: false,
          bin: null,
          backend: "mflux-boogu",
          missing: ["bin"],
          message: "mflux binary not found; install mflux first",
        }),
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.depsError).toMatch(/mflux binary not found/);
  });

  test("mixed video + image scenes batch per backend (two generate calls, shared protocol)", async () => {
    const dirs = stageDirs();
    const videoJobs = [];
    const imageJobs = [];
    const generate = async ({ jobs }) => {
      if (jobs[0].file.endsWith(".png")) imageJobs.push(...jobs);
      else videoJobs.push(...jobs);
      return {
        ok: true,
        fatal: null,
        results: jobs.map((j) => ({ label: j.label, ok: true, file: j.output_path, error: null })),
      };
    };
    const scenes = [
      imageScene({ id: 11 }),
      imageScene({
        id: 5,
        mediaStrategy: "b-roll",
        aiImage: undefined,
        aiVideo: { prompt: "video prompt" },
      }),
    ];
    const result = await runBrollStage(baseOpts(dirs, { scenes, generate }));
    expect(imageJobs.length).toBe(2);
    expect(videoJobs.length).toBe(2);
    expect(result.counts.generated).toBe(2);
    // Each scene landed its own kind
    expect(scenes[0].media.type).toBe("image");
    expect(scenes[1].media.type).toBe("video");
  });

  test("an over-budget composed image prompt is refused before generation", async () => {
    const dirs = stageDirs();
    let generateCalled = 0;
    const result = await runBrollStage(
      baseOpts(dirs, {
        scenes: [imageScene({ aiImage: { prompt: "glowing diagram ".repeat(600) } })],
        generate: async () => {
          generateCalled += 1;
          return { ok: true, fatal: null, results: [] };
        },
      }),
    );
    expect(generateCalled).toBe(0);
    expect(result.counts.failed).toBe(1);
    const entry = readReport(reportPath(dirs.outputDir)).scenes["11"];
    expect(entry.status).toBe("failed");
    expect(entry.reason).toContain("token budget");
  });
});
