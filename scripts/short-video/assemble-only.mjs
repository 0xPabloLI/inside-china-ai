/**
 * Assembly-only script — reuses existing TTS audio and recorded videos.
 * Generates BGM and assembles the final video.
 * Use this when TTS and recording are already done and only assembly failed.
 */

import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateBGM } from "./generate-bgm.mjs";
import { assembleVideo } from "./assemble.mjs";
import { scenes } from "./scene-data.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outputDir = join(__dirname, "output");
const audioDir = join(outputDir, "audio");
const videoDir = join(outputDir, "video");

// Build scene data from existing files
const sceneData = [];
for (const scene of scenes) {
  const audioPath = join(audioDir, `scene-${scene.id}.mp3`);
  const videoPath = join(videoDir, `scene-${scene.id}.webm`);

  // Get duration from audio file
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

  sceneData.push({
    sceneId: scene.id,
    videoPath,
    audioPath,
    duration,
  });
  console.log(`  Scene ${scene.id}: ${duration.toFixed(2)}s`);
}

const totalDuration = sceneData.reduce((s, d) => s + d.duration, 0);
console.log(`  Total: ${totalDuration.toFixed(1)}s\n`);

// Generate BGM
console.log("🎵 Generating background music...");
const bgm = generateBGM(Math.ceil(totalDuration + 10));
console.log();

// Assemble
console.log("🔧 Assembling final video...\n");
const result = assembleVideo(sceneData, outputDir, bgm.bgmPath);

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`✅ Assembly complete!`);
console.log(`   📁 Output: ${result.path}`);
console.log(`   ⏱  Duration: ${result.duration}`);
console.log(`   📐 Resolution: 1080×1920 (9:16)`);
console.log(`   🎬 Scenes: ${sceneData.length}`);
console.log("");
