#!/usr/bin/env node
/**
 * Remotion Frame Analysis — pixel-based layout verification for rendered videos.
 *
 * Extracts key frames (one per scene, at scene midpoint) from the rendered MP4
 * via ffmpeg, analyzes each frame for safe-zone compliance, content presence,
 * and render integrity using lib/frame-analysis.mjs (pure functions).
 *
 * This is the Remotion-path counterpart of verify-scene-dom.mjs (which does
 * DOM-based checks for the Playwright path). Since Remotion renders to pixels
 * not DOM, we analyze the actual rendered output.
 *
 * Usage:
 *   node verify-remotion-frames.mjs --content <dir> [--video <path>]
 *
 *   --content:  content pipeline ID (required — e.g. deepseek, unitree-ipo)
 *   --video:    path to rendered MP4 (optional — auto-detected if not given)
 *
 * Exit code: 0 if all checks pass, 1 if any fail.
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, mkdirSync, rmSync, createReadStream } from "fs";
import { join, dirname } from "path";
import { resolveSceneAudio } from "./lib/audio/sync.mjs";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { SAFE_ZONES } from "./lib/safe-zones.mjs";
import { FPS, sceneTimeline, scheduleTotalFrames, TRANSITION_FRAMES } from "./lib/timeline.mjs";
import { resolveOutputVideo } from "./lib/assemble.mjs";
import { runFrameAnalysis, checkFinalFrameHasContent } from "./lib/frame-analysis.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Parse args ───
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const contentDir = getArg("content");
if (!contentDir) {
  const available = readdirSync(join(__dirname, "content"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  console.error("❌ --content flag is required. Available content:");
  available.forEach((d) => console.error(`   - ${d}`));
  process.exit(1);
}

const pipelineId = contentDir.replace(/\//g, "-");
const OUTPUT_DIR = join(__dirname, "output", pipelineId);
const SCENE_DATA_PATH = join(__dirname, "content", contentDir, "scene-data.mjs");
const META_PATH = join(__dirname, "content", contentDir, "meta.mjs");

// Auto-detect video path if not provided
let videoPath = getArg("video");
if (!videoPath) {
  let filePrefix = pipelineId;
  try {
    const metaMod = await import(`file://${META_PATH}`);
    const meta = metaMod.meta || null;
    const subject = meta?.subject;
    if (subject && subject !== pipelineId) filePrefix = `${subject}-${pipelineId}`;
  } catch {}
  videoPath = resolveOutputVideo(OUTPUT_DIR, filePrefix);
}

// ─── Results tracking ───
const results = { pass: 0, warn: 0, fail: 0 };

function logResult(r) {
  const icon = r.level === "pass" ? "✅" : r.level === "warn" ? "⚠️" : "❌";
  console.log(`  ${icon} ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
  results[r.level]++;
}

// ─── Banner ───
console.log(`\n🖼️ Remotion Frame Analysis — ${contentDir}`);
console.log("─".repeat(50));

// ─── Check video exists ───
if (!existsSync(videoPath)) {
  console.error(`❌ Video not found: ${videoPath}`);
  console.error(
    "   Run the pipeline first: node scripts/short-video/main.mjs --remotion --content " +
      contentDir,
  );
  process.exit(1);
}
console.log(`  Video: ${videoPath}`);

// ─── Load scene data ───
let scenes, durations;
try {
  const mod = await import(`file://${SCENE_DATA_PATH}`);
  scenes = mod.scenes || mod.default?.scenes;
} catch (e) {
  console.error(`❌ Failed to load scene-data: ${e.message}`);
  process.exit(1);
}

if (!scenes || scenes.length === 0) {
  console.error("❌ No scenes found in scene-data.mjs");
  process.exit(1);
}

// Load durations from audio files (same logic as render-remotion.mjs)
const audioDir = join(OUTPUT_DIR, "audio");
try {
  durations = scenes.map((scene) => {
    const audioPath = resolveSceneAudio(audioDir, scene.id);
    if (!audioPath) return 5; // fallback
    const info = execSync(
      `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString();
    return parseFloat(info.trim()) || 5;
  });
} catch {
  // Fallback: use uniform 5s durations
  durations = scenes.map(() => 5);
  console.log("  ⚠️  Could not load audio durations, using 5s fallback");
}

console.log(`  Scenes: ${scenes.length}, FPS: ${FPS}`);
console.log();

// ─── Create temp dir for frame PNGs ───
const tempDir = join(OUTPUT_DIR, ".frame-analysis");
mkdirSync(tempDir, { recursive: true });

// ─── Extract and analyze frames ───
let failed = 0;

// Shared schedule: sample where each scene's VISUAL actually is, which is the
// same place its audio and subtitles start (timeline option A2).
const schedule = sceneTimeline(
  scenes.map((scene, i) => ({ sceneId: scene.id ?? i + 1, duration: durations[i] ?? 5 })),
  { transitionOverlap: TRANSITION_FRAMES },
);
const totalFrames = scheduleTotalFrames(schedule);

for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i];
  const entry = schedule[i];
  const midFrame = entry.visualStartFrames + Math.floor(entry.visualFrames / 2);

  console.log(`Scene ${scene.id} (${scene.name || "scene"}): frame ${midFrame}`);

  // Extract frame as PNG via ffmpeg
  const framePath = join(tempDir, `scene-${scene.id}-frame-${midFrame}.png`);
  try {
    execSync(
      `ffmpeg -i "${videoPath}" -vf "select=eq(n\\,${midFrame})" -vframes 1 -y "${framePath}" -loglevel quiet`,
    );
  } catch (e) {
    console.log(`  ⚠️  Frame extraction failed for scene ${scene.id}: ${e.message?.slice(0, 100)}`);
    results.warn++;
    continue;
  }

  if (!existsSync(framePath)) {
    console.log(`  ⚠️  Frame PNG not created for scene ${scene.id}`);
    results.warn++;
    continue;
  }

  // Parse PNG → PixelBuffer
  let buf;
  try {
    buf = await new Promise((resolve, reject) => {
      createReadStream(framePath)
        .pipe(new PNG())
        .on("parsed", function (data) {
          resolve({ data, width: this.width, height: this.height });
        })
        .on("error", reject);
    });
  } catch (e) {
    console.log(`  ⚠️  PNG parsing failed for scene ${scene.id}: ${e.message?.slice(0, 100)}`);
    results.warn++;
    continue;
  }

  // Run analysis
  const analysisResults = runFrameAnalysis(buf, SAFE_ZONES);
  for (const r of analysisResults) {
    logResult(r);
  }

  const sceneFails = analysisResults.filter((r) => r.level === "fail");
  if (sceneFails.length > 0) {
    failed++;
  }

  console.log();
}

// ─── Last frame: the CTA must hold to the very last frame ───
const lastFrame = totalFrames - 1;
console.log(`Final frame (${lastFrame}/${totalFrames}): CTA must still be on screen`);

const lastFramePath = join(tempDir, `final-frame-${lastFrame}.png`);
let lastFrameExtracted = true;
try {
  execSync(
    `ffmpeg -i "${videoPath}" -vf "select=eq(n\\,${lastFrame})" -vframes 1 -y "${lastFramePath}" -loglevel quiet`,
  );
} catch (e) {
  lastFrameExtracted = false;
  console.log(`  ❌ Final frame extraction failed: ${String(e.message).slice(0, 120)}`);
  results.fail++;
  failed++;
}

if (lastFrameExtracted && existsSync(lastFramePath)) {
  const buf = await new Promise((resolve, reject) => {
    createReadStream(lastFramePath)
      .pipe(new PNG())
      .on("parsed", function (data) {
        resolve({ data, width: this.width, height: this.height });
      })
      .on("error", reject);
  });
  const tailResult = checkFinalFrameHasContent(buf, SAFE_ZONES);
  logResult(tailResult);
  if (tailResult.level === "fail") failed++;
}

console.log();

// ─── Cleanup ───
try {
  rmSync(tempDir, { recursive: true, force: true });
} catch {}

// ─── Summary ───
console.log("=".repeat(50));
console.log("FRAME ANALYSIS SUMMARY");
console.log("=".repeat(50));
console.log(`  ✅ PASS: ${results.pass}`);
console.log(`  ⚠️  WARN: ${results.warn}`);
console.log(`  ❌ FAIL: ${results.fail}`);

if (results.fail > 0) {
  console.log("\n❌ Frame analysis FAILED — fix layout issues in Remotion components.");
} else {
  console.log("\n✅ All frame checks passed!");
}
console.log("=".repeat(50));

process.exit(results.fail > 0 ? 1 : 0);
