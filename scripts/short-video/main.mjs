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
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { generateTTS } from "./lib/generate-tts.mjs";
import { renderRemotion, rawOutputPathFor } from "./lib/render-remotion.mjs";
import { assertRemotionRenderer } from "./lib/renderer-guard.mjs";
import { checkFinalMedia, formatFinalMediaFailures } from "./lib/final-media-gate.mjs";
import { regenerateSubtitles } from "./lib/subtitles/generate.mjs";
import { runCanonicalTextGateWithRepair } from "./lib/verify-canonical-text.mjs";
import { verifySubtitles } from "./lib/verify-subtitles.mjs";
import { verifyWithRetry, applyDriftCorrection } from "./lib/verify-retry.mjs";
import { buildCues } from "./lib/subtitles/cues.mjs";
import { renderAss } from "./lib/subtitles/ass.mjs";
import { finalizeRenderedVideo } from "./lib/post-process.mjs";
import { runForcedAlignment } from "./lib/tts/post-process.mjs";
import { selectBGM } from "./lib/bgm.mjs";
import { createProfiler } from "./lib/pipeline-profile.mjs";
import { runMediaTrack } from "./lib/media-track.mjs";

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

  // ── Version number (timestamp-based, for output file naming) ──
  const version = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // ── Step profiler (#225) — wall-clock per step; written on process exit
  // (happy path and failure paths alike) to output/<pipelineId>/profile-<version>.json
  const profiler = createProfiler({
    outputDir: join(__dirname, "output", meta.pipelineId),
    version,
  });
  const prof = { mark: profiler.mark, end: profiler.end, wrap: profiler.wrap };

  // ── Step 0.5: Currency normalization (RMB → USD dual-annotation) ──
  // Auto-inserts $X (¥Y) format before TTS runs, enforcing the currency
  // rule by code. Non-blocking: if it fails, scenes pass through unchanged.
  prof.mark("step-0.5-currency");
  try {
    const { normalizeSceneData } = await import("./lib/normalize-currency.mjs");
    normalizeSceneData(scenes, meta);
    console.log("💱 Step 0.5: Currency normalization complete (RMB → USD dual-annotation)\n");
  } catch (e) {
    console.warn(`⚠️  Currency normalization skipped: ${e.message}\n`);
  }
  prof.end("step-0.5-currency");

  // ── Step 0.6: TTS text normalization (version numbers, decimals, dates) ──
  // Rewrites voiceover-only fields so TTS reads "V four point one" instead of
  // "v four [pause] one". On-screen texts are left untouched.
  prof.mark("step-0.6-tts-normalize");
  try {
    const { normalizeTtsText } = await import("./lib/normalize-tts-text.mjs");
    normalizeTtsText(scenes, meta);
    console.log("🔤 Step 0.6: TTS text normalization complete (versions/decimals/dates)\n");
  } catch (e) {
    console.warn(`⚠️  TTS text normalization skipped: ${e.message}\n`);
  }
  prof.end("step-0.6-tts-normalize");

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

  // ── Avatar instrumentation (#214 ticket 02) ──
  // Minimal fail-closed check ONLY: a declared avatar videoPath whose file is
  // missing aborts here, before TTS spend. Generation itself is a separate
  // CLI (lands with #214 T3) and is never triggered from main.mjs. The
  // render layer re-checks at staging time (render-remotion.mjs), so
  // render-only runs get the same fail-closed guarantee.
  const avatarScenes = scenes.filter((s) => s.avatar && typeof s.avatar === "object");
  if (avatarScenes.length > 0) {
    for (const scene of avatarScenes) {
      if (scene.avatar.videoPath) {
        const avatarPath = resolve(__dirname, "content", contentDir, scene.avatar.videoPath);
        if (!existsSync(avatarPath)) {
          console.error(`❌ Avatar video missing for scene ${scene.id}: ${scene.avatar.videoPath}`);
          console.error(
            `   Fail-closed: the render will not silently drop the digital human.`,
          );
          console.error(
            `   Restore the generated clip, or regenerate it (digital-human CLI, #214 T3), or remove scene.avatar from the scene.`,
          );
          process.exit(1);
        }
      }
    }
    const pending = avatarScenes.filter((s) => !s.avatar.videoPath).length;
    console.log(
      `🧑‍💼 Avatar declared on ${avatarScenes.length} scene(s)` +
        (pending ? ` (${pending} pending generation — render will fail-closed)` : ""),
    );
    console.log("");
  }

  // ── Pre-Render Verification (validates scene-data against SKILL.md rules) ──
  const skipPreflight = process.argv.includes("--skip-preflight");
  if (!skipPreflight) {
    console.log("🔍 Step 0: Pre-Render Verification...\n");
    prof.mark("step-0-preflight");
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
    prof.end("step-0-preflight");
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

  // ── Isolated output directory (the voice track writes TTS audio here) ──
  const outputDir = join(__dirname, "output", meta.pipelineId);
  const audioDir = join(outputDir, "audio");
  mkdirSync(audioDir, { recursive: true });

  // ── Voice ∥ Media tracks (#225 optimization 1) ──
  // The media track (sourcing 1.5 → patch 1.5c → upscale 1.5b → B-roll 1.5d,
  // now in lib/media-track.mjs) only touches scene media fields; the voice
  // track (TTS, Step 1) only reads scene text. No shared mutable state, so
  // both run concurrently. The media gate (1.6) runs after the join: it
  // needs the final media state the media track produces.
  console.log("⚡ Tracks: [media: sourcing→patch→upscale→broll] ∥ [voice: TTS]\n");
  console.log("📝 Step 1: Generating TTS voiceover (parallel with media track)...\n");
  prof.mark("media-track", { track: "media" });
  prof.mark("step-1-tts", { track: "voice" });
  let ttsResults;
  try {
    // allSettled, not all: on a voice-track failure the media track still
    // runs to its natural end, so the failure-path profile records real
    // durations instead of the finally block prematurely closing a live step.
    const [mediaDone, ttsDone] = await Promise.allSettled([
      runMediaTrack({ scenes, contentDir, baseDir: __dirname, broll, prof }),
      generateTTS(scenes, audioDir),
    ]);
    if (mediaDone.status === "rejected") {
      // The track's own contract is never-reject (every stage has its own
      // try/catch); reaching here means an unexpected bug — surface it but
      // keep a TTS failure authoritative for the abort below.
      console.warn(`⚠️  Media track crashed unexpectedly: ${mediaDone.reason?.message}\n`);
    }
    if (ttsDone.status === "rejected") throw ttsDone.reason;
    ttsResults = ttsDone.value;
  } finally {
    prof.end("media-track");
    prof.end("step-1-tts");
  }

  // ── Step 1.6: Final media gate ──
  // Runs after the join: sourcing (1.5), patch application (1.5c), upscale
  // (1.5b) and B-roll generation (1.5d) have all had their turn.
  // Preflight cannot do this: it runs before Step 1.5 and would block sourcing.
  {
    const contentDirAbs = resolve(__dirname, "content", contentDir);
    prof.mark("step-1.6-media-gate", { track: "media" });
    const gate = checkFinalMedia({ scenes, contentDir: contentDirAbs });
    if (!gate.pass) {
      console.error("❌ Step 1.6: Final media check FAILED\n");
      console.error(`   ${formatFinalMediaFailures(gate)}\n`);
      console.error("   A media-dependent layout renders an empty middle band without media.");
      console.error("   Supply the media, or switch the scene to a CSS-only layout.");
      process.exit(1);
    }
    prof.end("step-1.6-media-gate");
    console.log("✅ Step 1.6: Final media check passed (all layouts have the media they need)\n");
  }

  // ── Step 2: Validate every scene received a TTS result ──
  for (const scene of scenes) {
    const tts = ttsResults.find((t) => t.sceneId === scene.id);
    if (!tts) throw new Error(`No TTS result for scene ${scene.id}`);
  }
  const totalDuration = ttsResults.reduce((s, t) => s + t.duration, 0);
  const ttsCached = ttsResults.filter((r) => r.cached).length;
  console.log(`\n  Total voiceover: ${totalDuration.toFixed(1)}s` + (ttsCached ? ` (${ttsCached}/${scenes.length} from cache)` : "") + "\n");

  // ── Step 3: Select background music (optional, --bgm flag) ──
  const useBGM = process.argv.includes("--bgm");
  const bgmFileOverride = getArg("bgm-file");
  let bgmPath = null;
  if (useBGM) {
    console.log("🎵 Step 3: Selecting background music...\n");
    prof.mark("step-3-bgm");
    bgmPath = selectBGM(meta.pipelineId, bgmFileOverride);
    prof.end("step-3-bgm");
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
  prof.mark("step-4-subtitles");
  const sceneDurations = ttsResults.map((r) => ({ sceneId: r.sceneId, duration: r.duration }));
  const subtitles = regenerateSubtitles({ outputDir, sceneDurations });
  if (subtitles) {
    console.log(`  📝 ASS generated: ${subtitles.cues.length} cues`);

    // ── Gate 1: Canonical Text verification (before rendering) ──
    console.log("  🔍 Gate 1: Canonical Text verification...");
    const audioDir = join(outputDir, "audio");
    prof.mark("step-4-gate1-canonical");
    const gateResult = await runCanonicalTextGateWithRepair(
      subtitles.timingData,
      scenes,
      meta.keyEntities,
      {
        label: "Gate 1",
        realignFn: async () => {
          const { runForcedAlignment } = await import("./lib/tts/post-process.mjs");
          await runForcedAlignment(scenes, ttsResults, audioDir, { force: true });
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
    prof.end("step-4-gate1-canonical");
    console.log();
  }
  prof.end("step-4-subtitles");

  // ── Step 5: Render final video ──
  console.log("🔧 Step 5: Rendering final video with Remotion...\n");
  prof.mark("step-5-render");
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
  prof.end("step-5-render");

  // ── Step 6: Verify subtitles with auto-retry (optional, --skip-verify to skip) ──
  const skipVerify = process.argv.includes("--skip-verify");
  const maxRetries = parseInt(getArg("max-retries") ?? "2", 10);
  if (skipVerify) {
    console.log("🔍 Step 6: Subtitle verification skipped (--skip-verify)\n");
  } else if (!subtitles) {
    console.log("🔍 Step 6: Subtitle verification skipped (no subtitles generated)\n");
  } else {
    prof.mark("step-6-verify", { maxRetries });
    console.log(
      "🔍 Step 6: Verifying rendered subtitles with auto-retry (max-retries=" +
        maxRetries +
        ")...\n",
    );

    // Repair dispatch: maps failure categories to repair actions
    const repairFn = (category, report) => {
      const findBaseAndBurn = () => {
        // The finalize pass keeps the RAW render output as the repair base.
        // Rebuild the shipped file from it with the corrected ASS — the full
        // single-pass chain (subs + BGM + loudnorm + #176 head trim), not a
        // bare re-burn, so the repaired artifact matches the shipped recipe.
        const rawPath = rawOutputPathFor(result.path);
        if (!existsSync(rawPath)) return null;
        finalizeRenderedVideo({
          videoPath: rawPath,
          assPath: subtitles.assPath,
          bgmPath,
          outputPath: result.path,
          realign: {
            outputDir,
            sceneDurations,
            audioPaths: ttsResults.map((t) => t.audioPath),
          },
        });
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
            await runForcedAlignment(scenes, ttsResults, join(outputDir, "audio"), {
              force: true,
            });
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
    prof.end("step-6-verify");
  }

  profiler.summary();
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
