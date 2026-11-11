#!/usr/bin/env node
/**
 * Verify the hook's promise against its opening picture (#1206).
 *
 * Extracts the first frames of the rendered video, classifies each one (is it
 * footage, a text card, flat background or black?), and — with `--semantic` —
 * asks the VLM whether the opening picture depicts the hook's printed claim.
 *
 * This is the check `verify-video` / `verify-remotion-frames` deliberately do
 * not make: those judge layout (safe zones, contrast, media presence), never
 * "does frame 0 show what the copy says it shows". The 2026-10-25 cut shipped
 * `IT LIFTS A CAR.` over a night rescue segment and passed every one of them.
 *
 * DEFAULT IS WARN-ONLY, exit 0. A CSS-only hook is a legal choice, and the
 * semantic score is a model judgment. `--strict` promotes the two hard
 * findings (no footage at all; claim not depicted) to fails and exit 1.
 *
 * Usage:
 *   node scripts/short-video/verify-hook-payoff.mjs --content <dir>
 *     [--video <path>] [--strict] [--semantic] [--window-ms 4000] [--json]
 *
 *   --content     content pipeline id (required — e.g. unitree-h2x-guardian)
 *   --video       rendered mp4 (default: newest output/<pipelineId> render)
 *   --strict      exit 1 when a fail-level finding is reported
 *   --semantic    run the VLM claim check (slow; cached in output/<pipelineId>/.vlm-cache)
 *   --window-ms   semantic window inside the hook (default: hook scene length)
 *   --json        machine-readable report on stdout
 */

import { createReadStream, existsSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

import { resolveOutputVideo } from "./lib/assemble.mjs";
import { resolveSceneAudio } from "./lib/audio/sync.mjs";
import { getDurationSync } from "./lib/tts/ffmpeg-cmd.mjs";
import { extractFramesAtIndexes } from "./lib/frame-extract.mjs";
import { FPS, sceneClipDuration } from "./lib/timeline.mjs";
import {
  HOOK_SAMPLE_TIMES_SEC,
  analyzeHookFrame,
  buildHookClaim,
  evaluateHookPayoff,
  formatHookPayoffReport,
} from "./lib/hook-payoff.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const contentDir = getArg("content");
if (!contentDir) {
  console.error("❌ --content flag is required (e.g. --content unitree-h2x-guardian)");
  process.exit(1);
}
const strict = args.includes("--strict");
const semantic = args.includes("--semantic");
const asJson = args.includes("--json");

const SCENE_DATA_PATH = join(__dirname, "content", contentDir, "scene-data.mjs");
const META_PATH = join(__dirname, "content", contentDir, "meta.mjs");

let meta = null;
try {
  meta = (await import(`file://${META_PATH}`)).meta || null;
} catch {
  /* meta.mjs is optional here */
}
const pipelineId = meta?.pipelineId || contentDir.replace(/\//g, "-");
const OUTPUT_DIR = join(__dirname, "output", pipelineId);

const filePrefix =
  meta?.subject && meta.subject !== pipelineId ? `${meta.subject}-${pipelineId}` : pipelineId;
const videoPath = getArg("video") || resolveOutputVideo(OUTPUT_DIR, filePrefix);

if (!existsSync(videoPath)) {
  console.error(`❌ Video not found: ${videoPath}`);
  process.exit(1);
}

let scenes;
try {
  scenes = (await import(`file://${SCENE_DATA_PATH}`)).scenes || [];
} catch (error) {
  console.error(`❌ Failed to load scene-data: ${error.message}`);
  process.exit(1);
}

const hook = scenes[0] || null;
const claim = buildHookClaim(hook);

/**
 * Length of the hook scene in ms, from its own TTS take. Absent audio means the
 * pipeline has not run in this checkout (output/ is gitignored); fall back to a
 * 4s window, which is the hook's typical rendered length.
 */
function hookWindowMs() {
  const override = Number(getArg("window-ms"));
  if (Number.isFinite(override) && override > 0) return override;
  try {
    const audioPath = resolveSceneAudio(join(OUTPUT_DIR, "audio"), hook?.id);
    const tts = audioPath ? getDurationSync(audioPath) : 0;
    if (tts > 0) return Math.round(sceneClipDuration(tts) * 1000);
  } catch {
    /* fall through */
  }
  return 4000;
}

function readPng(filePath) {
  return new Promise((resolve, reject) => {
    const source = createReadStream(filePath);
    const png = new PNG();
    // `pipe()` does not forward source errors to the destination, so the read
    // stream needs its own listener — otherwise ENOENT/EACCES escapes as an
    // uncaught exception instead of skipping the frame.
    source.on("error", reject);
    png.on("parsed", function onParsed() {
      resolve({ data: this.data, width: this.width, height: this.height });
    });
    png.on("error", reject);
    source.pipe(png);
  });
}

const tempDir = join(OUTPUT_DIR, ".hook-payoff-frames");
const samples = [];
let semantics = null;

// The frames exist for this run only. Clear stale PNGs first (a killed run
// otherwise leaves frames that a later failed ffmpeg pass would reuse and
// report as this run's samples), and clean up on every exit path.
rmSync(tempDir, { recursive: true, force: true });
try {
  const frames = HOOK_SAMPLE_TIMES_SEC.map((t) => Math.round(t * FPS));
  const { byFrame } = await extractFramesAtIndexes({
    videoPath,
    frames,
    outDir: tempDir,
    nameFor: (f) => `hook-${f}.png`,
  });

  for (const t of HOOK_SAMPLE_TIMES_SEC) {
    const frame = Math.round(t * FPS);
    const framePath = byFrame.get(frame);
    if (!framePath) continue;
    try {
      const buf = await readPng(framePath);
      const analysis = analyzeHookFrame(buf);
      samples.push({ t, frame, kind: analysis.kind, metrics: analysis.metrics });
    } catch {
      /* an unreadable frame is reported as missing, not fabricated */
    }
  }

  if (semantic) {
    const { analyzeAssetSemantics, closeVisualAnalyzer, getVlmModelId } =
      await import("./lib/visual-analyzer.mjs");
    const { wrapAnalyzerWithCache } = await import("./lib/vlm-cache.mjs");
    const analyze = wrapAnalyzerWithCache(analyzeAssetSemantics, {
      cacheDir: join(OUTPUT_DIR, ".vlm-cache"),
      model: getVlmModelId(),
      disabled: process.env.VLM_CACHE_DISABLED === "1",
    });
    // The analyzer forwards the Python child's stderr through console.debug,
    // which Node writes to stdout — that would corrupt `--json`. Keep stdout
    // parseable; non-JSON runs still show the diagnostics.
    const debugLog = console.debug;
    if (asJson) console.debug = () => {};
    try {
      semantics = await analyze(videoPath, {
        startMs: 0,
        endMs: hookWindowMs(),
        sampleFps: 2,
        hookCheck: { promise: claim.promise },
      });
    } catch {
      // A missing VLM must not hide the pixel verdict — report it unavailable.
      semantics = { payoff: null, payoffReason: null };
    } finally {
      console.debug = debugLog;
      await closeVisualAnalyzer();
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const result = evaluateHookPayoff({ samples, claim, semantics, strict });
const report = {
  content: contentDir,
  video: videoPath,
  windowMs: semantic ? hookWindowMs() : null,
  ...result,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n🎯 Hook Payoff Check — ${contentDir}`);
  console.log("─".repeat(50));
  console.log(`  Video: ${videoPath}`);
  for (const sample of samples) {
    const m = sample.metrics;
    console.log(
      `  frame ${sample.frame} (${sample.t}s): ${sample.kind} · ink ${(m.inkCoverage * 100).toFixed(1)}% · bright ${(m.brightRatio * 100).toFixed(1)}%`,
    );
  }
  if (samples.length < HOOK_SAMPLE_TIMES_SEC.length) {
    console.log(`  ⚠️  ${HOOK_SAMPLE_TIMES_SEC.length - samples.length} sampled frame(s) missing`);
  }
  console.log();
  console.log(formatHookPayoffReport(result));
}

process.exit(strict && result.level === "fail" ? 1 : 0);
