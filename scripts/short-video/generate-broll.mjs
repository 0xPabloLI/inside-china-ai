#!/usr/bin/env node
/**
 * B-roll generation CLI — manual/agent entrypoint for the FastVideo B-roll stage.
 *
 * Usage:
 *   node generate-broll.mjs --content <dir> [--scene <id>] [--force]
 *                           [--max-scenes N] [--threshold N]
 *                           [--approve-auto] [--auto-budget N] [--video-budget N]
 *                           [--plan]
 *
 * Reads scene-data (never writes it), generates 2 candidates per opted-in
 * scene, gates them through the VLM, assigns winners in-memory, and records
 * everything in output/<dir>/b-roll-report.json for the agent iteration loop.
 *
 * #355: scenes without an explicit mediaStrategy are chain candidates. They
 * are planned (output/<dir>/media-chain-plan.json) but only spend GPU after
 * `--approve-auto` — the HITL confirmation point for the implicit rung.
 * `--plan` shows the plan without probing dependencies or generating.
 */
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runBrollStage,
  buildGenerationPlan,
  serializeMediaChainPlan,
} from "./lib/b-roll/orchestrator.mjs";
import { estSecondsPerClip, resolveModelTier } from "./lib/b-roll/runner.mjs";
import { EST_SECONDS_PER_IMAGE } from "./lib/b-roll/t2i-runner.mjs";
import { planPath, writePlan } from "./lib/b-roll/report.mjs";
import { DEFAULT_AUTO_SCENE_BUDGET, DEFAULT_AUTO_VIDEO_BUDGET } from "./lib/media-strategies.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const HELP = `B-roll generation (FastVideo FastMetal-1.3B-QAD + Z-Image Turbo, local MLX)

  node generate-broll.mjs --content <dir> [options]

Options:
  --content <dir>      Content directory under content/ (required)
  --scene <id>         Only generate for this scene id
  --force              Bypass the won-file cache and regenerate
  --max-scenes N       Cap the number of scenes generated this run
  --threshold N        Gate relevance threshold (default 60)
  --approve-auto       Approve the default chain's implicit generation (HITL)
  --auto-budget N      Chain scenes allowed to generate this run (default ${DEFAULT_AUTO_SCENE_BUDGET})
  --video-budget N     Chain scenes allowed to use T2V instead of T2I (default ${DEFAULT_AUTO_VIDEO_BUDGET})
  --plan               Write and print the media-chain plan, generate nothing
  --help               Show this help

Environment:
  FASTVIDEO_REPO           FastVideo checkout (default: experiments/fastvideo-spike/repo)
  FASTVIDEO_PYTHON         Interpreter override (honored strictly, no probing)
  BROLL_MODEL_ROOT         Pin the weights dir instead of re-resolving the HF cache
  BROLL_MLX_CHECKPOINT     Pin the packed MLX DiT dir (mlx_dit.json + mlx_dit.safetensors)
  AI_IMAGE_BACKEND         T2I backend (default mflux-boogu; mflux-z-image / sd3.5)
  MFLUX_BIN                mflux binary override (default probes ~/.video-t2i-env, then PATH)

Candidates: 2 per scene, portrait 480x832 video / 832x1216 image, Tier A params.
See docs/video-production-runbook.md for the agent prompt-iteration protocol.`;

function getArg(argv, name) {
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

async function defaultLoadScenes(contentDir) {
  const base = join(__dirname, "content", contentDir);
  const dataMod = await import(pathToFileURL(join(base, "scene-data.mjs")).href);
  const scenes = dataMod.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error(`No valid scenes array in content/${contentDir}/scene-data.mjs`);
  }
  return {
    slug: contentDir,
    scenes,
    contentDir: resolve(base),
    outputDir: join(__dirname, "output", contentDir),
  };
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${seconds}s (~${minutes}min)`;
}

/** One line per scene the plan actually asks a human/agent to decide on. */
export function formatMediaChainPlan(plan) {
  const lines = ["🗂  Media chain plan"];
  for (const entry of plan.entries) {
    if (!["generate", "approval-required", "budget-skipped"].includes(entry.action)) continue;
    const label = entry.auto ? "chain" : entry.strategy;
    const form = entry.form === "auto" ? "auto→image" : entry.form;
    const prompt = entry.promptSource ? ` · prompt: ${entry.promptSource}` : "";
    const why = entry.action === "generate" ? "" : ` · ${entry.action}`;
    lines.push(`   scene ${entry.scene.id} · ${label} · ${form}${prompt}${why}`);
  }
  const { summary } = plan;
  lines.push(
    `   → ${summary.generate} runnable · ${summary.approvalRequired} awaiting approval · ` +
      `${summary.budgetSkipped} over auto budget (${summary.autoBudget} scenes / ${summary.videoBudget} video)`,
  );
  return lines.join("\n");
}

function estimateForPlan(plan, { tier }) {
  let imageScenes = 0;
  let videoScenes = 0;
  let pending = 0;
  for (const entry of plan.entries) {
    if (entry.action === "approval-required") {
      pending += 1;
      continue;
    }
    if (entry.action !== "generate") continue;
    if (entry.form === "image") imageScenes += 1;
    else videoScenes += 1;
  }
  const perClip = estSecondsPerClip(tier);
  const runnableSeconds = imageScenes * 2 * EST_SECONDS_PER_IMAGE + videoScenes * 2 * perClip;
  // Pending chain scenes ride the T2I fast path until approved; quote it so
  // the approval request carries its own price tag.
  const pendingSeconds = pending * 2 * EST_SECONDS_PER_IMAGE;
  return { imageScenes, videoScenes, pending, runnableSeconds, pendingSeconds, perClip };
}

export async function runBrollCli({
  argv,
  loadScenes = defaultLoadScenes,
  runStage = runBrollStage,
  closeAnalyzer = null,
  log = console.log,
}) {
  if (argv.includes("--help") || argv.length === 0) {
    log(HELP);
    return { exitCode: argv.includes("--help") ? 0 : 1 };
  }

  const contentArg = getArg(argv, "content");
  if (!contentArg) {
    log("❌ --content <dir> is required. Try: node generate-broll.mjs --help");
    return { exitCode: 1 };
  }

  const { slug, scenes, contentDir, outputDir } = await loadScenes(contentArg);

  const thresholdRaw = getArg(argv, "threshold");
  const maxScenesRaw = getArg(argv, "max-scenes");
  const autoBudgetRaw = getArg(argv, "auto-budget");
  const videoBudgetRaw = getArg(argv, "video-budget");
  const opts = {
    force: argv.includes("--force"),
    sceneFilter: getArg(argv, "scene"),
    threshold: thresholdRaw !== undefined ? Number(thresholdRaw) : undefined,
    maxScenes: maxScenesRaw !== undefined ? Number(maxScenesRaw) : undefined,
    approveAuto: argv.includes("--approve-auto"),
    autoBudget: autoBudgetRaw !== undefined ? Number(autoBudgetRaw) : DEFAULT_AUTO_SCENE_BUDGET,
    videoBudget: videoBudgetRaw !== undefined ? Number(videoBudgetRaw) : DEFAULT_AUTO_VIDEO_BUDGET,
    planOnly: argv.includes("--plan"),
  };

  // The plan is the single source for "is there anything to do?" and for the
  // HITL request. It is written before any dependency probe.
  const plan = buildGenerationPlan(scenes, {
    sceneFilter: opts.sceneFilter,
    approveAuto: opts.approveAuto,
    autoBudget: opts.autoBudget,
    videoBudget: opts.videoBudget,
  });
  const runnable = plan.entries.filter((entry) => entry.action === "generate");
  const approvalRequired = plan.summary.approvalRequired;

  if (runnable.length === 0 && approvalRequired === 0) {
    log(
      "ℹ️  No scenes require B-roll generation (no chain candidate, cache-complete, or filtered out).",
    );
    return { exitCode: 0, plan };
  }

  const planFile = planPath(outputDir);
  writePlan(
    planFile,
    serializeMediaChainPlan(plan, { content: slug, approveAuto: opts.approveAuto }),
  );
  log(formatMediaChainPlan(plan));

  if (opts.planOnly) {
    log(`\n📝 Plan only — nothing generated. Plan: ${planFile}`);
    return { exitCode: 0, plan, planFile };
  }

  const tier = resolveModelTier(process.env);
  const estimate = estimateForPlan(plan, { tier });
  if (runnable.length > 0) {
    log(
      `🎞  B-roll: ${runnable.length} scene(s) x 2 candidates = ${formatDuration(estimate.runnableSeconds)} ` +
        `(~${EST_SECONDS_PER_IMAGE}s/image, ~${estimate.perClip}s/clip on ${tier}; cache hits reduce this)`,
    );
  }
  if (approvalRequired > 0) {
    log(
      `⏸  ${approvalRequired} chain scene(s) need approval before spending GPU ` +
        `(~${formatDuration(estimate.pendingSeconds)} on the T2I fast path). ` +
        `Review ${planFile}, then rerun with --approve-auto ` +
        `(budgets: --auto-budget N / --video-budget N).`,
    );
  }

  // Nothing runnable but a plan to approve: the file is written, no stage call.
  if (runnable.length === 0) return { exitCode: 0, plan, planFile };

  const result = await runStage({
    scenes,
    contentSlug: slug,
    contentDir,
    outputDir,
    force: opts.force,
    sceneFilter: opts.sceneFilter,
    threshold: opts.threshold,
    maxScenes: opts.maxScenes,
    approveAuto: opts.approveAuto,
    autoBudget: opts.autoBudget,
    videoBudget: opts.videoBudget,
    onProgress: (line) => log(line),
  });

  if (closeAnalyzer) {
    try {
      await closeAnalyzer();
    } catch (_e) {
      // VLM shutdown is best-effort.
    }
  }

  if (result.depsError) {
    log(`⚠️  B-roll skipped: ${result.depsError}`);
    return { exitCode: 0, result, plan, planFile };
  }

  const { counts } = result;
  log("\n📊 B-roll summary");
  log(
    `   generated(won): ${counts.generated} | cached: ${counts.cached} | failed: ${counts.failed} | ` +
      `escalated: ${counts.escalated} | skipped: ${counts.skipped} | ` +
      `approval-required: ${counts.approvalRequired ?? 0} | over-auto-budget: ${counts.budgetSkipped ?? 0}`,
  );
  if (result.reportFile) log(`   report: ${result.reportFile}`);
  if (result.planFile) log(`   plan: ${result.planFile}`);
  if ((counts.failed ?? 0) > 0 || (counts.escalated ?? 0) > 0) {
    log(
      "   → Agent iteration: read the report, rewrite the failing prompt (8-dimension video template or its 6-dimension image variant), rerun. Max 3 rounds per scene.",
    );
  }
  if ((result.counts?.approvalRequired ?? 0) > 0) {
    log(
      "   → Chain scenes still await approval: rerun with --approve-auto after the HITL confirmation.",
    );
  }
  return { exitCode: 0, result, plan, planFile };
}

const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { closeVisualAnalyzer } = await import("./lib/visual-analyzer.mjs");
  runBrollCli({
    argv: process.argv.slice(2),
    closeAnalyzer: closeVisualAnalyzer,
  })
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error(`❌ B-roll CLI failed: ${error.message}`);
      process.exit(1);
    });
}
