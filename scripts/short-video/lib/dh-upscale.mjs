/**
 * DH upscale — post-processing super-resolution wrapper for digital-human
 * model outputs (#194).
 *
 * Digital-human models emit low-resolution talking-head video (SoulX-FlashHead
 * 512×512, EchoMimicV3 624×816); the publish pipeline needs 720p+ / 1024²+.
 * This wrapper reuses the Real-ESRGAN ncnn-vulkan binary and shared constants
 * from upscale.mjs but deliberately does NOT reuse its B-roll decision logic:
 *
 *   - upscale.mjs clamps the short side to 720 — for a 512² frame upscaled 2×
 *     to 1024² that would shrink the result back to 720². The digital-human
 *     default keeps the native upscaled resolution; pass `shortSide` to clamp.
 *   - upscale.mjs hardcodes scale 2 and the model per media type; here the
 *     scale, tile size and model are options (defaults by media type:
 *     realesr-animevideov3 for video, realesrgan-x4plus for images).
 *   - upscale.mjs (B-roll path) is intentionally left untouched (#194 triage).
 *
 * Standalone module: import upscaleDigitalHuman() from the future digital-human
 * pipeline's post-processing step, or run directly:
 *
 *   node scripts/short-video/lib/dh-upscale.mjs <input.mp4> [output.mp4] \
 *       [--scale 2|3|4] [--short-side N] [--model NAME] [--tile N]
 *
 * @module dh-upscale
 */

import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import {
  FFMPEG_PATH,
  FFPROBE_PATH,
  REALESRGAN_MODELS_DIR,
  REALESRGAN_PATH,
  buildUpscaledPath,
  checkResolution,
} from "./upscale.mjs";

// ─── Pure functions ───

/**
 * Resolve the Real-ESRGAN invocation plan from options and media type.
 *
 * @param {object} options
 * @param {boolean} options.isVideo - Whether the input is a video
 * @param {number} [options.scale] - Upscale ratio (2, 3 or 4; default 2)
 * @param {string} [options.model] - Model name (default: by media type)
 * @param {number} [options.tile] - Tile size passed as -t (default 256)
 * @param {number|null} [options.shortSide] - Clamp the output short side;
 *   null keeps the native upscaled resolution (default)
 * @returns {{ mode: "video"|"image", model: string, scale: number, tile: number, targetShortSide: number|null }}
 */
export function resolveUpscalePlan({
  isVideo,
  scale = 2,
  model,
  tile = 256,
  shortSide = null,
} = {}) {
  if (!Number.isInteger(scale) || scale < 2 || scale > 4) {
    throw new Error(`Invalid scale ${scale}: realesrgan-ncnn-vulkan supports 2, 3 or 4`);
  }
  if (!Number.isInteger(tile) || tile < 32) {
    throw new Error(`Invalid tile ${tile}: must be an integer >= 32`);
  }
  return {
    mode: isVideo ? "video" : "image",
    model: model ?? (isVideo ? "realesr-animevideov3" : "realesrgan-x4plus"),
    scale,
    tile,
    targetShortSide: shortSide,
  };
}

// ─── Upscale functions ───

/**
 * Run the Real-ESRGAN binary over a directory of PNG frames.
 *
 * @param {string} framesDir - Input frame directory
 * @param {string} upscaledDir - Output frame directory
 * @param {{ model: string, scale: number, tile: number }} plan - From resolveUpscalePlan
 * @returns {{ status: number, stderr: string, stdout: string }}
 */
function runRealesrgan(framesDir, upscaledDir, plan) {
  return spawnSync(
    REALESRGAN_PATH,
    [
      "-i",
      framesDir,
      "-o",
      upscaledDir,
      "-n",
      plan.model,
      "-s",
      String(plan.scale),
      "-t",
      String(plan.tile),
      "-m",
      REALESRGAN_MODELS_DIR,
      "-f",
      "png",
    ],
    { encoding: "utf8", timeout: 600000 },
  );
}

/**
 * Upscale a digital-human VIDEO with Real-ESRGAN, preserving framerate and
 * audio. Same 3-step frame pipeline as upscale.mjs's upscaleVideo (Real-ESRGAN
 * ncnn-vulkan cannot read mp4), but parameterized per resolveUpscalePlan and
 * keeping the native upscaled resolution unless shortSide is given.
 *
 * Audio sync is guaranteed because frame count is preserved, the framerate is
 * set explicitly, and the audio stream is copied from the original file.
 *
 * @param {string} inputPath - Digital-human model output (mp4/mov/...)
 * @param {string} outputPath - Output video path
 * @param {object} [options] - See resolveUpscalePlan
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
export function upscaleDigitalHumanVideo(inputPath, outputPath, options = {}) {
  if (!existsSync(REALESRGAN_PATH)) {
    return { success: false, error: "Real-ESRGAN binary not found" };
  }

  let plan;
  try {
    plan = resolveUpscalePlan({ isVideo: true, ...options });
  } catch (e) {
    return { success: false, error: e.message };
  }

  // Step 0: original framerate (for A/V sync)
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

  const tmpBase = join(tmpdir(), `dh-upscale-${Date.now()}`);
  const framesDir = join(tmpBase, "frames");
  const upscaledDir = join(tmpBase, "upscaled");
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(upscaledDir, { recursive: true });

  try {
    // Step 1: extract frames as PNG
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

    // Step 2: Real-ESRGAN batch upscale the frame directory
    const realesrganResult = runRealesrgan(framesDir, upscaledDir, plan);
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

    // Step 3: reassemble at the original framerate, copying the original audio
    const args = [
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
    ];
    if (plan.targetShortSide !== null) {
      args.push(
        "-vf",
        `scale='if(gt(iw,ih),-1,${plan.targetShortSide})':'if(gt(iw,ih),${plan.targetShortSide},-1)'`,
      );
    }
    args.push("-c:v", "libx264", "-preset", "fast", "-crf", "23", "-y", outputPath);

    const reassembleResult = spawnSync(FFMPEG_PATH, args, { encoding: "utf8", timeout: 300000 });
    if (reassembleResult.status !== 0) {
      return {
        success: false,
        error: `Reassembly failed: ${(reassembleResult.stderr || "").substring(0, 200)}`,
      };
    }

    return { success: true, path: outputPath };
  } finally {
    try {
      rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Upscale a digital-human IMAGE (e.g. a reference portrait) with Real-ESRGAN,
 * parameterized per resolveUpscalePlan (upscale.mjs's upscaleImage hardcodes
 * model/scale/tile and a 720 short side).
 *
 * @param {string} inputPath - Image path
 * @param {string} outputPath - Output image path
 * @param {object} [options] - See resolveUpscalePlan
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
export function upscaleDigitalHumanImage(inputPath, outputPath, options = {}) {
  if (!existsSync(REALESRGAN_PATH)) {
    return { success: false, error: "Real-ESRGAN binary not found" };
  }

  let plan;
  try {
    plan = resolveUpscalePlan({ isVideo: false, ...options });
  } catch (e) {
    return { success: false, error: e.message };
  }

  const realesrganResult = spawnSync(
    REALESRGAN_PATH,
    [
      "-i",
      inputPath,
      "-o",
      outputPath,
      "-n",
      plan.model,
      "-s",
      String(plan.scale),
      "-t",
      String(plan.tile),
      "-m",
      REALESRGAN_MODELS_DIR,
    ],
    { encoding: "utf8", timeout: 300000 },
  );
  if (realesrganResult.status !== 0) {
    return {
      success: false,
      error: (realesrganResult.stderr || realesrganResult.stdout || "Real-ESRGAN failed").substring(
        0,
        200,
      ),
    };
  }
  return { success: true, path: outputPath };
}

/**
 * Upscale a digital-human output (video or image) per resolveUpscalePlan.
 *
 * @param {string} inputPath - Digital-human model output
 * @param {string} [outputPath] - Defaults to input with -upscaled suffix
 * @param {object} [options] - See resolveUpscalePlan
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
export function upscaleDigitalHuman(inputPath, outputPath, options = {}) {
  if (!existsSync(inputPath)) {
    return { success: false, error: `Input not found: ${inputPath}` };
  }
  const out = outputPath ?? buildUpscaledPath(inputPath);
  const res = checkResolution(inputPath);
  if (res.width === 0) {
    return { success: false, error: `Could not read resolution of ${inputPath}` };
  }
  const plan = resolveUpscalePlan({ isVideo: res.isVideo, ...options });

  console.log(
    `  🎞️  dh-upscale: ${res.width}×${res.height} → ${plan.scale}× via ${plan.model}` +
      (plan.targetShortSide ? ` (short side → ${plan.targetShortSide})` : " (native size)"),
  );
  return res.isVideo
    ? upscaleDigitalHumanVideo(inputPath, out, options)
    : upscaleDigitalHumanImage(inputPath, out, options);
}

// ─── CLI ───

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scale") options.scale = Number(argv[++i]);
    else if (arg === "--short-side") options.shortSide = Number(argv[++i]);
    else if (arg === "--tile") options.tile = Number(argv[++i]);
    else if (arg === "--model") options.model = argv[++i];
    else positional.push(arg);
  }
  return { positional, options };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (positional.length < 1) {
    console.error(
      "Usage: node scripts/short-video/lib/dh-upscale.mjs <input.mp4> [output.mp4] " +
        "[--scale 2|3|4] [--short-side N] [--model NAME] [--tile N]",
    );
    process.exit(1);
  }
  const [input, output = buildUpscaledPath(input)] = positional;
  const result = upscaleDigitalHuman(input, output, options);
  if (!result.success) {
    console.error(`❌ dh-upscale failed: ${result.error}`);
    process.exit(1);
  }
  const after = checkResolution(output);
  console.log(`✅ dh-upscale: ${output} (${after.width}×${after.height})`);
}
