#!/usr/bin/env node
/**
 * TikTok Best Practices Compliance Check
 *
 * Automated verification of video output against 2025-2026 TikTok best practices.
 * Run after pipeline completes. Checks everything that can be checked programmatically.
 * Outputs:
 *   - ✅ PASS items
 *   - ❌ FAIL items (with actionable fix)
 *   - 👤 MANUAL items (cannot automate, listed for user)
 *
 * Usage: node scripts/short-video/verify-video.mjs [--tiktok]
 *   --tiktok: also check TikTok-specific 60-70s duration requirement
 *
 * Exit code: 0 if all automated checks pass, 1 if any fail.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "output");
const VIDEO_PATH = join(OUTPUT_DIR, "deepseek-short.mp4");
const SCENE_DATA_PATH = join(__dirname, "scene-data.mjs");
const SUBTITLE_TIMING_PATH = join(OUTPUT_DIR, "audio", "subtitle-timing.json");

const checkTikTok = process.argv.includes("--tiktok");

// ─── Results tracking ───
const results = {
  pass: [],
  fail: [],
  manual: [],
};

function pass(category, check, detail = "") {
  results.pass.push({ category, check, detail });
  console.log(`  ✅ ${check}${detail ? ` — ${detail}` : ""}`);
}

function fail(category, check, detail, fix = "") {
  results.fail.push({ category, check, detail, fix });
  console.log(`  ❌ ${check}${detail ? ` — ${detail}` : ""}`);
  if (fix) console.log(`     → FIX: ${fix}`);
}

function manual(category, check, detail = "") {
  results.manual.push({ category, check, detail });
  console.log(`  👤 [MANUAL] ${check}${detail ? ` — ${detail}` : ""}`);
}

// ─── 1. Video file exists ───
console.log("\n📹 Video File Checks");
console.log("─".repeat(50));

if (!existsSync(VIDEO_PATH)) {
  fail("File", "Video file exists", `${VIDEO_PATH} not found`, "Run the pipeline first: node scripts/short-video/main.mjs --bgm");
  printSummary();
  process.exit(1);
}
pass("File", "Video file exists", VIDEO_PATH);

// ─── 2. Video specs (ffprobe) ───
console.log("\n📐 Video Specifications");
console.log("─".repeat(50));

let videoInfo;
try {
  const raw = execSync(
    `ffprobe -i "${VIDEO_PATH}" -show_entries format=duration -show_entries stream=width,height,codec_name,r_frame_rate -v quiet -of json`,
    { encoding: "utf8" }
  );
  videoInfo = JSON.parse(raw);
} catch {
  fail("Specs", "ffprobe can read video", "ffprobe failed", "Ensure ffmpeg is installed");
  printSummary();
  process.exit(1);
}

const duration = parseFloat(videoInfo.format?.duration || "0");
const stream = videoInfo.streams?.[0] || {};
const width = stream.width;
const height = stream.height;
const frameRate = stream.r_frame_rate; // e.g. "30/1"

pass("Specs", "Video duration readable", `${duration.toFixed(1)}s`);

// Resolution check
if (width === 1080 && height === 1920) {
  pass("Specs", "Resolution 1080×1920 (9:16)", `${width}×${height}`);
} else {
  fail("Specs", "Resolution 1080×1920 (9:16)", `Got ${width}×${height}`, "Check record-scenes.mjs viewport settings");
}

// Duration check
if (checkTikTok) {
  if (duration <= 70) {
    pass("Duration", "TikTok optimal (60-70s)", `${duration.toFixed(1)}s`);
  } else if (duration <= 90) {
    fail("Duration", "TikTok optimal (60-70s)", `${duration.toFixed(1)}s > 70s`, "Create shortened TikTok cut: select 6-8 key scenes");
  } else {
    fail("Duration", "TikTok max (90s)", `${duration.toFixed(1)}s > 90s`, "MUST shorten for TikTok. Use for YouTube Shorts only.");
  }
} else {
  if (duration <= 180) {
    pass("Duration", "YouTube Shorts duration (≤180s)", `${duration.toFixed(1)}s`);
  } else {
    fail("Duration", "YouTube Shorts duration (≤180s)", `${duration.toFixed(1)}s > 180s`, "Cut scenes to reduce duration");
  }
}

// Frame rate check
const fps = frameRate ? eval(frameRate) : 0;
if (fps >= 23 && fps <= 60) {
  pass("Specs", "Frame rate (23-60fps)", `${fps.toFixed(1)}fps`);
} else {
  fail("Specs", "Frame rate (23-60fps)", `${fps.toFixed(1)}fps`, "Check assemble.mjs output settings");
}

// ─── 3. Scene data checks ───
console.log("\n📝 Scene Data Checks");
console.log("─".repeat(50));

// Import scene data
let scenes;
try {
  const mod = await import(`file://${SCENE_DATA_PATH}`);
  scenes = mod.scenes || mod.default?.scenes;
} catch (e) {
  fail("Scene Data", "scene-data.mjs loads", e.message, "Fix syntax errors in scene-data.mjs");
  printSummary();
  process.exit(1);
}

if (!scenes || scenes.length === 0) {
  fail("Scene Data", "Scenes array exists", "No scenes found", "Define scenes[] in scene-data.mjs");
} else {
  pass("Scene Data", "Scenes array exists", `${scenes.length} scenes`);
}

// Hook check: Scene 1 must have compelling content
const hookScene = scenes[0];
const hookText = hookScene?.voiceover || "";
const hasNumberInHook = /\$?\d+[.,]?\d*\s*(billion|million|thousand|%|B|M|K)?/i.test(hookText);
const hasStrongWord = /\b(leaked|paused|crash|surge|breakthrough|exclusive|secret|revealed|banned|crisis|first|never|only)\b/i.test(hookText);

if (hasNumberInHook || hasStrongWord) {
  pass("Hook", "Hook has compelling element (number/strong word)", hookText.substring(0, 80));
} else {
  fail("Hook", "Hook has compelling element", `Hook: "${hookText.substring(0, 80)}"`, "Add a number, shocking claim, or question to Scene 1 voiceover");
}

// Source attribution check
let sourceCount = 0;
for (const scene of scenes) {
  const vo = scene.voiceover || "";
  if (/\b(reported|said|told|according to|revealed|stated|announced|confirmed|Bloomberg|Reuters|FT|Wall Street Journal|sources?)\b/i.test(vo)) {
    sourceCount++;
  }
}
if (sourceCount >= 2) {
  pass("Content", "Source attribution (≥2 scenes mention sources)", `${sourceCount} scenes`);
} else {
  fail("Content", "Source attribution (≥2 scenes)", `${sourceCount} scenes`, "Add 'Bloomberg reported...' or 'Liang said...' to voiceover");
}

// SEO keywords check
const targetKeywords = ["China", "AI", "DeepSeek"];
let keywordPass = true;
for (const kw of targetKeywords) {
  let count = 0;
  for (const scene of scenes) {
    const vo = (scene.voiceover || "").toLowerCase();
    const texts = JSON.stringify(scene.texts || "").toLowerCase();
    if (vo.includes(kw.toLowerCase()) || texts.includes(kw.toLowerCase())) {
      count++;
    }
  }
  if (count >= 2) {
    pass("SEO", `Keyword "${kw}" in ≥2 scenes`, `${count} scenes`);
  } else {
    keywordPass = false;
    fail("SEO", `Keyword "${kw}" in ≥2 scenes`, `${count} scenes`, `Add "${kw}" to voiceover or on-screen text in more scenes`);
  }
}

// Share-worthy data points: scenes with numbers
let dataScenes = 0;
for (const scene of scenes) {
  const vo = scene.voiceover || "";
  const texts = JSON.stringify(scene.texts || "");
  if (/\$?\d+[.,]?\d*/.test(vo + texts)) {
    dataScenes++;
  }
}
if (dataScenes >= scenes.length * 0.5) {
  pass("Content", "Share-worthy data points (≥50% scenes have numbers)", `${dataScenes}/${scenes.length} scenes`);
} else {
  fail("Content", "Share-worthy data points", `${dataScenes}/${scenes.length} scenes have numbers`, "Add concrete numbers to more scenes");
}

// ─── 4. Subtitle checks ───
console.log("\n🔤 Subtitle Checks");
console.log("─".repeat(50));

if (existsSync(SUBTITLE_TIMING_PATH)) {
  const timing = JSON.parse(readFileSync(SUBTITLE_TIMING_PATH, "utf8"));
  const scenesWithSubs = timing.filter(t => t.segments && t.segments.length > 0).length;
  const totalScenesExceptCTA = scenes.length - 1; // CTA excluded

  if (scenesWithSubs >= totalScenesExceptCTA) {
    pass("Subtitles", "All scenes have subtitle timing", `${scenesWithSubs}/${totalScenesExceptCTA} scenes`);
  } else {
    fail("Subtitles", "All scenes have subtitle timing", `${scenesWithSubs}/${totalScenesExceptCTA} scenes`, "Re-run force-align.py");
  }

  // Check Scene 1 has subtitles
  const scene1Timing = timing.find(t => t.sceneId === 1 || t.sceneId === scenes[0].id);
  if (scene1Timing && scene1Timing.segments && scene1Timing.segments.length > 0) {
    pass("Subtitles", "Scene 1 (hook) has subtitles", `${scene1Timing.segments.length} chunks`);
  } else {
    fail("Subtitles", "Scene 1 (hook) has subtitles", "No timing for Scene 1", "Re-run force-align.py — Scene 1 should not be skipped");
  }
} else {
  fail("Subtitles", "subtitle-timing.json exists", "File not found", "Run force-align.py after TTS generation");
}

// ─── 5. Algorithm penalty checks ───
console.log("\n⚠️ Algorithm Penalty Checks");
console.log("─".repeat(50));

// Check for watermarks from other platforms
// (Can't programmatically inspect video pixels, but can check scene data for watermark references)
let hasWatermarkRef = false;
for (const scene of scenes) {
  const allText = JSON.stringify(scene);
  if (/@instagram|@youtube|@facebook|tiktok watermark|repost from/i.test(allText)) {
    hasWatermarkRef = true;
    break;
  }
}
if (!hasWatermarkRef) {
  pass("Penalty", "No cross-platform watermark references in scene data");
} else {
  fail("Penalty", "No cross-platform watermarks", "Found platform reference in scene data", "Remove cross-platform references");
}

// Check for clickbait / misleading hooks
const hookLower = hookText.toLowerCase();
const clickbaitPatterns = [
  /\byou won't believe\b/i,
  /\bshocking truth\b/i,
  /\bthis will blow your mind\b/i,
  /\bclick here\b/i,
];
const hasClickbait = clickbaitPatterns.some(p => p.test(hookLower));
if (!hasClickbait) {
  pass("Penalty", "No clickbait patterns in hook");
} else {
  fail("Penalty", "No clickbait in hook", "Hook contains clickbait language", "Rewrite hook to be factual but dramatic");
}

// Check for misinformation risk (unverified claims)
let unverifiedClaims = 0;
for (const scene of scenes) {
  const vo = scene.voiceover || "";
  // Flag claims with "sources say" without attribution
  if (/\bsources say\b/i.test(vo) && !/\b(according to|reported by|Bloomberg|Reuters|FT)\b/i.test(vo)) {
    unverifiedClaims++;
  }
}
if (unverifiedClaims === 0) {
  pass("Penalty", "No unverified 'sources say' claims");
} else {
  fail("Penalty", "No unverified claims", `${unverifiedClaims} scenes use 'sources say' without attribution`, "Replace with specific source: 'Bloomberg reported...'");
}

// ─── 6. Manual items (cannot automate) ───
console.log("\n👤 Manual Items (Cannot Automate)");
console.log("─".repeat(50));

manual("Publish", "3-5 hashtags (broad + niche)", "Caption: #chinaai #deepseek #ai #technews #chinatech");
manual("Publish", "Geographic tag", "Add China/US location tag in TikTok before publishing");
manual("Publish", "In-app editing", "Upload to TikTok, add sticker/effect in-app, then publish");
manual("Publish", "Reply to comments (first hour)", "Post → monitor → respond to early comments");
manual("Publish", "Post at off-peak hours", "Check TikTok analytics for best times");
manual("Publish", "Pinned comment with article link", "Pin comment with full article URL");
manual("Publish", "Title under 60 chars", "Write compelling title in TikTok UI");
manual("Publish", "AIGC label", "If AI voice used, label as AI-generated content in TikTok");
manual("Publish", "Trending audio", "Add trending audio from TikTok library (not just BGM)");

// ─── Summary ───
function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`  ✅ PASS:   ${results.pass.length}`);
  console.log(`  ❌ FAIL:   ${results.fail.length}`);
  console.log(`  👤 MANUAL: ${results.manual.length}`);

  if (results.fail.length > 0) {
    console.log("\n❌ FAILED CHECKS (must fix before publishing):");
    for (const f of results.fail) {
      console.log(`  • [${f.category}] ${f.check}`);
      if (f.fix) console.log(`    → ${f.fix}`);
    }
    console.log("\n⚠️ Fix the above issues, then re-run: node scripts/short-video/verify-video.mjs");
    console.log("Do NOT publish until all automated checks pass.");
  } else {
    console.log("\n✅ All automated checks passed!");
    console.log("\n👤 Manual items to complete at publish time:");
    for (const m of results.manual) {
      console.log(`  • [${m.category}] ${m.check}`);
      if (m.detail) console.log(`    → ${m.detail}`);
    }
  }
  console.log("=".repeat(60));
}

printSummary();
process.exit(results.fail.length > 0 ? 1 : 0);
