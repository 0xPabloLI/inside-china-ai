/**
 * Remotion render orchestrator — called by main.mjs when a content directory
 * has a `remotion/` subdirectory (or when --remotion flag is used).
 *
 * Flow:
 *   1. Check remotion/node_modules exists → auto npm install if not
 *   2. Construct props JSON from scenes + audioPaths + durations
 *   3. Call `npx remotion render` via child process
 *   4. Finalize in one ffmpeg pass: subtitles + BGM + loudnorm + #176 head trim
 *   5. Return { path, duration }
 *
 * The Remotion project lives at scripts/short-video/remotion/.
 * The CLI renders to an intermediate MP4, then FFmpeg post-processes it.
 */

import { execSync } from "child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { finalizeRenderedVideo } from "./post-process.mjs";
import { sceneClipFrames } from "./timeline.mjs";
import { autoUpscaleIfNeeded } from "./upscale.mjs";
import { assertAvatarScene, isAvatarDeclared } from "./avatar-guard.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the Remotion project root. */
const REMOTION_DIR = join(__dirname, "..", "remotion");

/**
 * Derive the raw (pre-finalize) render output path from a final video path.
 * renderRemotion keeps the raw file when subtitles were burned so the
 * verification repair path (main.mjs) can rebuild the shipped artifact from
 * it — both sides must agree on the name, so the derivation lives here.
 *
 * @param {string} finalPath - e.g. ".../subject-pipeline-short.mp4"
 * @returns {string} e.g. ".../subject-pipeline-raw.mp4"
 */
export function rawOutputPathFor(finalPath) {
  return finalPath.replace("-short.mp4", "-raw.mp4");
}

/**
 * Stage avatar videos (scene.avatar.videoPath) into public/assets/.
 *
 * #214 ticket 02 — mirrors the media copy mechanism exactly: same
 * public/assets/ directory, same basename relativization (the component
 * resolves staticFile(`assets/${videoPath})`), same skip-if-copied cache.
 * One deliberate difference: media missing → warn and strip (sourcing finds
 * another asset); avatar missing → FAIL. The user paid to generate the
 * digital human, so a render without the card is never acceptable.
 *
 * The checks themselves live in ./avatar-guard.mjs (#272) so the render doors
 * and main.mjs enforce one contract: pending generation, missing,
 * corrupt/unreadable, and — new in #272 — a clip too short for this scene's
 * CURRENT voiceover. Sequential, so the first bad scene aborts before any later
 * clip is staged.
 *
 * Pure pre-render staging: throws BEFORE the Remotion CLI is invoked.
 *
 * @param {object} options
 * @param {Array} options.scenes - Sanitized scene array (mutated: videoPath relativized)
 * @param {Array<number>} [options.durations] - TTS voiceover seconds, index-aligned
 *   with `scenes` (same array the props hand-off uses). Omit only when the
 *   caller genuinely has no durations.
 * @param {string} options.contentDir - Content directory (videoPath is content-relative)
 * @param {string} options.publicAssetsDir - remotion/public/assets target
 * @returns {number} staged avatar scene count
 */
export function stageAvatarVideos({ scenes, durations = [], contentDir = "", publicAssetsDir }) {
  let staged = 0;
  for (const [index, scene] of scenes.entries()) {
    if (!isAvatarDeclared(scene)) continue;

    // Presence, readability and "long enough for this scene's current
    // voiceover" — one implementation, shared with main.mjs (#272).
    assertAvatarScene({ scene, voiceoverDurationSec: durations[index], contentDir });

    const avatarSrc = join(contentDir || ".", scene.avatar.videoPath);
    const filename = basename(avatarSrc);
    const avatarDest = join(publicAssetsDir, filename);
    if (!existsSync(avatarDest)) {
      copyFileSync(avatarSrc, avatarDest);
      console.log(`  🧑‍💼 Copied avatar: ${filename}`);
    }
    // Rewrite videoPath to just the filename (relative to public/assets/)
    scene.avatar = { ...scene.avatar, videoPath: filename };
    staged++;
  }
  return staged;
}

/**
 * Render a video using Remotion.
 *
 * @param {object} options
 * @param {Array} options.scenes - Scene data array (from scene-data.mjs)
 * @param {Array<string>} options.audioPaths - TTS audio file paths (absolute)
 * @param {Array<number>} options.durations - TTS durations in seconds
 * @param {string} options.outputDir - Where to write the final MP4
 * @param {string} options.pipelineId - Pipeline ID for naming
 * @param {string} [options.contentDir] - Content directory (for media path resolution)
 * @param {string} [options.subtitlesPath] - ASS subtitle file
 * @param {string} [options.bgmPath] - BGM audio file
 * @param {string} [options.version] - Version suffix
 * @param {string} [options.subject] - Subject prefix
 * @returns {{path: string, duration: string}}
 */
export function renderRemotion({
  scenes,
  audioPaths,
  durations,
  outputDir,
  pipelineId,
  contentDir = "",
  subtitlesPath = null,
  bgmPath = null,
  version = null,
  subject = null,
}) {
  // ── 1. Auto-install if needed ──
  const nodeModulesPath = join(REMOTION_DIR, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    console.log("  📦 Installing Remotion dependencies (first run)...");
    execSync("npm install", { cwd: REMOTION_DIR, stdio: ["pipe", "pipe", "pipe"] });
    console.log("  ✅ Dependencies installed");
  }

  // ── 2. Copy audio files to remotion/public/ for staticFile() access ──
  // Remotion's Chrome headless can't load file:// URLs, only public/ files
  const publicAudioDir = join(REMOTION_DIR, "public", "audio");
  mkdirSync(publicAudioDir, { recursive: true });
  const audioPublicPaths = audioPaths.map((p, i) => {
    const cleanPath = p.replace("file://", "");
    const filename = basename(cleanPath);
    const dest = join(publicAudioDir, filename);
    copyFileSync(cleanPath, dest);
    return `audio/${filename}`; // relative to public/ for staticFile()
  });

  // ── 2b. Copy media files (from scene.media.path) to remotion/public/assets/ ──
  // MediaBackground.tsx uses staticFile(media.path) which resolves relative to public/
  // Content media files live in content/{slug}/assets/ — copy them to public/assets/
  // Note: public/assets may be a symlink to ../../assets — that's fine, files go there
  const publicAssetsDir = join(REMOTION_DIR, "public", "assets");
  if (!existsSync(publicAssetsDir)) {
    mkdirSync(publicAssetsDir, { recursive: true });
  }
  // Deep clone scenes to avoid mutating the original objects
  const sanitizedScenes = scenes.map((s) => ({ ...s }));
  for (const scene of sanitizedScenes) {
    if (scene.media && scene.media.path) {
      const mediaSrc = join(contentDir || ".", scene.media.path);
      if (existsSync(mediaSrc)) {
        // Auto-upscale sub-720p assets before copying (only for adopted assets).
        // `upscale: false` is an asset's own opt-out of this safety net —
        // generated B-roll clips are 480×832 by design and must not be sent
        // through per-frame Real-ESRGAN here.
        let srcPath = mediaSrc;
        if (scene.media.upscale !== false) {
          const upscaleResult = autoUpscaleIfNeeded(mediaSrc);
          if (upscaleResult.upscaled) {
            console.log(`  📈 Upscaled: ${basename(upscaleResult.path)} → 720p`);
          }
          srcPath = upscaleResult.path;
        }
        const filename = basename(srcPath);
        const mediaDest = join(publicAssetsDir, filename);
        if (!existsSync(mediaDest)) {
          copyFileSync(srcPath, mediaDest);
          console.log(`  📸 Copied media: ${filename}`);
        }
        // Rewrite path to just the filename (relative to public/assets/)
        scene.media = { ...scene.media, path: filename };
      } else {
        console.warn(
          `  ⚠️  Media file not found: ${scene.media.path} — stripping media from scene ${scene.id}`,
        );
        delete scene.media;
      }
    }
    // #156: copy the backdrop clip too (no upscale — generated clips set
    // upscale:false; a missing backdrop file just drops the layer, which
    // validateMedia already warns about).
    if (scene.media?.backdrop?.path) {
      const bdSrc = join(contentDir || ".", scene.media.backdrop.path);
      if (existsSync(bdSrc)) {
        const bdDest = join(publicAssetsDir, basename(bdSrc));
        if (!existsSync(bdDest)) {
          copyFileSync(bdSrc, bdDest);
          console.log(`  📸 Copied backdrop: ${basename(bdSrc)}`);
        }
        scene.media = {
          ...scene.media,
          backdrop: { ...scene.media.backdrop, path: basename(bdSrc) },
        };
      } else {
        console.warn(
          `  ⚠️  Backdrop file not found: ${scene.media.backdrop.path} — dropping backdrop from scene ${scene.id}`,
        );
        const { backdrop: _dropped, ...mediaWithoutBackdrop } = scene.media;
        scene.media = mediaWithoutBackdrop;
      }
    }
  }

  // ── 2c. Stage avatar videos (scene.avatar.videoPath) ──
  // #214 ticket 02: fail-closed pre-render check + public/assets copy +
  // videoPath relativization (mirrors the media copy mechanism above).
  const avatarCount = stageAvatarVideos({
    scenes: sanitizedScenes,
    durations,
    contentDir,
    publicAssetsDir,
  });
  if (avatarCount > 0) {
    console.log(`  🧑‍💼 Avatar card layer enabled for ${avatarCount} scene(s)`);
  }

  // ── 3. Construct props ──
  const props = {
    scenes: sanitizedScenes,
    audioPaths: audioPublicPaths,
    durations,
    contentDir,
  };

  // ── 3. Calculate total duration in frames (from timeline.mjs — single source of truth) ──
  const totalFrames = durations.reduce((sum, d) => sum + sceneClipFrames(d), 0);

  // ── 4. Render via CLI ──
  const filePrefix = subject && subject !== pipelineId ? `${subject}-${pipelineId}` : pipelineId;
  const versionSuffix = version ? `-v${version}` : "";
  const finalPath = join(outputDir, `${filePrefix}${versionSuffix}-short.mp4`);
  const rawPath = join(outputDir, `${filePrefix}${versionSuffix}-raw.mp4`);

  console.log(`  🎬 Rendering ${scenes.length} scenes via Remotion (${totalFrames} frames)...`);

  // Use execSync with proper JSON escaping for --props
  const propsJson = JSON.stringify(props).replace(/'/g, "'\\''");
  const renderCmd = `npx remotion render src/Root.tsx ShortVideo '${rawPath}' --props='${propsJson}'`;

  try {
    execSync(renderCmd, {
      cwd: REMOTION_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    const stderr = e.stderr?.toString() ?? "";
    // The structured gate failure sits on the LAST TextFitError line; head-
    // truncating stderr buries it under per-frame browser console noise
    // (burned a debugging session on the _gate-smoke run).
    const fitError = [...stderr.matchAll(/\[TextFitError\] (\{.*\})/g)].pop()?.[1];
    const detail = fitError ?? stderr.slice(-800);
    throw new Error(`Remotion render failed: ${e.message?.substring(0, 200)}\nstderr: ${detail}`);
  }

  console.log(`  ✅ Remotion render complete: ${rawPath}`);

  // ── 5. Finalize in a single ffmpeg pass (#198) ──
  // The former chain ran up to 4 sequential passes over the same mp4
  // (burnSubtitles → mixBgm → normalizeLoudness → realignAudioToTimeline),
  // costing 2-3 full re-encodes plus 3 generations of AAC loss per render.
  // finalizeRenderedVideo folds subs + BGM + loudnorm + the #176 head trim
  // into one -filter_complex pass; the head drift is measured on the RAW
  // output (audio decode only — post-processing preserves timestamps) so the
  // trim rides in the single encode instead of costing its own re-encode.
  const hasSubs = Boolean(subtitlesPath && existsSync(subtitlesPath));
  finalizeRenderedVideo({
    videoPath: rawPath,
    assPath: hasSubs ? subtitlesPath : null,
    bgmPath: bgmPath || null,
    outputPath: finalPath,
    realign: {
      outputDir, // scene audio for measurement lives here
      sceneDurations: scenes.map((s, i) => ({
        sceneId: s.id ?? i + 1,
        duration: durations[i],
      })),
      audioPaths: audioPaths.map((p) => p.replace("file://", "")),
    },
  });

  // Keep the raw output when subtitles were burned: main.mjs's verification
  // repair path rebuilds the shipped file from it with a corrected ASS.
  // (Without subtitles there is no repair that needs a base.)
  try {
    if (!hasSubs && existsSync(rawPath)) unlinkSync(rawPath);
  } catch {}

  // ── 6. Get final duration ──
  let finalDuration = "unknown";
  try {
    const info = execSync(
      `ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString();
    finalDuration = `${parseFloat(info.trim()).toFixed(1)}s`;
  } catch {}

  // ── 7. Clean up copied audio files ──
  try {
    rmSync(publicAudioDir, { recursive: true, force: true });
  } catch {}

  return { path: finalPath, duration: finalDuration };
}
