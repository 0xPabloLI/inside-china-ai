#!/usr/bin/env node
/**
 * Replay one recorded render, without TTS, alignment or the pipeline gates.
 *
 * A render writes `output/<pipelineId>/render/<version>/` with `props.json`
 * and `manifest.json` (see lib/render-manifest.mjs). When a render fails, the
 * thrown error names this script; when a render needs to be reproduced later,
 * this script is the entry point.
 *
 * What it deliberately does not do: restage media. Staging rewrites the props
 * paths, so the original source path is gone by the time the manifest exists.
 * A missing staged asset therefore means "render this content again", and the
 * plan says exactly that instead of letting Remotion fail on frame 0.
 * Audio is the exception — the render door deletes its public copies after a
 * successful run, so they are copied back from `output/<id>/audio/`.
 *
 * Usage:
 *   node scripts/short-video/replay-render.mjs --manifest <path> [--plan]
 *       [--public-dir <dir>] [--remotion-dir <dir>] [--audio-dir <dir>]
 *
 *   --plan   print the plan (missing artifacts, command, cwd) and stop
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { finalizeRenderedVideo } from "./lib/post-process.mjs";
import {
  finalizePlan,
  formatRenderCommand,
  planReplay,
  readRenderArtifacts,
} from "./lib/render-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getArg(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function printPlan(manifestPath, plan) {
  console.log(`replay — ${manifestPath}`);
  console.log(`  kind:    ${plan.kind}`);
  console.log(`  command: ${formatRenderCommand(plan.command)}`);
  console.log(`  cwd:     ${plan.cwd}`);
  for (const item of plan.recoverable) {
    console.log(`  recover: ${item.rel} ← ${item.from}`);
  }
  for (const note of plan.notes) {
    console.log(`  note:    ${note}`);
  }
  if (!plan.ok) {
    console.log("  blocked:");
    for (const item of plan.blocking) console.log(`    - ${item}`);
  }
  console.log(`  status:  ${plan.ok ? "ok" : "blocked"}`);
}

export function main(args) {
  const manifestPath = getArg(args, "manifest");
  if (!manifestPath) {
    console.error(
      "usage: replay-render.mjs --manifest <path> [--plan] [--public-dir <dir>] [--remotion-dir <dir>] [--audio-dir <dir>]",
    );
    return 1;
  }
  if (!existsSync(manifestPath)) {
    console.error(`❌ manifest not found: ${manifestPath}`);
    return 1;
  }

  const remotionDir = getArg(args, "remotion-dir") || join(__dirname, "remotion");
  const publicDir = getArg(args, "public-dir") || join(remotionDir, "public");
  const audioDir = getArg(args, "audio-dir") || undefined;

  let plan;
  try {
    plan = planReplay({ manifestPath, publicDir, remotionDir, audioDir });
  } catch (e) {
    console.error(`❌ ${e.message}`);
    return 1;
  }
  printPlan(manifestPath, plan);

  if (!plan.ok) {
    console.error("\n❌ nothing was rendered — fix the items above, or re-run the pipeline.");
    return 1;
  }
  if (args.includes("--plan")) return 0;

  for (const item of plan.recoverable) {
    mkdirSync(dirname(item.to), { recursive: true });
    copyFileSync(item.from, item.to);
    console.log(`  copied ${item.rel}`);
  }

  try {
    execFileSync(plan.command[0], plan.command.slice(1), { cwd: plan.cwd, stdio: "inherit" });
  } catch (e) {
    // A spawn failure (missing npx, bad cwd) is not a render failure: saying
    // "exited non-zero" there sends the reader looking for output that never
    // existed.
    const spawn = typeof e.status !== "number";
    console.error(
      spawn
        ? `\n❌ replay could not start: ${e.code ?? "spawn error"} — ${e.message.split("\n")[0]}`
        : `\n❌ replay failed: the command exited with ${e.status} (see its output above).`,
    );
    console.error(`   manifest: ${manifestPath}`);
    return 1;
  }

  const { manifest, props } = readRenderArtifacts(manifestPath);
  // A still has no finalize pass and no raw file to delete: the render door
  // never runs ffmpeg on a PNG. Treating one as a video would both run
  // loudnorm on an image and then unlink the image itself.
  if (plan.kind === "still") {
    console.log(`\n✅ still: ${manifest.rawPath}`);
    return 0;
  }

  // Mirror the render door exactly: finalize always runs (loudnorm + head
  // trim), and the raw file is removed when no subtitles were burned. The
  // audio for the #176 head trim comes from the pipeline output, because the
  // door's public copies are already gone by the time a replay runs.
  const finalize = finalizePlan({ manifest, audioDir: plan.audioDir });
  finalizeRenderedVideo({
    videoPath: finalize.videoPath,
    assPath: finalize.assPath,
    bgmPath: finalize.bgmPath,
    outputPath: finalize.outputPath,
    realign: finalize.realign,
  });
  if (finalize.deleteRawAfter) {
    try {
      unlinkSync(manifest.rawPath);
    } catch {}
  }
  console.log(`\n✅ final: ${manifest.finalPath}`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
