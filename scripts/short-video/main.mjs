/**
 * Short Video Pipeline — Multi-Content Architecture
 *
 * Supports multiple content pipelines, each isolated in output/{pipelineId}/.
 * Content (scene data + visual templates) lives in content/{article}/.
 * Infrastructure (TTS, recording, assembly) is shared and content-agnostic.
 *
 * Usage:
 *   node scripts/short-video/main.mjs --content deepseek --bgm
 *   node scripts/short-video/main.mjs --content distillation/pt1 --bgm
 *   node scripts/short-video/main.mjs --content deepseek --bgm --bgm-file news-theme-yt.mp3
 *   node scripts/short-video/main.mjs              # lists available content
 *
 * Output:
 *   scripts/short-video/output/{pipelineId}/final.mp4
 */

import { writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join, dirname, resolve, relative } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { generateTTS } from "./lib/generate-tts.mjs";
import { recordScenes } from "./lib/record-scenes.mjs";
import { assembleVideo } from "./lib/assemble.mjs";
import { renderRemotion } from "./lib/render-remotion.mjs";
import { regenerateSubtitles } from "./lib/subtitles/generate.mjs";
import { verifySubtitles } from "./lib/verify-subtitles.mjs";
import { verifyWithRetry, applyDriftCorrection } from "./lib/verify-retry.mjs";
import { buildCues } from "./lib/subtitles/cues.mjs";
import { renderAss } from "./lib/subtitles/ass.mjs";
import { burnSubtitles } from "./lib/post-process.mjs";
import { selectBGM } from "./lib/bgm.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI args ───
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function checkCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // ── Load content pipeline ──
  const contentDir = getArg("content");
  if (!contentDir) {
    const available = readdirSync(join(__dirname, "content"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    console.error("❌ --content flag is required. Available content:");
    available.forEach((d) => console.error(`   - ${d}`));
    process.exit(1);
  }
  const contentPath = `./content/${contentDir}`;

  let meta, scenes, generateScene;
  try {
    const metaMod = await import(`${contentPath}/meta.mjs`);
    meta = metaMod.meta;
    const dataMod = await import(`${contentPath}/scene-data.mjs`);
    scenes = dataMod.scenes;
    const scenesMod = await import(`${contentPath}/scenes.mjs`);
    generateScene = scenesMod.generateScene;
  } catch (e) {
    console.error(`❌ Failed to load content pipeline: ${contentPath}`);
    console.error(`   ${e.message}`);
    console.error(`   Ensure content/${contentDir}/ has meta.mjs, scene-data.mjs, scenes.mjs`);
    process.exit(1);
  }

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    console.error(`❌ No valid scenes array in content/${contentDir}/scene-data.mjs`);
    process.exit(1);
  }

  // ── Step 0.5: Currency normalization (RMB → USD dual-annotation) ──
  // Auto-inserts $X (¥Y) format before TTS runs, enforcing the currency
  // rule by code. Non-blocking: if it fails, scenes pass through unchanged.
  try {
    const { normalizeSceneData } = await import("./lib/normalize-currency.mjs");
    normalizeSceneData(scenes, meta);
    console.log("💱 Step 0.5: Currency normalization complete (RMB → USD dual-annotation)\n");
  } catch (e) {
    console.warn(`⚠️  Currency normalization skipped: ${e.message}\n`);
  }

  // ── Version number (timestamp-based, for output file naming) ──
  const version = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  console.log(`🎬 Short Video Pipeline`);
  console.log(`   Content: ${meta.title || contentDir}`);
  console.log(`   Pipeline ID: ${meta.pipelineId}`);
  console.log(`   Version: ${version}`);
  // ── Renderer selection ──
  // Default: Remotion (better quality). Opt out with --playwright or meta.renderer="playwright".
  const useRemotion = !process.argv.includes("--playwright") && meta.renderer !== "playwright";
  console.log(
    `   Renderer: ${useRemotion ? "Remotion (React → frame-by-frame)" : "Playwright (HTML → screen record)"}`,
  );
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── Pre-Render Verification (validates scene-data against SKILL.md rules) ──
  const skipPreflight = process.argv.includes("--skip-preflight");
  if (!skipPreflight) {
    console.log("🔍 Step 0: Pre-Render Verification...\n");
    try {
      execSync(`node "${join(__dirname, "verify-video.mjs")}" --pre --content "${contentDir}"`, {
        stdio: "inherit",
      });
    } catch {
      console.error(
        "\n❌ Pre-Render Verification FAILED — fix the issues above before running the pipeline.",
      );
      console.error("   (Use --skip-preflight to bypass, not recommended)");
      process.exit(1);
    }
    console.log();
  }

  // ── Prerequisite checks ──
  const hasFfmpeg = checkCommand("ffmpeg");
  if (!hasFfmpeg) {
    console.error("❌ FFmpeg is required but not found. Install with: brew install ffmpeg");
    process.exit(1);
  }

  // ── Focus detector dependency check (optional, warning only) ──
  // detectFocus() gracefully degrades if OpenCV not installed, so this is
  // a warning, not a hard failure. See spec §7.1.
  const focusScript = join(__dirname, "lib", "focus_detector.py");
  if (existsSync(focusScript)) {
    try {
      execSync(
        `${join(process.env.HOME || "", ".video-tts-env/bin/python3")} -c "import cv2; assert hasattr(cv2, 'CascadeClassifier') and hasattr(cv2, 'saliency')"`,
        { stdio: "pipe", timeout: 5000 },
      );
    } catch {
      console.warn("⚠️  OpenCV not available — focus detection will be skipped (degraded mode).");
      console.warn("   Install: pip install -r scripts/short-video/lib/requirements-focus.txt");
    }
  }

  // ── Step 1.5: Asset sourcing (auto-search missing media) ──
  // For each scene with media where the file doesn't exist → trigger asset-sourcer.
  // Non-blocking: if search fails, scene renders without media (graceful degradation).
  const scenesNeedingMedia = scenes.filter((s) => {
    if (!s.media?.path) return false;
    const contentDirAbs = resolve(__dirname, "content", contentDir);
    const mediaPath = resolve(contentDirAbs, s.media.path);
    return !existsSync(mediaPath);
  });
  if (scenesNeedingMedia.length > 0) {
    console.log("🔍 Step 1.5: Auto-sourcing missing media assets...\n");
    try {
      const contentDirAbs = resolve(__dirname, "content", contentDir);
      const { extractKeywords, main: sourcerMain } = await import("./lib/asset-sourcer.mjs");
      const keywords = extractKeywords(scenes, meta, []);
      const companyKeyword = meta?.keyEntities?.companies?.[0] || keywords[0] || "china ai";
      console.log(`  Searching for: ${companyKeyword}`);
      // Run asset-sourcer in non-interactive mode
      await sourcerMain([
        "--content",
        contentDir,
        "--keywords",
        companyKeyword,
        "--non-interactive",
      ]);
      console.log();
    } catch (e) {
      console.warn(`⚠️  Asset sourcing skipped: ${e.message}\n`);
    }
  }

  // ── Step 1.5b: Media upscale (auto-upscale sub-720p media) ──
  // Only processes confirmed media files (Cascade: selected first, then enhanced).
  // Non-blocking: if upscale fails, original file is used.
  const scenesWithMedia = scenes.filter((s) => s.media?.path);
  if (scenesWithMedia.length > 0) {
    console.log("🖼️ Step 1.5b: Checking media resolution for upscale...\n");
    try {
      const { autoUpscaleIfNeeded } = await import("./lib/upscale.mjs");
      let upscaledCount = 0;
      for (const scene of scenes) {
        if (!scene.media?.path) continue;
        const contentDirAbs = resolve(__dirname, "content", contentDir);
        const mediaPath = resolve(contentDirAbs, scene.media.path);
        const result = autoUpscaleIfNeeded(mediaPath);
        if (result.upscaled) {
          // Update scene to use the upscaled path (relative to content dir)
          scene.media.path = relative(contentDirAbs, result.path);
          upscaledCount++;
          console.log(`  Scene ${scene.id}: upscaled to ${result.path.split("/").pop()}`);
        }
      }
      if (upscaledCount === 0) {
        console.log("  All media already ≥720p — no upscale needed");
      }
      console.log();
    } catch (e) {
      console.warn(`⚠️  Media upscale skipped: ${e.message}\n`);
    }
  }

  // ── Isolated output directory ──
  const outputDir = join(__dirname, "output", meta.pipelineId);
  const audioDir = join(outputDir, "audio");
  const videoDir = join(outputDir, "video");
  const scenesDir = join(outputDir, "scenes");

  for (const dir of [audioDir, videoDir, scenesDir]) {
    mkdirSync(dir, { recursive: true });
  }

  // ── Step 1: Generate TTS ──
  console.log("📝 Step 1: Generating TTS voiceover...\n");
  const ttsResults = await generateTTS(scenes, audioDir);
  const totalDuration = ttsResults.reduce((s, t) => s + t.duration, 0);
  console.log(`\n  Total voiceover: ${totalDuration.toFixed(1)}s\n`);

  // ── Step 2: Generate HTML scenes (Playwright only) ──
  const sceneData = [];
  if (!useRemotion) {
    console.log("🎨 Step 2: Generating HTML scene templates...\n");
    for (const scene of scenes) {
      const tts = ttsResults.find((t) => t.sceneId === scene.id);
      if (!tts) throw new Error(`No TTS result for scene ${scene.id}`);

      const html = generateScene(scene, tts.duration, scene.voiceover);
      const htmlPath = join(scenesDir, `scene-${scene.id}.html`);
      writeFileSync(htmlPath, html);

      sceneData.push({
        sceneId: scene.id,
        htmlPath,
        duration: tts.duration,
        audioPath: tts.audioPath,
      });
      console.log(`  Scene ${scene.id} (${scene.name}): ${tts.duration.toFixed(1)}s`);
    }
    console.log();
  } else {
    console.log("🎨 Step 2: Skipped (Remotion renders React components directly)\n");
    for (const scene of scenes) {
      const tts = ttsResults.find((t) => t.sceneId === scene.id);
      if (!tts) throw new Error(`No TTS result for scene ${scene.id}`);
      sceneData.push({
        sceneId: scene.id,
        duration: tts.duration,
        audioPath: tts.audioPath,
      });
    }
  }

  // ── Step 2.5: DOM layout verification (Playwright only) ──
  if (!useRemotion) {
    const skipDomCheck = process.argv.includes("--skip-dom-check");
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
        console.error(
          "   Fix the scene layout (slot system, docs/brand-system.md), or bypass with",
        );
        console.error("   --skip-dom-check (escape hatch only, not recommended).");
        process.exit(1);
      }
      console.log();
    }
  } else {
    console.log("📐 Step 2.5: Skipped (Remotion uses declarative React layout)\n");
  }

  // ── Step 3: Record/Render videos ──
  let videoResults = null;
  if (!useRemotion) {
    console.log("📹 Step 3: Recording scene videos with Playwright...\n");
    videoResults = await recordScenes(sceneData, videoDir);
    console.log();
  } else {
    console.log("📹 Step 3: Skipped (Remotion renders in Step 5)\n");
  }

  // ── Step 3.5: Select background music (optional, --bgm flag) ──
  const useBGM = process.argv.includes("--bgm");
  const bgmFileOverride = getArg("bgm-file");
  let bgmPath = null;
  if (useBGM) {
    console.log("🎵 Step 3.5: Selecting background music...\n");
    bgmPath = selectBGM(meta.pipelineId, bgmFileOverride);
    if (bgmPath) {
      console.log(`  🎵 BGM: ${bgmPath.split("/").pop()}`);
      console.log(`     (instant start, 12% volume, auto-looped)\n`);
    } else {
      console.log("  ⚠️  No BGM file found — skipping\n");
    }
  } else {
    console.log("🎵 Step 3.5: BGM skipped (use --bgm to enable)\n");
  }

  // ── Step 4: Generate ASS subtitles from word-level timing ──
  const sceneDurations = ttsResults.map((r) => ({ sceneId: r.sceneId, duration: r.duration }));
  const subtitles = regenerateSubtitles({ outputDir, sceneDurations });
  if (subtitles) {
    console.log(`  📝 ASS generated: ${subtitles.cues.length} cues`);
  }

  // ── Step 5: Assemble/Render final video ──
  let result;
  if (useRemotion) {
    console.log("🔧 Step 5: Rendering final video with Remotion...\n");
    result = renderRemotion({
      scenes,
      audioPaths: ttsResults.map((t) => t.audioPath),
      durations: ttsResults.map((t) => t.duration),
      outputDir,
      pipelineId: meta.pipelineId,
      contentDir: resolve(__dirname, "content", contentDir),
      subtitlesPath: subtitles?.assPath ?? null,
      bgmPath,
      version,
      subject: meta.subject,
    });
  } else {
    console.log("🔧 Step 5: Assembling final video with FFmpeg...\n");
    result = assembleVideo(
      videoResults,
      outputDir,
      meta.pipelineId,
      bgmPath,
      subtitles?.assPath ?? null,
      version,
      meta.subject,
    );
  }

  // ── Step 6: Verify subtitles with auto-retry (optional, --skip-verify to skip) ──
  const skipVerify = process.argv.includes("--skip-verify");
  const maxRetries = parseInt(getArg("max-retries") ?? "2", 10);
  if (skipVerify) {
    console.log("🔍 Step 6: Subtitle verification skipped (--skip-verify)\n");
  } else if (!subtitles) {
    console.log("🔍 Step 6: Subtitle verification skipped (no subtitles generated)\n");
  } else {
    console.log(
      "🔍 Step 6: Verifying rendered subtitles with auto-retry (max-retries=" +
        maxRetries +
        ")...\n",
    );

    // Repair dispatch: maps failure categories to repair actions
    const repairFn = (category, report) => {
      const findBaseAndBurn = () => {
        const presubsPath = result.path.replace("-short.mp4", "-short-presubs.mp4");
        const rawPath = result.path.replace("-short.mp4", "-short-raw.mp4");
        const basePath = existsSync(presubsPath)
          ? presubsPath
          : existsSync(rawPath)
            ? rawPath
            : null;
        if (!basePath) return null;
        burnSubtitles(basePath, subtitles.assPath, result.path);
        return { success: true, videoPath: result.path, assPath: subtitles.assPath };
      };

      if (category === "audio-sync-drift") {
        // Extract per-scene drift from report and compensate subtitle cues
        const driftMap = {};
        for (const s of report.audioSync?.scenes ?? []) {
          if (!s.ok) driftMap[s.sceneId] = s.drift;
        }
        const cues = applyDriftCorrection(
          buildCues(subtitles.timingData, sceneDurations),
          driftMap,
        );
        writeFileSync(subtitles.assPath, renderAss(cues), "utf8");
        return findBaseAndBurn() ?? { success: false };
      }

      if (category === "cue-gaps") {
        const cues = buildCues(subtitles.timingData, sceneDurations);
        writeFileSync(subtitles.assPath, renderAss(cues), "utf8");
        return findBaseAndBurn() ?? { success: false };
      }

      if (category === "subtitle-alignment") {
        // Re-run whisper alignment + regenerate subtitles
        // This requires async TTS alignment, deferred for now
        return { success: false };
      }

      return { success: false };
    };

    const { report: finalReport } = await verifyWithRetry({
      verifyFn: () =>
        verifySubtitles({
          videoPath: result.path,
          assPath: subtitles.assPath,
          timingData: subtitles.timingData,
          sceneDurations,
          outputDir,
        }),
      repairFn,
      maxRetries,
      videoPath: result.path,
      assPath: subtitles.assPath,
    });

    if (!finalReport.summary.passed) {
      console.error(
        "❌ Subtitle verification failed after " +
          maxRetries +
          " retries — refusing to ship a broken video.",
      );
      process.exit(1);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Pipeline complete!`);
  console.log(`   📁 Output: ${result.path}`);
  console.log(`   ⏱  Duration: ${result.duration}`);
  console.log(`   📐 Resolution: 1080×1920 (9:16)`);
  console.log(`   🎬 Scenes: ${scenes.length}`);
  console.log(`   🏷  Pipeline: ${meta.pipelineId}`);
  console.log(`   🔖 Version: ${version}`);
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err.message);
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
});
