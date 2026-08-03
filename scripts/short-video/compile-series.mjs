#!/usr/bin/env node
/**
 * Compilation Script — Plan A: FFmpeg Concat with Xfade
 *
 * Merges multiple MP4 files into one compilation video with
 * cross-fade transitions (1s video xfade + 1s audio acrossfade).
 *
 * Usage:
 *   node scripts/short-video/compile-series.mjs --videos p1.mp4 p2.mp4 p3.mp4 [--output out.mp4]
 *
 * Output:
 *   scripts/short-video/output/compilation.mp4 (default)
 */

import { existsSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI args ───

const args = process.argv.slice(2);
function getVideos() {
  const i = args.indexOf("--videos");
  if (i < 0 || i + 1 >= args.length) return [];
  const result = [];
  for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) {
    result.push(args[j]);
  }
  return result;
}
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const videos = getVideos();
const outputPath = getArg("output") || join(__dirname, "output", "compilation.mp4");
const XFADE_DURATION = 1; // seconds

// ─── Pure functions (exported for testing) ───

/**
 * Build a simple concat demuxer command (no transitions).
 */
export function buildConcatCommand(files, outputPath) {
  const listFile = "/tmp/ffmpeg-concat-list.txt";
  const entries = files.map((f) => `file '${resolve(f)}'`).join("\n");
  return `echo '${entries}' > ${listFile} && ffmpeg -y -f concat -safe 0 -i ${listFile} -c copy ${outputPath}`;
}

/**
 * Build an xfade + acrossfade FFmpeg command for multiple files.
 *
 * @param {Array<{path: string, duration: number}>} files - video files with durations
 * @param {string} outputPath - output file path
 * @param {number} xfadeDuration - transition duration in seconds
 * @returns {string} FFmpeg command string
 */
export function buildXfadeCommand(files, outputPath, xfadeDuration) {
  if (files.length === 0) return "";
  if (files.length === 1) {
    return `ffmpeg -y -i ${files[0].path} -c copy ${outputPath}`;
  }

  // Build input args
  const inputs = files.map((f) => `-i ${f.path}`).join(" ");

  // Build filter graph
  let filter = "";
  let prevVideoLabel = "[0:v]";
  let prevAudioLabel = "[0:a]";
  let cumulativeOffset = 0;

  for (let i = 1; i < files.length; i++) {
    const offset = Math.round(cumulativeOffset + files[i - 1].duration - xfadeDuration);
    cumulativeOffset += files[i - 1].duration - xfadeDuration;

    const vOut = i < files.length - 1 ? `[v${i}]` : "[vout]";
    const aOut = i < files.length - 1 ? `[a${i}]` : "[aout]";

    filter += `[${i - 1 === 0 ? "0" : i - 1}:v][${i}:v]xfade=transition=fade:duration=${xfadeDuration}:offset=${offset}${vOut};`;
    filter += `[${i - 1 === 0 ? "0" : i - 1}:a][${i}:a]acrossfade=d=${xfadeDuration}${aOut};`;

    prevVideoLabel = vOut;
    prevAudioLabel = aOut;
  }

  // Fix filter chain: need proper labeling
  // For 2 files: [0:v][1:v]xfade=...[vout];[0:a][1:a]acrossfade=...[aout]
  // For 3 files: [0:v][1:v]xfade=...[v1];[v1][2:v]xfade=...[vout];...
  filter = "";
  let vLabel = "0:v";
  let aLabel = "0:a";
  cumulativeOffset = 0;

  for (let i = 1; i < files.length; i++) {
    cumulativeOffset += files[i - 1].duration - xfadeDuration;
    const offset = Math.round(cumulativeOffset);
    const isLast = i === files.length - 1;
    const vOut = isLast ? "vout" : `v${i}`;
    const aOut = isLast ? "aout" : `a${i}`;

    filter += `[${vLabel}][${i}:v]xfade=transition=fade:duration=${xfadeDuration}:offset=${offset}[${vOut}];`;
    filter += `[${aLabel}][${i}:a]acrossfade=d=${xfadeDuration}[${aOut}];`;

    vLabel = vOut;
    aLabel = aOut;
  }

  // Remove trailing semicolon
  filter = filter.replace(/;$/, "");

  return `ffmpeg -y ${inputs} -filter_complex "${filter}" -map "[vout]" -map "[aout]" -c:v libx264 -c:a aac ${outputPath}`;
}

/**
 * Get video duration in seconds using ffprobe.
 */
function getVideoDuration(videoPath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: "utf8" },
    );
    return parseFloat(output.trim());
  } catch {
    return 0;
  }
}

// ─── Main ───

async function main() {
  if (videos.length === 0) {
    console.error("❌ No video files specified. Use --videos <path1> <path2> ...");
    process.exit(1);
  }

  console.log("🎬 Compilation Script — Plan A (FFmpeg Concat + Xfade)");
  console.log("=".repeat(60));

  // Validate files
  for (const v of videos) {
    if (!existsSync(v)) {
      console.error(`❌ File not found: ${v}`);
      process.exit(1);
    }
  }

  console.log(`📹 Input: ${videos.length} file(s)`);
  videos.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));

  // Single file: just copy
  if (videos.length === 1) {
    console.log("\n📋 Single file — copying without re-encoding...");
    execSync(`cp "${videos[0]}" "${outputPath}"`);
    const size = statSync(outputPath).size;
    console.log(`✅ Done: ${outputPath} (${(size / 1024 / 1024).toFixed(1)}MB)`);
    return;
  }

  // Get durations
  console.log("\n⏱  Getting video durations...");
  const filesWithDuration = videos.map((v) => ({
    path: resolve(v),
    duration: getVideoDuration(v),
  }));
  filesWithDuration.forEach((f) => console.log(`  ${f.path}: ${f.duration.toFixed(1)}s`));

  // Build and run xfade command
  console.log("\n🔧 Building FFmpeg xfade command...");
  const cmd = buildXfadeCommand(filesWithDuration, outputPath, XFADE_DURATION);
  console.log(`  Command: ${cmd.substring(0, 120)}...`);

  try {
    execSync(cmd, { stdio: "pipe" });
    const size = statSync(outputPath).size;
    const totalDuration = filesWithDuration.reduce((s, f) => s + f.duration, 0);
    const compilationDuration = totalDuration - (filesWithDuration.length - 1) * XFADE_DURATION;

    console.log("\n" + "=".repeat(60));
    console.log("✅ Compilation complete!");
    console.log(`   📁 Output: ${outputPath}`);
    console.log(`   ⏱  Duration: ${compilationDuration.toFixed(1)}s`);
    console.log(`   📐 Resolution: 1080×1920 (9:16)`);
    console.log(`   📦 Size: ${(size / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   🎬 Parts: ${videos.length}`);
    console.log(`   ✨ Transitions: ${videos.length - 1} xfade(s)`);
    console.log("=".repeat(60));
  } catch (e) {
    console.error(`❌ FFmpeg failed: ${e.message}`);
    process.exit(1);
  }
}

// Run main only when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
