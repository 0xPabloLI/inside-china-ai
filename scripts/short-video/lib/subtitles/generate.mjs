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
import { checkCueCompliance, formatComplianceReport } from "./compliance.mjs";

/** Reading-speed limit for the gate; override with SUBTITLE_MAX_CPS (17 = children). */
export function subtitleMaxCps(env = process.env) {
  const raw = Number(env.SUBTITLE_MAX_CPS);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/**
 * Gate mode for the compliance check. `warn` (default) reports but renders;
 * `fail` blocks the render; `off` disables the check. Reading speed is the
 * advisory dimension here — the cues are karaoke (six words, word-by-word
 * highlight) so a strict 20 CPS cut would chop sentences mid-flight; keep
 * `fail` for content that must match the Netflix guide exactly.
 */
export function subtitleComplianceMode(env = process.env) {
  const raw = String(env.SUBTITLE_COMPLIANCE || "")
    .trim()
    .toLowerCase();
  return raw === "fail" || raw === "off" ? raw : "warn";
}

/**
 * Run the #415 ② compliance gate over built cues.
 *
 * @param {Array} cues
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {object|null} the report, or null when the gate is off
 */
export function enforceSubtitleCompliance(cues, env = process.env) {
  const mode = subtitleComplianceMode(env);
  if (mode === "off") return null;
  const report = checkCueCompliance(cues, { maxCps: subtitleMaxCps(env) });
  if (report.ok) return report;
  const detail = formatComplianceReport(report);
  if (mode === "fail") {
    throw new Error(`Subtitle compliance gate failed\n${detail}`);
  }
  console.warn(`  ⚠️ ${detail}`);
  return report;
}

/**
 * @param {Array|object} timingData - contents of subtitle-timing.json (old array or new {scenes:[]} format)
 * @param {Array<{sceneId: number, duration: number}>} sceneDurations
 * @param {string} outputPath - .ass file to write
 * @returns {{assPath: string, cues: Array, compliance: object|null}}
 */
export function generateSubtitles(timingData, sceneDurations, outputPath) {
  const cues = buildCues(timingData, sceneDurations);
  const compliance = enforceSubtitleCompliance(cues);
  writeFileSync(outputPath, renderAss(cues), "utf8");
  return { assPath: outputPath, cues, compliance };
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
 * @returns {{assPath: string, timingData: (Array|object), cues: Array} | null}
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
