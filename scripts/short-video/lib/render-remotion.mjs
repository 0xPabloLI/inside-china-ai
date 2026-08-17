/**
 * Remotion render orchestrator — called by main.mjs when a content directory
 * has a `remotion/` subdirectory (or when --remotion flag is used).
 *
 * Flow:
 *   1. Check remotion/node_modules exists → auto npm install if not
 *   2. Construct props JSON from scenes + audioPaths + durations
 *   3. Call `npx remotion render` via child process
 *   4. Post-process: burnSubtitles → mixBgm → normalizeLoudness
 *   5. Return { path, duration }
 *
 * The Remotion project lives at scripts/short-video/remotion/.
 * The CLI renders to an intermediate MP4, then FFmpeg post-processes it.
 */

import { execSync, execFileSync } from "child_process";
import {
  existsSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { burnSubtitles, mixBgm, normalizeLoudness } from "./post-process.mjs";
import { sceneClipFrames } from "./timeline.mjs";
import { autoUpscaleIfNeeded } from "./upscale.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the Remotion project root. */
const REMOTION_DIR = join(__dirname, "..", "remotion");

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
      let mediaSrc = join(contentDir || ".", scene.media.path);
      if (existsSync(mediaSrc)) {
        // Auto-upscale sub-720p assets before copying (only for adopted assets)
        const upscaleResult = autoUpscaleIfNeeded(mediaSrc);
        if (upscaleResult.upscaled) {
          console.log(`  📈 Upscaled: ${basename(upscaleResult.path)} → 720p`);
          mediaSrc = upscaleResult.path;
        }
        const filename = basename(upscaleResult.path);
        const mediaDest = join(publicAssetsDir, filename);
        if (!existsSync(mediaDest)) {
          copyFileSync(mediaSrc, mediaDest);
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
    const stderr = e.stderr?.toString()?.substring(0, 500) ?? "";
    throw new Error(`Remotion render failed: ${e.message?.substring(0, 200)}\nstderr: ${stderr}`);
  }

  console.log(`  ✅ Remotion render complete: ${rawPath}`);

  // ── 5. Post-process ──
  let currentPath = rawPath;

  // Burn subtitles
  if (subtitlesPath && existsSync(subtitlesPath)) {
    const tempPath = rawPath.replace(".mp4", "-presubs.mp4");
    renameSync(currentPath, tempPath);
    burnSubtitles(tempPath, subtitlesPath, currentPath);
  }

  // Mix BGM
  if (bgmPath) {
    const tempPath = currentPath.replace(".mp4", "-prebgm.mp4");
    renameSync(currentPath, tempPath);
    mixBgm(tempPath, bgmPath, currentPath);
  }

  // Normalize loudness
  {
    const tempPath = currentPath.replace(".mp4", "-prenorm.mp4");
    renameSync(currentPath, tempPath);
    normalizeLoudness(tempPath, currentPath);
    try {
      unlinkSync(tempPath);
    } catch {}
  }

  // Rename raw → final if different
  if (currentPath !== finalPath) {
    renameSync(currentPath, finalPath);
  }

  // Clean up raw file if it still exists
  try {
    if (existsSync(rawPath) && rawPath !== finalPath) unlinkSync(rawPath);
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
