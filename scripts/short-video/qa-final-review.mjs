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
 *   node scripts/short-video/qa-final-review.mjs --content <id> --reproduce <frame> [--out <png>]
 *   node scripts/short-video/qa-final-review.mjs --content <id> --report <final-review.json>
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
  TILE_SIZE,
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
    "usage: qa-final-review.mjs --content <id> --video <finished.mp4> [--implementer <id>] | --plan-only | --reproduce <frame> | --report <final-review.json>",
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
const reproduceFrame = getArg("reproduce");
const videoPath = getArg("video");
const implementer = getArg("implementer") || process.env.USER || "pipeline-session";

if (!existsSync(join(contentDir, "scene-data.mjs"))) {
  die(`no scene-data.mjs for content ${contentId}`);
}
if (!videoPath && !planOnly && !reportPath && reproduceFrame === null) {
  die("--video <finished.mp4> is required (or use --plan-only / --reproduce / --report)");
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

const manifestPath = join(qaDir, "acceptance-frames.json");
let previousManifest = null;
if (existsSync(manifestPath)) {
  try {
    previousManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    previousManifest = null;
  }
}
const writeManifest = (manifest) =>
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// --reproduce: re-render ONE declared frame through still-frame.mjs, which
// checks the staged assets and reproduces the real render props. The loop
// reviews finished-video frames; this is the per-scene remotion still the
// issue names, kept as an explicit single-frame investigation step.
if (reproduceFrame !== null) {
  const frame = Number(reproduceFrame);
  if (!Number.isInteger(frame) || !plan.frames.some((f) => f.frame === frame)) {
    die(
      `--reproduce needs one declared acceptance frame: ${plan.frames.map((f) => f.frame).join(", ")}`,
    );
  }
  const out = getArg("out") || join(qaDir, `reproduce-${frame}.png`);
  mkdirSync(qaDir, { recursive: true });
  console.log(`Reproducing frame ${frame} via still-frame.mjs → ${out}`);
  try {
    execFileSync(
      process.execPath,
      [
        join(__dirname, "still-frame.mjs"),
        "--content",
        contentId,
        "--frame",
        String(frame),
        "--out",
        out,
      ],
      { stdio: "inherit" },
    );
  } catch {
    die(
      "still-frame.mjs failed — a still needs a prior full render of this content (staged assets)",
    );
  }
  console.log(`✅ reproduced frame ${frame}: ${out}`);
  process.exit(0);
}

// --report: check the report against the COMPLETE packet the reviewer saw.
if (reportPath) {
  if (!previousManifest?.complete) {
    die("no complete QA packet for this content — run the full loop with --video first");
  }
  const savedFrames = previousManifest.frames.map((f) => f.frame).join(",");
  const currentFrames = plan.frames.map((f) => f.frame).join(",");
  if (savedFrames !== currentFrames) {
    die(
      "the acceptance frame declaration changed since the QA packet was built — rebuild the packet with --video before reviewing",
    );
  }
  const missingStills = plan.frames.filter((f) => !existsSync(join(framesDir, f.pngName)));
  if (missingStills.length > 0) {
    die(
      `${missingStills.length} declared still(s) are missing from ${framesDir} — rebuild the packet`,
    );
  }
  const missingSheets = plan.sheets.filter((s) => !existsSync(join(sheetsDir, s.name)));
  if (missingSheets.length > 0) {
    die(`${missingSheets.length} sheet(s) are missing from ${sheetsDir} — rebuild the packet`);
  }
  if (!existsSync(reportPath)) die(`report not found: ${reportPath}`);
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (e) {
    die(`cannot parse report: ${e.message}`);
  }

  // Rounds are cumulative in the packet, so a reviewer cannot replay round 1
  // forever. The implementer is likewise fixed when the packet was built.
  const rounds = Array.isArray(previousManifest.reviewRounds) ? previousManifest.reviewRounds : [];
  const expectedRound = rounds.length + 1;
  if (report.round !== expectedRound) {
    die(`report round must be ${expectedRound} (packet has recorded ${rounds.length} round(s))`);
  }
  const validation = validateReviewReport(report, plan, {
    expectedImplementer: previousManifest.implementer,
  });
  const outcome = decideReviewOutcome(report, plan, validation);
  if (!validation.ok) {
    for (const error of validation.errors) console.error(`   - ${error}`);
    die(`final review INVALID (${validation.errors.length} problem(s))`);
  }
  // A validated (even failing) round counts; only an invalid report leaves the
  // ledger untouched.
  writeManifest({ ...previousManifest, reviewRounds: [...rounds, report.round] });

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
if (planOnly) {
  console.log(`   declared frames: ${plan.frames.map((f) => f.frame).join(", ")}`);
  console.log("   --plan-only: nothing written; supply --video for the full loop");
  process.exit(0);
}

// A half-built packet must never look complete to --report.
if (previousManifest) writeManifest({ ...previousManifest, complete: false });

// One ffmpeg pass for every acceptance frame. Missing frames mean the finished
// video is shorter than the timeline: fail closed rather than quietly
// reviewing a subset of the declared frames.
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
    `color=c=black:s=${TILE_SIZE.width}x${TILE_SIZE.height}:d=1`,
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

// Only now is the packet complete: manifest and reviewer input are written
// after the stills and sheets exist, so a failed run leaves no usable packet.
writeManifest({
  contentId,
  video: { path: videoPath, name: basename(videoPath), bytes: statSync(videoPath).size },
  implementer,
  complete: true,
  reviewRounds: [],
  ...plan,
});
writeFileSync(
  join(qaDir, "review-request.md"),
  renderReviewRequest(plan, { contentId, videoPath, implementer }),
);
console.log(`   declaration: ${manifestPath}`);
console.log(`   reviewer packet: ${join(qaDir, "review-request.md")}`);
console.log("\n✅ QA packet ready. Hand review-request.md + sheets to an INDEPENDENT reviewer.");
console.log(
  `   Then: node scripts/short-video/qa-final-review.mjs --content ${contentId} --report <final-review.json>`,
);
