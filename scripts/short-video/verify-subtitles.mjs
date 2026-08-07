#!/usr/bin/env node
/**
 * Verify rendered subtitles against alignment data — CLI wrapper.
 *
 * Delegates to lib/verify-subtitles.mjs for all logic.
 *
 * Usage:
 *   node verify-subtitles.mjs <video.mp4> <subtitles.ass> <subtitle-timing.json> <scene-durations.json> [output-dir]
 *
 * The optional output-dir enables the end-to-end audio sync check, which
 * measures each scene's voiceover against the shipped video's audio track.
 *
 * Exit code: 0 = pass, 1 = errors found or bad usage
 */

import { readFileSync } from "fs";
import { verifySubtitles } from "./lib/verify-subtitles.mjs";

const [videoPath, assPath, timingPath, durationsPath, outputDir = null] = process.argv.slice(2);

if (!videoPath || !assPath || !timingPath || !durationsPath) {
  console.error(
    "Usage: node verify-subtitles.mjs <video.mp4> <subtitles.ass> <subtitle-timing.json> <scene-durations.json> [output-dir]",
  );
  process.exit(1);
}

const report = verifySubtitles({
  videoPath,
  assPath,
  timingData: JSON.parse(readFileSync(timingPath, "utf8")),
  sceneDurations: JSON.parse(readFileSync(durationsPath, "utf8")),
  outputDir,
});

process.exit(report.summary.passed ? 0 : 1);
