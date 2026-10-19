/**
 * Internal-pause trimming for TTS takes (#786, decision #279 方案 A).
 *
 * Effective speech rate = words / (voiced time + pause time). Professional
 * broadcasters speed up by editing pauses, not by speaking syllables faster
 * (Castro 2010: 19.8 pauses/min at 327 ms, 11% of airtime; CBC 1937-1987:
 * pauses shortened while syllable rate stayed constant). This pipeline used to
 * leave every pause intact on the production engine (`useSilenceFilter:false`)
 * — three real packs measured 154-161 WPM with 10.5-13.7% of the voiced time
 * spent in pauses (`docs/research/speech-density-pacing-2026-10.md`).
 *
 * The decision was to cap INTERNAL pauses at a 250 ms floor and keep the head
 * and tail silence untouched (they carry the scene transition). ffmpeg's
 * `silenceremove` cannot express that: `stop_periods=-1` also trims the
 * trailing silence, and a positive `stop_periods` only trims the tail. So this
 * module measures the silences first (`silencedetect`), plans which slices to
 * drop, and expresses the plan as an `aselect` range mask — leaving head/tail
 * samples bit-identical and cutting every internal pause to exactly the floor.
 *
 * Calibration is shared with the research so numbers stay comparable:
 * `noise=-35dB`, `d=0.15` (a 150 ms silence is measured but never trimmed,
 * because it already sits under the 250 ms floor).
 */

import { execFile } from "child_process";
import { promisify } from "util";
// Measurement-only pass: PATH-resolved ffmpeg, never ffmpeg-full (one policy,
// see ffmpeg-cmd.mjs).
import { ffmpegMeasureCmd, getDuration } from "./ffmpeg-cmd.mjs";

const execFileAsync = promisify(execFile);

/** Internal pauses are capped at this length (#279 HITL, 方案 A). */
export const DEFAULT_SILENCE_FLOOR_MS = 250;

/**
 * Silence detection threshold / minimum length.
 *
 * The threshold matches the research calibration (-35 dB). The minimum length
 * is 100 ms, NOT the 150 ms used to *count* pauses in the research: a pause in
 * a real take often ends with a short sub-threshold stretch that the word's
 * onset ramps out of, and at `d=0.15` that tail is invisible — so the planner
 * capped the pause to 250 ms only for the detector to re-measure 328 ms once
 * the tail became contiguous with the cut (embodied-ai scene 2). Measuring from
 * 100 ms makes the tail visible so `PAUSE_MERGE_GAP_SEC` can absorb it.
 */
const SILENCE_THRESHOLD_DB = -35;
const SILENCE_MIN_DURATION_SEC = 0.1;

/**
 * `aselect` keeps or drops whole audio frames, so the cut granularity is the
 * DECODER frame size, not 1024 samples. Measured on the production WAV takes:
 * ffmpeg 8 decodes them as 4096-sample frames (~93 ms at 44.1 kHz), which put
 * the surviving pause at 271 ms — over the 250 ms floor — for a cut planned at
 * 225 ms (see the sweep in `docs/research/speech-density-pacing-2026-10.md`).
 *
 * `TRIM_FRAME_SAMPLES` re-slices the stream into 256-sample frames (~5.8 ms)
 * before `aselect` so the planned cut lands where we asked; with it the same
 * take measures 230 ms. The 25 ms guard then only has to absorb the residual
 * frame rounding plus the detector's own resolution, and the resulting pause
 * stays safely under the floor.
 */
export const TRIM_FRAME_SAMPLES = 256;
export const FRAME_QUANTIZATION_GUARD_SEC = 0.025;

/** Head/tail tolerance: silences that touch a boundary are never trimmed. */
const BOUNDARY_EPSILON_SEC = 0.01;

/**
 * Two sub-threshold stretches separated by less than this belong to the SAME
 * pause. `silencedetect` splits a pause whenever the level ticks back over the
 * threshold for an instant, and because `d=0.15` hides sub-150 ms stretches the
 * tail of a split pause is invisible to a naive planner — real takes showed a
 * 1-sample split (embodied-ai scene 2: 409 ms + 106 ms) and a 36 ms one
 * (silent-update scene 3). Trimming only the first half left 328 ms / 262 ms of
 * quiet, over the cap.
 *
 * 100 ms is below the shortest spoken word and above a plosive closure, so a
 * merged gap carries no speech — only a noise tick or a click.
 */
const PAUSE_MERGE_GAP_SEC = 0.1;

/**
 * Allowed measurement slack when verifying the result, so a 250 ms pause that
 * re-measures at 250.4 ms is not reported as a violation.
 */
const FLOOR_VERIFY_TOLERANCE_MS = 10;

/**
 * Parse `silencedetect` output into intervals.
 *
 * An interval with no matching `silence_end` runs to the end of the file
 * (ffmpeg omits the closing line for trailing silence).
 *
 * @param {string} stderr - ffmpeg stderr carrying silencedetect logs
 * @param {number} [duration] - media duration, used to close an open interval
 * @returns {Array<{start: number, end: number}>}
 */
export function parseSilenceDetect(stderr, duration = Number.POSITIVE_INFINITY) {
  const intervals = [];
  let open = null;
  const re = /silence_(start|end):\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(String(stderr ?? ""))) !== null) {
    const value = Number(m[2]);
    if (!Number.isFinite(value)) continue;
    if (m[1] === "start") {
      open = value;
    } else if (open !== null) {
      intervals.push({ start: open, end: value });
      open = null;
    }
  }
  if (open !== null) intervals.push({ start: open, end: duration });
  return intervals.filter((iv) => Number.isFinite(iv.end) && iv.end > iv.start);
}

/**
 * Merge sub-threshold stretches that are separated by only a tick.
 *
 * @param {Array<{start: number, end: number}>} silences
 * @param {number} [gapSec] - largest gap still considered one pause
 * @returns {Array<{start: number, end: number}>} merged regions, sorted
 */
export function mergeSilences(silences, gapSec = PAUSE_MERGE_GAP_SEC) {
  const sorted = (silences ?? [])
    .map((iv) => ({ start: Math.max(0, Number(iv?.start)), end: Number(iv?.end) }))
    .filter((iv) => Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start - last.end <= gapSec) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

/**
 * Plan the trim: keep head/tail silence, cap internal pauses at the floor.
 *
 * Pauses are merged first (`mergeSilences`) so a pause that the detector split
 * into two stretches is cut as one — otherwise the surviving tail of the split
 * keeps the pause over the cap.
 *
 * @param {Object} opts
 * @param {Array<{start: number, end: number}>} opts.silences - detected intervals
 * @param {number} opts.duration - total media duration
 * @param {number} [opts.floorMs] - pause cap in milliseconds
 * @returns {{keep: Array<{start: number, end: number}>, drops: Array<{start: number, end: number, pauseMs: number, removedMs: number}>, removedSec: number}}
 *   `keep` is null when nothing needs trimming (callers then skip the filter).
 */
export function planSilenceTrim({ silences, duration, floorMs = DEFAULT_SILENCE_FLOOR_MS }) {
  const floorSec = Math.max(0, Number(floorMs) || 0) / 1000;
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) {
    return { keep: null, drops: [], removedSec: 0 };
  }

  const drops = [];
  for (const region of mergeSilences(silences)) {
    const start = Math.max(0, region.start);
    const end = Math.min(total, region.end);
    if (end <= start) continue;
    // Head/tail silence carries the scene transition — never trimmed.
    const touchesHead = start <= BOUNDARY_EPSILON_SEC;
    const touchesTail = end >= total - BOUNDARY_EPSILON_SEC;
    if (touchesHead || touchesTail) continue;
    // A pause already at or under the cap needs no cut. The comparison is
    // against the floor itself, NOT floor + guard: a 268 ms pause measured on
    // a real take is over the cap and must be trimmed (the guard only decides
    // where to place the cut, it is not extra allowance).
    if (end - start <= floorSec) continue;
    const cutFrom = start + Math.max(0, floorSec - FRAME_QUANTIZATION_GUARD_SEC);
    if (cutFrom >= end) continue;
    drops.push({ start: cutFrom, end, pauseMs: Math.round((end - start) * 1000) });
  }

  if (drops.length === 0) return { keep: null, drops: [], removedSec: 0 };

  drops.sort((a, b) => a.start - b.start);
  const keep = [];
  let cursor = 0;
  for (const d of drops) {
    if (d.start > cursor) keep.push({ start: cursor, end: d.start });
    cursor = Math.max(cursor, d.end);
  }
  if (cursor < total) keep.push({ start: cursor, end: total });

  const removedSec = drops.reduce((sum, d) => sum + (d.end - d.start), 0);
  return { keep, drops, removedSec };
}

/**
 * ffmpeg filter expressions that realise a trim plan.
 *
 * Returns an empty array when there is nothing to trim (the caller then emits
 * the cleanup chain only). The chain is:
 *   1. `asetnsamples` — re-slice to `TRIM_FRAME_SAMPLES` so `aselect` can cut
 *      at ~6 ms granularity instead of the decoder's ~93 ms WAV frames.
 *   2. `aselect` — keep everything outside the planned drop ranges.
 *   3. `asetpts=N/SR/TB` — re-stamp the surviving samples so downstream
 *      filters (rubberband / atempo) see a continuous timeline.
 *
 * @param {Array<{start: number, end: number}>|null} drops - ranges to cut
 * @returns {string[]}
 */
export function buildTrimFilters(drops) {
  if (!Array.isArray(drops) || drops.length === 0) return [];
  const expr = drops.map((d) => `between(t,${d.start.toFixed(4)},${d.end.toFixed(4)})`).join("+");
  return [`asetnsamples=n=${TRIM_FRAME_SAMPLES}:p=0`, `aselect='not(${expr})'`, "asetpts=N/SR/TB"];
}

/**
 * Re-measure a trimmed take and report any internal pause still over the cap.
 *
 * The plan is arithmetic; whether the encode actually delivered it is an
 * empirical question (frame rounding, detector splitting, a pause the first
 * pass did not see). #786's acceptance criterion is about the delivered pause,
 * so the pipeline observes it instead of asserting it.
 *
 * @param {Object} opts
 * @param {Array<{start: number, end: number}>} opts.silences - measured AFTER trimming
 * @param {number} opts.duration
 * @param {number} [opts.floorMs]
 * @param {number} [opts.toleranceMs]
 * @returns {{violations: Array<{start: number, end: number, ms: number}>, maxMs: number, checked: number}}
 */
export function verifySilenceFloor({
  silences,
  duration,
  floorMs = DEFAULT_SILENCE_FLOOR_MS,
  toleranceMs = FLOOR_VERIFY_TOLERANCE_MS,
}) {
  const limit = (Number(floorMs) || 0) + (Number(toleranceMs) || 0);
  const total = Number(duration);
  const violations = [];
  let maxMs = 0;
  let checked = 0;
  if (!Number.isFinite(total) || total <= 0) return { violations, maxMs, checked };
  for (const region of mergeSilences(silences)) {
    // Head/tail silence is intentionally kept long — not a violation.
    if (region.start <= BOUNDARY_EPSILON_SEC) continue;
    if (region.end >= total - BOUNDARY_EPSILON_SEC) continue;
    const ms = (Math.min(total, region.end) - region.start) * 1000;
    checked += 1;
    maxMs = Math.max(maxMs, ms);
    if (ms > limit) violations.push({ ...region, ms: Math.round(ms) });
  }
  return { violations, maxMs: Math.round(maxMs), checked };
}

/**
 * Measure a file's silences and total duration.
 *
 * Errors propagate: a take we cannot measure must not be silently shipped
 * with whatever pauses it happens to have (#786 — the whole point of the
 * ticket is that the untrimmed path was invisible).
 *
 * @param {string} audioPath
 * @param {Object} [opts]
 * @param {number} [opts.thresholdDb]
 * @param {number} [opts.minDurationSec]
 * @returns {Promise<{duration: number, silences: Array<{start: number, end: number}>}>}
 */
export async function probeSilences(
  audioPath,
  { thresholdDb = SILENCE_THRESHOLD_DB, minDurationSec = SILENCE_MIN_DURATION_SEC } = {},
) {
  const duration = await getDuration(audioPath);
  // silencedetect writes to stderr; ffmpeg exits non-zero only on a real
  // decode failure, which we want to surface.
  const { stderr } = await execFileAsync(ffmpegMeasureCmd, [
    "-hide_banner",
    "-nostats",
    "-i",
    audioPath,
    "-af",
    `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
    "-f",
    "null",
    "-",
  ]);
  return { duration, silences: parseSilenceDetect(stderr, duration) };
}
