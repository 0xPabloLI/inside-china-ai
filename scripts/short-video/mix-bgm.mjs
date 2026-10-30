#!/usr/bin/env node
/**
 * Standalone BGM Mixer — burns background music into an existing video.
 *
 * This is the ALTERNATE path, not the default one. The default (user decision
 * 2026-10-25) is to attach the bed on the platform inside
 * `tiktok-upload-prep.mjs` — same run as the AIGC label and the publish — so
 * the pipeline never stops to ask about music. Reach for this script only when
 * the user names a different track, or when a local mix is needed for a
 * non-TikTok surface (it also backs `render-only.mjs --bgm`).
 *
 * Usage:
 *   node scripts/short-video/mix-bgm.mjs --video <path> [--bgm-file <path>] [--pipeline-id <id>]
 *
 * If --bgm-file is omitted, auto-selects from the BGM pool using --pipeline-id.
 * Output: <video-path> with BGM mixed in (original saved as -nobgm.mp4)
 *
 * Mix settings: 0.1s fade-in (instant start), 12% volume, auto-loop, 3s fade-out.
 *
 * The `volume` below (≈ −18.4 dB gain on the bed, shared with
 * finalizeRenderedVideo) is a DIFFERENT scale from the platform slider's dB
 * reading. It is now calibrated on the rendered artifact: the mix check at the
 * end of this script and `verify-video.mjs` measure the bed-vs-narration ratio
 * directly (docs/research/music-under-voice-calibration-2026-10.md §6 —
 * volume=0.12 measured 13.7 dB below narration, PASS at the loud edge; the
 * retune question is tracked in #1043).
 */

import { execFileSync } from "child_process";
import { existsSync, renameSync, unlinkSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { selectBGM } from "./lib/bgm.mjs";
import {
  detectSilenceWindows,
  evaluateBgmMargin,
  measureBgmMargin,
  writeBgmMixMarker,
} from "./lib/audio/bgm-margin.mjs";
import { getDurationSync } from "./lib/tts/ffmpeg-cmd.mjs";
import { DEFAULT_BGM_VOLUME } from "./lib/post-process.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Bed gain on the local path — shared with the finalizeRenderedVideo path. */
const BGM_VOLUME = DEFAULT_BGM_VOLUME;

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const videoPath = getArg("video");
if (!videoPath) {
  console.error("❌ --video flag is required");
  console.error(
    "   Example: node mix-bgm.mjs --video output/kimi-sandbox/xxx-short.mp4 --pipeline-id kimi-sandbox",
  );
  process.exit(1);
}

const bgmFileOverride = getArg("bgm-file");
const pipelineId = getArg("pipeline-id") || "default";

const absVideoPath = resolve(videoPath);
if (!existsSync(absVideoPath)) {
  console.error(`❌ Video not found: ${absVideoPath}`);
  process.exit(1);
}

// ── Select BGM ──
console.log("🎵 Selecting BGM...\n");
const bgmPath = selectBGM(pipelineId, bgmFileOverride);
if (!bgmPath) {
  console.error("❌ No BGM file available");
  process.exit(1);
}
console.log(`  🎵 BGM: ${bgmPath.split("/").pop()}\n`);

// ── Get video duration ──
// argv-safe shared probe (#319 OCR video batch scan): the path is data, not a
// shell command. Failure falls back to the historical 180s default.
let videoDuration = 180;
try {
  const probed = getDurationSync(absVideoPath);
  if (Number.isFinite(probed) && probed > 0) videoDuration = probed;
} catch {}

console.log(`  📹 Video: ${videoDuration.toFixed(1)}s`);

// ── Mix BGM ──
const noBgmPath = absVideoPath.replace(".mp4", "-nobgm.mp4");
renameSync(absVideoPath, noBgmPath);

const bgmFadeOutStart = Math.max(videoDuration - 3, 1).toFixed(2);
const filterComplex = `[1:a]afade=t=in:st=0:d=0.1,afade=t=out:st=${bgmFadeOutStart}:d=3,volume=${BGM_VOLUME}[bgm];[0:a]volume=1.0[tts];[tts][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`;

console.log(
  `  🔧 Mixing BGM (instant start, ${Math.round(BGM_VOLUME * 100)}% volume, auto-looped)...`,
);

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    noBgmPath,
    "-stream_loop",
    "-1",
    "-i",
    bgmPath,
    "-filter_complex",
    filterComplex,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    absVideoPath,
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);

console.log(`  ✅ BGM mixed in → ${absVideoPath.split("/").pop()}`);

writeBgmMixMarker(absVideoPath, { bgmPath, volume: BGM_VOLUME });

// ── Measure the mix against the artifact, not the constant ──
// The voice-only file renamed above is the reference: its gaps say exactly
// where only the bed can be. This is the check the −20 dB default lacked.
let marginVerdict = { status: "unknown", reasons: [] };
try {
  const windows = detectSilenceWindows(noBgmPath, { duration: videoDuration });
  const measurement = measureBgmMargin({ videoPath: absVideoPath, windows });
  marginVerdict = evaluateBgmMargin(measurement, { expectBed: true });
  if (measurement.ok) {
    console.log(
      `  🎚  Music ${measurement.marginDb.toFixed(1)} dB below narration ` +
        `(speech ${measurement.speechRmsDb.toFixed(1)} dBFS / bed ${measurement.bgmOnlyRmsDb.toFixed(1)} dBFS ` +
        `over ${measurement.pauseWindows} pauses)`,
    );
  }
  for (const reason of marginVerdict.reasons) {
    console.log(
      `  ${marginVerdict.status === "pass" ? "✅" : marginVerdict.status === "warn" ? "⚠️ " : "❌"} ${reason}`,
    );
  }
} catch (err) {
  console.log(`  ⚠️  BGM margin not measured: ${err.message}`);
}

// Clean up — but keep the voice-only reference when the mix is out of band,
// so the fix is a re-mix of this file rather than a re-mix of a mixed file.
if (marginVerdict.status === "fail") {
  console.error(`\n❌ Mix is out of band — voice-only reference kept: ${noBgmPath}`);
  process.exit(1);
}
try {
  unlinkSync(noBgmPath);
} catch {}

console.log("\n✅ Done!");
