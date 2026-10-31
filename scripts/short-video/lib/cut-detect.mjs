/**
 * Shot-cut detection — the independent measured time source for competitor
 * timelines (#749).
 *
 * Why ffmpeg's `scene` score and not PySceneDetect: the cut signal the repo
 * already validates (`bench/keyframe/bench_common.py` §13.3) is ffmpeg's scene
 * filter; PySceneDetect is not installed and adding a runtime dependency for
 * one decode pass buys nothing over the same underlying frame-difference
 * measure. The ticket's precondition — hard-cut detection returns nothing on
 * no-cut (talking-head) material — was re-measured on this corpus and holds:
 * 5 of the 35 videos have zero cuts at 0.2, including three single-shot
 * talking heads (`marcus.dipaola`), and the synthetic 30s `talkinghead` asset
 * yields none at 0.08/0.2/0.3. Those records therefore keep the existing
 * ASR-span interpolation; this module never invents a time point.
 *
 * Semantics of a "cut": the first frame of a new shot. `select='gt(scene,TH)'`
 * selects the frame whose scene score against the previous frame crosses TH,
 * and `showinfo` prints that frame's pts. Frame 0 is never selected (nothing
 * precedes it); callers prepend the video start themselves.
 *
 * @module cut-detect
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";

/**
 * Default scene-score threshold.
 *
 * Calibrated on this corpus (2026-10-31): the five no-cut controls
 * (three single-shot talking heads, a 15s face-to-camera clip, a 13.8s clip)
 * yield zero cuts at 0.3/0.15/0.1, while the actual transitions in the
 * `shedoesai/7372434986558934305` logo carousel (~12 logo switches) survive
 * only below 0.2 — 4 cuts at 0.3, 6 at 0.2, 11 at 0.15, 13 at 0.1. 0.1 adds
 * boundaries 33-40ms apart inside one transition (e.g. 1.433/1.467s on
 * `shedoesai/7642646978014219542`), so 0.15 is the low end without that
 * jitter. A false positive costs one measured frame time; a false negative
 * costs resolution, so the threshold errs low.
 */
export const DEFAULT_CUT_THRESHOLD = 0.15;

const FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
// Decode-only pass: prefer the full build the rest of the pipeline pins, but
// fall back to PATH rather than losing the second source on a host without it
// (the TTS measurement policy is PATH-resolved for the same reason).
const FFMPEG = process.env.CUT_DETECT_FFMPEG || (existsSync(FFMPEG_FULL) ? FFMPEG_FULL : "ffmpeg");
const SCENE_PTS_RE = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Extract the `pts_time` values from `showinfo`'s stderr.
 *
 * Kept separate so the parsing contract is testable without decoding a video.
 * Values are seconds (ffmpeg's pts_time unit), in output order; the select
 * filter emits one showinfo line per selected frame.
 *
 * @param {string} stderr
 * @returns {number[]}
 */
export function parseScenePts(stderr) {
  const out = [];
  for (const match of String(stderr ?? "").matchAll(SCENE_PTS_RE)) {
    const value = Number.parseFloat(match[1]);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * The persisted artifact shape for one video's cut detection.
 *
 * Single-sourced because two writers persist it: the analysis runner beside the
 * record, and the retime CLI in its output directory. They must stay
 * byte-identical so either can reproduce the other (#749 review).
 *
 * @param {string} videoId
 * @param {{cutsMs: number[], threshold: number}} detected
 * @returns {object}
 */
export function cutsArtifact(videoId, { cutsMs, threshold }) {
  return {
    schemaVersion: "competitor-cuts-v1",
    videoId,
    source: "ffmpeg-scene",
    threshold,
    cutsMs,
  };
}

/**
 * Detect hard cuts in `videoPath` with ffmpeg's scene filter.
 *
 * Returns millisecond timestamps of the first frame of each new shot, strictly
 * inside `(0, duration)` from ffmpeg's own decode (no audio, no ASR). A missing
 * ffmpeg or a failed decode throws — callers decide whether "no second source"
 * is acceptable for their record (it is for the competitor runner, which then
 * keeps the interpolation fallback).
 *
 * @param {string} videoPath
 * @param {object} [opts]
 * @param {number} [opts.threshold] - scene score in (0, 1)
 * @param {string} [opts.ffmpeg]
 * @param {number} [opts.timeoutMs]
 * @returns {{cutsMs: number[], threshold: number}}
 */
export function detectCuts(
  videoPath,
  { threshold = DEFAULT_CUT_THRESHOLD, ffmpeg = FFMPEG, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const filter = `select='gt(scene,${threshold})',showinfo`;
  // spawnSync (not execFileSync): showinfo writes to stderr, and execFileSync
  // only returns stdout.
  const result = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-i",
      videoPath,
      "-filter:v",
      filter,
      "-an",
      "-sn",
      "-dn",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const tail = String(result.stderr ?? "")
      .trim()
      .split("\n")
      .slice(-3)
      .join(" | ");
    throw new Error(`ffmpeg scene detection failed (${result.status}): ${tail}`);
  }
  const cutsMs = parseScenePts(result.stderr)
    .map((seconds) => Math.round(seconds * 1000))
    .filter((ms, index, all) => ms > 0 && all.indexOf(ms) === index)
    .sort((a, b) => a - b);
  return { cutsMs, threshold };
}
