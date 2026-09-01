/**
 * B-roll orchestrator: route scenes by mediaStrategy, apply cache/round rules,
 * assemble one generation batch, gate candidates, assign winners in-memory and
 * persist the report. Never writes scene-data; never throws for expected
 * failure modes.
 */
import { existsSync } from "node:fs";
import { basename, join } from "node:path";

import {
  emptyReport,
  readReport,
  writeReport,
  reportPath,
  promptHash,
  decideCache,
  nextRound,
  shouldRefuse,
} from "./report.mjs";
import { buildClaim, scoreCandidates, pickWinner, GATE_THRESHOLD } from "./gate.mjs";
import { resolveDependencies, runGeneration } from "./runner.mjs";

export const SEED_BASE = 1024;
const CANDIDATES_PER_SCENE = 2;

export function hasMedia(scene) {
  return Boolean(scene.media && (scene.media.path || scene.media.url));
}

/**
 * Pure routing pass. Returns one plan per scene; never mutates inputs.
 * plan = { scene, action: 'skip' | 'generate', reason, warn? }
 */
export function planScenes(scenes) {
  return scenes.map((scene) => {
    const strategy = scene.mediaStrategy ?? "asset";
    if (scene.mediaOptOut === true) {
      return { scene, action: "skip", reason: "media-opt-out", warn: true };
    }
    if (strategy === "asset") {
      return { scene, action: "skip", reason: "asset-strategy" };
    }
    if (strategy === "asset-then-broll" && hasMedia(scene)) {
      return { scene, action: "skip", reason: "has-media" };
    }
    return { scene, action: "generate", reason: `strategy-${strategy}` };
  });
}

/**
 * Step 1.5 sourcing rule: a scene that chose pure b-roll must not buy stock
 * assets; `asset-then-broll` still sources first and only falls back to
 * generation when sourcing left it without media.
 */
export function shouldSourceStock(scene) {
  return (scene.mediaStrategy ?? "asset") !== "b-roll";
}

/**
 * Scenes the stage would attempt, before cache and round rules are applied.
 * Shared by the CLI time estimate and main.mjs's "any work at all?" guard.
 */
export function scenesRequiringGeneration(scenes, sceneFilter = null, maxScenes = Infinity) {
  const filterIds = sceneFilter
    ? new Set(Array.isArray(sceneFilter) ? sceneFilter : [sceneFilter])
    : null;
  const list = planScenes(scenes)
    .filter((p) => p.action === "generate" && (!filterIds || filterIds.has(String(p.scene.id))))
    .map((p) => p.scene);
  return Number.isFinite(maxScenes) ? list.slice(0, maxScenes) : list;
}

function seedsForScene(sceneIndex) {
  return Array.from({ length: CANDIDATES_PER_SCENE }, (_, i) => SEED_BASE + sceneIndex * 100 + i);
}

function assignWinner(scene, winnerFile) {
  if (scene.media) return false;
  scene.media = {
    type: "video",
    path: `assets/b-roll/${winnerFile}`,
    source: "AI-generated (FastVideo FastMetal-1.3B-QAD)",
    animation: "fade",
    overlay: 0.7,
    volume: 0,
    // 480×832 trips the "short side < 720" heuristic in upscale.mjs, and
    // render-remotion.mjs would rerun per-frame Real-ESRGAN on it.
    upscale: false,
  };
  return true;
}

/**
 * Run the B-roll stage over a scene list.
 *
 * @param {object} opts
 * @param {Array<object>} opts.scenes mutable scene objects (winner assignment is in-memory)
 * @param {string} opts.contentSlug
 * @param {string} opts.contentDir absolute content dir (candidates land in assets/b-roll/)
 * @param {string} opts.outputDir absolute output dir (b-roll-report.json)
 * @param {boolean} [opts.force] bypass cache
 * @param {string|string[]} [opts.sceneFilter] only these scene ids
 * @param {number} [opts.maxScenes] cap on scenes entering generation
 * @param {number} [opts.threshold]
 * @param {Function} [opts.fileExists] injectable existsSync
 * @param {Function} [opts.generate] injectable runner.runGeneration
 * @param {Function} [opts.resolveDeps] injectable runner.resolveDependencies
 * @param {Function} [opts.analyzer] injectable visual-analyzer claim scorer
 * @param {Function} [opts.onProgress] called with each batch-script stdout line as it arrives
 * @param {object} [opts.env] environment for dep probing
 * @returns {Promise<{counts: {generated: number, cached: number, failed: number,
 *   escalated: number, skipped: number}, depsError: string|null, reportFile: string|null}>}
 */
export async function runBrollStage(opts) {
  const {
    scenes,
    contentSlug,
    contentDir,
    outputDir,
    force = false,
    sceneFilter = null,
    maxScenes = Number.POSITIVE_INFINITY,
    threshold = GATE_THRESHOLD,
    fileExists = existsSync,
    generate = runGeneration,
    resolveDeps = resolveDependencies,
    analyzer,
    onProgress = null,
    env = process.env,
  } = opts;

  const counts = { generated: 0, cached: 0, failed: 0, escalated: 0, skipped: 0 };
  const filterIds = sceneFilter
    ? new Set(Array.isArray(sceneFilter) ? sceneFilter : [sceneFilter])
    : null;

  const reportFile = reportPath(outputDir);
  const report = readReport(reportFile) ?? emptyReport(contentSlug, threshold);

  const plans = planScenes(scenes);
  let generatePlans = plans.filter((p) => p.action === "generate");
  counts.skipped += plans.length - generatePlans.length;
  if (filterIds) {
    generatePlans = generatePlans.filter((p) => filterIds.has(String(p.scene.id)));
  }

  // Cache + escalation pass before touching dependencies.
  const toGenerate = [];
  let reportDirty = false;
  for (const plan of generatePlans) {
    const scene = plan.scene;
    const sceneId = String(scene.id);
    const prompt = scene.aiVideo?.prompt ?? "";
    const entry = report.scenes?.[sceneId];
    const winnerFile = entry?.winner?.file;

    if (!force && entry) {
      const decision = decideCache(
        entry,
        prompt,
        winnerFile ? fileExists(join(contentDir, "assets", "b-roll", winnerFile)) : false,
      );
      if (decision.reuse) {
        assignWinner(scene, winnerFile);
        counts.cached += 1;
        continue;
      }
    }

    const round = nextRound(entry ?? null);
    if (shouldRefuse(round)) {
      report.scenes = report.scenes ?? {};
      report.scenes[sceneId] = { ...(entry ?? {}), status: "escalated" };
      reportDirty = true;
      counts.escalated += 1;
      continue;
    }
    toGenerate.push({ scene, sceneId, prompt, round });
  }

  const limited = toGenerate.slice(0, maxScenes);

  if (limited.length === 0) {
    if (reportDirty) writeReport(reportFile, report);
    return { counts, depsError: null, reportFile: reportDirty ? reportFile : null };
  }

  const deps = resolveDeps(env);
  if (!deps.ok) {
    return { counts, depsError: deps.message, reportFile: null };
  }

  // Assemble a single batch across all scenes (model loads once).
  const jobs = [];
  const jobsByScene = new Map();
  limited.forEach((item, sceneIndex) => {
    const seeds = seedsForScene(sceneIndex);
    const sceneJobs = seeds.map((seed) => {
      const file = `scene-${item.sceneId}-seed${seed}.mp4`;
      return {
        label: `scene-${item.sceneId}-seed${seed}`,
        prompt: item.prompt,
        output_path: join(contentDir, "assets", "b-roll", file),
        seed,
        file,
      };
    });
    jobsByScene.set(item.sceneId, sceneJobs);
    jobs.push(...sceneJobs);
  });

  const batch = await generate({
    python: deps.python,
    repo: deps.repo,
    jobs,
    workDir: join(outputDir, "b-roll-work"),
    onProgress,
    // Pinned weights (BROLL_MODEL_ROOT / BROLL_MLX_CHECKPOINT) or null, in
    // which case the runner resolves the local HF cache snapshot.
    modelRoot: deps.modelRoot ?? null,
    mlxCheckpoint: deps.mlxCheckpoint ?? null,
    env,
  });

  const resultsByLabel = new Map((batch.results ?? []).map((r) => [r.label, r]));

  let gateAnalyzer = analyzer;
  if (!gateAnalyzer) {
    const { analyzeAssetSemantics } = await import("../visual-analyzer.mjs");
    gateAnalyzer = analyzeAssetSemantics;
  }

  report.scenes = report.scenes ?? {};
  for (const item of limited) {
    const { scene, sceneId, prompt, round } = item;
    const sceneJobs = jobsByScene.get(sceneId);

    const candidatesInput = [];
    const failedCandidates = [];
    for (const job of sceneJobs) {
      const result = resultsByLabel.get(job.label);
      if (!batch.ok || !result || !result.ok) {
        failedCandidates.push({
          seed: job.seed,
          file: job.file,
          relevance: null,
          reason: `generation failed: ${result?.error ?? batch.fatal ?? "unknown"}`,
        });
        continue;
      }
      candidatesInput.push({ seed: job.seed, file: result.file });
    }

    let scored = [];
    if (candidatesInput.length > 0) {
      scored = await scoreCandidates(candidatesInput, {
        analyzer: gateAnalyzer,
        claim: buildClaim(scene),
        threshold,
      });
    }

    const winner = pickWinner(scored);
    const candidates = [
      ...scored.map((c) => ({
        seed: c.seed,
        file: basename(c.file),
        relevance: c.relevance,
        reason: c.reason,
      })),
      ...failedCandidates,
    ];

    report.scenes[sceneId] = {
      strategy: scene.mediaStrategy,
      promptHash: promptHash(prompt),
      round,
      status: winner ? "won" : "failed",
      prompt,
      voiceover: scene.voiceover ?? "",
      candidates,
      winner: winner ? { seed: winner.seed, file: basename(winner.file) } : null,
    };

    if (winner) {
      assignWinner(scene, basename(winner.file));
      counts.generated += 1;
    } else {
      counts.failed += 1;
    }
  }

  writeReport(reportFile, report);
  return { counts, depsError: null, reportFile };
}
