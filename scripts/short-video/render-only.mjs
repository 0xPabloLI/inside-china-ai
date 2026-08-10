/**
 * Render-only pipeline — re-renders scenes, subtitles and the final video from
 * audio that already exists in output/{pipelineId}/audio/.
 *
 * Use it when only the visuals or the subtitle logic changed: it skips TTS and
 * forced alignment (the slow, non-deterministic steps) but runs the exact same
 * scene generation, assembly, subtitle generation and verification as main.mjs,
 * so what it produces is representative of a full run.
 *
 * Usage:
 *   node scripts/short-video/render-only.mjs --content restraint/pt1
 *   node scripts/short-video/render-only.mjs --content deepseek --bgm
 */
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, existsSync } from "fs";
import { recordScenes } from "./lib/record-scenes.mjs";
import { assembleVideo } from "./lib/assemble.mjs";
import { selectBGM } from "./lib/bgm.mjs";
import { regenerateSubtitles } from "./lib/subtitles/generate.mjs";
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

  let meta, scenes, generateScene;
  try {
    ({ meta } = await import(`${contentPath}/meta.mjs`));
    ({ scenes } = await import(`${contentPath}/scene-data.mjs`));
    ({ generateScene } = await import(`${contentPath}/scenes.mjs`));
  } catch (e) {
    console.error(`❌ Failed to load content pipeline: ${contentPath}`);
    console.error(`   ${e.message}`);
    process.exit(1);
  }

  const version = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputDir = join(__dirname, "output", meta.pipelineId);
  const audioDir = join(outputDir, "audio");
  const scenesDir = join(outputDir, "scenes");
  const videoDir = join(outputDir, "video");

  console.log(`🎬 Render-only (no TTS)`);
  console.log(`   Content: ${meta.title || contentDir}`);
  console.log(`   Pipeline ID: ${meta.pipelineId}`);
  console.log(`   Version: ${version}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── Step 1: Read durations from the existing voiceover ──
  const sceneData = [];
  for (const scene of scenes) {
    const audioPath = join(audioDir, `scene-${scene.id}.mp3`);
    if (!existsSync(audioPath)) {
      console.error(`❌ Missing audio: ${audioPath}`);
      console.error(`   Run main.mjs --content ${contentDir} first.`);
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
      htmlPath: join(scenesDir, `scene-${scene.id}.html`),
    });
  }

  const totalDuration = sceneData.reduce((s, d) => s + d.duration, 0);
  console.log(`  Voiceover: ${sceneData.length} scenes, ${totalDuration.toFixed(1)}s total\n`);

  // ── Step 2: Re-generate HTML scenes ──
  console.log("🎨 Step 2: Generating HTML scene templates...\n");
  for (const sd of sceneData) {
    const scene = scenes.find((s) => s.id === sd.sceneId);
    writeFileSync(sd.htmlPath, generateScene(scene, sd.duration, scene.voiceover));
    console.log(
      `  Scene ${sd.sceneId} (${scene.name || scene.label || "scene"}): ${sd.duration.toFixed(1)}s`,
    );
  }
  console.log();

  // ── Step 2.5: DOM layout verification (safe-zone / right-rail / overflow) ──
  // Same hard gate as main.mjs: geometry violations abort before re-recording.
  // Bypass with --skip-dom-check (escape hatch only — all content
  // directories are on the slot layout).
  const skipDomCheck = args.includes("--skip-dom-check");
  if (skipDomCheck) {
    console.log("📐 Step 2.5: DOM layout verification skipped (--skip-dom-check)\n");
  } else {
    console.log("📐 Step 2.5: Verifying scene DOM layout (safe zones)...\n");
    try {
      execSync(`node "${join(__dirname, "verify-scene-dom.mjs")}" --content "${contentDir}"`, {
        stdio: "inherit",
      });
    } catch {
      console.error(
        "\n❌ DOM layout verification FAILED — scene content enters a TikTok safe zone.",
      );
      console.error("   Fix the scene layout (slot system, docs/brand-system.md), or bypass with");
      console.error("   --skip-dom-check (escape hatch only, not recommended).");
      process.exit(1);
    }
    console.log();
  }

  // ── Step 3: Re-record videos ──
  console.log("📹 Step 3: Recording scene videos with Playwright...\n");
  const videoResults = await recordScenes(sceneData, videoDir);
  console.log();

  // ── Step 3.5: BGM (optional) ──
  const useBGM = args.includes("--bgm");
  const bgmFileOverride = getArg("bgm-file");
  let bgmPath = null;
  if (useBGM) {
    console.log("🎵 Step 3.5: Selecting background music...\n");
    bgmPath = selectBGM(meta.pipelineId, bgmFileOverride);
    if (bgmPath) {
      console.log(`  🎵 BGM: ${bgmPath.split("/").pop()} (instant start, 12% volume, looped)\n`);
    } else {
      console.log("  ⚠️  No BGM file found — skipping\n");
    }
  } else {
    console.log("🎵 Step 3.5: BGM skipped (use --bgm to enable)\n");
  }

  // ── Step 4: Re-generate subtitles from the existing alignment ──
  const sceneDurations = sceneData.map((s) => ({ sceneId: s.sceneId, duration: s.duration }));
  const subtitles = regenerateSubtitles({ outputDir, sceneDurations });
  if (subtitles) {
    console.log(`📝 Step 4: ASS generated: ${subtitles.cues.length} cues\n`);
  } else {
    console.log("📝 Step 4: Subtitles skipped (no subtitle-timing.json)\n");
  }

  // ── Step 5: Assemble ──
  console.log("🔧 Step 5: Assembling final video with FFmpeg...\n");
  const result = assembleVideo(
    videoResults,
    outputDir,
    meta.pipelineId,
    bgmPath,
    subtitles?.assPath ?? null,
    version,
    meta.subject,
  );

  // ── Step 6: Verify ──
  const skipVerify = args.includes("--skip-verify");
  if (skipVerify || !subtitles) {
    console.log("🔍 Step 6: Subtitle verification skipped\n");
  } else {
    console.log("🔍 Step 6: Verifying rendered subtitles against the alignment data...\n");
    const report = verifySubtitles({
      videoPath: result.path,
      assPath: subtitles.assPath,
      timingData: subtitles.timingData,
      sceneDurations,
      outputDir,
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
