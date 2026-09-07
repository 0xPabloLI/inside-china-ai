#!/usr/bin/env node
/**
 * Digital-human generation CLI (#214) — plan / approve / run / resume.
 *
 * Three-state workflow (spec docs/specs/spec-digital-human-pipeline.md):
 *   plan    Dry-run: compute which avatar scenes need generation, how each
 *           scene's TTS audio splits under the model's per-segment cap
 *           (silence-boundary segmentation), and the per-segment/total
 *           duration+cost estimate. Writes exactly one file —
 *           output/{pipelineId}/digital-human-plan.json — and makes NO
 *           remote calls and NO scene-data / remote-task writes.
 *   approve HITL gate: flip approval.approved in the plan file after a human
 *           reviewed it. File edit only — no remote calls.
 *   run     Execute an APPROVED plan: slice TTS audio at unit boundaries,
 *           push the per-run Kaggle input dataset (portrait + driver wavs),
 *           submit one EchoMimicV3 Flash v51 kernel per unit (remote-task
 *           state machine), harvest, 2x upscale, ffmpeg concat, atomic
 *           scene-data writeback, and the 耗时/平台/费用 report.
 *   resume  Recover an interrupted run: re-harvest live/timeout units under
 *           their existing kernel ids, resubmit only failed/never-submitted
 *           units. Completed units are never resubmitted or re-billed.
 *
 * Usage:
 *   node scripts/short-video/digital-human.mjs plan --content <dir> [--tier free|quality]
 *   node scripts/short-video/digital-human.mjs approve --plan <plan.json>
 *   node scripts/short-video/digital-human.mjs run --plan <plan.json> [--portrait <img>]
 *   node scripts/short-video/digital-human.mjs resume --plan <plan.json> [--portrait <img>]
 *
 * Quality tier (Modal A100, SoulX-FlashTalk 14B, $0.20/5.2s segment) requires
 * per-package authorization; without it plan AND run refuse (spec scenario 8).
 */
import { resolve } from "node:path";

import { executeApprove, executePlan, MODEL_TIERS, runPlan, resumePlan } from "./lib/digital-human.mjs";

const HELP = `Digital-human generation orchestration (#214)

  node digital-human.mjs <subcommand> [options]

Subcommands:
  plan      Dry-run generation plan (scene list + segment table + cost estimate).
            Writes output/{pipelineId}/digital-human-plan.json only — zero remote
            calls, zero scene-data/remote-task writes.
  approve   HITL gate: set approval.approved=true on a reviewed plan file.
  run       Execute an approved plan on Kaggle T4 (EchoMimicV3 Flash v51):
            submit one kernel per generation unit, harvest, 2x upscale, concat,
            write scene.avatar.videoPath back atomically, write the report.
            Refuses unapproved plans and quality tier without authorization.
  resume    Recover an interrupted run: re-harvest live/timeout kernels, resubmit
            only failed/never-submitted units (completed units are never re-billed).

plan options:
  --content <dir>      Content directory under content/ (required)
  --tier <name>        free (default: Kaggle T4, EchoMimicV3 Flash v51, $0) or
                       quality (Modal A100, SoulX-FlashTalk 14B, $0.20/5.2s segment;
                       requires per-package authorization)
  --output-root <dir>  Override the output root (default: scripts/short-video/output)

approve/run/resume options:
  --plan <file>        Path to digital-human-plan.json (required)
  --portrait <img>     Reference photo override (run/resume only; default
                       content/<dir>/assets/avatar/portrait.jpg)
  --output-root <dir>  Sanity check: must match the plan's output dir

Quality-tier authorization (per package):
  content/<dir>/avatar-quality.authorized   marker file (empty file = authorized), or
  DIGITAL_HUMAN_QUALITY_AUTHORIZED=1        single-run env override

HITL flow: plan → human reviews the plan file → approve → run (→ resume on
interruption). run/resume refuse to start without approval.approved=true.
`;

function getArg(argv, name) {
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

function requirePlanPath(args, subcommand) {
  const planPath = getArg(args, "plan");
  if (!planPath) {
    console.error(`❌ ${subcommand} requires --plan <digital-human-plan.json>`);
    process.exit(1);
  }
  return planPath;
}

function printRunOutcome(result, subcommand) {
  switch (result.outcome) {
    case "completed": {
      const { report } = result;
      console.log(`✅ Digital-human run complete (${subcommand})`);
      for (const w of result.writtenBack) {
        console.log(`   Scene ${w.sceneId} → ${w.videoPath}`);
      }
      console.log(
        `   Units: ${report.totals.units}, generated scenes: ${report.totals.scenesGenerated}` +
          (report.totals.scenesSkipped ? `, skipped (already generated): ${report.totals.scenesSkipped}` : ""),
      );
      console.log(
        `   耗时 ${report.totals.elapsedSeconds}s · 平台 ${report.totals.platform} · 费用 $${report.totals.costUsd.toFixed(2)}` +
          (report.totals.quotaMinutes ? ` (Kaggle quota ${report.totals.quotaMinutes} min)` : ""),
      );
      console.log(`📄 Report: ${result.reportPath}`);
      return;
    }
    case "refused":
      console.error(`❌ ${result.reason}`);
      if (result.authSwitch) console.error(`   Authorization switch: ${result.authSwitch}`);
      process.exit(1);
      break;
    case "interrupted":
      console.error(`⏸️  ${result.reason}`);
      process.exit(1);
      break;
    case "failed":
    default:
      console.error(`❌ ${result.reason ?? "run failed"}`);
      process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  if (!subcommand || subcommand === "--help" || args.includes("--help")) {
    console.log(HELP);
    process.exit(subcommand ? 0 : 1);
  }

  if (!["plan", "approve", "run", "resume"].includes(subcommand)) {
    console.error(`❌ Unknown subcommand: ${subcommand}`);
    console.error("   Available: plan | approve | run | resume");
    process.exit(1);
  }

  if (subcommand === "approve") {
    const planPath = requirePlanPath(args, subcommand);
    const result = executeApprove(resolve(planPath));
    console.log(`✅ Plan approved (HITL gate passed)`);
    console.log(`   Plan: ${result.planPath}`);
    console.log(`   approvedAt: ${result.plan.approval.approvedAt}`);
    console.log(`   Next: node scripts/short-video/digital-human.mjs run --plan ${result.planPath}`);
    return;
  }

  if (subcommand === "plan") {
    await runPlanSubcommand(args);
    return;
  }

  // run / resume
  const planPath = requirePlanPath(args, subcommand);
  const portrait = getArg(args, "portrait");
  const outputRoot = getArg(args, "output-root");
  const execute = subcommand === "run" ? runPlan : resumePlan;
  console.log(`🧑‍💼 Digital-human ${subcommand}`);
  console.log(`   Plan: ${planPath}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  const result = await execute({
    planPath: resolve(planPath),
    portrait: portrait ? resolve(portrait) : undefined,
    outputRoot: outputRoot ? resolve(outputRoot) : undefined,
  });
  printRunOutcome(result, subcommand);
}

async function runPlanSubcommand(args) {
  const contentSlug = getArg(args, "content");
  if (!contentSlug) {
    console.error("❌ --content flag is required (e.g. --content deepseek)");
    process.exit(1);
  }
  const tier = getArg(args, "tier") ?? "free";
  const outputRoot = getArg(args, "output-root");

  console.log(`🧑‍💼 Digital-human plan (dry-run)`);
  console.log(`   Content: ${contentSlug}`);
  console.log(`   Tier: ${tier} — ${MODEL_TIERS[tier]?.model ?? "unknown"}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const result = await executePlan({
    contentSlug,
    outputRoot: outputRoot ? resolve(outputRoot) : undefined,
    tier,
  });

  if (result.outcome === "no-avatar") {
    console.log("✅ 无需生成 — this package declares no scene.avatar; nothing to plan.");
    console.log("   (No files written, no remote calls made.)");
    return;
  }

  if (result.outcome === "refused") {
    console.error(`❌ ${result.reason}`);
    console.error(`   Authorization switch: ${result.authSwitch}`);
    process.exit(1);
  }

  const plan = result.plan;
  console.log(`   Pipeline: ${plan.pipelineId}`);
  console.log(`   Segmentation cap: ${plan.model.segmentCapSeconds}s/segment (silence-boundary split)`);
  console.log("");
  for (const s of plan.scenes) {
    if (s.status === "already-generated") {
      console.log(`   Scene ${s.sceneId}: already generated (videoPath set) — skipped`);
      continue;
    }
    const segs = s.segments
      .map((seg) => `[${seg.from.toFixed(2)}–${seg.to.toFixed(2)}s]${seg.hardCut ? "⚠︎hard" : ""}`)
      .join(" ");
    console.log(
      `   Scene ${s.sceneId}: ${s.segmentCount} segment(s) / ${s.unitCount} generation unit(s), ` +
        `${s.durationSeconds.toFixed(2)}s audio, boundaries=${s.boundarySource}` +
        (s.presentIntervals ? `, present=${JSON.stringify(s.presentIntervals)}` : ""),
    );
    console.log(`     ${segs}`);
  }
  console.log("");
  console.log(`   Scenes needing generation: ${plan.totals.scenesNeedingGeneration}`);
  console.log(`   Segments: ${plan.totals.segments} → generation units: ${plan.totals.generationUnits}`);
  console.log(`   Generated audio: ${plan.totals.generatedSeconds}s`);
  console.log(
    `   Platform: ${plan.totals.platform} — est. ${plan.totals.estimatedMinutes} min` +
      (plan.totals.quota ? ` (${plan.totals.quota})` : "") +
      `, cost $${plan.totals.costUsd.toFixed(2)}`,
  );
  console.log("");
  console.log(`📄 Plan written: ${result.planPath}`);
  console.log("   No remote calls were made; scene-data and remote-task state are untouched.");
  console.log(
    `   Review the plan, then: node scripts/short-video/digital-human.mjs approve --plan ${result.planPath}`,
  );
}

main().catch((err) => {
  console.error(`\n❌ Digital-human ${process.argv[2] ?? "cli"} failed: ${err.message}`);
  process.exit(1);
});
