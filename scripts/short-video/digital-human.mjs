#!/usr/bin/env node
/**
 * Digital-human generation CLI (#214) — plan / approve / run orchestration.
 *
 * Subcommands:
 *   plan    Dry-run: compute which avatar scenes need generation, how each
 *           scene's TTS audio splits under the model's per-segment cap
 *           (silence-boundary segmentation), and the per-segment/total
 *           duration+cost estimate. Writes exactly one file —
 *           output/{pipelineId}/digital-human-plan.json — and makes NO
 *           remote calls and NO scene-data / remote-task writes.
 *   run     Not implemented yet (#214 ticket 04) — consumes an approved plan.
 *   resume  Not implemented yet (#214 ticket 04) — resumes interrupted runs.
 *
 * Usage:
 *   node scripts/short-video/digital-human.mjs plan --content <dir> [--tier free|quality]
 *
 * Quality tier (Modal A100, SoulX-FlashTalk 14B, $0.20/5.2s segment) requires
 * per-package authorization; without it plan refuses (spec scenario 8).
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executePlan, MODEL_TIERS } from "./lib/digital-human.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const HELP = `Digital-human generation orchestration (#214)

  node digital-human.mjs plan --content <dir> [options]

Subcommands:
  plan      Dry-run generation plan (scene list + segment table + cost estimate).
            Writes output/{pipelineId}/digital-human-plan.json only — zero remote
            calls, zero scene-data/remote-task writes.

Options:
  --content <dir>      Content directory under content/ (required)
  --tier <name>        free (default: Kaggle T4, EchoMimicV3 Flash v51, $0) or
                       quality (Modal A100, SoulX-FlashTalk 14B, $0.20/5.2s segment;
                       requires per-package authorization)
  --output-root <dir>  Override the output root (default: scripts/short-video/output)
  --help               Show this help

Quality-tier authorization (per package):
  content/<dir>/avatar-quality.authorized   marker file (empty file = authorized), or
  DIGITAL_HUMAN_QUALITY_AUTHORIZED=1        single-run env override

Plan approval (HITL): review the plan file, then set approval.approved=true +
approval.approvedAt — run --plan (ticket 04) refuses without it.

Prerequisite: TTS already generated for the package (output/{pipelineId}/audio/),
plan reads scene-{id}.tts-meta.json / scene-durations.json + subtitle-timing.json.
`;

function getArg(argv, name) {
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  if (!subcommand || subcommand === "--help" || args.includes("--help")) {
    console.log(HELP);
    process.exit(subcommand ? 0 : 1);
  }

  if (subcommand !== "plan") {
    console.error(`❌ Unknown or not-yet-implemented subcommand: ${subcommand}`);
    console.error("   run/resume land with #214 ticket 04. Only `plan` is available.");
    process.exit(1);
  }

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
  console.log("   Review the plan, then set approval.approved=true for run --plan (#214 ticket 04).");
}

main().catch((err) => {
  console.error(`\n❌ Digital-human plan failed: ${err.message}`);
  process.exit(1);
});
