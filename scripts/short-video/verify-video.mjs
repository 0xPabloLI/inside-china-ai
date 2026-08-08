#!/usr/bin/env node
/**
 * TikTok Best Practices Compliance Check
 *
 * Automated verification of video output against 2025-2026 TikTok best practices.
 * Runs scene-data validation in both modes, plus video/subtitle/manual checks
 * in post-render mode only.
 *
 * Usage:
 *   node verify-video.mjs --pre --content <dir>       # Pre-render: scene-data only (no video needed)
 *   node verify-video.mjs [--tiktok] --content <dir>   # Post-render: full check (video + scene-data + subtitles)
 *
 *   --pre:        pre-render mode (skip video/subtitle/manual checks)
 *   --tiktok:     also check TikTok-specific 60-70s duration requirement (post-render only)
 *   --long-form:  explicit YouTube long-form opt-in — downgrades scene-count (>10) and
 *                 voiceover-word (>180) violations from FAIL to WARN. TikTok default
 *                 keeps them as FAIL so oversized content must be split into parts.
 *   --content:    content pipeline ID (e.g. deepseek, distillation/pt1, restraint/pt1)
 *
 * Exit code: 0 if all automated checks pass, 1 if any fail.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { runAllSceneDataChecks } from "./lib/scene-rules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Parse args ───
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const contentDir = getArg("content") || "deepseek";
const pipelineId = contentDir.replace(/\//g, "-");
const preMode = args.includes("--pre");
const checkTikTok = args.includes("--tiktok");
const longForm = args.includes("--long-form");

const OUTPUT_DIR = join(__dirname, "output", pipelineId);
const SCENE_DATA_PATH = join(__dirname, "content", contentDir, "scene-data.mjs");
const META_PATH = join(__dirname, "content", contentDir, "meta.mjs");
const SUBTITLE_TIMING_PATH = join(OUTPUT_DIR, "audio", "subtitle-timing.json");

// Load meta.mjs (for subject field + preflight validation)
let filePrefix = pipelineId;
let meta = null;
try {
  const metaMod = await import(`file://${META_PATH}`);
  meta = metaMod.meta || null;
  const subject = meta?.subject;
  if (subject && subject !== pipelineId) filePrefix = `${subject}-${pipelineId}`;
} catch {}
const VIDEO_PATH = join(OUTPUT_DIR, `${filePrefix}-short.mp4`);

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

// ─── Mode banner ───
console.log(`\n${preMode ? "🔍 Pre-Render" : "📹 Post-Render"} Verification — ${contentDir}`);
console.log("─".repeat(50));

// ─── Meta data checks (shared: pre-render + post-render) ───
console.log("\n📋 Meta Data Checks");
console.log("─".repeat(50));

if (!meta) {
  fail(
    "Meta",
    "meta.mjs loads",
    "File not found or no meta export",
    `Create meta.mjs in content/${contentDir}/`,
  );
} else {
  // Required existing fields
  const requiredFields = ["subject", "pipelineId", "title", "article"];
  for (const field of requiredFields) {
    if (meta[field]) {
      pass("Meta", `meta.${field} exists`, String(meta[field]));
    } else {
      fail("Meta", `meta.${field} exists`, "Missing", `Add '${field}' to meta.mjs`);
    }
  }

  // Required extended fields (WP-6)
  const extendedFields = ["createdAt", "topics", "keyEntities", "dataPoints"];
  for (const field of extendedFields) {
    if (meta[field]) {
      const detail = Array.isArray(meta[field])
        ? `${meta[field].length} items`
        : typeof meta[field] === "object"
          ? Object.keys(meta[field]).join(", ")
          : String(meta[field]);
      pass("Meta", `meta.${field} exists (extended)`, detail);
    } else {
      warn(
        "Meta",
        `meta.${field} exists (extended)`,
        "Missing",
        `Add '${field}' to meta.mjs (WP-6 extended field)`,
      );
    }
  }

  // Series fields (required if seriesId present)
  if (meta.seriesId) {
    const seriesFields = ["seriesId", "partNumber", "totalParts"];
    for (const field of seriesFields) {
      if (meta[field] !== undefined) {
        pass("Meta", `meta.${field} exists (series)`, String(meta[field]));
      } else {
        warn(
          "Meta",
          `meta.${field} exists (series)`,
          "Missing",
          `Add '${field}' to meta.mjs (series content)`,
        );
      }
    }
  }

  // keyEntities sub-structure validation
  if (meta.keyEntities) {
    const entityKeys = ["companies", "people", "models"];
    for (const key of entityKeys) {
      if (Array.isArray(meta.keyEntities[key])) {
        pass("Meta", `meta.keyEntities.${key} is array`, `${meta.keyEntities[key].length} items`);
      } else {
        fail(
          "Meta",
          `meta.keyEntities.${key} is array`,
          "Missing or not array",
          `Add '${key}: []' to keyEntities in meta.mjs`,
        );
      }
    }
  }
}

// ─── Post-render: Video file + specs ───
if (!preMode) {
  console.log("\n📹 Video File Checks");
  console.log("─".repeat(50));

  if (!existsSync(VIDEO_PATH)) {
    fail(
      "File",
      "Video file exists",
      `${VIDEO_PATH} not found`,
      "Run the pipeline first: node scripts/short-video/main.mjs --bgm",
    );
    printSummary();
    process.exit(1);
  }
  pass("File", "Video file exists", VIDEO_PATH);

  // ── Video specs (ffprobe) ──
  console.log("\n📐 Video Specifications");
  console.log("─".repeat(50));

  let videoInfo;
  try {
    const raw = execSync(
      `ffprobe -i "${VIDEO_PATH}" -show_entries format=duration -show_entries stream=width,height,codec_name,r_frame_rate -v quiet -of json`,
      { encoding: "utf8" },
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
  const frameRate = stream.r_frame_rate;

  pass("Specs", "Video duration readable", `${duration.toFixed(1)}s`);

  if (width === 1080 && height === 1920) {
    pass("Specs", "Resolution 1080×1920 (9:16)", `${width}×${height}`);
  } else {
    fail(
      "Specs",
      "Resolution 1080×1920 (9:16)",
      `Got ${width}×${height}`,
      "Check record-scenes.mjs viewport settings",
    );
  }

  if (checkTikTok) {
    if (duration <= 70) {
      pass("Duration", "TikTok optimal (60-70s)", `${duration.toFixed(1)}s`);
    } else if (duration <= 600) {
      warn(
        "Duration",
        "TikTok optimal (60-70s)",
        `${duration.toFixed(1)}s > 70s (within TikTok 10min limit)`,
        "Create shortened TikTok cut: select 6-8 key scenes for optimal performance",
      );
    } else {
      fail(
        "Duration",
        "TikTok max (600s/10min)",
        `${duration.toFixed(1)}s > 600s`,
        "MUST shorten — exceeds TikTok 10-minute upload limit.",
      );
    }
  } else {
    if (duration <= 180) {
      pass("Duration", "YouTube Shorts duration (≤180s)", `${duration.toFixed(1)}s`);
    } else {
      fail(
        "Duration",
        "YouTube Shorts duration (≤180s)",
        `${duration.toFixed(1)}s > 180s`,
        "Cut scenes to reduce duration",
      );
    }
  }

  const fps = frameRate ? eval(frameRate) : 0;
  if (fps >= 23 && fps <= 60) {
    pass("Specs", "Frame rate (23-60fps)", `${fps.toFixed(1)}fps`);
  } else {
    fail(
      "Specs",
      "Frame rate (23-60fps)",
      `${fps.toFixed(1)}fps`,
      "Check assemble.mjs output settings",
    );
  }
}

// ─── Scene data checks (shared: pre-render + post-render) ───
console.log("\n📝 Scene Data Checks");
console.log("─".repeat(50));

let scenes, seriesMeta;
try {
  const mod = await import(`file://${SCENE_DATA_PATH}`);
  scenes = mod.scenes || mod.default?.scenes;
  seriesMeta = mod.seriesMeta || null;
} catch (e) {
  fail("Scene Data", "scene-data.mjs loads", e.message, "Fix syntax errors in scene-data.mjs");
  printSummary();
  process.exit(1);
}

if (!scenes || scenes.length === 0) {
  fail("Scene Data", "Scenes array exists", "No scenes found", "Define scenes[] in scene-data.mjs");
  printSummary();
  process.exit(1);
}

pass("Scene Data", "Scenes array exists", `${scenes.length} scenes`);

// Run all scene-data validation rules from lib/scene-rules.mjs
const sceneResults = runAllSceneDataChecks(scenes, seriesMeta, { longForm });
for (const r of sceneResults.pass) {
  console.log(`  ✅ ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
}
results.pass.push(...sceneResults.pass);
for (const r of sceneResults.warn) {
  console.log(`  ⚠️  ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
  if (r.fix) console.log(`     → FIX: ${r.fix}`);
  results.warn.push(r);
}
for (const r of sceneResults.fail) {
  console.log(`  ❌ ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
  if (r.fix) console.log(`     → FIX: ${r.fix}`);
  results.fail.push(r);
}

// ─── Post-render: Subtitle checks ───
if (!preMode) {
  console.log("\n🔤 Subtitle Checks");
  console.log("─".repeat(50));

  if (existsSync(SUBTITLE_TIMING_PATH)) {
    const timing = JSON.parse(readFileSync(SUBTITLE_TIMING_PATH, "utf8"));
    const scenesWithSubs = timing.filter((t) => t.segments && t.segments.length > 0).length;
    const totalScenesExceptCTA = scenes.length - 1;

    if (scenesWithSubs >= totalScenesExceptCTA) {
      pass(
        "Subtitles",
        "All scenes have subtitle timing",
        `${scenesWithSubs}/${totalScenesExceptCTA} scenes`,
      );
    } else {
      fail(
        "Subtitles",
        "All scenes have subtitle timing",
        `${scenesWithSubs}/${totalScenesExceptCTA} scenes`,
        "Re-run force-align.py",
      );
    }

    const scene1Timing = timing.find((t) => t.sceneId === 1 || t.sceneId === scenes[0].id);
    if (scene1Timing && scene1Timing.segments && scene1Timing.segments.length > 0) {
      pass("Subtitles", "Scene 1 (hook) has subtitles", `${scene1Timing.segments.length} chunks`);
    } else {
      fail(
        "Subtitles",
        "Scene 1 (hook) has subtitles",
        "No timing for Scene 1",
        "Re-run force-align.py — Scene 1 should not be skipped",
      );
    }
  } else {
    fail(
      "Subtitles",
      "subtitle-timing.json exists",
      "File not found",
      "Run force-align.py after TTS generation",
    );
  }
}

// ─── Post-render: Manual items ───
if (!preMode) {
  console.log("\n👤 Manual Items (Cannot Automate)");
  console.log("─".repeat(50));

  manual(
    "Publish",
    "Title (< 60 chars)",
    `Write in TikTok title field. Best practice: compelling + factual.\n` +
      `  Example: "DeepSeek's $1.4B leak reveals China's AI strategy"\n` +
      `  Don't: clickbait like "You won't believe..."\n` +
      `  Rule: include main keyword (DeepSeek/China AI) for SEO`,
  );
  manual(
    "Publish",
    "Description (with SEO keywords)",
    `Write in TikTok description field. 2-3 sentences.\n` +
      `  Include: topic summary + "China AI" + "DeepSeek" + call to action\n` +
      `  Example: "A leaked investor meeting reveals DeepSeek's strategy.\n` +
      `  Follow for more China AI deep dives."\n` +
      `  Put hashtags at the end of description, NOT in title`,
  );
  manual(
    "Publish",
    "3-5 hashtags (broad + niche)",
    `Add at end of description in TikTok. Use 3-5 only.\n` +
      `  Broad: #chinaai #ai #technews\n` +
      `  Niche: #deepseek #chinatech\n` +
      `  Don't: #fyp #foryou (too generic, doesn't help discovery)\n` +
      `  Don't: more than 5 hashtags (looks spammy)`,
  );
  manual(
    "Publish",
    "Geographic tag",
    `In TikTok post screen → tap "Location" → select "China" or "United States".\n` +
      `  Why: algorithm prioritizes local content.\n` +
      `  If video is about Chinese companies → tag China.\n` +
      `  If targeting US audience → tag United States.`,
  );
  manual(
    "Publish",
    "In-app editing (algorithm bonus)",
    `After uploading video to TikTok:\n` +
      `  1. Tap "Edit" in the TikTok upload screen\n` +
      `  2. Add at least one element: text sticker, effect, or filter\n` +
      `  3. Then publish\n` +
      `  Why: TikTok algorithm favors content edited within the app.\n` +
      `  Even a small sticker counts — don't skip this step.`,
  );
  manual(
    "Publish",
    "AIGC label (if AI voice used)",
    `If video uses AI-generated voice (XTTS/cloned):\n` +
      `  In TikTok post screen → toggle "AI-generated content" ON.\n` +
      `  Why: TikTok requires labeling AI content. Not labeling = penalty.\n` +
      `  This adds a small "AI-generated" badge to the video.`,
  );
  manual(
    "Publish",
    "Trending audio",
    `In TikTok post screen → tap "Add sound" → search trending sounds.\n` +
      `  Pick a trending sound that fits the mood (tech/serious).\n` +
      `  Set volume: original audio at 100%, trending sound at 5-10%.\n` +
      `  Why: trending audio boosts discoverability.\n` +
      `  Don't: replace the voiceover with music.`,
  );
  manual(
    "Publish",
    "Pinned comment (with article link)",
    `After publishing:\n` +
      `  1. Write a comment with the full article URL (when domain is live)\n` +
      `  2. Long-press the comment → "Pin comment"\n` +
      `  Example: "Full article: https://chinaainews.com/posts/deepseek-leak"\n` +
      `  Why: drives traffic to website + increases engagement.`,
  );
  manual(
    "Publish",
    "Reply to comments (first hour)",
    `After publishing, stay active for 60 minutes:\n` +
      `  - Reply to every comment in first hour\n` +
      `  - Ask follow-up questions to spark conversation\n` +
      `  - This loops the video (comment = replay) = more watch time\n` +
      `  Why: first-hour engagement signals algorithm to push further.`,
  );
  manual(
    "Publish",
    "Post at off-peak hours",
    `Check TikTok analytics → Followers → Activity.\n` +
      `  Post when your audience is LEAST active (counterintuitive).\n` +
      `  Why: less competition = algorithm more likely to test your video.\n` +
      `  If no analytics yet: try 2-4 PM or 10 PM-12 AM (off-peak for most).`,
  );
}

// ─── Summary ───
function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log(`${preMode ? "PRE-RENDER" : "POST-RENDER"} VERIFICATION SUMMARY`);
  console.log("=".repeat(60));
  console.log(`  ✅ PASS:   ${results.pass.length}`);
  console.log(`  ⚠️  WARN:    ${results.warn.length}`);
  console.log(`  ❌ FAIL:   ${results.fail.length}`);
  if (!preMode) {
    console.log(`  👤 MANUAL: ${results.manual.length}`);
  }

  if (results.fail.length > 0) {
    console.log("\n❌ FAILED CHECKS (must fix before proceeding):");
    for (const f of results.fail) {
      console.log(`  • [${f.category}] ${f.check}`);
      if (f.fix) console.log(`    → ${f.fix}`);
    }
    if (preMode) {
      console.log("\n⚠️  AGENT: Fix the issues above in scene-data.mjs, then re-run:");
      console.log(`   node verify-video.mjs --pre --content ${contentDir}`);
    } else {
      console.log("\n⚠️ AGENT: Analyze each failure, fix the root cause in scene-data/pipeline,");
      console.log("   re-run the relevant pipeline step, then re-run verify-video.mjs.");
      console.log("   Do NOT ask the user to fix code issues. Do NOT publish until 0 failures.");
    }
  } else {
    console.log("\n✅ All automated checks passed!");
    if (!preMode) {
      console.log("\n👤 Manual publishing checklist (present to user):");
      console.log("─".repeat(60));
      for (const m of results.manual) {
        console.log(`\n  [ ] ${m.check}`);
        if (m.detail) console.log(m.detail);
      }
      console.log("\n" + "─".repeat(60));
      console.log("Copy the above checklist. Complete each item when publishing on TikTok.");
    } else {
      console.log("   Ready to run the pipeline.");
    }
  }
  console.log("=".repeat(60));
}

printSummary();

// ─── Post-render: Auto-generate caption if all checks pass ───
if (!preMode && results.fail.length === 0) {
  console.log("\n📝 Generating TikTok caption...");
  try {
    const contentArg = contentDir ? ` --content "${contentDir}"` : "";
    execSync(`node "${join(__dirname, "generate-caption.mjs")}"${contentArg}`, {
      stdio: "inherit",
    });

    // Verify caption file constraints (B6: caption ≤ 2200 chars)
    // generate-caption.mjs writes to output/ (not output/{pipelineId}/)
    const captionPath = join(__dirname, "output", "tiktok-caption.txt");
    if (existsSync(captionPath)) {
      const captionContent = readFileSync(captionPath, "utf8");
      if (captionContent.length > 2200) {
        fail(
          "Caption",
          "Caption length ≤ 2,200 chars",
          `${captionContent.length} chars`,
          "Trim caption content — remove redundant sentences or hashtags",
        );
      } else {
        pass("Caption", "Caption length ≤ 2,200 chars", `${captionContent.length} chars`);
      }
    }
  } catch (e) {
    fail(
      "Caption",
      "Caption generation succeeded",
      e.message,
      "Check scene-data.mjs for issues that cause invalid caption (title > 60, caption > 2200, or hashtag count out of range)",
    );
  }
}

process.exit(results.fail.length > 0 ? 1 : 0);
