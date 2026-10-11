import { readFileSync, existsSync } from "fs";
import { resolve as pathResolve, join } from "path";
import { renderRemotion } from "./lib/render-remotion.mjs";
import { normalizeMediaPatch, applyAssignedMedia } from "./lib/apply-media-patch.mjs";
import { resolveSceneAudioPath } from "./lib/scene-audio.mjs";

const CONTENT_DIR = "deepseek-v41-flash";
const baseDir = pathResolve(import.meta.dirname);
const contentDirAbs = join(baseDir, "content", CONTENT_DIR);
const outputDir = join(baseDir, "output", CONTENT_DIR);
const audioDir = join(outputDir, "audio");

const { meta } = await import(`./content/${CONTENT_DIR}/meta.mjs`);
const { scenes } = await import(`./content/${CONTENT_DIR}/scene-data.mjs`);

// #421 review: same normalization chain as main.mjs (Step 0.5 currency +
// Step 0.6 TTS dual-track) — the subtitle render boundary below recomputes
// the alignment signature and must see the text the pipeline aligned against.
const { normalizeSceneData } = await import("./lib/normalize-currency.mjs");
normalizeSceneData(scenes, meta);
const { normalizeTtsText } = await import("./lib/normalize-tts-text.mjs");
normalizeTtsText(scenes, meta);

const patchPath = join(outputDir, "media-patch.json");
if (existsSync(patchPath)) {
  const patch = JSON.parse(readFileSync(patchPath, "utf-8"));
  const assigned = normalizeMediaPatch(patch).filter(
    (p) => p.status === "assigned" && p.media?.path,
  );
  if (assigned.length > 0) {
    const r = applyAssignedMedia(scenes, assigned, contentDirAbs);
    console.log(
      `📦 Applied ${r.applied} media assignments to scenes: ${r.appliedSceneIds.join(", ")}`,
    );
  }
}

const durations = JSON.parse(readFileSync(join(audioDir, "scene-durations.json"), "utf-8"))
  .sort((a, b) => a.sceneId - b.sceneId)
  .map((d) => d.duration);

// #421 review: resolve through the tts-meta sidecar so the render and the
// render-boundary signature hash the same take the timing was aligned to.
const audioPaths = scenes.map(
  (s) => resolveSceneAudioPath(audioDir, s.id) ?? join(audioDir, `scene-${s.id}.wav`),
);

const subtitlesPath = join(outputDir, "subtitles.ass");

console.log(`🎬 Re-rendering ${scenes.length} scenes with ${audioPaths.length} audio files...`);
console.log(`   Durations: ${durations.map((d) => d.toFixed(1) + "s").join(", ")}`);
console.log(`   Total: ${durations.reduce((s, d) => s + d, 0).toFixed(1)}s`);
console.log(`   Subtitles: ${existsSync(subtitlesPath) ? "yes" : "no"}`);
console.log(
  `   Scenes with media: ${scenes
    .filter((s) => s.media?.path)
    .map((s) => s.id)
    .join(", ")}`,
);

// Subtitle render boundary (#421): a voiced render must carry valid, fresh
// subtitle timing — refuse instead of silently dropping the burn-in.
{
  const { assertSubtitleTiming } = await import("./lib/subtitles/generate.mjs");
  const ttsResults = scenes.map((scene, i) => ({
    sceneId: scene.id,
    audioPath: audioPaths[i],
    duration: durations[i],
  }));
  try {
    assertSubtitleTiming({ scenes, ttsResults, outputDir });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    console.error(
      "   Fail-closed: a voiced video without burned-in subtitles is not shippable (#421).",
    );
    process.exit(1);
  }
}

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
