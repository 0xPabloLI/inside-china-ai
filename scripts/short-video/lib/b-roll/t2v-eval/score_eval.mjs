#!/usr/bin/env node
/**
 * Issue #298 eval scorer: FastMetal-5B-QAD vs Wan1.3B baseline B-roll clips.
 *
 * Scores each scene's baseline winner clip and the 5B candidate clip through
 * the production claim gate (gate.scoreCandidates + visual-analyzer, same
 * Qwen3-VL model, same GATE_THRESHOLD) against the same Scene Data claim —
 * like-for-like with the baseline report's relevance scores.
 *
 * Inputs:
 *   - Scene Data: content/ant-lingbot-world-13b/scene-data.mjs (claims)
 *   - Baseline clips: output/ant-lingbot-world-13b/assets/b-roll (winner files)
 *   - 5B clips: output/t2v-eval-fastmetal5b-20260925 (driver output)
 *
 * Output: output/t2v-eval-fastmetal5b-20260925/eval-scores.json
 *
 * Usage: node score_eval.mjs [--scenes 2,4,8,9]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
// Generated clips live in the main checkout's gitignored output dir (same
// convention as run_fastmetal5b.py), not the session worktree.
const runningInWorktree = /inside-china-ai-wt\//.test(repoRoot);
const outputsRoot = runningInWorktree
  ? resolve(repoRoot, "../../inside-china-ai/scripts/short-video/output")
  : join(repoRoot, "scripts/short-video/output");

const outDir = join(outputsRoot, "t2v-eval-fastmetal5b-20260925");
// Generated B-roll clips live under content/ per media-asset-management (only
// reports/logs land in output/).
const baselineDir = join(outputsRoot, "..", "content/ant-lingbot-world-13b/assets/b-roll");

const jobsDoc = JSON.parse(readFileSync(join(here, "fastmetal5b-jobs.json"), "utf8"));
const baselineReport = JSON.parse(
  readFileSync(join(outputsRoot, "ant-lingbot-world-13b/b-roll-report.json"), "utf8"),
);

const { buildClaim, scoreCandidates, GATE_THRESHOLD } = await import(
  pathToFileURL(join(repoRoot, "scripts/short-video/lib/b-roll/gate.mjs"))
);
const { analyzeAssetSemantics, closeVisualAnalyzer } = await import(
  pathToFileURL(join(repoRoot, "scripts/short-video/lib/visual-analyzer.mjs"))
);
const { scenes } = await import(
  pathToFileURL(join(repoRoot, "scripts/short-video/content/ant-lingbot-world-13b/scene-data.mjs"))
);

const args = process.argv.slice(2);
const scenesArg = args.includes("--scenes") ? args[args.indexOf("--scenes") + 1].split(",").map(Number) : null;

const rows = [];
try {
  for (const job of jobsDoc.jobs) {
    const sceneIdx = Number(job.sceneId);
    if (scenesArg && !scenesArg.includes(sceneIdx)) continue;
    const scene = scenes[sceneIdx - 1];
    const claim = buildClaim({ ...scene, mediaStrategy: "video" });
    const baseWinner = baselineReport.scenes[job.sceneId]?.winner?.file;
    const candidates = [];
    if (baseWinner) {
      const p = join(baselineDir, baseWinner);
      if (existsSync(p)) candidates.push({ variant: "baseline-1.3b", file: p });
      else console.warn(`[score] baseline clip missing: ${p}`);
    }
    const p5b = join(outDir, `${job.label}.mp4`);
    if (existsSync(p5b)) candidates.push({ variant: "fastmetal-5b", file: p5b });
    else console.warn(`[score] 5B clip missing: ${p5b}`);

    if (candidates.length === 0) {
      rows.push({ scene: sceneIdx, label: job.label, error: "no clips found" });
      continue;
    }
    // Force the windowed frame-extraction path: mlx_vlm's native-video
    // input returns a STALE cached analysis for every video after the first
    // in the same worker process (found during this eval — both variants got
    // byte-identical descriptions). Production gates pass scene windows, so
    // they hit the extraction path; the eval must too. 2fps over the full
    // clip (~10 frames) applied equally to both variants.
    const window = { startMs: 0, endMs: 6000, sampleFps: 2 };
    const scored = await scoreCandidates(candidates, {
      analyzer: analyzeAssetSemantics,
      claim,
      window,
    });
    rows.push({
      scene: sceneIdx,
      label: job.label,
      seed: job.seed,
      threshold: GATE_THRESHOLD,
      voiceover: claim.voiceover,
      results: scored.map((s) => ({
        variant: s.variant,
        relevance: s.relevance,
        passed: s.passed,
        reason: s.reason,
      })),
    });
    console.log(`[score] scene ${sceneIdx}:`,
      scored.map((s) => `${s.variant}=${s.relevance ?? "null"}`).join(" "));
  }
} finally {
  await closeVisualAnalyzer();
}

writeFileSync(join(outDir, "eval-scores.json"), JSON.stringify(rows, null, 1));
console.log(`[score] wrote ${join(outDir, "eval-scores.json")}`);
