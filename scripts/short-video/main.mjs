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

import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from "fs";
import { join, dirname, resolve, relative } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { generateTTS } from "./lib/generate-tts.mjs";
import { renderRemotion } from "./lib/render-remotion.mjs";
import { assertRemotionRenderer } from "./lib/renderer-guard.mjs";
import { checkFinalMedia, formatFinalMediaFailures } from "./lib/final-media-gate.mjs";
import { regenerateSubtitles } from "./lib/subtitles/generate.mjs";
import { runCanonicalTextGateWithRepair } from "./lib/verify-canonical-text.mjs";
import { verifySubtitles } from "./lib/verify-subtitles.mjs";
import { verifyWithRetry, applyDriftCorrection } from "./lib/verify-retry.mjs";
import { buildCues } from "./lib/subtitles/cues.mjs";
import { renderAss } from "./lib/subtitles/ass.mjs";
import { burnSubtitles } from "./lib/post-process.mjs";
import { runForcedAlignment } from "./lib/tts/post-process.mjs";
import { selectBGM } from "./lib/bgm.mjs";
import { skipsMediaSourcing } from "./lib/claim-keywords.mjs";

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

  let meta, scenes;
  try {
    const metaMod = await import(`${contentPath}/meta.mjs`);
    meta = metaMod.meta;
    const dataMod = await import(`${contentPath}/scene-data.mjs`);
    scenes = dataMod.scenes;
  } catch (e) {
    console.error(`❌ Failed to load content pipeline: ${contentPath}`);
    console.error(`   ${e.message}`);
    console.error(`   Ensure content/${contentDir}/ has meta.mjs + scene-data.mjs`);
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
  // ── Renderer guard ──
  // The HTML/Playwright path was retired (decision 59): Remotion is the only
  // renderer. Fail fast before any real work on attempts to opt back in.
  try {
    assertRemotionRenderer({ argv: args, meta });
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  console.log(`   Renderer: Remotion (React → frame-by-frame)`);
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

  // ── B-roll module (optional) ──
  // Loaded once so both the Step 1.5 sourcing filter and the Step 1.5d stage
  // share it. A load failure only disables B-roll; the pipeline keeps running.
  let broll = null;
  try {
    broll = await import("./lib/b-roll/orchestrator.mjs");
  } catch (e) {
    console.warn(`⚠️  B-roll stage unavailable: ${e.message}\n`);
  }

  // ── Step 1.5: Asset sourcing (auto-search missing media) ──
  // Triggers asset-sourcer when any non-CTA scene lacks media OR has media path pointing to a missing file.
  // Non-blocking: if search fails, scene renders without media (graceful degradation).
  const scenesNeedingMedia = scenes.filter((s) => {
    // #191: shared skip predicate — NO_MEDIA_TYPES, explicit media:null,
    // deprecated mediaOptOut (legacy), CSS-only layouts (hero-center /
    // stacked-cards).
    if (skipsMediaSourcing(s)) return false;
    // A scene that chose pure b-roll must not spend the sourcing budget.
    if (broll && !broll.shouldSourceStock(s)) return false;
    if (!s.media?.path) return true; // No media field at all → needs sourcing
    const contentDirAbs = resolve(__dirname, "content", contentDir);
    const mediaPath = resolve(contentDirAbs, s.media.path);
    return !existsSync(mediaPath); // Media path set but file missing → needs sourcing
  });
  if (scenesNeedingMedia.length > 0) {
    console.log("🔍 Step 1.5: Auto-sourcing missing media assets...\n");
    try {
      // Per-scene claims (assetNeed) + company-entity fallback are consumed
      // inside asset-sourcer from scene-data directly (spec #130 D3/D11) —
      // main no longer narrows the search to companies[0].
      const { main: sourcerMain } = await import("./lib/asset-sourcer.mjs");
      await sourcerMain(["--content", contentDir]);
      console.log();
    } catch (e) {
      console.warn(`⚠️  Asset sourcing skipped: ${e.message}\n`);
    }
  }

  // ── Step 1.5c: Apply media-patch.json to scenes (auto-assign sourced assets) ──
  // After asset-sourcer runs, it generates media-patch.json with scene assignments.
  // This step reads the patch and applies assigned media to scenes that don't have media yet.
  // Memory-only mutation — does NOT write back to scene-data.mjs.
  {
    const contentDirAbs = resolve(__dirname, "content", contentDir);
    const patchPath = resolve(contentDirAbs, "..", "..", "output", contentDir, "media-patch.json");
    if (existsSync(patchPath)) {
      try {
        const patch = JSON.parse(readFileSync(patchPath, "utf-8"));
        const assigned = Array.isArray(patch)
          ? patch.filter((p) => p.status === "assigned" && p.media?.path)
          : [];
        if (assigned.length > 0) {
          let applied = 0;
          const appliedScenes = [];
          for (const entry of assigned) {
            const scene = scenes.find((s) => s.id === entry.sceneId);
            if (!scene) continue;
            if (scene.media?.path) continue; // Don't overwrite existing media
            const mediaPath = resolve(contentDirAbs, entry.media.path);
            if (!existsSync(mediaPath)) {
              console.warn(
                `⚠️  Patched media not found: ${entry.media.path} (scene ${entry.sceneId})`,
              );
              continue;
            }
            scene.media = { ...scene.media, ...entry.media };
            applied++;
            appliedScenes.push(entry.sceneId);
          }
          if (applied > 0) {
            console.log(
              `📦 Step 1.5c: Applied ${applied} media assignments to scenes: ${appliedScenes.join(", ")}\n`,
            );
          } else {
            console.log(`📦 Step 1.5c: No new media to apply (all scenes already have media)\n`);
          }
        } else {
          console.log(
            `⚠️  Step 1.5c: 0 assets assigned in media-patch.json — continuing with CSS fallback\n`,
          );
        }
      } catch (e) {
        console.warn(`⚠️  Step 1.5c: Failed to apply media patch: ${e.message}\n`);
      }
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

  // ── Step 1.5d: B-roll generation (mediaStrategy opt-in scenes) ──
  // Runs after upscale on purpose: Tier A clips are 480x832 and must not be
  // handed to Real-ESRGAN. Winners are assigned in memory only — scene-data is
  // never rewritten. Non-blocking: any failure leaves the scenes untouched.
  if (broll) {
    const pending = broll.scenesRequiringGeneration(scenes);
    if (pending.length > 0) {
      console.log(`🎬 Step 1.5d: Generating B-roll for ${pending.length} scene(s)...\n`);
      try {
        const { closeVisualAnalyzer } = await import("./lib/visual-analyzer.mjs");
        let result;
        try {
          result = await broll.runBrollStage({
            scenes,
            contentSlug: contentDir,
            contentDir: resolve(__dirname, "content", contentDir),
            // Report lives beside media-patch.json, keyed by content dir (same
            // convention the standalone generate-broll.mjs entrypoint uses).
            outputDir: join(__dirname, "output", contentDir),
            onProgress: (line) => console.log(line),
          });
        } finally {
          await closeVisualAnalyzer();
        }
        if (result.depsError) {
          console.warn(`⚠️  Step 1.5d: B-roll skipped — ${result.depsError}\n`);
        } else {
          const { counts } = result;
          console.log(
            `🎬 Step 1.5d: B-roll ${counts.generated} generated, ${counts.cached} cached, ` +
              `${counts.failed} failed, ${counts.escalated} escalated, ${counts.skipped} skipped`,
          );
          if (result.reportFile)
            console.log(`   Report: ${relative(__dirname, result.reportFile)}`);
          if (counts.failed > 0 || counts.escalated > 0) {
            console.log(
              "   → Rewrite the failing aiVideo prompts (8-dimension template) and rerun.",
            );
          }
          console.log();
        }
      } catch (e) {
        console.warn(`⚠️  Step 1.5d: B-roll stage failed: ${e.message}\n`);
      }
    }
  }

  // ── Step 1.6: Final media gate ──
  // Runs here, after sourcing (1.5), patch application (1.5c), upscale
  // (1.5b) and B-roll generation (1.5d) — everything that can still supply a
  // missing file has had its turn.
  // Preflight cannot do this: it runs before Step 1.5 and would block sourcing.
  {
    const contentDirAbs = resolve(__dirname, "content", contentDir);
    const gate = checkFinalMedia({ scenes, contentDir: contentDirAbs });
    if (!gate.pass) {
      console.error("❌ Step 1.6: Final media check FAILED\n");
      console.error(`   ${formatFinalMediaFailures(gate)}\n`);
      console.error("   A media-dependent layout renders an empty middle band without media.");
      console.error("   Supply the media, or switch the scene to a CSS-only layout.");
      process.exit(1);
    }
    console.log("✅ Step 1.6: Final media check passed (all layouts have the media they need)\n");
  }

  // ── Isolated output directory ──
  const outputDir = join(__dirname, "output", meta.pipelineId);
  const audioDir = join(outputDir, "audio");

  mkdirSync(audioDir, { recursive: true });

  // ── Step 1: Generate TTS ──
  console.log("📝 Step 1: Generating TTS voiceover...\n");
  const ttsResults = await generateTTS(scenes, audioDir);
  const totalDuration = ttsResults.reduce((s, t) => s + t.duration, 0);
  console.log(`\n  Total voiceover: ${totalDuration.toFixed(1)}s\n`);

  // ── Step 2: Validate every scene received a TTS result ──
  for (const scene of scenes) {
    const tts = ttsResults.find((t) => t.sceneId === scene.id);
    if (!tts) throw new Error(`No TTS result for scene ${scene.id}`);
  }

  // ── Step 3: Select background music (optional, --bgm flag) ──
  const useBGM = process.argv.includes("--bgm");
  const bgmFileOverride = getArg("bgm-file");
  let bgmPath = null;
  if (useBGM) {
    console.log("🎵 Step 3: Selecting background music...\n");
    bgmPath = selectBGM(meta.pipelineId, bgmFileOverride);
    if (bgmPath) {
      console.log(`  🎵 BGM: ${bgmPath.split("/").pop()}`);
      console.log(`     (instant start, 12% volume, auto-looped)\n`);
    } else {
      console.log("  ⚠️  No BGM file found — skipping\n");
    }
  } else {
    console.log("🎵 Step 3: BGM skipped (use --bgm to enable)\n");
  }

  // ── Step 4: Generate ASS subtitles from word-level timing ──
  const sceneDurations = ttsResults.map((r) => ({ sceneId: r.sceneId, duration: r.duration }));
  const subtitles = regenerateSubtitles({ outputDir, sceneDurations });
  if (subtitles) {
    console.log(`  📝 ASS generated: ${subtitles.cues.length} cues`);

    // ── Gate 1: Canonical Text verification (before rendering) ──
    console.log("  🔍 Gate 1: Canonical Text verification...");
    const audioDir = join(outputDir, "audio");
    const gateResult = await runCanonicalTextGateWithRepair(
      subtitles.timingData,
      scenes,
      meta.keyEntities,
      {
        label: "Gate 1",
        realignFn: async () => {
          const { runForcedAlignment } = await import("./lib/tts/post-process.mjs");
          await runForcedAlignment(scenes, ttsResults, audioDir);
        },
        reloadTimingFn: () => {
          const timingPath = join(audioDir, "subtitle-timing.json");
          return JSON.parse(readFileSync(timingPath, "utf8"));
        },
      },
    );
    // Update subtitles.timingData with repaired timing (if repair occurred)
    if (gateResult.timingData) {
      subtitles.timingData = gateResult.timingData;
    }
    console.log();
  }

  // ── Step 5: Render final video ──
  console.log("🔧 Step 5: Rendering final video with Remotion...\n");
  const result = renderRemotion({
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
        // Re-run forced alignment (text-align.py) + regenerate ASS + re-burn
        // This is an async repair — verifyWithRetry supports async repairFn

        return (async () => {
          try {
            await runForcedAlignment(scenes, ttsResults, join(outputDir, "audio"));
          } catch {
            return { success: false };
          }
          // Re-read timing from disk (text-align.py updated it)
          const timingPath = join(outputDir, "audio", "subtitle-timing.json");
          if (!existsSync(timingPath)) return { success: false };
          subtitles.timingData = JSON.parse(readFileSync(timingPath, "utf8"));
          // Regenerate ASS
          const { cues } = generateSubtitles(
            subtitles.timingData,
            sceneDurations,
            subtitles.assPath,
          );
          const burnResult = findBaseAndBurn();
          return burnResult ?? { success: false };
        })();
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
          audioPaths: ttsResults.map((t) => t.audioPath),
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
