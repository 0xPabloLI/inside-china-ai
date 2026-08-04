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
 *   node scripts/short-video/main.mjs              # defaults to deepseek
 *
 * Output:
 *   scripts/short-video/output/{pipelineId}/final.mp4
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { generateTTS } from "./generate-tts.mjs";
import { recordScenes } from "./record-scenes.mjs";
import { assembleVideo } from "./assemble.mjs";
import { generateBGM } from "./generate-bgm.mjs";
import { generateSRT } from "./generate-srt.mjs";

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
  const contentDir = getArg("content") || "deepseek";
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

  console.log(`🎬 Short Video Pipeline`);
  console.log(`   Content: ${meta.title || contentDir}`);
  console.log(`   Pipeline ID: ${meta.pipelineId}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

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

  // ── Step 3: Record videos ──
  console.log("📹 Step 3: Recording scene videos with Playwright...\n");
  const videoResults = await recordScenes(sceneData, videoDir);
  console.log();

  // ── Step 3.5: Generate background music (optional, --bgm flag) ──
  const useBGM = process.argv.includes("--bgm");
  let bgmPath = null;
  if (useBGM) {
    console.log("🎵 Step 3.5: Generating background music...\n");
    const bgmDuration = Math.ceil(totalDuration + 10);
    const bgm = generateBGM(bgmDuration);
    bgmPath = bgm.bgmPath;
    console.log();
  } else {
    console.log("🎵 Step 3.5: BGM skipped (use --bgm to enable)\n");
  }

  // ── Step 4: Generate SRT/ASS from ASR timing data ──
  const timingPath = join(outputDir, "audio", "subtitle-timing.json");
  const srtPath = join(outputDir, "subtitles.ass");
  let srtFile = null;
  if (existsSync(timingPath)) {
    const timingData = JSON.parse(readFileSync(timingPath, "utf8"));
    const sceneDurations = ttsResults.map((r) => ({ sceneId: r.sceneId, duration: r.duration }));
    srtFile = generateSRT(timingData, sceneDurations, srtPath);
  }

  // ── Step 5: Assemble final video ──
  console.log("🔧 Step 5: Assembling final video with FFmpeg...\n");
  const result = assembleVideo(videoResults, outputDir, bgmPath, srtFile);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Pipeline complete!`);
  console.log(`   📁 Output: ${result.path}`);
  console.log(`   ⏱  Duration: ${result.duration}`);
  console.log(`   📐 Resolution: 1080×1920 (9:16)`);
  console.log(`   🎬 Scenes: ${scenes.length}`);
  console.log(`   🏷  Pipeline: ${meta.pipelineId}`);
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err.message);
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
});
