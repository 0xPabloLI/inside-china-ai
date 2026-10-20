/**
 * Re-render with fresh TTS + subtitles (skips asset sourcing).
 *
 * Use after changing TTS parameters, ttsText, or subtitle logic when the
 * existing media-patch.json is still valid.  Runs:
 *   normalize → apply media-patch → TTS (Kaggle) → forced alignment → render
 *
 * Usage: node scripts/short-video/rerender-full.mjs [--content <dir>]
 * (default deepseek-v41-flash)
 */
import { readFileSync, existsSync } from "fs";
import { resolve as pathResolve, join } from "path";
import { resolveContentDir, formatContentError } from "./lib/cli-content.mjs";

const baseDir = pathResolve(import.meta.dirname);
const resolvedContent = resolveContentDir({
  argv: process.argv.slice(2),
  baseDir,
  defaultContent: "deepseek-v41-flash",
});
if (!resolvedContent.ok) {
  console.error(formatContentError(resolvedContent));
  process.exit(1);
}
const CONTENT_DIR = resolvedContent.contentDir;
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
  const assigned = normalizeMediaPatch(patch).filter(
    (p) => p.status === "assigned" && p.media?.path,
  );
  if (assigned.length > 0) {
    const r = applyAssignedMedia(scenes, assigned, contentDirAbs);
    console.log(
      `📦 Applied ${r.applied} media assignments: scenes ${r.appliedSceneIds.join(", ")}`,
    );
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
// #421 review: render the takes this run just produced (scene order), not a
// re-probed path that could resolve to a stale legacy file.
const audioPaths = scenes.map(
  (s) =>
    ttsResults.find((r) => r.sceneId === s.id)?.audioPath ?? join(audioDir, `scene-${s.id}.wav`),
);

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

// Step 4.5: subtitle render boundary (#421) — never render a voiced video
// without valid, fresh subtitles.
{
  const { assertSubtitleTiming } = await import("./lib/subtitles/generate.mjs");
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

// Step 4.6: final media gate (#299) — this path never sources or generates
// media, so a scene whose layout (or hook contract) needs a file must fail
// here instead of rendering an empty frame.
{
  const { checkFinalMedia, formatFinalMediaFailures, formatFinalMediaWarnings } =
    await import("./lib/final-media-gate.mjs");
  const gate = checkFinalMedia({ scenes, contentDir: contentDirAbs });
  if (gate.warnings.length > 0) {
    console.warn(`⚠️  Media warnings:\n${formatFinalMediaWarnings(gate)}\n`);
  }
  if (!gate.pass) {
    console.error("❌ Final media check FAILED\n");
    console.error(`   ${formatFinalMediaFailures(gate)}\n`);
    console.error(
      "   Supply the media (bind scene.media), or set media:null for a deliberate CSS-only hook.",
    );
    process.exit(1);
  }
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
