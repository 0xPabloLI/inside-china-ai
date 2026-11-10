#!/usr/bin/env node
/**
 * #735 — QA final-review loop for one content pack.
 *
 * Two declared acceptance frames per scene (relative offsets resolved through
 * lib/timeline.mjs), one batched ffmpeg extraction from the FINISHED video,
 * 3x4 contact sheets, and an input packet for an independent reviewer. The
 * reviewer's JSON report is validated in `--report` mode.
 *
 * This is a standalone post-render step. It does not edit any existing gate or
 * render entry point; quantitative thresholds are out of scope (2026-11-09
 * HITL option A). Run it after `verify-video.mjs` is green and before HITL.
 *
 * Usage:
 *   node scripts/short-video/qa-final-review.mjs --content <id> --video <finished.mp4> [--implementer <id>]
 *   node scripts/short-video/qa-final-review.mjs --content <id> --plan-only
 *   node scripts/short-video/qa-final-review.mjs --content <id> --report output/<id>/qa/final-review.json
 */
import { execFileSync } from "child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readSceneDurationsForTimeline } from "./lib/avatar-frame-audit.mjs";
import { extractFramesAtIndexes } from "./lib/frame-extract.mjs";
import {
  SHEET_LAYOUT,
  buildSheetCommand,
  decideReviewOutcome,
  planAcceptanceFrames,
  renderReviewRequest,
  validateReviewReport,
} from "./lib/qa-final-review.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);
const die = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

const contentId = getArg("content");
if (!contentId) {
  die(
    "usage: qa-final-review.mjs --content <id> --video <finished.mp4> [--implementer <id>] | --plan-only | --report <final-review.json>",
  );
}
// Same shape as still-frame.mjs: the id is a path segment and must not escape
// the content tree.
if (!/^[a-z0-9_][a-z0-9._-]*$/.test(contentId)) {
  die(`--content must be a content id, got: ${JSON.stringify(contentId)}`);
}

const contentDir = join(__dirname, "content", contentId);
const qaDir = join(__dirname, "output", contentId, "qa");
const framesDir = join(qaDir, "frames");
const sheetsDir = join(qaDir, "sheets");
const planOnly = hasFlag("plan-only");
const reportPath = getArg("report");
const videoPath = getArg("video");
const implementer = getArg("implementer") || process.env.USER || "pipeline-session";

if (!existsSync(join(contentDir, "scene-data.mjs"))) {
  die(`no scene-data.mjs for content ${contentId}`);
}
if (!videoPath && !planOnly && !reportPath) {
  die("--video <finished.mp4> is required (or use --plan-only / --report)");
}
if (videoPath && !existsSync(videoPath)) {
  die(`video not found: ${videoPath}`);
}

const { scenes } = await import(join(contentDir, "scene-data.mjs"));
const audioDir = join(__dirname, "output", contentId, "audio");
let durations;
try {
  durations = readSceneDurationsForTimeline(audioDir, scenes.length);
} catch (e) {
  die(e.message);
}
const durationById = new Map(durations.map((d) => [d.sceneId, d.duration]));
const declarations = scenes.map((scene) => {
  const duration = durationById.get(scene.id);
  if (typeof duration !== "number" || duration <= 0) {
    throw new Error(`no duration for scene ${scene.id} in ${audioDir}`);
  }
  return { sceneId: scene.id, duration, voiceover: scene.voiceover ?? "" };
});

let plan;
try {
  plan = planAcceptanceFrames(declarations);
} catch (e) {
  die(e.message);
}

mkdirSync(qaDir, { recursive: true });
const manifestPath = join(qaDir, "acceptance-frames.json");
let previousManifest = null;
if (existsSync(manifestPath)) {
  try {
    previousManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    previousManifest = null;
  }
}
const videoInfo = videoPath
  ? { path: videoPath, name: basename(videoPath), bytes: statSync(videoPath).size }
  : (previousManifest?.video ?? null);
const manifest = {
  contentId,
  video: videoInfo,
  implementer,
  ...plan,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const reviewRequest = renderReviewRequest(plan, {
  contentId,
  videoPath: videoPath ?? "(plan-only: no video supplied)",
  implementer,
});
writeFileSync(join(qaDir, "review-request.md"), reviewRequest);

if (reportPath) {
  // The report must be checked against the declaration the reviewer actually
  // saw, not a freshly recomputed one (a TTS retake between the two would
  // otherwise re-legitimise an outdated set of frame numbers).
  if (!previousManifest?.frames) {
    die("no QA packet for this content — run the full loop with --video first");
  }
  const savedFrames = previousManifest.frames.map((f) => f.frame).join(",");
  const currentFrames = plan.frames.map((f) => f.frame).join(",");
  if (savedFrames !== currentFrames) {
    die(
      "the acceptance frame declaration changed since the QA packet was built — rebuild the packet with --video before reviewing",
    );
  }
  if (!existsSync(reportPath)) die(`report not found: ${reportPath}`);
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (e) {
    die(`cannot parse report: ${e.message}`);
  }
  const validation = validateReviewReport(report, plan);
  const outcome = decideReviewOutcome(report, plan);
  if (!validation.ok) {
    for (const error of validation.errors) console.error(`   - ${error}`);
    die(`final review INVALID (${validation.errors.length} problem(s))`);
  }
  console.log(`Final review: ${outcome.status}`);
  if (outcome.status === "fix-required") {
    console.log(
      `   P0/P1 findings: ${outcome.blockers.length} → fix and rerun as round ${outcome.nextRound}`,
    );
    for (const b of outcome.blockers)
      console.log(`   frame ${b.frame} [${b.severity}] ${b.evidence}`);
    process.exit(1);
  }
  if (outcome.status === "exhausted") {
    console.error(
      `   three review rounds still leave ${outcome.blockers.length} P0/P1 — do not publish`,
    );
    process.exit(1);
  }
  console.log(
    `   ${plan.frames.length} acceptance frames reviewed, no P0/P1 blockers → HITL may proceed`,
  );
  process.exit(0);
}

console.log(
  `QA plan: ${plan.scenes.length} scenes / ${plan.frames.length} frames / ${plan.sheets.length} sheets (${plan.totalFrames} frames @ ${plan.fps}fps)`,
);
console.log(`   declaration: ${join(qaDir, "acceptance-frames.json")}`);
console.log(`   reviewer packet: ${join(qaDir, "review-request.md")}`);
if (planOnly) {
  console.log("   --plan-only: no frames extracted; supply --video for the full loop");
  process.exit(0);
}

// One ffmpeg pass for every acceptance frame. Missing frames mean the finished
// video is shorter than the timeline (runbook:164): fail closed rather than
// quietly reviewing a subset of the declared frames.
const { byFrame, missing } = await extractFramesAtIndexes({
  videoPath,
  frames: plan.frames.map((f) => f.frame),
  outDir: framesDir,
  nameFor: (f) => `frame-${f}.png`,
});
if (missing.length > 0) {
  die(
    `${missing.length} declared acceptance frame(s) are absent from ${basename(videoPath)} (frames: ${missing.join(", ")}). ` +
      "The finished video is shorter than the scene timeline — rerun the render or TTS before reviewing.",
  );
}

mkdirSync(sheetsDir, { recursive: true });
const blankPath = join(sheetsDir, ".blank.png");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=270x480:d=1",
    "-frames:v",
    "1",
    blankPath,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

for (const sheet of plan.sheets) {
  const tilesDir = join(sheetsDir, `.tiles-${String(sheet.index).padStart(2, "0")}`);
  mkdirSync(tilesDir, { recursive: true });
  const framePaths = [];
  for (let i = 0; i < SHEET_LAYOUT.cols * SHEET_LAYOUT.rows; i += 1) {
    const source = sheet.cells[i] ? byFrame.get(sheet.cells[i].frame) : blankPath;
    const staged = join(tilesDir, `${String(i + 1).padStart(2, "0")}.png`);
    copyFileSync(source ?? blankPath, staged);
    framePaths.push(staged);
  }
  const outPath = join(sheetsDir, sheet.name);
  const pattern = join(tilesDir, "%02d.png");
  const argv = buildSheetCommand({ framePaths, outPath, inputPattern: pattern });
  try {
    execFileSync(argv[0], argv.slice(1), {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (e) {
    die(`sheet ${sheet.name} tiling failed: ${e.stderr?.toString().slice(-400) ?? e.message}`);
  }
  rmSync(tilesDir, { recursive: true, force: true });
  console.log(`   ${sheet.name}: ${sheet.cells.length} frame(s) → ${outPath}`);
}
rmSync(blankPath, { force: true });

console.log("\n✅ QA packet ready. Hand review-request.md + sheets to an INDEPENDENT reviewer.");
console.log(
  `   Then: node scripts/short-video/qa-final-review.mjs --content ${contentId} --report <final-review.json>`,
);
