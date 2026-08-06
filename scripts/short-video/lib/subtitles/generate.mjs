/**
 * Subtitle generation entry point: alignment data → burned-in-ready .ass file.
 *
 * Used by both the full pipeline (main.mjs) and the TTS-free re-render
 * (render-only.mjs) so a rendered video always carries the same subtitles the
 * verifier will check.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildCues } from "./cues.mjs";
import { renderAss } from "./ass.mjs";

/**
 * @param {Array} timingData - contents of subtitle-timing.json
 * @param {Array<{sceneId: number, duration: number}>} sceneDurations
 * @param {string} outputPath - .ass file to write
 * @returns {{assPath: string, cues: Array}}
 */
export function generateSubtitles(timingData, sceneDurations, outputPath) {
  const cues = buildCues(timingData, sceneDurations);
  writeFileSync(outputPath, renderAss(cues), "utf8");
  return { assPath: outputPath, cues };
}

/**
 * Regenerate subtitles from the alignment data already on disk
 * (audio/subtitle-timing.json), refreshing audio/scene-durations.json.
 * Shared by main.mjs (after TTS) and render-only.mjs (no TTS) so both entry
 * points produce — and verify — the exact same subtitles.
 *
 * @param {object} options
 * @param {string} options.outputDir
 * @param {Array<{sceneId: number, duration: number}>} options.sceneDurations
 * @returns {{assPath: string, timingData: Array, cues: Array} | null}
 *   null when no alignment data exists
 */
export function regenerateSubtitles({ outputDir, sceneDurations }) {
  const audioDir = join(outputDir, "audio");
  const timingPath = join(audioDir, "subtitle-timing.json");
  if (!existsSync(timingPath)) return null;

  writeFileSync(join(audioDir, "scene-durations.json"), JSON.stringify(sceneDurations, null, 2));
  const timingData = JSON.parse(readFileSync(timingPath, "utf8"));
  const assPath = join(outputDir, "subtitles.ass");
  const { cues } = generateSubtitles(timingData, sceneDurations, assPath);
  return { assPath, timingData, cues };
}
