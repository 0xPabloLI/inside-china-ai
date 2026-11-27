/**
 * Remotion render orchestrator — called by main.mjs when a content directory
 * has a `remotion/` subdirectory (or when --remotion flag is used).
 *
 * Flow:
 *   1. Check remotion/node_modules exists → auto npm install if not
 *   2. Construct props JSON from scenes + audioPaths + durations
 *   3. Write props.json + manifest.json under output/<id>/render/<version>/
 *   4. Call `npx remotion render … --props=<path>` via execFile (no shell)
 *   5. Finalize in one ffmpeg pass: subtitles + BGM + loudnorm + #176 head trim
 *   6. Return { path, duration }
 *
 * The Remotion project lives at scripts/short-video/remotion/.
 * The CLI renders to an intermediate MP4, then FFmpeg post-processes it.
 */

import { execFileSync, execSync } from "child_process";
import {
  existsSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  copyFileSync,
  statSync,
  rmSync,
  rmdirSync,
  readFileSync,
  readdirSync,
} from "fs";
import { createHash } from "crypto";
import { join, dirname, basename, relative, isAbsolute } from "path";
import { fileURLToPath } from "url";
import { finalizeRenderedVideo } from "./post-process.mjs";
import { sceneClipFrames } from "./timeline.mjs";
import { autoUpscaleIfNeeded } from "./upscale.mjs";
import { assertAvatarScene, isAvatarDeclared } from "./avatar-guard.mjs";
import { getDurationSync } from "./tts/ffmpeg-cmd.mjs";
import {
  buildRemotionRenderArgs,
  describeRenderFailure,
  formatRenderCommand,
  manifestPathFor,
  propsPathFor,
  renderArtifactDir,
  updateRenderManifest,
  writeRenderArtifacts,
} from "./render-manifest.mjs";
import { computeCompositionFingerprint } from "./render-composition.mjs";
import { applyEvidenceAudioDefaults } from "./evidence-audio.mjs";
import {
  INCREMENTAL_SCHEMA,
  buildSceneFingerprints,
  planIncrementalRender,
} from "./render-incremental.mjs";

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

/** File-level sha256, or null when the file is unreadable. */
function sha256File(path) {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/** All staged media a scene's pixels can depend on, as paths under public/assets. */
function stagedMediaPaths(scene) {
  const paths = [];
  if (scene?.media?.path) paths.push(scene.media.path);
  if (scene?.media?.backdrop?.path) paths.push(scene.media.backdrop.path);
  if (scene?.avatar?.videoPath) paths.push(scene.avatar.videoPath);
  return paths;
}

/**
 * One digest over every staged media file a scene references. A missing file
 * yields null — the scene then compares unequal to any recorded hash, which is
 * the fail-safe direction (render it again).
 */
export function sceneMediaSha256(scene, publicAssetsDir) {
  const paths = stagedMediaPaths(scene);
  if (paths.length === 0) return null;
  const entries = [];
  for (const rel of paths.sort()) {
    const sha = sha256File(join(publicAssetsDir, rel));
    if (!sha) return null;
    entries.push(`${rel}:${sha}`);
  }
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

/**
 * Find the newest render of this pipeline whose cache is still usable.
 *
 * Read-only: a candidate must match the composition fingerprint and fps, and
 * every segment it recorded must still exist. Only after all of that does the
 * planner decide whether the *scene data* also matches. Segment paths are
 * stored relative to the pipeline output dir, so a moved output folder still
 * resolves.
 *
 * @param {{outputDir: string, compositionFingerprint: string, fps?: number, excludeVersion?: string|null}} input
 * @returns {{version: string, manifestPath: string, manifest: object}|null}
 */
export function findIncrementalBase({
  outputDir,
  compositionFingerprint,
  fps = 30,
  excludeVersion = null,
}) {
  const root = join(outputDir, "render");
  if (!existsSync(root)) return null;
  const candidates = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === excludeVersion) continue;
    const manifestPath = join(root, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const inc = manifest.incremental;
      if (!inc || inc.schema !== INCREMENTAL_SCHEMA) continue;
      if (inc.fps !== fps || inc.compositionFingerprint !== compositionFingerprint) continue;
      if (!Array.isArray(inc.segments) || inc.segments.length === 0) continue;
      const allPresent = inc.segments.every((segment) => {
        if (typeof segment.path !== "string" || segment.path.length === 0) return false;
        return existsSync(isAbsolute(segment.path) ? segment.path : join(outputDir, segment.path));
      });
      if (!allPresent) continue;
      candidates.push({ version: entry.name, manifestPath, manifest });
    } catch {
      // A corrupt manifest is not a reason to stop looking further back.
    }
  }
  candidates.sort((a, b) => {
    const at = a.manifest.createdAt ?? a.version;
    const bt = b.manifest.createdAt ?? b.version;
    return bt.localeCompare(at);
  });
  return candidates[0] ?? null;
}

/**
 * Delete everything under a stale version directory except files a kept
 * manifest still references. A newer incremental render can reuse an older
 * version's part, so `rm -rf render/<old>/` would silently break its cache.
 */
function removeUnprotectedTree(dir, protectedFiles) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (protectedFiles.has(full)) continue;
    if (entry.isDirectory()) {
      removeUnprotectedTree(full, protectedFiles);
    } else {
      try {
        unlinkSync(full);
      } catch {
        /* best effort */
      }
    }
  }
  try {
    if (readdirSync(dir).length === 0) rmdirSync(dir);
  } catch {
    /* best effort */
  }
}

/**
 * Keep the two newest cached versions per pipeline (#228 ③ decision 11).
 *
 * Only files this renderer wrote are candidates: part files under
 * `render/<version>/` and `*-raw.mp4` at the pipeline root. Anything still
 * referenced by a kept manifest is preserved even when its own version is old.
 *
 * @param {{outputDir: string, keep?: number, keepVersion?: string|null}} input
 * @returns {{removed: string[]}}
 */
export function pruneRenderCache({ outputDir, keep = 2, keepVersion = null }) {
  const root = join(outputDir, "render");
  if (!existsSync(root)) return { removed: [] };

  const entries = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const segments = manifest.incremental?.segments;
      if (!Array.isArray(segments) || segments.length === 0) continue;
      entries.push({ version: entry.name, dir: join(root, entry.name), manifest });
    } catch {
      continue;
    }
  }
  entries.sort((a, b) => {
    const at = a.manifest.createdAt ?? a.version;
    const bt = b.manifest.createdAt ?? b.version;
    return bt.localeCompare(at);
  });

  const keepSet = new Set(entries.slice(0, keep).map((entry) => entry.version));
  if (keepVersion) keepSet.add(keepVersion);

  const protectedFiles = new Set();
  for (const entry of entries) {
    if (!keepSet.has(entry.version)) continue;
    for (const segment of entry.manifest.incremental.segments) {
      protectedFiles.add(isAbsolute(segment.path) ? segment.path : join(outputDir, segment.path));
    }
  }

  const removed = [];
  for (const entry of entries) {
    if (keepSet.has(entry.version)) continue;
    let protectedInDir = false;
    for (const segment of entry.manifest.incremental.segments) {
      const abs = isAbsolute(segment.path) ? segment.path : join(outputDir, segment.path);
      if (protectedFiles.has(abs)) {
        protectedInDir = true;
        continue;
      }
      const rel = relative(outputDir, abs);
      if (rel.startsWith("..") || isAbsolute(rel)) continue;
      const allowed = rel.startsWith("render/") || /-raw\.mp4$/.test(abs);
      if (!allowed || !existsSync(abs)) continue;
      try {
        unlinkSync(abs);
        removed.push(rel);
      } catch {
        /* best effort */
      }
    }
    if (protectedInDir) {
      removeUnprotectedTree(entry.dir, protectedFiles);
      if (!existsSync(entry.dir)) removed.push(relative(outputDir, entry.dir));
      continue;
    }
    try {
      rmSync(entry.dir, { recursive: true, force: true });
      removed.push(relative(outputDir, entry.dir));
    } catch {
      /* best effort */
    }
  }
  return { removed };
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
        // through per-frame Real-ESRGAN here. `upscale: "resample"` keeps the
        // safety net but swaps the kernel: charts and screenshots carry glyphs
        // the SR model rewrites (#1382 / #1399).
        let srcPath = mediaSrc;
        if (scene.media.upscale !== false) {
          const strategy = scene.media.upscale === "resample" ? "resample" : undefined;
          const upscaleResult = autoUpscaleIfNeeded(
            mediaSrc,
            undefined,
            strategy ? { strategy } : {},
          );
          if (upscaleResult.upscaled) {
            const how = upscaleResult.strategy === "resample" ? "resample" : "720p";
            console.log(`  📈 Upscaled: ${basename(upscaleResult.path)} → ${how}`);
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

  // ── 2d. Evidence source audio (#1560) ──
  // An evidence video with a real track and `volume: 0` is a contradiction the
  // renderer used to honour silently. The default is materialised into the
  // props here — the artifact both the renderer and the gates can read — rather
  // than inside MediaBackground, which never learns the scene's mediaRole.
  let evidenceAudioScenes = 0;
  for (const [index, scene] of sanitizedScenes.entries()) {
    const resolved = applyEvidenceAudioDefaults(scene);
    if (resolved !== scene) {
      sanitizedScenes[index] = resolved;
      evidenceAudioScenes += 1;
    }
  }
  if (evidenceAudioScenes > 0) {
    console.log(`  🔊 Evidence source audio resolved for ${evidenceAudioScenes} scene(s)`);
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
  const fps = 30;

  // ── 3b. Incremental plan ──
  // Everything below this line is a pure decision made from inputs that already
  // exist on disk. The cache lookup only reads manifests; a plan that cannot
  // prove every reused frame is byte-identical falls back to a full render.
  const composition = computeCompositionFingerprint({ remotionDir: REMOTION_DIR });
  const audioSha256 = {};
  audioPaths.forEach((path, index) => {
    const id = scenes[index]?.id ?? index + 1;
    audioSha256[id] = sha256File(path.replace("file://", ""));
  });
  const mediaSha256 = {};
  for (const scene of sanitizedScenes) {
    mediaSha256[scene.id] = sceneMediaSha256(scene, publicAssetsDir);
  }
  const sceneFingerprints = buildSceneFingerprints({
    scenes: sanitizedScenes,
    durations,
    audioSha256,
    mediaSha256,
  });
  const forceFull = process.env.SHORT_VIDEO_FORCE_FULL_RENDER === "1";
  const base = forceFull
    ? null
    : findIncrementalBase({
        outputDir,
        compositionFingerprint: composition.fingerprint,
        fps,
        excludeVersion: version,
      });
  const plan = planIncrementalRender({
    previous: forceFull ? null : (base?.manifest.incremental ?? null),
    props,
    sceneFingerprints,
    compositionFingerprint: composition.fingerprint,
    fps,
  });
  const mode = forceFull ? "full" : plan.mode;
  if (forceFull) plan.reason = "SHORT_VIDEO_FORCE_FULL_RENDER=1";

  if (mode === "full") {
    console.log(`  🎬 Full render (${plan.reason ?? "cold cache"}): ${totalFrames} frames`);
  } else if (mode === "noop") {
    console.log(`  ♻️ Inputs unchanged — 0 frames rasterized, re-finalize only`);
  } else {
    console.log(
      `  ♻️ Incremental: reuse ${plan.stats.reusedFrames}/${totalFrames} frames, ` +
        `render ${plan.stats.dirtyFrames} across scene(s) ${plan.stats.dirtyScenes.join(", ")}`,
    );
  }

  const incrementalRecord = {
    schema: INCREMENTAL_SCHEMA,
    mode,
    reason: plan.reason ?? null,
    fallbackReason: mode === "full" ? (plan.reason ?? null) : null,
    compositionFingerprint: composition.fingerprint,
    fps,
    totalFrames: plan.totalFrames,
    scenes: plan.timeline.map((entry, index) => ({
      ...entry,
      fingerprint: sceneFingerprints[index]?.fingerprint ?? null,
      audioSha256: audioSha256[entry.sceneId] ?? null,
      mediaSha256: mediaSha256[entry.sceneId] ?? null,
    })),
    segments: [],
    baseManifest: base?.manifestPath ?? null,
  };

  // ── 4. Render via CLI ──
  const filePrefix = subject && subject !== pipelineId ? `${subject}-${pipelineId}` : pipelineId;
  const versionSuffix = version ? `-v${version}` : "";
  const finalPath = join(outputDir, `${filePrefix}${versionSuffix}-short.mp4`);
  const rawPath = join(outputDir, `${filePrefix}${versionSuffix}-raw.mp4`);

  // Props go to disk, not into the command line: one line per render used to
  // carry 8KB of JSON, and a failure kept only 200 characters of it (see
  // render-manifest.mjs for the layout and why).
  const artifactDir = renderArtifactDir(outputDir, version);
  const manifestPath = manifestPathFor(artifactDir);
  const renderArgs = buildRemotionRenderArgs({
    rawPath,
    propsPath: propsPathFor(artifactDir),
  });

  // The finalize decisions are recorded, not recomputed by whoever replays
  // this render later: the recorded file is the contract.
  const hasSubs = Boolean(subtitlesPath && existsSync(subtitlesPath));
  const finalize = {
    assPath: hasSubs ? subtitlesPath : null,
    bgmPath: bgmPath || null,
    deleteRawAfter: !hasSubs,
    sceneDurations: scenes.map((s, i) => ({
      sceneId: s.id ?? i + 1,
      duration: durations[i],
    })),
    audioBasenames: audioPaths.map((p) => basename(p.replace("file://", ""))),
  };

  writeRenderArtifacts({
    outputDir,
    version,
    props,
    pipelineId,
    contentDir,
    audioDir: join(outputDir, "audio"),
    rawPath: mode === "full" ? rawPath : null,
    finalPath,
    subtitlesPath,
    bgmPath,
    subject,
    command: renderArgs,
    finalize,
    incremental: forceFull ? null : incrementalRecord,
  });
  const commandLine = formatRenderCommand(renderArgs);
  console.log(`  📄 Render artifacts: ${manifestPath}`);

  const segments = [];
  if (mode === "full") {
    try {
      // argv array, no shell: the props path is the only path that reaches
      // here, and quoting is no longer load-bearing for correctness.
      execFileSync(renderArgs[0], renderArgs.slice(1), {
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
      throw new Error(describeRenderFailure({ detail, commandLine, manifestPath }));
    }
    console.log(`  ✅ Remotion render complete: ${rawPath}`);
  } else if (mode === "noop") {
    // Nothing to rasterize: the previous manifest's segments are this run's
    // segments, byte for byte.
    segments.push(
      ...plan.segments.map((segment) => ({
        path: segment.path,
        startFrame: segment.startFrame,
        endFrame: segment.endFrame,
        generation: segment.generation ?? 0,
        timelineStartFrame: segment.timelineStartFrame,
        timelineEndFrame: segment.timelineEndFrame,
      })),
    );
  } else if (mode === "incremental") {
    const partsDir = join(artifactDir, "parts");
    mkdirSync(partsDir, { recursive: true });
    const baseGeneration = Math.max(
      0,
      ...(base?.manifest.incremental.segments ?? []).map((segment) => segment.generation ?? 0),
    );
    let partIndex = 0;

    for (const segment of plan.segments) {
      if (segment.kind === "reuse") {
        segments.push({
          path: segment.path,
          startFrame: segment.startFrame,
          endFrame: segment.endFrame,
          generation: segment.generation ?? 0,
          timelineStartFrame: segment.timelineStartFrame,
          timelineEndFrame: segment.timelineEndFrame,
        });
        continue;
      }

      const frames = segment.timelineEndFrame - segment.timelineStartFrame;
      const partAbs = join(partsDir, `part-${String(partIndex).padStart(3, "0")}.mp4`);
      partIndex += 1;
      const partArgs = [
        ...buildRemotionRenderArgs({ rawPath: partAbs, propsPath: propsPathFor(artifactDir) }),
        // Remotion's range is inclusive; our segment ends are exclusive.
        `--frames=${segment.timelineStartFrame}-${segment.timelineEndFrame - 1}`,
      ];
      try {
        execFileSync(partArgs[0], partArgs.slice(1), {
          cwd: REMOTION_DIR,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e) {
        const stderr = e.stderr?.toString() ?? "";
        const fitError = [...stderr.matchAll(/\[TextFitError\] (\{.*\})/g)].pop()?.[1];
        const detail = fitError ?? stderr.slice(-800);
        throw new Error(
          describeRenderFailure({
            detail,
            commandLine: formatRenderCommand(partArgs),
            manifestPath,
          }),
        );
      }
      segments.push({
        path: relative(outputDir, partAbs),
        startFrame: 0,
        endFrame: frames,
        generation: baseGeneration + 1,
        timelineStartFrame: segment.timelineStartFrame,
        timelineEndFrame: segment.timelineEndFrame,
      });
      console.log(
        `  🎞️  Rendered frames ${segment.timelineStartFrame}–${segment.timelineEndFrame - 1} → ${basename(partAbs)}`,
      );
    }
  }

  // ── 5. Finalize in a single ffmpeg pass (#198) ──
  // The former chain ran up to 4 sequential passes over the same mp4
  // (burnSubtitles → mixBgm → normalizeLoudness → realignAudioToTimeline),
  // costing 2-3 full re-encodes plus 3 generations of AAC loss per render.
  // finalizeRenderedVideo folds subs + BGM + loudnorm + the #176 head trim
  // into one -filter_complex pass; the head drift is measured on the RAW
  // output (audio decode only — post-processing preserves timestamps) so the
  // trim rides in the single encode instead of costing its own re-encode.
  const finalizeSegments =
    mode === "full"
      ? null
      : segments.map((segment) => ({
          path: isAbsolute(segment.path) ? segment.path : join(outputDir, segment.path),
          startFrame: segment.startFrame,
          endFrame: segment.endFrame,
        }));

  finalizeRenderedVideo({
    videoPath: mode === "full" ? rawPath : null,
    segments: finalizeSegments,
    fps,
    assPath: finalize.assPath,
    bgmPath: finalize.bgmPath,
    outputPath: finalPath,
    realign: {
      outputDir, // scene audio for measurement lives here
      sceneDurations: finalize.sceneDurations,
      audioPaths: audioPaths.map((p) => p.replace("file://", "")),
    },
  });

  // Keep the raw output when subtitles were burned: main.mjs's verification
  // repair path rebuilds the shipped file from it with a corrected ASS.
  // (Without subtitles there is no repair that needs a base.)
  try {
    if (finalize.deleteRawAfter && existsSync(rawPath)) unlinkSync(rawPath);
  } catch {}

  // Record the segments this run produced, then prune caches beyond the last
  // two versions. A forced full render deliberately writes no cache.
  const recordedSegments =
    mode === "full"
      ? existsSync(rawPath)
        ? [
            {
              path: relative(outputDir, rawPath),
              startFrame: 0,
              endFrame: totalFrames,
              generation: 0,
            },
          ]
        : []
      : segments;
  if (!forceFull) {
    incrementalRecord.segments = recordedSegments;
    updateRenderManifest(manifestPath, {
      // Keep the path even after the raw file is pruned: replay re-renders the
      // raw from props, and the manifest must still describe what it rendered.
      rawPath: mode === "full" ? rawPath : null,
      incremental: incrementalRecord,
    });
    const pruned = pruneRenderCache({ outputDir, keep: 2, keepVersion: version });
    if (pruned.removed.length > 0) {
      console.log(`  🧹 Pruned ${pruned.removed.length} stale render artifact(s)`);
    }
  }

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

  const repairSegments = recordedSegments.map((segment) => ({
    path: isAbsolute(segment.path) ? segment.path : join(outputDir, segment.path),
    startFrame: segment.startFrame,
    endFrame: segment.endFrame,
  }));

  return { path: finalPath, duration: finalDuration, mode, segments: repairSegments };
}
