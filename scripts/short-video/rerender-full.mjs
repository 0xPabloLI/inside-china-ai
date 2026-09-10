/**
 * Re-render with fresh TTS + subtitles (skips asset sourcing).
 *
 * Use after changing TTS parameters, ttsText, or subtitle logic when the
 * existing media-patch.json is still valid.  Runs:
 *   normalize → apply media-patch → TTS (Kaggle) → forced alignment → render
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

// Step 0.5: currency normalize
const { normalizeSceneData } = await import("./lib/normalize-currency.mjs");
normalizeSceneData(scenes, meta);

// Step 0.6: TTS dual-track normalize
const { normalizeTtsText } = await import("./lib/normalize-tts-text.mjs");
normalizeTtsText(scenes, meta);

// Apply media-patch.json
const patchPath = join(outputDir, "media-patch.json");
if (existsSync(patchPath)) {
  const patch = JSON.parse(readFileSync(patchPath, "utf-8"));
  const { normalizeMediaPatch, applyAssignedMedia } = await import("./lib/apply-media-patch.mjs");
  const assigned = normalizeMediaPatch(patch).filter((p) => p.status === "assigned" && p.media?.path);
  if (assigned.length > 0) {
    const r = applyAssignedMedia(scenes, assigned, contentDirAbs);
    console.log(`📦 Applied ${r.applied} media assignments: scenes ${r.appliedSceneIds.join(", ")}`);
  }
}

// Step 1: TTS (Kaggle CUDA) — regenerates audio + forced alignment
console.log("\n🎙️  Step 1: Generating TTS (Kaggle CUDA)...");
const { generateTTS } = await import("./lib/generate-tts.mjs");
const ttsResults = await generateTTS(scenes, audioDir);
console.log(`  ✅ TTS done: ${ttsResults.length} scenes`);

// Ensure durations are saved for downstream consumption
const durationsPath = join(audioDir, "scene-durations.json");
const durationsRaw = ttsResults
  .map((r) => ({ sceneId: r.sceneId, duration: r.duration }))
  .sort((a, b) => a.sceneId - b.sceneId);
const { writeFileSync: wfs } = await import("fs");
wfs(durationsPath, JSON.stringify(durationsRaw, null, 2));

const durations = durationsRaw.map((d) => d.duration);
const audioPaths = scenes.map((_, i) => join(audioDir, `scene-${i + 1}.wav`));

// Step 4: subtitles
const timingPath = join(audioDir, "subtitle-timing.json");
const subtitlesPath = join(outputDir, "subtitles.ass");
let subtitlesArg = null;
if (existsSync(timingPath)) {
  const { generateSubtitles } = await import("./lib/subtitles/generate.mjs");
  const timingData = JSON.parse(readFileSync(timingPath, "utf-8"));
  const result = generateSubtitles(timingData, durationsRaw, subtitlesPath);
  console.log(`📝 Subtitles: ${result.cues.length} cues → ${subtitlesPath}`);
  subtitlesArg = subtitlesPath;
}

// Step 5: render
console.log("\n🎬 Rendering...");
const { renderRemotion } = await import("./lib/render-remotion.mjs");
const result = renderRemotion({
  scenes,
  audioPaths,
  durations,
  outputDir,
  pipelineId: meta.pipelineId,
  contentDir: contentDirAbs,
  subtitlesPath: subtitlesArg,
  version: new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
  subject: meta.subject,
});

console.log(`\n✅ Render complete: ${result.path} (${result.duration})`);