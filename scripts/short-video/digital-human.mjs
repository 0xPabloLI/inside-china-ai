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
 *   audit   Frame audit (ticket 05): run the three-gate avatar frame audit
 *           (safe-zone compliance / lip movement / A/V sync) for every avatar
 *           scene of a plan against the COMPOSED render. Any gate FAIL exits
 *           non-zero and the package must NOT enter the publish chain; the
 *           error names the failed gate + zone and cites evidence frames.
 *
 * Usage:
 *   node scripts/short-video/digital-human.mjs plan --content <dir> [--tier free|quality]
 *   node scripts/short-video/digital-human.mjs approve --plan <plan.json>
 *   node scripts/short-video/digital-human.mjs run --plan <plan.json> [--portrait <img>]
 *   node scripts/short-video/digital-human.mjs resume --plan <plan.json> [--portrait <img>]
 *   node scripts/short-video/digital-human.mjs audit --plan <plan.json> [--video <render.mp4>]
 *
 * Quality tier (Modal A100, SoulX-FlashTalk 14B, $0.20/5.2s segment) requires
 * per-package authorization; without it plan AND run refuse (spec scenario 8).
 */
import { join, resolve } from "node:path";

import { executeApprove, executePlan, MODEL_TIERS, readPlanFile, runPlan, resumePlan } from "./lib/digital-human.mjs";
import { auditDigitalHumanPackage, FRAME_AUDIT_RESULT_NAME } from "./lib/avatar-frame-audit.mjs";
import { resolveOutputVideo } from "./lib/assemble.mjs";

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
            --force clears prior-generation state first (see options below).
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
  --force              run only: regenerate scenes the plan lists as
                       needs-generation even when state says they are done —
                       clears scene-data avatar.videoPath + cached mp4 and the
                       matching remote-task records, auto-stamps a fresh
                       DH_KERNEL_TAG. Refuses while matching kernels are
                       still running. Use the ORIGINAL approved plan (a
                       re-planned file marks scenes already-generated).

audit options:
  --plan <file>        Path to digital-human-plan.json (required) — supplies
                       the avatar scene list, TTS audio paths and present windows
  --video <file>       Composed render to audit (default: latest
                       output/{pipelineId}/{prefix}-v*-short.mp4)
  --output-root <dir>  Sanity check: must match the plan's output dir

Audit outputs (T6 publish-chain wiring consumes the exit code + result JSON):
  output/{pipelineId}/avatar/frame-audit-result.json   machine-readable gates
  output/{pipelineId}/avatar/frame-audit/scene-<id>/   evidence frames

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

  if (!["plan", "approve", "run", "resume", "audit"].includes(subcommand)) {
    console.error(`❌ Unknown subcommand: ${subcommand}`);
    console.error("   Available: plan | approve | run | resume | audit");
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

  if (subcommand === "audit") {
    await runAuditSubcommand(args);
    return;
  }

  // run / resume
  const planPath = requirePlanPath(args, subcommand);
  const portrait = getArg(args, "portrait");
  const outputRoot = getArg(args, "output-root");
  const force = args.includes("--force");
  if (force && subcommand !== "run") {
    console.error("❌ --force is only valid for the run subcommand");
    process.exit(1);
  }
  const execute = subcommand === "run" ? runPlan : resumePlan;
  console.log(`🧑‍💼 Digital-human ${subcommand}`);
  console.log(`   Plan: ${planPath}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  const result = await execute({
    planPath: resolve(planPath),
    portrait: portrait ? resolve(portrait) : undefined,
    outputRoot: outputRoot ? resolve(outputRoot) : undefined,
    force,
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

async function runAuditSubcommand(args) {
  const planPath = requirePlanPath(args, "audit");
  const videoArg = getArg(args, "video");
  const outputRoot = getArg(args, "output-root");

  const plan = readPlanFile(resolve(planPath));
  const planDir = resolve(planPath, "..");
  const outputBase = resolve(planDir, "..");
  if (outputRoot && resolve(outputRoot) !== outputBase) {
    console.error(`❌ --output-root ${outputRoot} does not match the plan's output dir ${outputBase}`);
    process.exit(1);
  }

  // Default video: the same resolution verify-video.mjs uses (latest -v*-short.mp4).
  const videoPath = videoArg
    ? resolve(videoArg)
    : resolveOutputVideo(join(outputBase, plan.pipelineId), plan.pipelineId);

  console.log(`🔍 Avatar frame audit (#214 ticket 05)`);
  console.log(`   Plan: ${planPath}`);
  console.log(`   Video: ${videoPath}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Scene count for timeline offsets comes from the package's scene-data.
  let totalSceneCount = 0;
  try {
    const dataMod = await import(`${resolve(plan.contentDir, "scene-data.mjs").replace(/\\/g, "/")}`);
    totalSceneCount = (dataMod.scenes ?? []).length;
  } catch {
    // readSceneDurationsForTimeline still validates completeness against this count.
  }
  if (!totalSceneCount) {
    console.error(`❌ Cannot read scenes from ${plan.contentDir}/scene-data.mjs — timeline offsets unavailable`);
    process.exit(1);
  }

  let result;
  try {
    result = await auditDigitalHumanPackage({
      plan,
      videoPath,
      outputDir: join(outputBase, plan.pipelineId),
      totalSceneCount,
    });
  } catch (e) {
    console.error(`❌ Frame audit could not run: ${e.message}`);
    process.exit(1);
  }

  for (const scene of result.scenes) {
    const mark = scene.ok ? "✅" : "❌";
    console.log(`${mark} Scene ${scene.sceneId} — ${scene.gates.map((g) => g.gate).join(" / ")}`);
    for (const gate of scene.gates) {
      const icon = gate.status === "pass" ? "✅" : gate.status === "skip" ? "⏭️ " : "❌";
      console.log(`   ${icon} [${gate.gate}] ${gate.status.toUpperCase()} — ${gate.detail}`);
    }
    if (!scene.ok) {
      console.log(`   Evidence frames: ${scene.evidenceDir}/`);
    }
  }

  console.log(`\n   Scenes: ${result.totals.scenesPassed}/${result.totals.scenes} passed`);
  console.log(`📄 Result: ${result.resultPath}`);

  if (!result.ok) {
    console.error(
      `\n⛔ Frame audit FAILED — the package must NOT enter the publish chain ` +
        `(${result.totals.failedGates.length} failed gate(s); see evidence frames above).`,
    );
    process.exit(1);
  }
  console.log(`\n✅ All avatar scenes passed the frame audit — clear for the publish chain.`);
}

main().catch((err) => {
  console.error(`\n❌ Digital-human ${process.argv[2] ?? "cli"} failed: ${err.message}`);
  process.exit(1);
});
