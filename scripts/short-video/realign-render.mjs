/**
 * Re-align + re-render only (skips TTS). Use after manually editing audio files.
 */
import { readFileSync, existsSync } from "fs";
import { resolve as pathResolve, join } from "path";

const CONTENT_DIR = "deepseek-v41-flash";
const baseDir = pathResolve(import.meta.dirname);
const contentDirAbs = join(baseDir, "content", CONTENT_DIR);
const outputDir = join(baseDir, "output", CONTENT_DIR);
const audioDir = join(outputDir, "audio");

const { meta } = await import(`./content/${CONTENT_DIR}/meta.mjs`);
const { scenes } = await import(`./content/${CONTENT_DIR}/scene-data.mjs`);

const { normalizeSceneData } = await import("./lib/normalize-currency.mjs");
normalizeSceneData(scenes, meta);
const { normalizeTtsText } = await import("./lib/normalize-tts-text.mjs");
normalizeTtsText(scenes, meta);

const patchPath = join(outputDir, "media-patch.json");
if (existsSync(patchPath)) {
  const patch = JSON.parse(readFileSync(patchPath, "utf-8"));
  const { normalizeMediaPatch, applyAssignedMedia } = await import("./lib/apply-media-patch.mjs");
  const assigned = normalizeMediaPatch(patch).filter((p) => p.status === "assigned" && p.media?.path);
  if (assigned.length > 0) {
    applyAssignedMedia(scenes, assigned, contentDirAbs);
    console.log(`📦 Applied ${assigned.length} media assignments`);
  }
}

const durationsRaw = JSON.parse(readFileSync(join(audioDir, "scene-durations.json"), "utf-8"))
  .sort((a, b) => a.sceneId - b.sceneId);
const durations = durationsRaw.map((d) => d.duration);
const audioPaths = scenes.map((_, i) => join(audioDir, `scene-${i + 1}.wav`));

console.log(`\n🎯 Running forced alignment...`);
const { generateTTS } = await import("./lib/generate-tts.mjs");
const ttsResults = audioPaths.map((p, i) => ({ sceneId: i + 1, audioPath: p, duration: durations[i] }));
const { runForcedAlignment } = await import("./lib/tts/post-process.mjs");
await runForcedAlignment(scenes, ttsResults, audioDir, { force: true });

const timingPath = join(audioDir, "subtitle-timing.json");
const subtitlesPath = join(outputDir, "subtitles.ass");
let subtitlesArg = null;
if (existsSync(timingPath)) {
  const { generateSubtitles } = await import("./lib/subtitles/generate.mjs");
  const timingData = JSON.parse(readFileSync(timingPath, "utf-8"));
  const result = generateSubtitles(timingData, durationsRaw, subtitlesPath);
  console.log(`📝 Subtitles: ${result.cues.length} cues`);
  subtitlesArg = subtitlesPath;
}

console.log("\n🎬 Rendering...");
const { renderRemotion } = await import("./lib/render-remotion.mjs");
const result = renderRemotion({
  scenes, audioPaths, durations, outputDir,
  pipelineId: meta.pipelineId, contentDir: contentDirAbs,
  subtitlesPath: subtitlesArg,
  version: new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
  subject: meta.subject,
});
console.log(`\n✅ Render complete: ${result.path} (${result.duration})`);