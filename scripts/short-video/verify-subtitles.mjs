#!/usr/bin/env node
/**
 * Verify subtitle coverage and sync — CLI wrapper.
 *
 * Delegates to lib/verify-subtitles.mjs for all logic.
 *
 * Usage:
 *   node verify-subtitles.mjs <video.mp4> <subtitle-timing.json> [scene-durations.json]
 *
 * Exit code: 0 = pass, 1 = issues found or error
 */

import { readFileSync } from "fs";
import { verifySubtitles } from "./lib/verify-subtitles.mjs";

const videoPath = process.argv[2];
const timingPath = process.argv[3];
const durationsPath = process.argv[4] || null;

if (!videoPath || !timingPath) {
  console.error(
    "Usage: node verify-subtitles.mjs <video.mp4> <subtitle-timing.json> [scene-durations.json]",
  );
  process.exit(1);
}

// Load subtitle timing data
const timingData = JSON.parse(readFileSync(timingPath, "utf8"));

// Load scene durations if provided
let sceneDurations = [];
if (durationsPath) {
  sceneDurations = JSON.parse(readFileSync(durationsPath, "utf8"));
}

// Run verification (no outputDir for CLI — no JSON file written)
const report = verifySubtitles(videoPath, timingData, sceneDurations, null);

process.exit(report.summary.passed ? 0 : 1);
