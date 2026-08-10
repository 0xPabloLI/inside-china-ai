/**
 * Short Video Pipeline — Multi-Content Architecture
 *
 * Supports multiple content pipelines, each isolated in output/{pipelineId}/.
 * Content (scene data + visual templates) lives in content/{article}/.
 * Infrastructure (TTS, recording, assembly) is shared and content-agnostic.
 *
 * Usage:
 *   node scripts/short-video/main.mjs --content deepseek --bgm
 *   node scripts/short-video/main.mjs --content distillation/pt1 --bgm
 *   node scripts/short-video/main.mjs --content deepseek --bgm --bgm-file news-theme-yt.mp3
 *   node scripts/short-video/main.mjs              # lists available content
 *
 * Output:
 *   scripts/short-video/output/{pipelineId}/final.mp4
 */

import { writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { generateTTS } from "./lib/generate-tts.mjs";
import { recordScenes } from "./lib/record-scenes.mjs";
import { assembleVideo } from "./lib/assemble.mjs";
import { regenerateSubtitles } from "./lib/subtitles/generate.mjs";
import { verifySubtitles } from "./lib/verify-subtitles.mjs";
import { selectBGM } from "./lib/bgm.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI args ───
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function checkCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // ── Load content pipeline ──
  const contentDir = getArg("content");
  if (!contentDir) {
    const available = readdirSync(join(__dirname, "content"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    console.error("❌ --content flag is required. Available content:");
    available.forEach((d) => console.error(`   - ${d}`));
    process.exit(1);
  }
  const contentPath = `./content/${contentDir}`;

  let meta, scenes, generateScene;
  try {
    const metaMod = await import(`${contentPath}/meta.mjs`);
    meta = metaMod.meta;
    const dataMod = await import(`${contentPath}/scene-data.mjs`);
    scenes = dataMod.scenes;
    const scenesMod = await import(`${contentPath}/scenes.mjs`);
    generateScene = scenesMod.generateScene;
  } catch (e) {
    console.error(`❌ Failed to load content pipeline: ${contentPath}`);
    console.error(`   ${e.message}`);
    console.error(`   Ensure content/${contentDir}/ has meta.mjs, scene-data.mjs, scenes.mjs`);
    process.exit(1);
  }

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    console.error(`❌ No valid scenes array in content/${contentDir}/scene-data.mjs`);
    process.exit(1);
  }

  // ── Version number (timestamp-based, for output file naming) ──
  const version = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  console.log(`🎬 Short Video Pipeline`);
  console.log(`   Content: ${meta.title || contentDir}`);
  console.log(`   Pipeline ID: ${meta.pipelineId}`);
  console.log(`   Version: ${version}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── Pre-Render Verification (validates scene-data against SKILL.md rules) ──
  const skipPreflight = process.argv.includes("--skip-preflight");
  if (!skipPreflight) {
    console.log("🔍 Step 0: Pre-Render Verification...\n");
    try {
      execSync(`node "${join(__dirname, "verify-video.mjs")}" --pre --content "${contentDir}"`, {
        stdio: "inherit",
      });
    } catch {
      console.error(
        "\n❌ Pre-Render Verification FAILED — fix the issues above before running the pipeline.",
      );
      console.error("   (Use --skip-preflight to bypass, not recommended)");
      process.exit(1);
    }
    console.log();
  }

  // ── Prerequisite checks ──
  const hasFfmpeg = checkCommand("ffmpeg");
  if (!hasFfmpeg) {
    console.error("❌ FFmpeg is required but not found. Install with: brew install ffmpeg");
    process.exit(1);
  }

  // ── Isolated output directory ──
  const outputDir = join(__dirname, "output", meta.pipelineId);
  const audioDir = join(outputDir, "audio");
  const videoDir = join(outputDir, "video");
  const scenesDir = join(outputDir, "scenes");

  for (const dir of [audioDir, videoDir, scenesDir]) {
    mkdirSync(dir, { recursive: true });
  }

  // ── Step 1: Generate TTS ──
  console.log("📝 Step 1: Generating TTS voiceover...\n");
  const ttsResults = await generateTTS(scenes, audioDir);
  const totalDuration = ttsResults.reduce((s, t) => s + t.duration, 0);
  console.log(`\n  Total voiceover: ${totalDuration.toFixed(1)}s\n`);

  // ── Step 2: Generate HTML scenes ──
  console.log("🎨 Step 2: Generating HTML scene templates...\n");
  const sceneData = [];
  for (const scene of scenes) {
    const tts = ttsResults.find((t) => t.sceneId === scene.id);
    if (!tts) throw new Error(`No TTS result for scene ${scene.id}`);

    const html = generateScene(scene, tts.duration, scene.voiceover);
    const htmlPath = join(scenesDir, `scene-${scene.id}.html`);
    writeFileSync(htmlPath, html);

    sceneData.push({
      sceneId: scene.id,
      htmlPath,
      duration: tts.duration,
      audioPath: tts.audioPath,
    });
    console.log(`  Scene ${scene.id} (${scene.name}): ${tts.duration.toFixed(1)}s`);
  }
  console.log();

  // ── Step 2.5: DOM layout verification (safe-zone / right-rail / overflow) ──
  // Render-level hard gate: a scene whose geometry violates the safe zones
  // must never reach the recorder. Bypass with --skip-dom-check (escape
  // hatch only — all content directories are on the slot layout; see
  // docs/brand-system.md → Layout Safety).
  const skipDomCheck = process.argv.includes("--skip-dom-check");
  if (skipDomCheck) {
    console.log("📐 Step 2.5: DOM layout verification skipped (--skip-dom-check)\n");
  } else {
    console.log("📐 Step 2.5: Verifying scene DOM layout (safe zones)...\n");
    try {
      execSync(`node "${join(__dirname, "verify-scene-dom.mjs")}" --content "${contentDir}"`, {
        stdio: "inherit",
      });
    } catch {
      console.error(
        "\n❌ DOM layout verification FAILED — scene content enters a TikTok safe zone.",
      );
      console.error("   Fix the scene layout (slot system, docs/brand-system.md), or bypass with");
      console.error("   --skip-dom-check (escape hatch only, not recommended).");
      process.exit(1);
    }
    console.log();
  }

  // ── Step 3: Record videos ──
  console.log("📹 Step 3: Recording scene videos with Playwright...\n");
  const videoResults = await recordScenes(sceneData, videoDir);
  console.log();

  // ── Step 3.5: Select background music (optional, --bgm flag) ──
  const useBGM = process.argv.includes("--bgm");
  const bgmFileOverride = getArg("bgm-file");
  let bgmPath = null;
  if (useBGM) {
    console.log("🎵 Step 3.5: Selecting background music...\n");
    bgmPath = selectBGM(bgmFileOverride);
    if (bgmPath) {
      console.log(`  🎵 BGM: ${bgmPath.split("/").pop()}`);
      console.log(`     (instant start, 12% volume, auto-looped)\n`);
    } else {
      console.log("  ⚠️  No BGM file found — skipping\n");
    }
  } else {
    console.log("🎵 Step 3.5: BGM skipped (use --bgm to enable)\n");
  }

  // ── Step 4: Generate ASS subtitles from word-level timing ──
  const sceneDurations = ttsResults.map((r) => ({ sceneId: r.sceneId, duration: r.duration }));
  const subtitles = regenerateSubtitles({ outputDir, sceneDurations });
  if (subtitles) {
    console.log(`  📝 ASS generated: ${subtitles.cues.length} cues`);
  }

  // ── Step 5: Assemble final video ──
  console.log("🔧 Step 5: Assembling final video with FFmpeg...\n");
  const result = assembleVideo(
    videoResults,
    outputDir,
    meta.pipelineId,
    bgmPath,
    subtitles?.assPath ?? null,
    version,
    meta.subject,
  );

  // ── Step 6: Verify subtitles (optional, --skip-verify to skip) ──
  const skipVerify = process.argv.includes("--skip-verify");
  if (skipVerify) {
    console.log("🔍 Step 6: Subtitle verification skipped (--skip-verify)\n");
  } else if (!subtitles) {
    console.log("🔍 Step 6: Subtitle verification skipped (no subtitles generated)\n");
  } else {
    console.log("🔍 Step 6: Verifying rendered subtitles against the alignment data...\n");
    const report = verifySubtitles({
      videoPath: result.path,
      assPath: subtitles.assPath,
      timingData: subtitles.timingData,
      sceneDurations,
      outputDir,
    });
    if (!report.summary.passed) {
      console.error("❌ Subtitle verification failed — refusing to ship a broken video.");
      process.exit(1);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Pipeline complete!`);
  console.log(`   📁 Output: ${result.path}`);
  console.log(`   ⏱  Duration: ${result.duration}`);
  console.log(`   📐 Resolution: 1080×1920 (9:16)`);
  console.log(`   🎬 Scenes: ${scenes.length}`);
  console.log(`   🏷  Pipeline: ${meta.pipelineId}`);
  console.log(`   🔖 Version: ${version}`);
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err.message);
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
});
