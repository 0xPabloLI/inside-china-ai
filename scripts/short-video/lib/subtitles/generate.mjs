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
import { alignmentCacheState, computeAlignmentSignature } from "../tts/cache.mjs";
import { assertDualTrackRestorable } from "./dual-track.mjs";

/** Reading-speed limit for the gate; override with SUBTITLE_MAX_CPS (17 = children). */
function subtitleMaxCps(env = process.env) {
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
 * @param {object} [options]
 * @param {Array} [options.scenes] - scene data; required unless the caller
 *   opts out, so no production path can skip the dual-track invariant (#753)
 * @param {boolean} [options.skipDualTrackCheck] - explicit opt-out for fixtures
 *   that model cues only (no dual track)
 * @returns {{assPath: string, cues: Array, compliance: object|null}}
 */
export function generateSubtitles(timingData, sceneDurations, outputPath, options = {}) {
  // Fail closed before anything reaches disk: a spoken word that restore could
  // not map would be burned into the video (#753). Missing `scenes` is a hard
  // error, not a silent pass — an optional guard is the same bug one layer up.
  if (options.skipDualTrackCheck !== true) {
    if (!Array.isArray(options.scenes)) {
      throw new Error(
        "generateSubtitles requires `scenes` to enforce the dual-track invariant (#753) — " +
          "pass the scene data, or { skipDualTrackCheck: true } in a fixture that does not " +
          "model the dual track.",
      );
    }
    assertDualTrackRestorable({ scenes: options.scenes, timingData });
  }
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
 * @param {Array} [options.scenes] - required unless `skipDualTrackCheck` (#753)
 * @param {boolean} [options.skipDualTrackCheck]
 * @returns {{assPath: string, timingData: (Array|object), cues: Array} | null}
 *   null when no alignment data exists
 */
export function regenerateSubtitles({ outputDir, sceneDurations, scenes, skipDualTrackCheck }) {
  const audioDir = join(outputDir, "audio");
  const timingPath = join(audioDir, "subtitle-timing.json");
  if (!existsSync(timingPath)) return null;

  writeFileSync(join(audioDir, "scene-durations.json"), JSON.stringify(sceneDurations, null, 2));
  const timingData = JSON.parse(readFileSync(timingPath, "utf8"));
  const assPath = join(outputDir, "subtitles.ass");
  const { cues } = generateSubtitles(timingData, sceneDurations, assPath, {
    scenes,
    skipDualTrackCheck,
  });
  return { assPath, timingData, cues };
}

/**
 * Does this run need burned-in subtitles?
 *
 * Same text source as `computeAlignmentSignature`: a scene carrying only the
 * spoken form (ttsText) still needs subtitles, so it must not be classified
 * as visual-only (#421 review). Shared by the render-boundary guard (#421)
 * and the Step 0.4 ASS burn preflight (#394) — one predicate, two consumers.
 *
 * @param {Array<{voiceover?: string, ttsText?: string}>} [scenes]
 * @returns {boolean}
 */
export function hasVoicedScenes(scenes) {
  return (scenes ?? []).some((s) => String(s?.ttsText ?? s?.voiceover ?? "").trim() !== "");
}

/**
 * Render-boundary guard (#421): a voiced run must not render without valid
 * subtitle timing.
 *
 * Every entry point calls this after its repair window (Gate 1 / realign) and
 * immediately before renderRemotion(). It fails closed when:
 *
 *  - the run has voiceover but `subtitle-timing.json` is missing (forced
 *    alignment never ran or produced nothing);
 *  - the timing file is unreadable/corrupt;
 *  - the alignment signature (scene text + audio bytes, #198) does not match
 *    the stored meta — stale timing, e.g. audio replaced without realigning;
 *  - the timing yields zero cues (nothing to burn in).
 *
 * Visual-only runs (no voiceover) are not applicable and return null.
 *
 * @param {object} options
 * @param {Array<{id: number, voiceover?: string, ttsText?: string}>} options.scenes
 * @param {Array<{sceneId: number, audioPath: string, duration: number}>} options.ttsResults
 * @param {string} options.outputDir - pipeline output dir (timing lives in <outputDir>/audio)
 * @returns {{timingData: (Array|object), cues: Array}|null} null when the run has no voiceover
 * @throws {Error} when the render boundary cannot be satisfied
 */
export function assertSubtitleTiming({ scenes, ttsResults, outputDir }) {
  if (!hasVoicedScenes(scenes)) return null;

  const audioDir = join(outputDir, "audio");
  const timingPath = join(audioDir, "subtitle-timing.json");
  if (!existsSync(timingPath)) {
    throw new Error(
      `subtitle-timing.json is missing under ${audioDir} but the run has voiceover — ` +
        `forced alignment never produced timing. Re-run the pipeline alignment step ` +
        `(main.mjs aligns after TTS; render-only cannot realign) before rendering (#421).`,
    );
  }

  let timingData;
  try {
    timingData = JSON.parse(readFileSync(timingPath, "utf8"));
  } catch (err) {
    throw new Error(
      `subtitle-timing.json is unreadable/corrupt (${err.message}) — ` +
        `re-run forced alignment before rendering (#421).`,
    );
  }

  const signature = computeAlignmentSignature(scenes, ttsResults);
  const state = alignmentCacheState(audioDir, signature);
  if (state !== "valid") {
    throw new Error(
      `subtitle-timing.json is stale (${state}) — it does not match the current scene text ` +
        `and audio bytes. Re-run forced alignment before rendering (#421).`,
    );
  }

  const sceneDurations = (ttsResults ?? []).map((r) => ({
    sceneId: r.sceneId,
    duration: r.duration,
  }));
  let cues;
  try {
    cues = buildCues(timingData, sceneDurations);
  } catch (err) {
    throw new Error(
      `subtitle-timing.json failed to build cues (${err.message}) — ` +
        `re-run forced alignment before rendering (#421).`,
    );
  }
  if (cues.length === 0) {
    throw new Error(
      `subtitle-timing.json produced zero cues — nothing can be burned in. ` +
        `Re-run forced alignment before rendering (#421).`,
    );
  }

  return { timingData, cues };
}
