/**
 * DeepSeek Short Video — Full Automated Pipeline
 *
 * Flow:
 *   1. Generate TTS voiceover (edge-tts or macOS `say`)
 *   2. Render HTML scene templates (1080×1920, CSS animations)
 *   3. Record each scene with Playwright (WebM video)
 *   4. Assemble final video with FFmpeg (combine video+audio, concatenate)
 *
 * Usage:
 *   node scripts/short-video/main.mjs           # No BGM (platforms auto-add)
 *   node scripts/short-video/main.mjs --bgm     # With procedural BGM
 *
 * Output:
 *   scripts/short-video/output/deepseek-short.mp4
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { generateTTS } from "./generate-tts.mjs";
import { generateSceneHTML } from "./generate-scenes.mjs";
import { recordScenes } from "./record-scenes.mjs";
import { assembleVideo } from "./assemble.mjs";
import { generateBGM } from "./generate-bgm.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI args ───
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

// ─── Dynamic scene-data loading ───
async function loadScenes() {
  const scenePath = getArg("scene");
  if (scenePath) {
    try {
      const absPath = resolve(scenePath);
      const mod = await import(absPath);
      if (!mod.scenes || !Array.isArray(mod.scenes) || mod.scenes.length === 0) {
        console.error(`❌ No valid scenes array found in: ${absPath}`);
        process.exit(1);
      }
      console.log(`📋 Scene data loaded from: ${absPath}\n`);
      return mod.scenes;
    } catch (e) {
      console.error(`❌ Failed to load scene file: ${scenePath}`);
      console.error(`   ${e.message}`);
      console.error("   Use --scene <path> to specify a scene-data file.");
      process.exit(1);
    }
  }
  // Default: load from ./scene-data.mjs
  const { scenes } = await import("./scene-data.mjs");
  return scenes;
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
  console.log("🎬 DeepSeek Short Video Pipeline");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Load scene data (supports --scene flag for multi-part series) ──
  const scenes = await loadScenes();

  // ── Prerequisite checks ──
  const hasFfmpeg = checkCommand("ffmpeg");
  const hasPlaywright = checkCommand("npx");

  if (!hasFfmpeg) {
    console.error("❌ FFmpeg is required but not found. Install with: brew install ffmpeg");
    process.exit(1);
  }

  // ── Create directories ──
  const outputDir = join(__dirname, "output");
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

    const html = generateSceneHTML(scene.id, tts.duration, scene.voiceover);
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

  // ── Step 4: Assemble final video ──
  console.log("🔧 Step 4: Assembling final video with FFmpeg...\n");
  const result = assembleVideo(videoResults, outputDir, bgmPath);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Pipeline complete!`);
  console.log(`   📁 Output: ${result.path}`);
  console.log(`   ⏱  Duration: ${result.duration}`);
  console.log(`   📐 Resolution: 1080×1920 (9:16)`);
  console.log(`   🎬 Scenes: ${scenes.length}`);
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err.message);
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
});
