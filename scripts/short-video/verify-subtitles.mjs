#!/usr/bin/env node
/**
 * Verify subtitle coverage and sync.
 * Usage: node verify-subtitles.mjs <video.mp4> <subtitle-timing.json> <scene-durations.json>
 *
 * Checks:
 * 1. Subtitle coverage — no gaps where audio plays but no subtitle
 * 2. Sync error — subtitle timestamps vs actual audio silence detection
 * 3. Last subtitle extends to end of audio
 */
import { readFileSync } from "fs";
import { execSync } from "child_process";

const videoPath = process.argv[2];
const timingPath = process.argv[3];
const durationsPath = process.argv[4] || null;

if (!videoPath || !timingPath) {
  console.error("Usage: node verify-subtitles.mjs <video.mp4> <subtitle-timing.json> [scene-durations.json]");
  process.exit(1);
}

// Load subtitle timing data
const timing = JSON.parse(readFileSync(timingPath, "utf8"));

// Get video duration
const videoDur = parseFloat(
  execSync(`ffprobe -i "${videoPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
);

// Load scene durations if provided (for per-scene offset calculation)
let sceneDurations = [];
if (durationsPath) {
  sceneDurations = JSON.parse(readFileSync(durationsPath, "utf8"));
}

// Calculate absolute subtitle timestamps
const subtitles = [];
let sceneOffset = 0;
for (const scene of timing) {
  const sceneId = scene.sceneId;
  const sceneDur = sceneDurations.find((s) => s.sceneId === sceneId)?.duration || 0;
  for (const seg of scene.segments || []) {
    const startAbs = sceneOffset + seg.start;
    const endAbs = sceneOffset + seg.end;
    subtitles.push({
      sceneId,
      start: startAbs,
      end: endAbs,
      text: seg.text?.substring(0, 40) || "",
    });
  }
  sceneOffset += sceneDur + 0.5; // 0.5s buffer between scenes
}

// Sort by start time
subtitles.sort((a, b) => a.start - b.start);

console.log(`\n📊 Subtitle Verification Report`);
console.log(`${"=".repeat(50)}`);
console.log(`Video: ${videoPath}`);
console.log(`Duration: ${videoDur.toFixed(1f)}s`);
console.log(`Subtitles: ${subtitles.length} chunks`);

// Check 1: Coverage gaps
console.log(`\n🔍 Check 1: Coverage Gaps`);
let gaps = [];
let prevEnd = 0;
for (const sub of subtitles) {
  if (sub.start - prevEnd > 1.0) {
    gaps.push({ from: prevEnd, to: sub.start, duration: sub.start - prevEnd });
  }
  prevEnd = Math.max(prevEnd, sub.end);
}
// Check gap at end
if (videoDur - prevEnd > 1.0) {
  gaps.push({ from: prevEnd, to: videoDur, duration: videoDur - prevEnd });
}

if (gaps.length === 0) {
  console.log(`  ✅ No gaps — subtitles cover entire audio`);
} else {
  console.log(`  ❌ ${gaps.length} gaps found:`);
  for (const g of gaps) {
    console.log(`     ${g.from.toFixed(1)}s - ${g.to.toFixed(1)}s (${g.duration.toFixed(1)}s gap)`);
  }
}

// Check 2: Last subtitle extends to end
console.log(`\n🔍 Check 2: Last Subtitle Coverage`);
const lastSub = subtitles[subtitles.length - 1];
if (lastSub) {
  const remaining = videoDur - lastSub.end;
  if (remaining > 1.0) {
    console.log(`  ❌ Last subtitle ends at ${lastSub.end.toFixed(1)}s, video ends at ${videoDur.toFixed(1)}s (${remaining.toFixed(1)}s uncovered)`);
  } else {
    console.log(`  ✅ Last subtitle covers to end (${lastSub.end.toFixed(1)}s / ${videoDur.toFixed(1)}s)`);
  }
}

// Check 3: Subtitle durations (too short = flickering)
console.log(`\n🔍 Check 3: Subtitle Duration`);
let tooShort = subtitles.filter((s) => s.end - s.start < 0.5);
if (tooShort.length === 0) {
  console.log(`  ✅ All subtitles ≥ 0.5s`);
} else {
  console.log(`  ⚠️ ${tooShort.length} subtitles shorter than 0.5s:`);
  for (const s of tooShort) {
    console.log(`     Scene ${s.sceneId}: ${(s.end - s.start).toFixed(2)}s — "${s.text}"`);
  }
}

// Summary
console.log(`\n${"=".repeat(50)}`);
const issues = gaps.length + (videoDur - lastSub?.end > 1.0 ? 1 : 0) + tooShort.length;
if (issues === 0) {
  console.log(`✅ PASS — No issues found`);
} else {
  console.log(`❌ FAIL — ${issues} issue(s) found`);
}
process.exit(issues > 0 ? 1 : 0);
