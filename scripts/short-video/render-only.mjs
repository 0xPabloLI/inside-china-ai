/**
 * Render-only script — re-generates HTML scenes and records videos
 * WITHOUT re-running TTS. Uses existing audio files from output/audio/.
 * Use this when you only changed HTML/CSS templates (scene design, subtitles, logo).
 *
 * Usage:
 *   node scripts/short-video/render-only.mjs           # No BGM
 *   node scripts/short-video/render-only.mjs --bgm      # With BGM
 */
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";
import { scenes } from "./scene-data.mjs";
import { generateSceneHTML } from "./generate-scenes.mjs";
import { recordScenes } from "./record-scenes.mjs";
import { assembleVideo } from "./assemble.mjs";
import { generateBGM } from "./generate-bgm.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outputDir = join(__dirname, "output");
const audioDir = join(outputDir, "audio");
const scenesDir = join(outputDir, "scenes");
const videoDir = join(outputDir, "video");

// Build scene data from existing audio files
const sceneData = [];
for (const scene of scenes) {
  const audioPath = join(audioDir, `scene-${scene.id}.mp3`);
  let duration;
  try {
    const info = execSync(
      `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString();
    duration = parseFloat(info.trim());
  } catch (e) {
    console.error(`Failed to get duration for scene ${scene.id}: ${e.message}`);
    process.exit(1);
  }

  const htmlPath = join(scenesDir, `scene-${scene.id}.html`);
  sceneData.push({
    sceneId: scene.id,
    audioPath,
    duration,
    htmlPath,
  });
  console.log(`  Scene ${scene.id}: ${duration.toFixed(2)}s`);
}

const totalDuration = sceneData.reduce((s, d) => s + d.duration, 0);
console.log(`  Total: ${totalDuration.toFixed(1)}s\n`);

// Step 1: Re-generate HTML scenes
console.log("🎨 Re-generating HTML scene templates...\n");
for (const sd of sceneData) {
  const scene = scenes.find((s) => s.id === sd.sceneId);
  const html = generateSceneHTML(sd.sceneId, sd.duration, scene.voiceover);
  const htmlPath = join(scenesDir, `scene-${sd.sceneId}.html`);
  writeFileSync(htmlPath, html);
  console.log(`  Scene ${sd.sceneId} (${scene.label || "scene"}): ${sd.duration.toFixed(1)}s`);
}

// Step 2: Re-record videos
console.log("\n📹 Re-recording scene videos...\n");
const videoResults = await recordScenes(sceneData, videoDir);
console.log();

// Step 3: BGM (optional)
const useBGM = process.argv.includes("--bgm");
let bgmPath = null;
if (useBGM) {
  console.log("🎵 Generating background music...\n");
  const bgm = generateBGM(Math.ceil(totalDuration + 10));
  bgmPath = bgm.bgmPath;
  console.log();
} else {
  console.log("🎵 BGM skipped (use --bgm to enable)\n");
}

// Step 4: Assemble
console.log("🔧 Assembling final video...\n");
const result = assembleVideo(videoResults, outputDir, bgmPath);

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`✅ Render complete!`);
console.log(`   📁 Output: ${result.path}`);
console.log(`   ⏱  Duration: ${result.duration}`);
console.log(`   📐 Resolution: 1080×1920 (9:16)`);
console.log(`   🎬 Scenes: ${sceneData.length}`);
console.log("");
