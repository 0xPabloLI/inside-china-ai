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
warn: [],
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

function warn(category, check, detail, fix = "") {
results.warn.push({ category, check, detail, fix });
console.log(`  ⚠️  ${check}${detail ? ` — ${detail}` : ""}`);
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
} else if (duration <= 600) {
warn("Duration", "TikTok optimal (60-70s)", `${duration.toFixed(1)}s > 70s (within TikTok 10min limit)`, "Create shortened TikTok cut: select 6-8 key scenes for optimal performance");
} else {
fail("Duration", "TikTok max (600s/10min)", `${duration.toFixed(1)}s > 600s`, "MUST shorten — exceeds TikTok 10-minute upload limit.");
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

// Check for clickbait / misleading hooks in ALL scenes
const clickbaitPatterns = [
  /\byou won't believe\b/i,
  /\bshocking truth\b/i,
  /\bthis will blow your mind\b/i,
  /\bclick here\b/i,
];
let clickbaitCount = 0;
for (const scene of scenes) {
  const vo = scene.voiceover || "";
  if (clickbaitPatterns.some(p => p.test(vo))) {
    clickbaitCount++;
  }
}
if (clickbaitCount === 0) {
  pass("Penalty", "No clickbait patterns in any scene");
} else {
  fail("Penalty", "No clickbait in any scene", `${clickbaitCount} scenes contain clickbait language`, "Rewrite to be factual but dramatic");
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

manual("Publish", "Title (< 60 chars)",
  `Write in TikTok title field. Best practice: compelling + factual.\n` +
  `  Example: "DeepSeek's $1.4B leak reveals China's AI strategy"\n` +
  `  Don't: clickbait like "You won't believe..."\n` +
  `  Rule: include main keyword (DeepSeek/China AI) for SEO`
);
manual("Publish", "Description (with SEO keywords)",
  `Write in TikTok description field. 2-3 sentences.\n` +
  `  Include: topic summary + "China AI" + "DeepSeek" + call to action\n` +
  `  Example: "A leaked investor meeting reveals DeepSeek's strategy.\n` +
  `  Follow for more China AI deep dives."\n` +
  `  Put hashtags at the end of description, NOT in title`
);
manual("Publish", "3-5 hashtags (broad + niche)",
  `Add at end of description in TikTok. Use 3-5 only.\n` +
  `  Broad: #chinaai #ai #technews\n` +
  `  Niche: #deepseek #chinatech\n` +
  `  Don't: #fyp #foryou (too generic, doesn't help discovery)\n` +
  `  Don't: more than 5 hashtags (looks spammy)`
);
manual("Publish", "Geographic tag",
  `In TikTok post screen → tap "Location" → select "China" or "United States".\n` +
  `  Why: algorithm prioritizes local content.\n` +
  `  If video is about Chinese companies → tag China.\n` +
  `  If targeting US audience → tag United States.`
);
manual("Publish", "In-app editing (algorithm bonus)",
  `After uploading video to TikTok:\n` +
  `  1. Tap "Edit" in the TikTok upload screen\n` +
  `  2. Add at least one element: text sticker, effect, or filter\n` +
  `  3. Then publish\n` +
  `  Why: TikTok algorithm favors content edited within the app.\n` +
  `  Even a small sticker counts — don't skip this step.`
);
manual("Publish", "AIGC label (if AI voice used)",
  `If video uses AI-generated voice (XTTS/cloned):\n` +
  `  In TikTok post screen → toggle "AI-generated content" ON.\n` +
  `  Why: TikTok requires labeling AI content. Not labeling = penalty.\n` +
  `  This adds a small "AI-generated" badge to the video.`
);
manual("Publish", "Trending audio",
  `In TikTok post screen → tap "Add sound" → search trending sounds.\n` +
  `  Pick a trending sound that fits the mood (tech/serious).\n` +
  `  Set volume: original audio at 100%, trending sound at 5-10%.\n` +
  `  Why: trending audio boosts discoverability.\n` +
  `  Don't: replace the voiceover with music.`
);
manual("Publish", "Pinned comment (with article link)",
  `After publishing:\n` +
  `  1. Write a comment with the full article URL (when domain is live)\n` +
  `  2. Long-press the comment → "Pin comment"\n` +
  `  Example: "Full article: https://chinaainews.com/posts/deepseek-leak"\n` +
  `  Why: drives traffic to website + increases engagement.`
);
manual("Publish", "Reply to comments (first hour)",
  `After publishing, stay active for 60 minutes:\n` +
  `  - Reply to every comment in first hour\n` +
  `  - Ask follow-up questions to spark conversation\n` +
  `  - This loops the video (comment = replay) = more watch time\n` +
  `  Why: first-hour engagement signals algorithm to push further.`
);
manual("Publish", "Post at off-peak hours",
  `Check TikTok analytics → Followers → Activity.\n` +
  `  Post when your audience is LEAST active (counterintuitive).\n` +
  `  Why: less competition = algorithm more likely to test your video.\n` +
  `  If no analytics yet: try 2-4 PM or 10 PM-12 AM (off-peak for most).`
);

// ─── Summary ───
function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(60));
console.log(`  ✅ PASS:   ${results.pass.length}`);
console.log(`  ⚠️  WARN:    ${results.warn.length}`);
console.log(`  ❌ FAIL:   ${results.fail.length}`);
console.log(`  👤 MANUAL: ${results.manual.length}`);

  if (results.fail.length > 0) {
    console.log("\n❌ FAILED CHECKS (agent must fix before publishing):");
    for (const f of results.fail) {
      console.log(`  • [${f.category}] ${f.check}`);
      if (f.fix) console.log(`    → ${f.fix}`);
    }
    console.log("\n⚠️ AGENT: Analyze each failure, fix the root cause in scene-data/pipeline,");
    console.log("   re-run the relevant pipeline step, then re-run verify-video.mjs.");
    console.log("   Do NOT ask the user to fix code issues. Do NOT publish until 0 failures.");
  } else {
    console.log("\n✅ All automated checks passed!");
    console.log("\n👤 Manual publishing checklist (present to user):");
    console.log("─".repeat(60));
    for (const m of results.manual) {
      console.log(`\n  [ ] ${m.check}`);
      if (m.detail) console.log(m.detail);
    }
    console.log("\n" + "─".repeat(60));
    console.log("Copy the above checklist. Complete each item when publishing on TikTok.");
  }
  console.log("=".repeat(60));
}

printSummary();
process.exit(results.fail.length > 0 ? 1 : 0);
