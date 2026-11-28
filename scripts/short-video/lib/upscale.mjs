/**
 * Upscale — two strategies for sub-720p media.
 *
 * 1. `sr` (default) — Real-ESRGAN ncnn-vulkan (Metal/Vulkan, no PyTorch).
 *    Photo-oriented: it invents detail, and with `-t 256` tiling it drops
 *    tiles. Correct for camera footage, wrong for line art (#1382).
 * 2. `resample` — ffmpeg scale with a deterministic kernel (Lanczos default).
 *    Never invents pixels, never drops tiles. This is the right tool whenever
 *    the asset must keep its glyphs (charts, screenshots, UI captures).
 *
 * Standalone module: import autoUpscaleIfNeeded() / resampleImage() from
 * asset-sourcer or any pipeline script. CLI:
 *
 *   node scripts/short-video/lib/upscale.mjs --resample in.png [out.png] \
 *        [--short-side 1024] [--filter lanczos]
 *
 * @module upscale
 */

import { existsSync, mkdirSync, realpathSync, rmSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { homedir, tmpdir } from "os";
import { FFMPEG_BIN, FFPROBE_BIN } from "./ffmpeg-bins.mjs";

// ─── Constants ───

/** Real-ESRGAN binary path. */
export const REALESRGAN_PATH = join(homedir(), ".local", "realesrgan", "realesrgan-ncnn-vulkan");

/** Real-ESRGAN models directory. */
export const REALESRGAN_MODELS_DIR = join(homedir(), ".local", "realesrgan", "models");

/**
 * ffprobe binary path — ffmpeg-full when installed, else PATH (#1118).
 * Decode/probe only: the ASS burn keeps its own libass-bound binary.
 */
export const FFPROBE_PATH = FFPROBE_BIN;

/**
 * ffmpeg binary path — ffmpeg-full when installed, else PATH (#1118).
 * Decode/probe only: the ASS burn keeps its own libass-bound binary.
 */
export const FFMPEG_PATH = FFMPEG_BIN;

/** Supported video extensions. */
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv"]);

/** Supported image extensions. */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Default target short side (720p). */
export const DEFAULT_TARGET_SHORT_SIDE = 720;

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

  // Use ffprobe to get resolution. The path is a catalog-controlled string, so
  // it goes through argv (execFile) and never through a shell line (#1003).
  let output;
  try {
    output = execFileSync(
      FFPROBE_PATH,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        filePath,
      ],
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

/**
 * Build the output path for a resampled file.
 *
 * A distinct suffix on purpose: `-upscaled` means "went through the SR model",
 * `-resampled` means "scaled with an interpolation kernel". Telling them apart
 * matters when debugging a corrupted asset — the two fail in different ways.
 *
 * @param {string} inputPath - Original file path
 * @returns {string} Path with -resampled suffix
 */
export function buildResampledPath(inputPath) {
  const ext = extname(inputPath);
  // Plain string surgery, not `path.join`: the only operation is "insert a
  // fixed suffix before the extension", which cannot traverse anywhere
  // (`extname`/`basename` never carry a separator out). `path.join` on the
  // same expression is a Semgrep taint sink, and that rule — taint mode —
  // ignores `// nosemgrep` (see path-safety.mjs); dropping the sink beats
  // hiding the finding.
  const stem = inputPath.slice(0, inputPath.length - ext.length);
  return `${stem}-resampled${ext}`;
}

/** Interpolation kernels accepted by resampleImage (ffmpeg `scale` flags). */
export const RESAMPLE_FILTERS = new Set(["lanczos", "bicubic", "bilinear"]);

/** Strategies `autoUpscaleIfNeeded` accepts — the photo path and the deterministic one. */
export const UPSCALE_STRATEGIES = new Set(["sr", "resample"]);

/**
 * Upscale an image with a deterministic interpolation kernel.
 *
 * Why this exists: Real-ESRGAN is a photo SR model. On line-art charts it
 * rewrites glyphs and — with `-t 256` tiling — silently drops tiles (2026-11-16
 * zhipu run: a good 800×600 fetch came back with the title's middle and the
 * mid-run candles blank; reproduced 100% locally). A resample kernel cannot do
 * either: same pixels in, a bigger grid out, no invented content.
 *
 * What it does NOT do, stated so nobody re-litigates it: it adds no detail. If
 * an asset genuinely needs more detail than the source carries, that is a
 * re-fetch at a higher resolution — not a bigger interpolation.
 *
 * @param {string} inputPath - Image path (png/jpg/webp)
 * @param {Object} [options]
 * @param {number} [options.targetShortSide=720] - Target short side in px
 * @param {string} [options.filter="lanczos"] - One of RESAMPLE_FILTERS
 * @param {string} [options.outputPath] - Defaults to buildResampledPath()
 * @returns {{ success: boolean, path?: string, from?: {width:number,height:number},
 *   to?: {width:number,height:number}, scale?: number, error?: string }}
 */
export function resampleImage(
  inputPath,
  { targetShortSide = DEFAULT_TARGET_SHORT_SIDE, filter = "lanczos", outputPath } = {},
) {
  if (!RESAMPLE_FILTERS.has(filter)) {
    return { success: false, error: `unsupported resample filter: ${filter}` };
  }

  const res = checkResolution(inputPath);
  if (!res.width || !res.height) {
    return { success: false, error: `cannot probe resolution of ${basename(inputPath)}` };
  }
  if (res.isVideo) {
    return { success: false, error: "resampleImage handles images only — use upscaleVideo" };
  }

  const shortSide = Math.min(res.width, res.height);
  if (shortSide >= targetShortSide) {
    return {
      success: false,
      error: `already ${shortSide}px on the short side (target ${targetShortSide})`,
    };
  }

  const scale = targetShortSide / shortSide;
  // Even dimensions: odd sizes make the contain-band fit land on half pixels and
  // break yuv encoders downstream.
  const width = Math.round((res.width * scale) / 2) * 2;
  const height = Math.round((res.height * scale) / 2) * 2;
  const outPath = outputPath ?? buildResampledPath(inputPath);

  // argv, never a shell line: the path is package-controlled but the rule is
  // absolute (#1003).
  const args = ["-v", "error", "-i", inputPath, "-vf", `scale=${width}:${height}:flags=${filter}`];
  // PNG keeps alpha; jpeg has no alpha channel and rejects rgba outright.
  if (extname(outPath).toLowerCase() === ".png") args.push("-pix_fmt", "rgba");
  args.push("-frames:v", "1", "-y", outPath);

  try {
    execFileSync(FFMPEG_PATH, args, {
      encoding: "utf8",
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    return { success: false, error: e.message?.substring(0, 200) || "ffmpeg resample failed" };
  }

  if (!existsSync(outPath)) {
    return { success: false, error: `ffmpeg reported success but wrote no ${basename(outPath)}` };
  }

  return {
    success: true,
    path: outPath,
    from: { width: res.width, height: res.height },
    to: { width, height },
    scale,
  };
}

// ─── Upscale functions ───

/**
 * Upscale a video using Real-ESRGAN + ffmpeg.
 *
 * Real-ESRGAN ncnn-vulkan cannot process mp4 directly — it only handles images.
 * This function implements a 3-step pipeline:
 *
 *   Step 0: ffprobe to get original framerate (for sync)
 *   Step 1: ffmpeg extracts every frame as PNG into a temp directory
 *   Step 2: Real-ESRGAN batch-upscales the frame directory (realesr-animevideov3)
 *   Step 3: ffmpeg reassembles frames into mp4 at original framerate,
 *           mapping audio from the original file (-map 1:a? -c:a copy)
 *           and scaling to target resolution.
 *
 * Audio sync is guaranteed because:
 *   - Frame count is preserved (N frames in → N frames out)
 *   - Framerate is explicitly set with -framerate <fps>
 *   - Audio stream is copied directly from the original file
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

  // Step 0: Get original framerate via ffprobe
  let fps = "30/1"; // fallback
  try {
    const fpsResult = spawnSync(
      FFPROBE_PATH,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate",
        "-of",
        "csv=p=0",
        inputPath,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    const fpsOutput = (fpsResult.stdout || "").trim();
    if (fpsOutput) fps = fpsOutput;
  } catch {
    console.warn(`  ⚠️  Could not detect framerate, defaulting to 30fps`);
  }

  // Create temp directories for frame extraction and upscaled frames
  const tmpBase = join(tmpdir(), `upscale-${Date.now()}`);
  const framesDir = join(tmpBase, "frames");
  const upscaledDir = join(tmpBase, "upscaled");
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(upscaledDir, { recursive: true });

  try {
    // Step 1: Extract frames as PNG
    const extractResult = spawnSync(
      FFMPEG_PATH,
      ["-i", inputPath, "-f", "image2", "-vcodec", "png", join(framesDir, "%08d.png")],
      { encoding: "utf8", timeout: 300000 },
    );

    if (extractResult.status !== 0) {
      return {
        success: false,
        error: `Frame extraction failed: ${(extractResult.stderr || "").substring(0, 200)}`,
      };
    }

    // Step 2: Real-ESRGAN batch upscale the frames directory
    const realesrganResult = spawnSync(
      REALESRGAN_PATH,
      [
        "-i",
        framesDir,
        "-o",
        upscaledDir,
        "-n",
        "realesr-animevideov3",
        "-s",
        "2",
        "-t",
        "256",
        "-m",
        REALESRGAN_MODELS_DIR,
        "-f",
        "png",
      ],
      { encoding: "utf8", timeout: 600000 },
    );

    if (realesrganResult.status !== 0) {
      return {
        success: false,
        error: (
          realesrganResult.stderr ||
          realesrganResult.stdout ||
          "Real-ESRGAN failed"
        ).substring(0, 200),
      };
    }

    // Step 3: Reassemble frames into mp4 with original framerate + audio
    const vf = `scale='if(gt(iw,ih),-1,${targetShortSide})':'if(gt(iw,ih),${targetShortSide},-1)', fps=${fps}`;
    const reassembleResult = spawnSync(
      FFMPEG_PATH,
      [
        "-framerate",
        fps,
        "-i",
        join(upscaledDir, "%08d.png"),
        "-i",
        inputPath,
        "-map",
        "0:v",
        "-map",
        "1:a?",
        "-c:a",
        "copy",
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-y",
        outputPath,
      ],
      { encoding: "utf8", timeout: 300000 },
    );

    if (reassembleResult.status !== 0) {
      return {
        success: false,
        error: `Reassembly failed: ${(reassembleResult.stderr || "").substring(0, 200)}`,
      };
    }

    return { success: true, path: outputPath };
  } finally {
    // Clean up temp frame directories
    try {
      rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
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
  const realesrganArgs = [
    "-i",
    inputPath,
    "-o",
    tmpOutput,
    "-n",
    "realesrgan-x4plus",
    "-s",
    "2",
    "-t",
    "256",
    "-m",
    REALESRGAN_MODELS_DIR,
  ];

  try {
    // #1598: argv, not a shell line — the paths can carry `$()`, backticks or
    // quotes (catalog/source-derived), and execSync would read them as syntax.
    execFileSync(REALESRGAN_PATH, realesrganArgs, {
      encoding: "utf8",
      timeout: 300000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    return { success: false, error: e.message?.substring(0, 200) || "Real-ESRGAN failed" };
  }

  // Real-ESRGAN picks the output container from the INPUT's channel count, not
  // from the -o extension: an RGBA source is always written as PNG, so asking
  // for "-tmp.jpg" actually yields "-tmp.jpg.png". Resolve the file that was
  // really written instead of assuming the requested path exists — on
  // 2026-10-13 the media gate failed on a phantom path produced exactly here.
  const realTmpOutput = existsSync(tmpOutput) ? tmpOutput : `${tmpOutput}.png`;
  if (!existsSync(realTmpOutput)) {
    return {
      success: false,
      error: `Real-ESRGAN produced no output at ${basename(tmpOutput)} or ${basename(realTmpOutput)}`,
    };
  }

  // Step 2: ffmpeg scale to target resolution
  const scaleFilter = `scale='if(gt(iw,ih),-1,${targetShortSide})':'if(gt(iw,ih),${targetShortSide},-1)'`;
  const scaleArgs = ["-i", realTmpOutput, "-vf", scaleFilter, "-y", outputPath];

  try {
    execFileSync(FFMPEG_PATH, scaleArgs, {
      encoding: "utf8",
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    // Degrade to the Real-ESRGAN output, but only if it is really there: a
    // success carrying a path that does not exist propagates straight into the
    // media patch and fails the gate much later, far from the cause.
    if (!existsSync(realTmpOutput)) {
      return {
        success: false,
        error: `ffmpeg scale failed and ${basename(realTmpOutput)} is missing`,
      };
    }
    console.warn(`  ⚠️  ffmpeg scale failed, using Real-ESRGAN output directly`);
    return { success: true, path: realTmpOutput };
  }

  if (!existsSync(outputPath)) {
    return {
      success: false,
      error: `ffmpeg scale reported success but wrote no ${basename(outputPath)}`,
    };
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
 * @param {Object} [options]
 * @param {"sr"|"resample"} [options.strategy="sr"] - `resample` keeps glyphs
 *   (charts/screenshots) at the cost of inventing nothing; `sr` is the photo
 *   path. Videos always take `sr` — resample is single-frame.
 * @returns {{ upscaled: boolean, path: string, strategy?: string, error?: string }}
 */
export function autoUpscaleIfNeeded(
  filePath,
  targetShortSide = DEFAULT_TARGET_SHORT_SIDE,
  options = {},
) {
  // A typo must not degrade into the SR model. Both seams (`media-track.mjs`,
  // `render-remotion.mjs`) derive this from `scene.media.upscale`, so a closed
  // set here + the preflight check in media-field-schema.mjs means an unknown
  // strategy can only come from a code path, and that is a bug, not a fallback.
  if (options.strategy !== undefined && !UPSCALE_STRATEGIES.has(options.strategy)) {
    throw new Error(
      `autoUpscaleIfNeeded: unknown strategy ${JSON.stringify(options.strategy)} — expected "sr" or "resample"`,
    );
  }

  const res = checkResolution(filePath);

  // No upscale needed
  if (!res.needsUpscale) {
    return { upscaled: false, path: filePath };
  }

  // Deterministic path: an explicit opt-in per asset (`upscale: "resample"`).
  if (options.strategy === "resample" && !res.isVideo) {
    const resampled = resampleImage(filePath, { targetShortSide, filter: options.filter });
    if (resampled.success) {
      return { upscaled: true, path: resampled.path, strategy: "resample" };
    }
    // No silent fallback into the SR model: the caller asked for glyph fidelity,
    // and Real-ESRGAN is exactly what destroys it.
    console.warn(`  ⚠️  Resample failed: ${resampled.error}`);
    return { upscaled: false, path: filePath, error: resampled.error };
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
    return { upscaled: true, path: result.path, strategy: "sr" };
  }

  // Upscale failed — degrade to original
  console.warn(`  ⚠️  Upscale failed: ${result.error}`);
  return { upscaled: false, path: filePath, error: result.error };
}

// ─── CLI ───

/**
 * Ad-hoc resample entry point — for one-off assets that are not part of a
 * content package (a screenshot for a post, a supplier image, etc.).
 *
 *   node scripts/short-video/lib/upscale.mjs --resample in.png [out.png] \
 *        [--short-side 1024] [--filter lanczos]
 *
 * @returns {number} process exit code
 */
function main(argv) {
  const args = argv.slice(2);
  const resampleAt = args.indexOf("--resample");
  if (resampleAt === -1) {
    console.error(
      "usage: node upscale.mjs --resample <input> [output] [--short-side N] [--filter lanczos|bicubic|bilinear]",
    );
    return 2;
  }

  const flagValue = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  };
  const input = args[resampleAt + 1];
  if (!input || input.startsWith("--")) {
    console.error("--resample needs an input path");
    return 2;
  }
  // Positional output = first bare argument after the input that is not a flag
  // and not a flag's value.
  const flagValues = new Set([flagValue("--short-side", null), flagValue("--filter", null)]);
  const output = args
    .slice(resampleAt + 2)
    .find(
      (a, i, all) => !a.startsWith("--") && !flagValues.has(a) && !all[i - 1]?.startsWith("--"),
    );

  const result = resampleImage(input, {
    targetShortSide: Number(flagValue("--short-side", DEFAULT_TARGET_SHORT_SIDE)),
    filter: flagValue("--filter", "lanczos"),
    ...(output ? { outputPath: output } : {}),
  });

  if (!result.success) {
    console.error(`✗ ${result.error}`);
    return 1;
  }
  console.log(
    `✓ ${basename(result.path)} — ${result.from.width}×${result.from.height} → ` +
      `${result.to.width}×${result.to.height} (${result.scale.toFixed(2)}×, resample)`,
  );
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv));
}
