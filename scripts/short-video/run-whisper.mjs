import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { scenes } from "./scene-data.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const audioDir = join(__dirname, "output", "audio");

// Build manifest from existing audio files
const manifest = [];
for (const scene of scenes) {
  const audioPath = join(audioDir, `scene-${scene.id}.mp3`);
  let duration;
  try {
    duration = parseFloat(execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim());
  } catch { continue; }
  manifest.push({ sceneId: scene.id, text: scene.voiceover, audioPath });
  console.log(`Scene ${scene.id}: ${duration.toFixed(2)}s`);
}

const manifestPath = join(audioDir, "whisper-manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`\nManifest saved: ${manifestPath}`);

// Run whisper alignment
const timingPath = join(audioDir, "subtitle-timing.json");
console.log("Running Whisper...");
execSync(`pip3 show openai-whisper >/dev/null 2>&1 && python3 "${join(__dirname, "whisper-align.py")}" --manifest "${manifestPath}" --output "${timingPath}" --model base 2>&1`, { stdio: "inherit" });
console.log("Done!");
