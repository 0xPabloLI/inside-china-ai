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
import {
  existsSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  copyFileSync,
  statSync,
  rmSync,
} from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { finalizeRenderedVideo } from "./post-process.mjs";
import { sceneClipFrames } from "./timeline.mjs";
import { autoUpscaleIfNeeded } from "./upscale.mjs";
import { assertAvatarScene, isAvatarDeclared } from "./avatar-guard.mjs";
import { getDurationSync } from "./tts/ffmpeg-cmd.mjs";
import { shellQuote } from "./shell-quote.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the Remotion project root. */
const REMOTION_DIR = join(__dirname, "..", "remotion");

/**
 * Whether a content asset must be copied into remotion/public/assets/.
 *
 * The staging sites used to be guarded by `if (!existsSync(dest))`, which
 * assumed a content asset's filename is its identity. It is not: re-compositing
 * or re-cropping a screenshot keeps the filename and changes the bytes, so the
 * public copy stayed at the previous version and Remotion silently rendered the
 * old picture. Nothing warned — the render succeeds, the frame is just wrong.
 *
 * The comparison is stat-based (size, then source-vs-destination mtime) rather
 * than hash-based: staging runs on every render for every asset, and a hash of
 * a 5MB PNG per scene costs more than it buys. Size catches every re-encode;
 * mtime catches same-size rewrites.
 *
 * The mtime arm carries a tolerance. A copy that preserves the timestamp (or a
 * test that pins it with utimesSync) round-trips through a float-seconds API and
 * can land a fraction of a millisecond off the source, so a bare `>` treats
 * identical files as edited and re-copies on every render. The tolerance is far
 * below the resolution of a real edit — an in-place re-composite lands seconds
 * or minutes later — so it removes the noise without weakening the signal.
 *
 * Fail-safe direction: anything unreadable means "copy". A redundant copy costs
 * milliseconds; a missed one ships a stale frame.
 *
 * @param {string} srcPath - Source asset (content/{slug}/assets/...)
 * @param {string} destPath - Staged copy (remotion/public/assets/...)
 * @returns {boolean} true when the copy must run
 */
export function shouldRestageAsset(srcPath, destPath) {
  let src;
  let dest;
  try {
    src = statSync(srcPath);
    dest = statSync(destPath);
  } catch {
    return true;
  }
  if (!src.isFile() || !dest.isFile()) return true;
  if (src.size !== dest.size) return true;
  return src.mtimeMs - dest.mtimeMs > MTIME_TOLERANCE_MS;
}

/** Ignore sub-millisecond mtime drift from timestamp round-trips (see above). */
const MTIME_TOLERANCE_MS = 2;

/**
 * Subdirectory of remotion/public/assets/ that holds render-time staged copies.
 *
 * public/assets is a SYMLINK to the curated scripts/short-video/assets/ — brand
 * assets, catalog.yml, bgm/, dh-fixtures/. A copy written straight into that
 * directory is therefore indistinguishable from a hand-curated asset: it shows
 * up as untracked noise after every render, and the ignore rules that hide the
 * downloaded ones (`pexels-*`, `unsplash-*`, …) never match the rest.
 *
 * Staged copies are render scratch, not curated content: they live in their own
 * namespace so the curated root keeps meaning "hand-placed". Both consumers
 * prepend `assets/` to a path without that prefix (AvatarCard.tsx:91,
 * MediaBackground.tsx:115 and :215), so `_staged/x.png` resolves to
 * public/assets/_staged/x.png.
 *
 * The observed accumulation this replaced is recorded in
 * __tests__/render-remotion-staging.test.mjs — keep the numbers there, not here.
 */
const STAGED_ASSET_DIR = "_staged";

/**
 * The path a staged asset is addressed by, relative to public/assets/.
 *
 * @param {string} filename - basename of the staged copy
 * @returns {string} e.g. "_staged/chart.png"
 */
export function stagedAssetRelPath(filename) {
  return `${STAGED_ASSET_DIR}/${filename}`;
}

/**
 * Copy one content asset into the staged namespace of the public assets dir and
 * return the path to hand Remotion.
 *
 * Single staging door for the three copy sites (media, backdrop, avatar): they
 * differ in what a missing file means (warn-and-strip vs fail-closed) but not in
 * where the copy lands, and keeping that in one place is what stops a future
 * site from re-introducing a flat copy.
 *
 * Containment: the destination name is `basename(srcPath)`, never the authored
 * path. `basename()` drops every directory component, so a scene-data `path` of
 * `../../../../etc/passwd` stages as `_staged/passwd` and the copy cannot leave
 * the staged directory. That is the whole defense and it is deliberate — a
 * scanner reporting the `join` as a traversal sink has not modelled `basename`
 * as the sanitizer it is.
 *
 * @param {object} options
 * @param {string} options.srcPath - Source asset (absolute, or relative to cwd)
 * @param {string} options.publicAssetsDir - remotion/public/assets target
 * @param {string} options.label - Log prefix, e.g. "📸 Copied media"
 * @returns {string} the staged path relative to public/assets/
 */
export function stageAsset({ srcPath, publicAssetsDir, label }) {
  const filename = basename(srcPath);
  const stagedDir = join(publicAssetsDir, STAGED_ASSET_DIR);
  const dest = join(stagedDir, filename);
  if (shouldRestageAsset(srcPath, dest)) {
    mkdirSync(stagedDir, { recursive: true });
    copyFileSync(srcPath, dest);
    console.log(`  ${label}: ${filename}`);
  }
  return stagedAssetRelPath(filename);
}

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
 * Build the `npx remotion render` command line.
 *
 * Both the output path and the props JSON go through the shared shellQuote
 * helper, so a subject/pipelineId carrying a quote, `$(...)` or a backtick
 * stays data instead of shell syntax (#319 OCR video batch scan — the
 * render-only contentDir/pipelineId findings land on this line).
 *
 * @param {{ rawPath: string, props: Record<string, unknown> }} input
 * @returns {string} command line for execSync
 */
export function buildRemotionRenderCommand({ rawPath, props }) {
  return `npx remotion render src/Root.tsx ShortVideo ${shellQuote(rawPath)} --props=${shellQuote(JSON.stringify(props))}`;
}

/**
 * Stage avatar videos (scene.avatar.videoPath) into the staged namespace.
 *
 * #214 ticket 02 — mirrors the media copy mechanism exactly: same
 * public/assets/ target and same `_staged/` namespace, same staged-path
 * relativization (the component resolves staticFile(`assets/${videoPath}`)),
 * same skip-if-copied cache. One deliberate difference: media missing → warn
 * and strip (sourcing finds another asset); avatar missing → FAIL. The user paid
 * to generate the digital human, so a render without the card is never
 * acceptable.
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
 * @param {Array} options.scenes - Sanitized scene array (mutated: videoPath rewritten to the staged path)
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
    // Rewrite videoPath to the staged path (relative to public/assets/)
    scene.avatar = {
      ...scene.avatar,
      videoPath: stageAsset({
        srcPath: avatarSrc,
        publicAssetsDir,
        label: "🧑‍💼 Copied avatar",
      }),
    };
    staged++;
  }
  return staged;
}

/**
 * #360 S8: the render side has no source-duration knowledge, so an
 * out-of-range videoStartOffsetMs cannot be verified here — it degrades
 * to black frames at render time. Surface one warning and let the author
 * decide (no block, no clamp).
 */
export function warnOffsetUnverifiable(scene) {
  if (scene.media?.videoStartOffsetMs > 0) {
    console.warn(
      `  ⚠️  Scene ${scene.id}: videoStartOffsetMs ${scene.media.videoStartOffsetMs}ms — render side has no source duration; an offset beyond the source length renders black frames (S8, author responsibility).`,
    );
  }
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

  // ── 2b. Copy media files (from scene.media.path) into the staged namespace ──
  // MediaBackground.tsx uses staticFile(media.path) which resolves relative to public/
  // Content media files live in content/{slug}/assets/ — copy them to public/assets/_staged/
  // Note: public/assets is a symlink to ../../assets, so _staged/ lands inside the
  // curated directory (see STAGED_ASSET_DIR for why it must stay in its own namespace).
  const publicAssetsDir = join(REMOTION_DIR, "public", "assets");
  if (!existsSync(publicAssetsDir)) {
    mkdirSync(publicAssetsDir, { recursive: true });
  }
  // Deep clone scenes to avoid mutating the original objects
  const sanitizedScenes = scenes.map((s) => ({ ...s }));
  for (const scene of sanitizedScenes) {
    warnOffsetUnverifiable(scene);
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
        // Rewrite path to the staged path (relative to public/assets/)
        scene.media = {
          ...scene.media,
          path: stageAsset({ srcPath, publicAssetsDir, label: "📸 Copied media" }),
        };
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
        scene.media = {
          ...scene.media,
          backdrop: {
            ...scene.media.backdrop,
            path: stageAsset({ srcPath: bdSrc, publicAssetsDir, label: "📸 Copied backdrop" }),
          },
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
  // #214 ticket 02: fail-closed pre-render check + staged copy +
  // videoPath rewrite (mirrors the media copy mechanism above).
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

  const renderCmd = buildRemotionRenderCommand({ rawPath, props });

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
  // argv-safe shared probe (#319 OCR video batch scan): finalPath carries
  // subject/pipelineId, so it must never reach a shell string.
  let finalDuration = "unknown";
  try {
    const probed = getDurationSync(finalPath);
    if (Number.isFinite(probed)) finalDuration = `${probed.toFixed(1)}s`;
  } catch {}

  // ── 7. Clean up copied audio files ──
  try {
    rmSync(publicAudioDir, { recursive: true, force: true });
  } catch {}

  return { path: finalPath, duration: finalDuration };
}
