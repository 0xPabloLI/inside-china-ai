import { readFileSync, existsSync } from "fs";
import { resolve as pathResolve, join } from "path";
import { renderRemotion } from "./lib/render-remotion.mjs";
import { normalizeMediaPatch, applyAssignedMedia } from "./lib/apply-media-patch.mjs";

const CONTENT_DIR = "deepseek-v41-flash";
const baseDir = pathResolve(import.meta.dirname);
const contentDirAbs = join(baseDir, "content", CONTENT_DIR);
const outputDir = join(baseDir, "output", CONTENT_DIR);
const audioDir = join(outputDir, "audio");

const { meta } = await import(`./content/${CONTENT_DIR}/meta.mjs`);
const { scenes } = await import(`./content/${CONTENT_DIR}/scene-data.mjs`);

const patchPath = join(outputDir, "media-patch.json");
if (existsSync(patchPath)) {
  const patch = JSON.parse(readFileSync(patchPath, "utf-8"));
  const assigned = normalizeMediaPatch(patch).filter(
    (p) => p.status === "assigned" && p.media?.path,
  );
  if (assigned.length > 0) {
    const r = applyAssignedMedia(scenes, assigned, contentDirAbs);
    console.log(`📦 Applied ${r.applied} media assignments to scenes: ${r.appliedSceneIds.join(", ")}`);
  }
}

const durations = JSON.parse(readFileSync(join(audioDir, "scene-durations.json"), "utf-8"))
  .sort((a, b) => a.sceneId - b.sceneId)
  .map((d) => d.duration);

const audioPaths = scenes.map((_, i) => join(audioDir, `scene-${i + 1}.wav`));

const subtitlesPath = join(outputDir, "subtitles.ass");

console.log(`🎬 Re-rendering ${scenes.length} scenes with ${audioPaths.length} audio files...`);
console.log(`   Durations: ${durations.map((d) => d.toFixed(1) + "s").join(", ")}`);
console.log(`   Total: ${durations.reduce((s, d) => s + d, 0).toFixed(1)}s`);
console.log(`   Subtitles: ${existsSync(subtitlesPath) ? "yes" : "no"}`);
console.log(`   Scenes with media: ${scenes.filter((s) => s.media?.path).map((s) => s.id).join(", ")}`);

const result = renderRemotion({
  scenes,
  audioPaths,
  durations,
  outputDir,
  pipelineId: meta.pipelineId,
  contentDir: contentDirAbs,
  subtitlesPath: existsSync(subtitlesPath) ? subtitlesPath : null,
  version: new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
  subject: meta.subject,
});

console.log(`\n✅ Render complete: ${result.path} (${result.duration})`);