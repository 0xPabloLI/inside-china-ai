/**
 * Upscale — Real-ESRGAN super-resolution integration.
 *
 * Automatically upscales sub-720p video/image assets to 720p using
 * Real-ESRGAN ncnn-vulkan (Metal/Vulkan, no PyTorch needed).
 *
 * Standalone module: import autoUpscaleIfNeeded() from asset-sourcer or
 * any pipeline script.
 *
 * @module upscale
 */

import { existsSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { execSync } from "child_process";
import { homedir } from "os";

// ─── Constants ───

/** Real-ESRGAN binary path. */
export const REALESRGAN_PATH = join(homedir(), ".local", "realesrgan", "realesrgan-ncnn-vulkan");

/** Real-ESRGAN models directory. */
export const REALESRGAN_MODELS_DIR = join(homedir(), ".local", "realesrgan", "models");

/** ffprobe binary path (ffmpeg-full). */
export const FFPROBE_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";

/** ffmpeg binary path (ffmpeg-full). */
export const FFMPEG_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";

/** Supported video extensions. */
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv"]);

/** Supported image extensions. */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Default target short side (720p). */
const DEFAULT_TARGET_SHORT_SIDE = 720;

// ─── Pure functions ───

/**
 * Check if a file is a supported video format.
 *
 * @param {string} filePath - File path
 * @returns {boolean}
 */
export function isVideoFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a supported image format.
 *
 * @param {string} filePath - File path
 * @returns {boolean}
 */
export function isImageFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a supported format (video or image).
 *
 * @param {string} filePath - File path
 * @returns {boolean}
 */
export function isSupportedFile(filePath) {
  return isVideoFile(filePath) || isImageFile(filePath);
}

/**
 * Get the resolution of a media file using ffprobe.
 *
 * @param {string} filePath - Path to video/image file
 * @returns {{ width: number, height: number, needsUpscale: boolean, isVideo: boolean }}
 */
export function checkResolution(filePath) {
  // File doesn't exist
  if (!existsSync(filePath)) {
    return { width: 0, height: 0, needsUpscale: false, isVideo: false };
  }

  // Unsupported format
  if (!isSupportedFile(filePath)) {
    return { width: 0, height: 0, needsUpscale: false, isVideo: false };
  }

  const isVideo = isVideoFile(filePath);

  // Use ffprobe to get resolution
  let output;
  try {
    output = execSync(
      `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`,
      { encoding: "utf8", timeout: 10000 },
    ).trim();
  } catch {
    console.warn(`  ⚠️  ffprobe failed for ${basename(filePath)}`);
    return { width: 0, height: 0, needsUpscale: false, isVideo };
  }

  // Parse "WIDTHxHEIGHT" format (e.g., "480x854")
  // Also handle "width=480\nheight=854" format
  let width = 0;
  let height = 0;

  const match = output.match(/(\d+)x(\d+)/);
  if (match) {
    width = parseInt(match[1], 10);
    height = parseInt(match[2], 10);
  } else {
    // Try "width=NNN\nheight=NNN" format
    const wMatch = output.match(/width=(\d+)/);
    const hMatch = output.match(/height=(\d+)/);
    if (wMatch) width = parseInt(wMatch[1], 10);
    if (hMatch) height = parseInt(hMatch[1], 10);
  }

  if (width === 0 || height === 0) {
    console.warn(`  ⚠️  Could not parse resolution for ${basename(filePath)}`);
    return { width: 0, height: 0, needsUpscale: false, isVideo };
  }

  const shortSide = Math.min(width, height);
  const needsUpscale = shortSide < DEFAULT_TARGET_SHORT_SIDE;

  return { width, height, needsUpscale, isVideo };
}

/**
 * Build the output path for an upscaled file.
 *
 * @param {string} inputPath - Original file path
 * @returns {string} Path with -upscaled suffix
 */
export function buildUpscaledPath(inputPath) {
  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);
  return join(dir, `${base}-upscaled${ext}`);
}

// ─── Upscale functions ───

/**
 * Upscale a video using Real-ESRGAN + ffmpeg.
 *
 * Uses realesr-animevideov3 model (fast, video-optimized).
 * 2x upscale then ffmpeg scale to target resolution.
 *
 * @param {string} inputPath - Input video path
 * @param {string} outputPath - Output video path
 * @param {number} [targetShortSide=720] - Target short side resolution
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
export function upscaleVideo(inputPath, outputPath, targetShortSide = DEFAULT_TARGET_SHORT_SIDE) {
  if (!existsSync(REALESRGAN_PATH)) {
    return { success: false, error: "Real-ESRGAN binary not found" };
  }

  // Step 1: Real-ESRGAN 2x upscale
  const tmpOutput = outputPath.replace(extname(outputPath), "-tmp" + extname(outputPath));
  const cmd = [
    `"${REALESRGAN_PATH}"`,
    `-i "${inputPath}"`,
    `-o "${tmpOutput}"`,
    `-n realesr-animevideov3`,
    `-s 2`,
    `-t 256`,
    `-m "${REALESRGAN_MODELS_DIR}"`,
  ].join(" ");

  try {
    execSync(cmd, { encoding: "utf8", timeout: 300000, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    return { success: false, error: e.message?.substring(0, 200) || "Real-ESRGAN failed" };
  }

  // Step 2: ffmpeg scale to target resolution + preserve audio from original input
  // Real-ESRGAN output has no audio — map video from tmp, audio from original
  const ffScaleCmd = [
    `"${FFMPEG_PATH}"`,
    `-i "${tmpOutput}"`,
    `-i "${inputPath}"`,
    `-map 0:v -map 1:a?`,
    `-c:a copy`,
    `-vf "scale='if(gt(iw,ih),-1,${targetShortSide})':'if(gt(iw,ih),${targetShortSide},-1)'"`,
    `-y "${outputPath}"`,
  ].join(" ");

  try {
    execSync(ffScaleCmd, { encoding: "utf8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    // ffmpeg failed, but Real-ESRGAN output might be usable
    console.warn(`  ⚠️  ffmpeg scale failed, using Real-ESRGAN output directly`);
    // Try to use the tmp output as final
    return { success: true, path: tmpOutput };
  }

  return { success: true, path: outputPath };
}

/**
 * Upscale an image using Real-ESRGAN + ffmpeg.
 *
 * Uses realesrgan-x4plus model (quality, for images).
 * 2x upscale then ffmpeg scale to target resolution.
 *
 * @param {string} inputPath - Input image path
 * @param {string} outputPath - Output image path
 * @param {number} [targetShortSide=720] - Target short side resolution
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
export function upscaleImage(inputPath, outputPath, targetShortSide = DEFAULT_TARGET_SHORT_SIDE) {
  if (!existsSync(REALESRGAN_PATH)) {
    return { success: false, error: "Real-ESRGAN binary not found" };
  }

  // Step 1: Real-ESRGAN 2x upscale
  const tmpOutput = outputPath.replace(extname(outputPath), "-tmp" + extname(outputPath));
  const cmd = [
    `"${REALESRGAN_PATH}"`,
    `-i "${inputPath}"`,
    `-o "${tmpOutput}"`,
    `-n realesrgan-x4plus`,
    `-s 2`,
    `-t 256`,
    `-m "${REALESRGAN_MODELS_DIR}"`,
  ].join(" ");

  try {
    execSync(cmd, { encoding: "utf8", timeout: 300000, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    return { success: false, error: e.message?.substring(0, 200) || "Real-ESRGAN failed" };
  }

  // Step 2: ffmpeg scale to target resolution
  const ffScaleCmd = [
    `"${FFMPEG_PATH}"`,
    `-i "${tmpOutput}"`,
    `-vf "scale='if(gt(iw,ih),-1,${targetShortSide})':'if(gt(iw,ih),${targetShortSide},-1)'"`,
    `-y "${outputPath}"`,
  ].join(" ");

  try {
    execSync(ffScaleCmd, { encoding: "utf8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    console.warn(`  ⚠️  ffmpeg scale failed, using Real-ESRGAN output directly`);
    return { success: true, path: tmpOutput };
  }

  return { success: true, path: outputPath };
}

/**
 * Automatically upscale a media file if its resolution is below 720p.
 *
 * Checks resolution, upscales if needed, returns the path to use.
 * If the file is already 720p+ or unsupported, returns the original path.
 * If Real-ESRGAN is unavailable or fails, degrades gracefully.
 *
 * @param {string} filePath - Path to media file
 * @param {number} [targetShortSide=720] - Target short side resolution
 * @returns {{ upscaled: boolean, path: string, error?: string }}
 */
export function autoUpscaleIfNeeded(filePath, targetShortSide = DEFAULT_TARGET_SHORT_SIDE) {
  const res = checkResolution(filePath);

  // No upscale needed
  if (!res.needsUpscale) {
    return { upscaled: false, path: filePath };
  }

  // Build output path
  const outputPath = buildUpscaledPath(filePath);

  // Choose upscale function based on file type
  let result;
  if (res.isVideo) {
    result = upscaleVideo(filePath, outputPath, targetShortSide);
  } else {
    result = upscaleImage(filePath, outputPath, targetShortSide);
  }

  if (result.success) {
    return { upscaled: true, path: result.path };
  }

  // Upscale failed — degrade to original
  console.warn(`  ⚠️  Upscale failed: ${result.error}`);
  return { upscaled: false, path: filePath, error: result.error };
}
