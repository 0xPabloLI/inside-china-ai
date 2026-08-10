#!/usr/bin/env node
/**
 * Standalone BGM Mixer — adds background music to an existing video.
 *
 * Used AFTER HITL confirmation: the pipeline produces video without BGM,
 * user reviews at HITL, confirms BGM choice, then this script mixes it in.
 *
 * Usage:
 *   node scripts/short-video/mix-bgm.mjs --video <path> [--bgm-file <path>] [--pipeline-id <id>]
 *
 * If --bgm-file is omitted, auto-selects from the BGM pool using --pipeline-id.
 * Output: <video-path> with BGM mixed in (original saved as -nobgm.mp4)
 *
 * Mix settings: 0.1s fade-in (instant start), 12% volume, auto-loop, 3s fade-out.
 */

import { execSync, execFileSync } from "child_process";
import { existsSync, renameSync, unlinkSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { selectBGM } from "./lib/bgm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const videoPath = getArg("video");
if (!videoPath) {
  console.error("❌ --video flag is required");
  console.error("   Example: node mix-bgm.mjs --video output/kimi-sandbox/xxx-short.mp4 --pipeline-id kimi-sandbox");
  process.exit(1);
}

const bgmFileOverride = getArg("bgm-file");
const pipelineId = getArg("pipeline-id") || "default";

const absVideoPath = resolve(videoPath);
if (!existsSync(absVideoPath)) {
  console.error(`❌ Video not found: ${absVideoPath}`);
  process.exit(1);
}

// ── Select BGM ──
console.log("🎵 Selecting BGM...\n");
const bgmPath = selectBGM(pipelineId, bgmFileOverride);
if (!bgmPath) {
  console.error("❌ No BGM file available");
  process.exit(1);
}
console.log(`  🎵 BGM: ${bgmPath.split("/").pop()}\n`);

// ── Get video duration ──
let videoDuration = 180;
try {
  const info = execSync(
    `ffprobe -i "${absVideoPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
  ).toString();
  videoDuration = parseFloat(info.trim());
} catch {}

console.log(`  📹 Video: ${videoDuration.toFixed(1)}s`);

// ── Mix BGM ──
const noBgmPath = absVideoPath.replace(".mp4", "-nobgm.mp4");
renameSync(absVideoPath, noBgmPath);

const bgmFadeOutStart = Math.max(videoDuration - 3, 1).toFixed(2);
const filterComplex = `[1:a]afade=t=in:st=0:d=0.1,afade=t=out:st=${bgmFadeOutStart}:d=3,volume=0.12[bgm];[0:a]volume=1.0[tts];[tts][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`;

console.log("  🔧 Mixing BGM (instant start, 12% volume, auto-looped)...");

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i", noBgmPath,
    "-stream_loop", "-1",
    "-i", bgmPath,
    "-filter_complex", filterComplex,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    absVideoPath,
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);

console.log(`  ✅ BGM mixed in → ${absVideoPath.split("/").pop()}`);

// Clean up
try {
  unlinkSync(noBgmPath);
} catch {}

console.log("\n✅ Done!");
