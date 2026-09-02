/**
 * Render-only pipeline — re-renders scenes, subtitles and the final video from
 * audio that already exists in output/{pipelineId}/audio/.
 *
 * Use it when only the visuals or the subtitle logic changed: it skips TTS and
 * forced alignment (the slow, non-deterministic steps) but runs the exact same
 * Remotion render, subtitle generation and verification as main.mjs, so what
 * it produces is representative of a full run.
 *
 * Usage:
 *   node scripts/short-video/render-only.mjs --content restraint/pt1
 *   node scripts/short-video/render-only.mjs --content deepseek --bgm
 */
import { execSync } from "child_process";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { renderRemotion } from "./lib/render-remotion.mjs";
import { assertRemotionRenderer } from "./lib/renderer-guard.mjs";
import { checkFinalMedia, formatFinalMediaFailures } from "./lib/final-media-gate.mjs";
import { selectBGM } from "./lib/bgm.mjs";
import { regenerateSubtitles } from "./lib/subtitles/generate.mjs";
import { runCanonicalTextGate } from "./lib/verify-canonical-text.mjs";
import { verifySubtitles } from "./lib/verify-subtitles.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

async function main() {
  const contentDir = getArg("content") || "deepseek";
  const contentPath = `./content/${contentDir}`;

  let meta, scenes;
  try {
    ({ meta } = await import(`${contentPath}/meta.mjs`));
    ({ scenes } = await import(`${contentPath}/scene-data.mjs`));
  } catch (e) {
    console.error(`❌ Failed to load content pipeline: ${contentPath}`);
    console.error(`   ${e.message}`);
    process.exit(1);
  }

  // The HTML/Playwright path was retired (decision 59): Remotion is the only
  // renderer. Fail fast before any real work on attempts to opt back in.
  try {
    assertRemotionRenderer({ argv: args, meta });
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  const version = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputDir = join(__dirname, "output", meta.pipelineId);
  const audioDir = join(outputDir, "audio");

  console.log(`🎬 Render-only (no TTS)`);
  console.log(`   Content: ${meta.title || contentDir}`);
  console.log(`   Pipeline ID: ${meta.pipelineId}`);
  console.log(`   Version: ${version}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── Step 1: Read durations from the existing voiceover ──
  // TTS engines differ in output format: edge-tts writes .mp3, F5-TTS-MLX
  // writes .wav. Accept either, preferring whichever file exists.
  const sceneData = [];
  for (const scene of scenes) {
    const audioPath = [".mp3", ".wav"]
      .map((ext) => join(audioDir, `scene-${scene.id}${ext}`))
      .find((p) => existsSync(p));
    if (!audioPath) {
      const expected = join(audioDir, "scene-" + scene.id + ".mp3");
      console.error("❌ Missing audio: " + expected + " (or .wav)");
      console.error("   Run main.mjs --content " + contentDir + " first.");
      process.exit(1);
    }

    const info = execSync(
      `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString();
    const duration = parseFloat(info.trim());
    if (Number.isNaN(duration)) {
      console.error(`❌ Could not read duration for scene ${scene.id}`);
      process.exit(1);
    }

    sceneData.push({
      sceneId: scene.id,
      audioPath,
      duration,
    });
  }

  const totalDuration = sceneData.reduce((s, d) => s + d.duration, 0);
  console.log(`  Voiceover: ${sceneData.length} scenes, ${totalDuration.toFixed(1)}s total\n`);

  // ── Step 2: Final media gate ──
  // render-only never runs asset sourcing, so the same shared gate is called
  // here instead: a missing media file must stop the re-render, not silently
  // produce a frame with an empty middle band.
  {
    const contentDirAbs = resolve(__dirname, "content", contentDir);
    const gate = checkFinalMedia({ scenes, contentDir: contentDirAbs });
    if (!gate.pass) {
      console.error("❌ Step 2: Final media check FAILED\n");
      console.error(`   ${formatFinalMediaFailures(gate)}\n`);
      console.error("   render-only does not source assets — supply the media first.");
      process.exit(1);
    }
    console.log("✅ Step 2: Final media check passed\n");
  }

  // ── Step 2.5: BGM (optional) ──
  const useBGM = args.includes("--bgm");
  const bgmFileOverride = getArg("bgm-file");
  let bgmPath = null;
  if (useBGM) {
    console.log("🎵 Step 2.5: Selecting background music...\n");
    bgmPath = selectBGM(meta.pipelineId, bgmFileOverride);
    if (bgmPath) {
      console.log(`  🎵 BGM: ${bgmPath.split("/").pop()} (instant start, 12% volume, looped)\n`);
    } else {
      console.log("  ⚠️  No BGM file found — skipping\n");
    }
  } else {
    console.log("🎵 Step 2.5: BGM skipped (use --bgm to enable)\n");
  }

  // ── Step 3: Re-generate subtitles from the existing alignment ──
  const sceneDurations = sceneData.map((s) => ({ sceneId: s.sceneId, duration: s.duration }));
  const subtitles = regenerateSubtitles({ outputDir, sceneDurations });
  if (subtitles) {
    console.log(`📝 Step 3: ASS generated: ${subtitles.cues.length} cues\n`);

    // ── Gate 1: Canonical Text verification (before rendering) ──
    console.log("🔍 Gate 1: Canonical Text verification...");
    runCanonicalTextGate(subtitles.timingData, scenes, meta.keyEntities, {
      label: "Gate 1",
      renderOnly: true,
    });
    console.log();
  } else {
    console.log("📝 Step 3: Subtitles skipped (no subtitle-timing.json)\n");
  }

  // ── Step 4: Render ──
  console.log("🔧 Step 4: Rendering final video with Remotion...\n");
  const result = renderRemotion({
    scenes,
    audioPaths: sceneData.map((sd) => sd.audioPath),
    durations: sceneData.map((sd) => sd.duration),
    outputDir,
    pipelineId: meta.pipelineId,
    contentDir: resolve(__dirname, "content", contentDir),
    subtitlesPath: subtitles?.assPath ?? null,
    bgmPath,
    version,
    subject: meta.subject,
  });

  // ── Step 5: Verify ──
  const skipVerify = args.includes("--skip-verify");
  if (skipVerify || !subtitles) {
    console.log("🔍 Step 5: Subtitle verification skipped\n");
  } else {
    console.log("🔍 Step 5: Verifying rendered subtitles against the alignment data...\n");
    const report = verifySubtitles({
      videoPath: result.path,
      assPath: subtitles.assPath,
      timingData: subtitles.timingData,
      sceneDurations,
      outputDir,
      audioPaths: sceneData.map((sd) => sd.audioPath),
    });
    if (!report.summary.passed) {
      console.error("❌ Subtitle verification failed — refusing to ship a broken video.");
      process.exit(1);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Render complete!`);
  console.log(`   📁 Output: ${result.path}`);
  console.log(`   ⏱  Duration: ${result.duration}`);
  console.log(`   📐 Resolution: 1080×1920 (9:16)`);
  console.log(`   🎬 Scenes: ${sceneData.length}`);
  console.log(`   🔖 Version: ${version}`);
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Render failed:", err.message);
  process.exit(1);
});
