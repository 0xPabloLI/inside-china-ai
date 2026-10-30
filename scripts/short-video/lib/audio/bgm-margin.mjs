/**
 * Music-under-voice margin — artifact-level check for the BGM mix (#950).
 *
 * Measures two levels on the SHIPPED audio track: RMS inside speech windows,
 * and RMS inside the gaps between speech, where only the bed can be. Their
 * difference is "how far the music sits below the narration" — the quantity
 * the platform slider does NOT equal (2026-10-25 publish: slider −20 dB read
 * as −22.2 dB measured). Whole-mix LUFS cannot see this: a bed 22 dB down and
 * one 35 dB down both pass the loudness gate.
 *
 * Windows come from two sources because the two paths know different things:
 *  - timing data (subtitle-timing.json + scene-durations.json) for any
 *    artifact, including a post downloaded from the platform;
 *  - silence detection on the voice-only render, for a just-mixed local file.
 *
 * Both feed the same RMS and verdict code. The verdict needs to know whether a
 * bed was expected; that comes from the `audio/bgm-mix.json` marker the mix
 * paths write next to the artifact, not from the numbers themselves (a bed 35
 * dB down and no bed at all are the same reading without it).
 */

import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { findScene, sceneTimeline } from "../timeline.mjs";
import { ffmpegMeasureCmd, getDurationSync } from "../tts/ffmpeg-cmd.mjs";
import { decodeToWavFile, readWavPcm } from "./wav.mjs";

/** Shortest gap that can hold a bed-only reading. */
const MIN_PAUSE_SECONDS = 0.15;
/**
 * Each pause window is pulled in by this much before it is measured: word
 * boundaries are alignment estimates, and the encoder smears transients a few
 * tens of ms into the gap.
 */
const PAUSE_INSET_SECONDS = 0.12;
/**
 * The local mix fades the bed in over 0.1s. 0.35 also covers decoder priming.
 * Applied to pause windows only — the voice itself is never faded.
 */
const HEAD_GUARD_SECONDS = 0.35;
/** The local mix fades the bed out over the final 3s; 3.2 clears the ramp. */
const TAIL_GUARD_SECONDS = 3.2;

/**
 * Pass band for "music below narration". Derivation and industry sources:
 * docs/research/music-under-voice-calibration-2026-10.md. The 2026-10-25 post
 * measured −22.2 dB and was heard as too light; the account's own history sits
 * at 17.5–21.5 dB of dynamic range.
 */
export const BGM_MARGIN_PASS_MIN_DB = 12;
export const BGM_MARGIN_PASS_MAX_DB = 26;
/** Outside the pass band but still plausible; outside this, the mix is wrong. */
export const BGM_MARGIN_WARN_MIN_DB = 10;
export const BGM_MARGIN_WARN_MAX_DB = 32;
/** A bed at or below this in its own windows is not a bed (incident: −35 dB). */
export const BGM_BED_FLOOR_DBFS = -50;
/** Pass requires headroom above the floor, not just survival. */
const BGM_BED_EDGE_DBFS = -48;
/** Digital silence is reported at this floor instead of -Infinity. */
const SILENCE_FLOOR_DBFS = -120;
/** Mono decode rate for RMS. Level estimation needs no more. */
const MEASURE_SAMPLE_RATE = 8000;
/** Fallback silence threshold for voice-only track analysis. */
const SILENCE_THRESHOLD_DB = -60;

function sumWindows(windows) {
  return (windows ?? []).reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
}

function normalizeTiming(timingData) {
  if (Array.isArray(timingData)) return timingData;
  if (timingData && Array.isArray(timingData.scenes)) return timingData.scenes;
  return [];
}

function clampGapToPauseWindow(gap, options) {
  const { headGuardSeconds, tailGuardSeconds, pauseInsetSeconds, minPauseSeconds, totalDuration } =
    options;
  const lower = Math.max(0, headGuardSeconds);
  const upper = Math.max(lower, totalDuration - tailGuardSeconds);
  const start = Math.max(gap[0], lower) + pauseInsetSeconds;
  const end = Math.min(gap[1], upper) - pauseInsetSeconds;
  return end - start >= minPauseSeconds ? [start, end] : null;
}

function pauseWindowsFromGaps(gaps, options) {
  const windows = [];
  for (const gap of gaps) {
    if (!Number.isFinite(gap[0]) || !Number.isFinite(gap[1]) || gap[1] <= gap[0]) continue;
    const window = clampGapToPauseWindow(gap, options);
    if (window) windows.push(window);
  }
  return windows;
}

function mergeWindows(windows) {
  const sorted = [...windows].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Derive speech and bed-only windows from alignment timing.
 *
 * Scene-local word/segment times are offset by `sceneTimeline()` — the same
 * frame-aligned offsets the renderer and subtitle generator use, so the
 * windows cannot drift from the artifact.
 *
 * @param {Array|{scenes: Array}} timingData - subtitle-timing.json (array or envelope)
 * @param {Array<{sceneId: number, duration: number}>} sceneDurations
 * @param {{fps?: number, minPauseSeconds?: number, pauseInsetSeconds?: number,
 *   headGuardSeconds?: number, tailGuardSeconds?: number}} [options]
 * @returns {{speech: Array<[number, number]>, pause: Array<[number, number]>,
 *   totalDuration: number, speechSeconds: number, pauseSeconds: number}}
 */
export function buildWindowsFromTiming(timingData, sceneDurations, options = {}) {
  const {
    fps,
    minPauseSeconds = MIN_PAUSE_SECONDS,
    pauseInsetSeconds = PAUSE_INSET_SECONDS,
    headGuardSeconds = HEAD_GUARD_SECONDS,
    tailGuardSeconds = TAIL_GUARD_SECONDS,
  } = options;
  const timeline = sceneTimeline(sceneDurations ?? [], fps ? { fps } : {});
  const totalDuration = timeline.length
    ? timeline[timeline.length - 1].offset + timeline[timeline.length - 1].clipDuration
    : 0;

  const rawSpeech = [];
  for (const scene of normalizeTiming(timingData)) {
    const entry = findScene(timeline, scene.sceneId);
    for (const segment of scene.segments ?? []) {
      const start = Number(segment.start);
      const end = Number(segment.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      rawSpeech.push([entry.offset + start, entry.offset + end]);
    }
  }
  const speech = mergeWindows(rawSpeech);

  const gaps = [];
  if (speech.length > 0) {
    gaps.push([0, speech[0][0]]);
    for (let i = 1; i < speech.length; i++) gaps.push([speech[i - 1][1], speech[i][0]]);
    gaps.push([speech[speech.length - 1][1], totalDuration]);
  }
  const pause = pauseWindowsFromGaps(gaps, {
    headGuardSeconds,
    tailGuardSeconds,
    pauseInsetSeconds,
    minPauseSeconds,
    totalDuration,
  });

  return {
    speech,
    pause,
    totalDuration,
    speechSeconds: sumWindows(speech),
    pauseSeconds: sumWindows(pause),
  };
}

/**
 * Derive the same windows from the voice-only render, for a mix that has just
 * landed and whose before-file still exists.
 *
 * `silencedetect` only has to find the gaps, not judge them: the pause floor,
 * inset and guards are applied afterwards exactly as in the timing path.
 *
 * @param {string} voiceOnlyPath - pre-mix render (no bed)
 * @param {{silenceThresholdDb?: number, duration?: number, minPauseSeconds?: number,
 *   pauseInsetSeconds?: number, headGuardSeconds?: number, tailGuardSeconds?: number}} [options]
 * @returns {{speech: Array<[number, number]>, pause: Array<[number, number]>,
 *   totalDuration: number, speechSeconds: number, pauseSeconds: number}}
 */
export function detectSilenceWindows(voiceOnlyPath, options = {}) {
  const {
    silenceThresholdDb = SILENCE_THRESHOLD_DB,
    minPauseSeconds = MIN_PAUSE_SECONDS,
    pauseInsetSeconds = PAUSE_INSET_SECONDS,
    headGuardSeconds = HEAD_GUARD_SECONDS,
    tailGuardSeconds = TAIL_GUARD_SECONDS,
  } = options;
  const totalDuration = options.duration ?? getDurationSync(voiceOnlyPath);

  const run = spawnSync(
    ffmpegMeasureCmd,
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      voiceOnlyPath,
      "-af",
      `silencedetect=noise=${silenceThresholdDb}dB:d=${minPauseSeconds}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (run.status !== 0) {
    throw new Error(
      `silencedetect failed on ${voiceOnlyPath}: ${String(run.stderr ?? "")
        .trim()
        .split("\n")
        .slice(-3)
        .join(" | ")}`,
    );
  }

  const silences = [];
  let open = null;
  for (const line of String(run.stderr ?? "").split(/\r?\n/)) {
    const started = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (started) open = Math.max(0, Number(started[1]));
    const ended = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (ended && open != null) {
      silences.push([open, Number(ended[1])]);
      open = null;
    }
  }
  if (open != null) silences.push([open, totalDuration]);

  const speech = [];
  let cursor = 0;
  for (const [start, end] of silences) {
    if (start > cursor) speech.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < totalDuration) speech.push([cursor, totalDuration]);

  const gaps = silences.map(([start, end]) => [start, end]);
  const pause = pauseWindowsFromGaps(gaps, {
    headGuardSeconds,
    tailGuardSeconds,
    pauseInsetSeconds,
    minPauseSeconds,
    totalDuration,
  });

  return {
    speech,
    pause,
    totalDuration,
    speechSeconds: sumWindows(speech),
    pauseSeconds: sumWindows(pause),
  };
}

function levelForWindows(samples, sampleRate, windows) {
  let sumSquares = 0;
  let count = 0;
  for (const [start, end] of windows ?? []) {
    const first = Math.max(0, Math.floor(start * sampleRate));
    const last = Math.min(samples.length, Math.ceil(end * sampleRate));
    for (let i = first; i < last; i++) {
      sumSquares += samples[i] * samples[i];
      count++;
    }
  }
  if (count === 0) return { db: null, seconds: 0 };
  const rms = Math.sqrt(sumSquares / count);
  const db = rms > 0 ? Math.max(SILENCE_FLOOR_DBFS, 20 * Math.log10(rms)) : SILENCE_FLOOR_DBFS;
  return { db, seconds: count / sampleRate };
}

/**
 * Energy-weighted RMS of each window set, and the margin between them.
 *
 * @param {{samples: Float32Array, sampleRate: number,
 *   windows: {speech: Array<[number, number]>, pause: Array<[number, number]>}}} input
 * @returns {{speechRmsDb: number|null, bgmOnlyRmsDb: number|null,
 *   marginDb: number|null, speechSeconds: number, pauseSeconds: number}}
 */
export function measureWindowLevels({ samples, sampleRate, windows }) {
  const speech = levelForWindows(samples, sampleRate, windows?.speech);
  const pause = levelForWindows(samples, sampleRate, windows?.pause);
  const marginDb = speech.db != null && pause.db != null ? speech.db - pause.db : null;
  return {
    speechRmsDb: speech.db,
    bgmOnlyRmsDb: pause.db,
    marginDb,
    speechSeconds: speech.seconds,
    pauseSeconds: pause.seconds,
  };
}

/**
 * Decode the artifact and measure both window sets.
 *
 * @param {{videoPath: string, windows: object}} input
 * @returns {{ok: boolean, speechRmsDb?: number, bgmOnlyRmsDb?: number,
 *   marginDb?: number, speechSeconds?: number, pauseSeconds?: number,
 *   speechWindows?: number, pauseWindows?: number, error?: string}}
 */
export function measureBgmMargin({ videoPath, windows }) {
  if (!windows || !(windows.speech?.length > 0)) {
    return { ok: false, error: "no speech windows — timing data covered no words" };
  }
  if (!(windows.pause?.length > 0)) {
    return { ok: false, error: "no bed-only windows — the artifact has no gap long enough" };
  }

  const dir = mkdtempSync(join(tmpdir(), "bgm-margin-"));
  try {
    const wavPath = join(dir, "audio.wav");
    decodeToWavFile(videoPath, wavPath, MEASURE_SAMPLE_RATE);
    const { samples, sampleRate } = readWavPcm(wavPath);
    const levels = measureWindowLevels({ samples, sampleRate, windows });
    if (levels.marginDb == null) {
      return { ok: false, error: "window levels not measurable" };
    }
    return {
      ok: true,
      ...levels,
      speechWindows: windows.speech.length,
      pauseWindows: windows.pause.length,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "?";
}

/**
 * Judge a margin measurement.
 *
 * `expectBed` is `true` when the render recorded a local mix, `false` when it
 * recorded none (platform-attach path), and `null` when the artifact carries
 * no marker (older render, or a post downloaded from the platform). The
 * expectation is what separates "the bed is 35 dB down" from "there is no bed";
 * the levels alone cannot tell them apart.
 *
 * @param {object} measurement - measureBgmMargin() result
 * @param {{expectBed?: boolean|null}} [options]
 * @returns {{status: "pass"|"warn"|"fail"|"unknown", reasons: string[]}}
 */
export function evaluateBgmMargin(measurement, options = {}) {
  const expectBed = options.expectBed ?? null;
  if (!measurement || measurement.ok !== true || !Number.isFinite(measurement.marginDb)) {
    return {
      status: "unknown",
      reasons: [measurement?.error ?? "artifact not measured"],
    };
  }

  const { marginDb, bgmOnlyRmsDb } = measurement;
  const bedPresent = bgmOnlyRmsDb > BGM_BED_FLOOR_DBFS;

  if (!bedPresent) {
    if (expectBed === true) {
      return {
        status: "fail",
        reasons: [
          `BGM bed absent or below ${BGM_BED_FLOOR_DBFS} dBFS: bed-only windows measure ` +
            `${fmt(bgmOnlyRmsDb)} dBFS`,
        ],
      };
    }
    return {
      status: "pass",
      reasons: [
        expectBed === false
          ? "no local bed (platform-attach path) — music-under-voice is not measurable on this artifact"
          : "no local bed and no mix recorded for this file — music-under-voice not measured",
      ],
    };
  }

  if (expectBed === false) {
    return {
      status: "warn",
      reasons: [
        `a local bed is measurable (${fmt(bgmOnlyRmsDb)} dBFS) although this render recorded no BGM — ` +
          "the platform bed would land on top of it",
      ],
    };
  }

  if (marginDb < BGM_MARGIN_WARN_MIN_DB) {
    return {
      status: "fail",
      reasons: [
        `music too loud: ${fmt(marginDb)} dB below the narration ` +
          `(fail below ${BGM_MARGIN_WARN_MIN_DB} dB, target ${BGM_MARGIN_PASS_MIN_DB}–${BGM_MARGIN_PASS_MAX_DB} dB)`,
      ],
    };
  }
  if (marginDb > BGM_MARGIN_WARN_MAX_DB) {
    return {
      status: "fail",
      reasons: [
        `music effectively gone: ${fmt(marginDb)} dB below the narration ` +
          `(fail above ${BGM_MARGIN_WARN_MAX_DB} dB, target ${BGM_MARGIN_PASS_MIN_DB}–${BGM_MARGIN_PASS_MAX_DB} dB)`,
      ],
    };
  }
  if (marginDb < BGM_MARGIN_PASS_MIN_DB || marginDb > BGM_MARGIN_PASS_MAX_DB) {
    return {
      status: "warn",
      reasons: [
        `music sits ${fmt(marginDb)} dB below the narration, outside the ` +
          `${BGM_MARGIN_PASS_MIN_DB}–${BGM_MARGIN_PASS_MAX_DB} dB pass band`,
      ],
    };
  }
  if (bgmOnlyRmsDb <= BGM_BED_EDGE_DBFS) {
    return {
      status: "warn",
      reasons: [
        `bed at the edge of audibility: ${fmt(bgmOnlyRmsDb)} dBFS in bed-only windows ` +
          `(pass needs > ${BGM_BED_EDGE_DBFS} dBFS)`,
      ],
    };
  }
  return {
    status: "pass",
    reasons: [
      `music sits ${fmt(marginDb)} dB below the narration ` +
        `(band ${BGM_MARGIN_PASS_MIN_DB}–${BGM_MARGIN_PASS_MAX_DB} dB)`,
    ],
  };
}

/**
 * Where the expectation marker lives: beside the artifact's audio/ directory.
 *
 * @param {string} videoPath
 */
function bgmMixMarkerPath(videoPath) {
  return join(dirname(videoPath), "audio", "bgm-mix.json");
}

/**
 * Record what the mix pass actually did. Called by both mix paths so a later
 * check can tell "bed missing" from "no bed expected" without guessing.
 *
 * @param {string} videoPath - the file the mix was written to
 * @param {{bgmPath?: string|null, volume?: number|null}} [mix]
 * @returns {object} the marker payload
 */
export function writeBgmMixMarker(videoPath, { bgmPath = null, volume = null } = {}) {
  const payload = {
    mixed: Boolean(bgmPath),
    bgm: bgmPath ? basename(bgmPath) : null,
    volume: volume ?? null,
    video: basename(videoPath),
    at: new Date().toISOString(),
  };
  const markerPath = bgmMixMarkerPath(videoPath);
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

/**
 * @param {string} videoPath
 * @returns {object|null} marker payload, or null when absent/unreadable
 */
export function readBgmMixMarker(videoPath) {
  try {
    const raw = JSON.parse(readFileSync(bgmMixMarkerPath(videoPath), "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * `expectBed` for a given artifact: the marker's claim when it names this
 * exact file, otherwise unknown.
 *
 * @param {string} videoPath
 * @returns {boolean|null}
 */
export function expectedBedFor(videoPath) {
  const marker = readBgmMixMarker(videoPath);
  if (!marker || marker.video !== basename(videoPath)) return null;
  return Boolean(marker.mixed);
}
