/**
 * #1212 — mechanical QA thresholds for the finished video (the quantitative
 * half #735 deliberately left out; 2026-11-09 HITL option A).
 *
 * Two metrics, both measured on the ENCODED mp4 (not on render props, not on
 * source assets). `qa-final-review.mjs` runs them when it builds the packet and
 * gates the reviewer's report on them; the independent review stays the
 * delivery subject — these thresholds cannot pass a pack on their own, they can
 * only block one.
 *
 * ## 1. Static segment — "入场即停" / a frozen picture
 *
 * Per scene, the longest run of consecutive frames whose mean absolute luma
 * difference (72×128 probe) is at or below `frameDiffEps`. The scan starts
 * after the crossfade (`TRANSITION_FRAMES`) and stops `holdExclusionFrames`
 * before the scene ends: the closing rest window is a CONTRACT (HOLD 30–45
 * frames, `remotion/src/tokens.ts`), so counting it would fail every compliant
 * scene. Excluding the top of the window (45) is the conservative direction —
 * it can only under-count a violation, never invent one.
 *
 * Calibration (2026-11-14, 29 finished packs, `frameDiffEps 0.1`):
 * per-scene max static run p50 56 / p90 88 / p95 91 / max 230 frames.
 * `maxStaticFrames 120` is p95 + 30% headroom: it flags exactly the one
 * legacy slideshow pack (`vidu-s2-ai-streamer`, 230 frames — frames are
 * byte-identical there, no camera), and leaves every pack that carries motion
 * alone. The surveyed source's rule is "完全静止 ≤3s" (`repo-survey-tracking.md`
 * §C.2/§C.6, landscape) — the portrait pack runs 4–8s per scene with a slower
 * read, so the rule is rescaled to 4s rather than copied.
 *
 * Why 0.1 is a real boundary and not a taste call: the camera is a 0.6% pull
 * over the whole scene, which lands below this probe's resolution as ~0.03–0.05
 * of mean luma — i.e. camera-only frames ARE static to a viewer, and a genuinely
 * frozen scene is indistinguishable from one that only creeps. Real motion
 * (entrance fade, media drift, cut) crosses 0.1 by an order of magnitude: the
 * corpus p90 of per-frame diff is 0.7.
 *
 * ## 2. High-saturation debris in the subtitle lane
 *
 * Fraction of the subtitle lane's pixels that are both saturated
 * (S ≥ `minSaturation`) and bright (V ≥ `minValue`), averaged over a 1s window
 * (`windowFrames`), reported as the peak across the film. The lane is derived
 * from `safe-zones.mjs` (SUBTITLE_LANE margins + reserved height), so a canvas
 * or lane change moves the probe with it — there is no second geometry table.
 *
 * Calibration (same corpus): window peak p50 4.0% / p90 10% / p99 11% /
 * max 12% — the baseline is the white cue's own antialiasing plus the content
 * band's separator line, not debris. `laneRatioWarn 0.15` is the corpus max
 * plus headroom and it is **WARN only**: no pack in the corpus contains a real
 * banner/QR fragment in the lane, so this threshold has never met a positive
 * sample. It is a gross-defect guardrail, not a calibrated PASS line — the
 * first real debris pack must re-derive it (recompute command in CALIBRATION).
 *
 * ## Reproduce
 *
 *   node scripts/short-video/qa-threshold-calibration.mjs --out /tmp/qa-cal.json
 *
 * The baseline is "packs rendered BEFORE #738 (2026-11-10)"; every number above
 * was taken from that population and must be recomputed once the first pack
 * rendered with the post-#738 renderer exists (same command, then update
 * CALIBRATION.baseline).
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { CANVAS, SUBTITLE_LANE, SUBTITLE_LANE_BOTTOM, SUBTITLE_LANE_TOP } from "./safe-zones.mjs";
import { FPS, TRANSITION_FRAMES, sceneTimeline } from "./timeline.mjs";

/** ffmpeg writes raw frames to a pipe; a 60s 1080p decode is ~25MB at 1/15. */
const RAW_MAX_BUFFER = 512 * 1024 * 1024;

/** Luma probe for the frame-diff series: exactly 1/15 of the 1080×1920 canvas. */
export const LUMA_PROBE = Object.freeze({ width: CANVAS.width / 15, height: CANVAS.height / 15 });

/**
 * Thresholds. Frozen on purpose: a gate whose numbers drift at runtime cannot
 * be audited against the corpus it was calibrated on.
 */
export const STATIC_SEGMENT = Object.freeze({
  /** Mean absolute luma difference (0–255) at or below which a frame pair is still. */
  frameDiffEps: 0.1,
  /** Longest tolerated still run inside a scene's live window, frames. */
  maxStaticFrames: 120,
  /** Frames reserved for the closing rest window, excluded from the scan. */
  holdExclusionFrames: 45,
});

export const DEBRIS = Object.freeze({
  minSaturation: 0.6,
  /** Value floor (0–255) — keeps dim edges of the dark canvas out of the count. */
  minValue: 128,
  /** Sample every Nth frame: debris is a structural defect, not a single frame. */
  sampleEvery: 3,
  /** Averaging window, frames — one second at FPS. */
  windowFrames: FPS,
  /** WARN line for the windowed lane coverage (0–1). */
  laneRatioWarn: 0.15,
});

/** The probe rect, in canvas px, derived from the lane's single source. */
export const SUBTITLE_LANE_RECT = Object.freeze({
  x: SUBTITLE_LANE.marginL,
  y: SUBTITLE_LANE_TOP,
  width: CANVAS.width - SUBTITLE_LANE.marginL - SUBTITLE_LANE.marginR,
  height: SUBTITLE_LANE_BOTTOM - SUBTITLE_LANE_TOP,
});

/** Where the numbers came from — surfaced in every mechanics report. */
export const CALIBRATION = Object.freeze({
  measuredAt: "2026-11-14",
  packs: 29,
  baseline:
    "finished mp4s rendered before #738 (2026-11-10); recompute once a post-#738 pack exists",
  command: "node scripts/short-video/qa-threshold-calibration.mjs --out /tmp/qa-cal.json",
  staticSegment: Object.freeze({ p50: 56, p90: 88, p95: 91, max: 230 }),
  debrisWindow: Object.freeze({ p50: 0.04, p90: 0.1, p95: 0.1, p99: 0.11, max: 0.12 }),
});

/**
 * The live scan window of every scene: after the crossfade, before the rest.
 *
 * Fails closed on the same inputs `planAcceptanceFrames` rejects — a scan
 * window is only meaningful when the timeline is.
 *
 * @param {Array<{sceneId:number,duration:number}>} sceneDurations
 * @param {{holdFrames?:number}} [options]
 * @returns {{fps:number,windows:Array<{sceneId:number,start:number,end:number}>}}
 */
export function sceneScanWindows(
  sceneDurations,
  { holdFrames = STATIC_SEGMENT.holdExclusionFrames } = {},
) {
  if (!Array.isArray(sceneDurations) || sceneDurations.length === 0) {
    throw new Error("scene durations are required to plan the mechanical scan");
  }
  if (!Number.isInteger(holdFrames) || holdFrames < 0) {
    throw new Error(`holdFrames must be a non-negative integer, got ${holdFrames}`);
  }
  const schedule = sceneTimeline(
    sceneDurations.map(({ sceneId, duration }) => ({ sceneId, duration })),
    { fps: FPS, transitionOverlap: TRANSITION_FRAMES },
  );
  const windows = schedule.map((entry) => {
    const start = entry.visualStartFrames + TRANSITION_FRAMES;
    const end = entry.visualStartFrames + entry.clipFrames - holdFrames;
    if (end <= start) {
      throw new Error(
        `scene ${entry.sceneId} has no live window to scan (${entry.clipFrames} frames, ${holdFrames} reserved for the hold)`,
      );
    }
    return { sceneId: entry.sceneId, start, end };
  });
  return { fps: FPS, windows };
}

/**
 * Mean absolute luma difference between consecutive frames.
 * Index 0 is 0 (a frame has no predecessor); index i compares i-1 → i.
 *
 * @param {Buffer} gray - raw 8-bit gray frames, concatenated
 * @param {{width:number,height:number}} size
 * @returns {Float64Array}
 */
export function meanAbsDiffSeries(gray, { width, height } = LUMA_PROBE) {
  const frameSize = width * height;
  if (
    !Number.isInteger(frameSize) ||
    frameSize <= 0 ||
    !Buffer.isBuffer(gray) ||
    gray.length < frameSize
  ) {
    throw new Error("gray frames and a positive probe size are required");
  }
  const count = Math.floor(gray.length / frameSize);
  const series = new Float64Array(count);
  for (let i = 1; i < count; i += 1) {
    let sum = 0;
    const prev = (i - 1) * frameSize;
    const cur = i * frameSize;
    for (let k = 0; k < frameSize; k += 1) sum += Math.abs(gray[prev + k] - gray[cur + k]);
    series[i] = sum / frameSize;
  }
  return series;
}

/**
 * Longest run of consecutive still frames inside one scan window.
 *
 * @param {Float64Array} diffs - from meanAbsDiffSeries
 * @param {{start:number,end:number,eps?:number}} window - [start, end)
 * @returns {{frames:number,from:number|null,to:number|null}}
 */
export function longestStaticRun(diffs, { start, end, eps = STATIC_SEGMENT.frameDiffEps }) {
  if (!Number.isFinite(eps) || eps < 0)
    throw new Error(`eps must be a non-negative number, got ${eps}`);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    throw new Error(`invalid scan window [${start}, ${end})`);
  }
  const limit = Math.min(end, diffs.length);
  let best = 0;
  let bestFrom = null;
  let bestTo = null;
  let run = 0;
  let runFrom = null;
  for (let i = start; i < limit; i += 1) {
    if (diffs[i] <= eps) {
      if (run === 0) runFrom = i;
      run += 1;
      if (run > best) {
        best = run;
        bestFrom = runFrom;
        bestTo = i;
      }
    } else {
      run = 0;
      runFrom = null;
    }
  }
  return { frames: best, from: bestFrom, to: bestTo };
}

/**
 * Fraction of the probe's pixels that are saturated and bright, per frame.
 *
 * @param {Buffer} rgb - raw rgb24 frames, concatenated
 * @param {{width:number,height:number,minSaturation?:number,minValue?:number}} size
 * @returns {Float64Array} 0–1 per frame
 */
export function saturatedRatioSeries(
  rgb,
  { width, height, minSaturation = DEBRIS.minSaturation, minValue = DEBRIS.minValue },
) {
  const frameSize = width * height;
  if (
    !Number.isInteger(frameSize) ||
    frameSize <= 0 ||
    !Buffer.isBuffer(rgb) ||
    rgb.length < frameSize * 3
  ) {
    throw new Error("rgb frames and a positive probe size are required");
  }
  const count = Math.floor(rgb.length / (frameSize * 3));
  const series = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    let hits = 0;
    const base = i * frameSize * 3;
    for (let p = 0; p < frameSize; p += 1) {
      const k = base + p * 3;
      const r = rgb[k];
      const g = rgb[k + 1];
      const b = rgb[k + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat >= minSaturation && max >= minValue) hits += 1;
    }
    series[i] = hits / frameSize;
  }
  return series;
}

/**
 * Highest mean over a sliding window (frames). A single affected frame is not
 * debris; a whole second of it is.
 *
 * @param {Float64Array|number[]} series
 * @param {number} window - frames
 * @returns {{peak:number,at:number|null}}
 */
export function peakWindowMean(series, window) {
  if (!Number.isInteger(window) || window <= 0) {
    throw new Error(`window must be a positive integer, got ${window}`);
  }
  if (series.length === 0) return { peak: 0, at: null };
  if (series.length < window) {
    let sum = 0;
    for (const v of series) sum += v;
    return { peak: sum / series.length, at: 0 };
  }
  let sum = 0;
  for (let i = 0; i < window; i += 1) sum += series[i];
  let best = sum / window;
  let at = 0;
  for (let i = window; i < series.length; i += 1) {
    sum += series[i] - series[i - window];
    const mean = sum / window;
    if (mean > best) {
      best = mean;
      at = i - window + 1;
    }
  }
  return { peak: best, at };
}

/** A threshold that has not been calibrated must never read as a PASS. */
function assertCalibrated(thresholds) {
  const missing = [];
  for (const [key, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value)) missing.push(key);
  }
  return missing;
}

/**
 * Apply both thresholds to one pack's measurements.
 *
 * Status ladder: `uncalibrated` (fail-closed) > `fail` (a P1 finding) >
 * `warn` (a P2 finding) > `pass`. Only the static segment can fail; debris is
 * WARN by contract until a real positive sample exists.
 *
 * @param {object} input
 * @param {Array<{sceneId:number,start:number,end:number}>} input.windows
 * @param {Float64Array} input.diffs
 * @param {Float64Array} input.laneSeries - per sampled frame
 * @param {{frameDiffEps?:number,maxStaticFrames?:number,laneRatioWarn?:number,windowFrames?:number}} [input.thresholds]
 */
export function evaluateMechanics({ windows, diffs, laneSeries, thresholds = {} } = {}) {
  const t = {
    frameDiffEps: thresholds.frameDiffEps ?? STATIC_SEGMENT.frameDiffEps,
    maxStaticFrames: thresholds.maxStaticFrames ?? STATIC_SEGMENT.maxStaticFrames,
    laneRatioWarn: thresholds.laneRatioWarn ?? DEBRIS.laneRatioWarn,
    windowFrames: thresholds.windowFrames ?? DEBRIS.windowFrames,
  };
  const missing = assertCalibrated(t);
  if (missing.length > 0) {
    return {
      status: "uncalibrated",
      findings: [
        {
          code: "uncalibrated",
          severity: "P1",
          detail: `no calibrated value for ${missing.join(", ")} — thresholds must come from a real-pack sample`,
        },
      ],
      staticSegment: null,
      debris: null,
    };
  }
  if (!Array.isArray(windows) || windows.length === 0) {
    throw new Error("scene scan windows are required");
  }
  if (!diffs || diffs.length === 0) throw new Error("a frame-diff series is required");
  if (!laneSeries || laneSeries.length === 0)
    throw new Error("a lane saturation series is required");

  const perScene = windows.map((w) => ({
    sceneId: w.sceneId,
    ...longestStaticRun(diffs, { start: w.start, end: w.end, eps: t.frameDiffEps }),
  }));
  const worst = perScene.reduce((a, b) => (b.frames > a.frames ? b : a), perScene[0]);
  const debrisPeak = peakWindowMean(
    laneSeries,
    Math.max(1, Math.round(t.windowFrames / DEBRIS.sampleEvery)),
  );

  const findings = [];
  if (worst.frames > t.maxStaticFrames) {
    findings.push({
      code: "static-segment",
      severity: "P1",
      detail:
        `scene ${worst.sceneId}: ${worst.frames} consecutive still frames ` +
        `(${(worst.frames / FPS).toFixed(1)}s, limit ${t.maxStaticFrames}) at frames ${worst.from}–${worst.to}`,
    });
  }
  if (debrisPeak.peak > t.laneRatioWarn) {
    findings.push({
      code: "lane-debris",
      severity: "P2",
      detail:
        `subtitle lane ${(debrisPeak.peak * 100).toFixed(1)}% saturated+bright over 1s ` +
        `(warn at ${(t.laneRatioWarn * 100).toFixed(0)}%, first sample ${debrisPeak.at})`,
    });
  }

  const status = findings.some((f) => f.severity === "P0" || f.severity === "P1")
    ? "fail"
    : findings.length > 0
      ? "warn"
      : "pass";

  return {
    status,
    findings,
    staticSegment: {
      frameDiffEps: t.frameDiffEps,
      maxStaticFrames: t.maxStaticFrames,
      worstFrames: worst.frames,
      worstSceneId: worst.sceneId,
      perScene,
    },
    debris: {
      laneRatioWarn: t.laneRatioWarn,
      peakRatio: debrisPeak.peak,
      firstSample: debrisPeak.at,
      lane: SUBTITLE_LANE_RECT,
    },
  };
}

/**
 * Measure one finished mp4 end to end: two ffmpeg passes (luma probe, lane
 * crop) plus `evaluateMechanics`.
 *
 * The video is decoded as-is — no seek, no frame re-timing — so the absolute
 * frame numbers are the ones `planAcceptanceFrames` declares and the reviewer
 * sees on the sheets.
 *
 * @param {object} options
 * @param {string} options.videoPath
 * @param {Array<{sceneId:number,duration:number}>} options.sceneDurations
 * @returns {{windows:Array<object>,diffs:Float64Array,laneSeries:Float64Array,evaluation:object,videoFrames:number}}
 */
export function measureVideo({ videoPath, sceneDurations }) {
  if (!videoPath || !existsSync(videoPath)) {
    throw new Error(`finished video not found: ${videoPath}`);
  }
  const { windows, fps } = sceneScanWindows(sceneDurations);
  const luma = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      `scale=${LUMA_PROBE.width}:${LUMA_PROBE.height},format=gray`,
      "-f",
      "rawvideo",
      "-",
    ],
    { maxBuffer: RAW_MAX_BUFFER },
  );
  const diffs = meanAbsDiffSeries(luma, LUMA_PROBE);

  const lane = SUBTITLE_LANE_RECT;
  const rgb = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      `crop=${lane.width}:${lane.height}:${lane.x}:${lane.y},select=not(mod(n\\,${DEBRIS.sampleEvery}))`,
      "-vsync",
      "0",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: RAW_MAX_BUFFER },
  );
  const laneSeries = saturatedRatioSeries(rgb, { width: lane.width, height: lane.height });

  return {
    fps,
    videoFrames: diffs.length,
    windows,
    diffs,
    laneSeries,
    evaluation: evaluateMechanics({ windows, diffs, laneSeries }),
  };
}
