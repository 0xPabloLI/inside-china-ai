#!/usr/bin/env node
/**
 * B-roll generation CLI — manual/agent entrypoint for the FastVideo B-roll stage.
 *
 * Usage:
 *   node generate-broll.mjs --content <dir> [--scene <id>] [--force]
 *                           [--max-scenes N] [--threshold N]
 *
 * Reads scene-data (never writes it), generates 2 candidates per opted-in
 * scene, gates them through the VLM, assigns winners in-memory, and records
 * everything in output/<dir>/b-roll-report.json for the agent iteration loop.
 */
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runBrollStage, scenesRequiringGeneration } from "./lib/b-roll/orchestrator.mjs";
import { EST_SECONDS_PER_CLIP } from "./lib/b-roll/runner.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const HELP = `B-roll generation (FastVideo FastMetal-1.3B-QAD, local MLX)

  node generate-broll.mjs --content <dir> [options]

Options:
  --content <dir>      Content directory under content/ (required)
  --scene <id>         Only generate for this scene id
  --force              Bypass the won-file cache and regenerate
  --max-scenes N       Cap the number of scenes generated this run
  --threshold N        Gate relevance threshold (default 60)
  --help               Show this help

Environment:
  FASTVIDEO_REPO           FastVideo checkout (default: experiments/fastvideo-spike/repo)
  FASTVIDEO_PYTHON         Interpreter override (honored strictly, no probing)
  BROLL_MODEL_ROOT         Pin the weights dir instead of re-resolving the HF cache
  BROLL_MLX_CHECKPOINT     Pin the packed MLX DiT dir (mlx_dit.json + mlx_dit.safetensors)

Candidates: 2 per scene, portrait 480x832, Tier A params. See
docs/video-workflow.md for the agent prompt-iteration protocol.`;

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
  const opts = {
    force: argv.includes("--force"),
    sceneFilter: getArg(argv, "scene"),
    threshold: thresholdRaw !== undefined ? Number(thresholdRaw) : undefined,
    maxScenes: maxScenesRaw !== undefined ? Number(maxScenesRaw) : undefined,
  };

  // Pre-count for the estimate; #24: zero needed scenes -> exit without
  // touching the stage, dependencies, or the report.
  const needed = scenesRequiringGeneration(
    scenes,
    opts.sceneFilter,
    opts.maxScenes ?? Infinity,
  ).length;

  if (needed === 0) {
    log(
      "ℹ️  No scenes require B-roll generation (no b-roll strategy, cache-complete, or filtered out).",
    );
    return { exitCode: 0 };
  }

  log(
    `🎞  B-roll: ${needed} scene(s) x 2 candidates x ~${EST_SECONDS_PER_CLIP}s ` +
      `= ${formatDuration(needed * 2 * EST_SECONDS_PER_CLIP)} (cache hits reduce this)`,
  );

  const result = await runStage({
    scenes,
    contentSlug: slug,
    contentDir,
    outputDir,
    force: opts.force,
    sceneFilter: opts.sceneFilter,
    threshold: opts.threshold,
    maxScenes: opts.maxScenes,
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
    return { exitCode: 0, result };
  }

  const { counts } = result;
  log("\n📊 B-roll summary");
  log(
    `   generated(won): ${counts.generated} | cached: ${counts.cached} | failed: ${counts.failed} | escalated: ${counts.escalated} | skipped: ${counts.skipped}`,
  );
  if (result.reportFile) log(`   report: ${result.reportFile}`);
  if (counts.failed > 0 || counts.escalated > 0) {
    log(
      "   → Agent iteration: read the report, rewrite failing prompts (8-dimension template), rerun. Max 3 rounds per scene.",
    );
  }
  return { exitCode: 0, result };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

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
