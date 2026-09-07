/**
 * Avatar frame audit (#214 ticket 05, spec docs/specs/spec-digital-human-pipeline.md
 * Implementation Decision 8 / Behavioral Scenario 6).
 *
 * Every scene that declares a digital human passes a THREE-GATE frame audit
 * after render. Any gate FAIL means the package does not enter the publish
 * chain (T6 wiring) — the error names the failed gate and cites evidence frames.
 *
 *   1. safe-zone  — the rendered avatar card must not intrude any protected
 *                   zone (top nav band / left margin / TikTok right action
 *                   rail / burned-subtitle lane / bottom dead zone ≈400px,
 *                   the platform caption+CTA area).
 *   2. lip-sync   — within the card's on-screen window, frame-difference
 *                   energy in the mouth region must show movement; a "static
 *                   face fake video" fails.
 *   3. av-sync    — the scene's TTS audio energy envelope vs the mouth-region
 *                   motion signal: speech onsets must align within the
 *                   documented tolerance.
 *
 * ─── Detection approach (ticket: composition geometry + pixel verification) ───
 *
 * The expected card rect comes from the composition geometry — the only
 * rendered position is "right-card" (lib/scene-rules.mjs AVATAR_POSITIONS),
 * so the declared rect is lib/safe-zones.mjs AVATAR_CARD_RECT, itself locked
 * to the real Chromium render by the ticket-02 render probe. The audit then
 * verifies ACTUAL pixels on uniformly sampled frames (ffmpeg, one scaled pass
 * per window). Per-pixel temporal standard deviation over the sampled frames
 * builds a motion map with two thresholds:
 *
 *   - weak (VARIANCE_DYNAMIC_THRESHOLD 8): "any playing video" — drives the
 *     card PRESENCE check inside the declared rect.
 *   - strong (STRONG_MOTION_THRESHOLD 25): "card-grade motion" — drives the
 *     zone-intrusion checks. Evidence (first real E2E render, dh-pilot-qwen4
 *     scene 10, an animated-gradient CTA background): background motion in
 *     protected zones measures std ≤ 31 (bottom dead zone p99 29) while card
 *     content measures median 33 with 62% of the rect above 25.
 *
 * SAFE-ZONE intrusion logic (the card div is clipped to the declared rect, so
 * its content can only leave it as a CONNECTED extension):
 *
 *   - Containment: strong-motion pixels CONNECTED to the card's component
 *     (flood-filled from seeds inside the eroded rect) must stay within the
 *     rect + edge tolerance. Any connected pixel inside a protected zone
 *     fails the gate naming that zone — this catches scale overrides and
 *     lane crossings. Unconnected background motion in a zone is NOT card
 *     content and never fires (measured: the ring around the compliant card
 *     holds ≤2 strong px, connected 0).
 *   - Displaced card: when presence fails (no playing card at the declared
 *     rect) AND a zone holds a strong-motion blob above the intrusion ratio,
 *     the card must have rendered elsewhere → the zone is named.
 *
 *   - lip-sync: mean TEMPORAL STD inside the mouth region (not mean
 *     inter-frame diff — at 10Hz sampling a real talking head's diff mean
 *     sits at 5.2, under the synthetic-fixture-calibrated 6.0 floor, while
 *     its temporal std measures 35.6 vs ≤3 encoder noise: a 10× separation).
 *   - av-sync: FIRST-ONSET alignment between the TTS energy envelope and the
 *     mouth-motion series. The previous cross-correlation approach is not
 *     viable on real content: the mouth series is dominated by sparse
 *     head-movement spikes, producing a flat correlation landscape (real
 *     render: peak 0.305 vs 0.280 at lag 0 — pass/fail decided by noise),
 *     while onset alignment measures +33ms on the same data.
 *
 * Fixtures for deterministic tests are ffmpeg-synthesized (no model output):
 * see __tests__/avatar-frame-audit.test.mjs. Real-machine smoke with ticket-04
 * output is deferred to HITL (ticket acceptance item 6).
 *
 * Reused utilities: lib/audio/wav.mjs (decode bridge), lib/audio/sync.mjs
 * (AUDIO_SYNC_TOLERANCE — the pipeline's audio budget), lib/safe-zones.mjs
 * (all geometry), lib/upscale.mjs (ffmpeg/ffprobe binary paths).
 *
 * @module avatar-frame-audit
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import {
  AVATAR_CARD,
  AVATAR_CARD_RECT,
  CANVAS,
  SAFE_ZONES,
  SUBTITLE_LANE_BOTTOM,
  SUBTITLE_LANE_TOP,
} from "./safe-zones.mjs";
import { decodeToWavFile, readWavPcm } from "./audio/wav.mjs";
import { FFMPEG_PATH, FFPROBE_PATH } from "./upscale.mjs";

// ─── Audit sampling (all thresholds are named constants with rationale) ───

/** Working resolution width. 1080/4 = 270: a 4px-accurate grid (zone gaps are
 *  ≥40px = ≥10 cells) with 16× cheaper decode/memory than full res. */
export const AUDIT_FRAME_WIDTH = 270;

/** Frame sampling rate for the audit window. 10Hz > 2× the ~2.5-4Hz mouth
 *  rhythm; ±50ms sampling quantization feeds the sync tolerance budget. */
export const AUDIT_SAMPLE_FPS = 10;

/** Hard cap on frames extracted per audit window (6s @10Hz) — bounds decode
 *  time and evidence dir size; windows longer than 6s get uniform subsamples. */
export const MAX_AUDIT_FRAMES_PER_WINDOW = 60;

/** Below this many sampled frames the audit cannot verify anything (a 0.3s
 *  sliver) — fail-closed rather than passing on thin evidence. */
export const MIN_AUDIT_FRAMES = 4;

/** Luminance std (across the window's frames) above which a pixel counts as
 *  "dynamic". x264 CRF-28 static-content noise measures ≤3 std; any playing
 *  video content measures ≫20. 8 ≈ 2.7× the measured noise ceiling. Drives
 *  the card PRESENCE check. */
export const VARIANCE_DYNAMIC_THRESHOLD = 8;

/** Luminance std above which a pixel counts as "card-grade motion" — the
 *  STRONG threshold driving zone-intrusion checks. Rationale (real E2E
 *  render, dh-pilot-qwen4 scene 10, animated-gradient background): background
 *  motion inside protected zones stays ≤31 std (bottom dead zone p99 29) while
 *  card content measures median 33 with 62% of the rect above 25; the ring
 *  right outside the compliant card holds ≤2 strong px. 25 therefore separates
 *  clipped card content (and anything CONNECTED to it) from animated
 *  backgrounds, which the weak threshold cannot do. */
export const STRONG_MOTION_THRESHOLD = 25;

/** Seeds for the card's strong-motion component are taken from the expected
 *  rect ERODED by this many canvas px, so encoder ringing at the card edge
 *  cannot seed a component that bridges into background motion. */
export const SEED_EROSION_PX = 8;

/** Edge tolerance (canvas px) excluded around the expected card rect when
 *  scanning zones: the card's 30px blurred shadow is STATIC (no variance) but
 *  encoder ringing at the card edge bleeds ~1-4px; 16px = 4 audit grid cells. */
export const EDGE_TOLERANCE_PX = 16;

/** Dynamic-pixel fraction of a protected zone (beyond the expected-rect band)
 *  that counts as card intrusion. A displaced 420×550 card covers ≥4% of the
 *  rail/lane/bottom zone it enters; compression noise stays ≪1%. */
export const ZONE_INTRUSION_RATIO = 0.02;

/** Dynamic-pixel fraction INSIDE the expected rect that proves the card is
 *  rendered and playing. The lip fixture's mouth-only motion covers ~8% of
 *  the card; a missing/never-generated card yields ~0%. */
export const CARD_PRESENCE_RATIO = 0.02;

/** Bottom dead zone height (canvas px) — TikTok caption/username climbs to
 *  y≈1500 worst case and the bottom nav bar starts ≈1790 (safe-zones.mjs
 *  header, calibrated against a real FYP screenshot). Zone top = 1920−400 =
 *  1520. This is the platform caption + CTA area the ticket names. */
export const BOTTOM_DEAD_ZONE_PX = 400;

/**
 * Mouth region as a ratio of the card rect. A talking-head model frames the
 * face centered in the card, so the mouth sits in the lower-middle: x ∈
 * [25%, 75%] (face width), y ∈ [60%, 90%] (below the nose, above the chin).
 * The fixture mouth patch (card-relative 30-70% × 65-85%) sits inside it.
 */
export const MOUTH_REGION_RATIO = { x0: 0.25, x1: 0.75, y0: 0.6, y1: 0.9 };

/**
 * Lip gate: mean TEMPORAL STD of luminance inside the mouth region must reach
 * this. The earlier metric (mean inter-frame diff, floor 6.0) was calibrated
 * on synthetic fixtures whose motion fires EVERY sampled interval; a real
 * EchoMimicV3 talking head at 10Hz sampling measures meanDiff 5.2 (mouths are
 * still between samples) yet temporal std 35.6 — sparse sampling suppresses
 * per-interval diffs but not the per-pixel spread over the window. Evidence:
 * real card mouth region 35.6; static-face/encoder noise ≤3; the synthetic
 * moving-mouth fixture ≈9-15. 5.0 = 1.7× the noise ceiling, ~2× below the
 * weakest fixture signal and 7× below the real card.
 */
export const LIP_MIN_TEMPORAL_STD = 5.0;

/** Per-sample-interval energy above which the interval counts as "active"
 *  (metric only). Also the flatness floor for the sync gate's mouth series. */
export const LIP_ACTIVE_DIFF = 4.0;

/**
 * A/V sync tolerance (seconds). |measured offset| beyond this FAILS.
 *
 * Composition of the budget:
 *  - ±33ms render frame grid (30fps, lib/timeline.mjs FPS);
 *  - ±50ms audit sampling quantization (AUDIT_SAMPLE_FPS);
 *  - ±50ms audio envelope hop (same rate);
 *  - 80ms pipeline audio budget (lib/audio/sync.mjs AUDIO_SYNC_TOLERANCE —
 *    the same budget the subtitle/audio alignment is held to).
 * 150ms also stays inside the ITU-R BT.1359 detectability band (~±100-125ms
 * acceptability, ±185ms annoyance) — a generation whose mouth leads/lags the
 * TTS by more than this reads as dubbed and must not ship. The misaligned
 * fixture is offset 400ms ≈ 2.7× the tolerance for unambiguous separation.
 */
export const AV_SYNC_TOLERANCE_SECONDS = 0.15;

/** Envelope sample rate for the sync check (Hz) = AUDIT_SAMPLE_FPS so the
 *  mouth series and the audio envelope share one time grid. */
export const SYNC_ENVELOPE_FPS = AUDIT_SAMPLE_FPS;

/** Fraction of a series' max above which a sample counts as "on" for onset
 *  detection. 0.2 sits above encoder/envelope noise and below any real speech
 *  burst (real render: audio env max 0.29, noise ~0.01; mouth max 119, p90 2). */
export const ONSET_RATIO = 0.2;

/** Search expansion (canvas px) around the expected rect for the diagnostic
 *  detected-motion bounding box (metrics/evidence only, not gating). */
const SEARCH_EXPANSION_PX = 240;

/** Result file name inside output/{pipelineId}/avatar/. */
export const FRAME_AUDIT_RESULT_NAME = "frame-audit-result.json";

/** The only rendered avatar position (lib/scene-rules.mjs AVATAR_POSITIONS). */
const RENDERED_POSITION = "right-card";

// ─── Zone geometry (canvas px, scaled at runtime by the video width) ───

/**
 * Protected zones the card must not intrude, in 1080×1920 canvas px. Names
 * are quoted verbatim in gate failures (spec Scenario 6: name the zone).
 * Derived ONLY from lib/safe-zones.mjs constants + the research bottom dead
 * zone — no new layout numbers are invented here.
 */
export function protectedZones() {
  const bottomZoneTop = CANVAS.height - BOTTOM_DEAD_ZONE_PX;
  return [
    {
      id: "top nav band",
      rect: { x: 0, y: 0, width: CANVAS.width, height: SAFE_ZONES.top },
    },
    {
      id: "left margin",
      rect: { x: 0, y: SAFE_ZONES.top, width: SAFE_ZONES.left, height: bottomZoneTop - SAFE_ZONES.top },
    },
    {
      id: "TikTok right action rail",
      rect: {
        x: CANVAS.width - SAFE_ZONES.right,
        y: SAFE_ZONES.top,
        width: SAFE_ZONES.right,
        height: CANVAS.height - SAFE_ZONES.top,
      },
    },
    {
      id: "burned-subtitle lane",
      rect: {
        x: 0,
        y: SUBTITLE_LANE_TOP,
        width: CANVAS.width,
        height: SUBTITLE_LANE_BOTTOM - SUBTITLE_LANE_TOP,
      },
    },
    {
      id: "bottom dead zone (platform caption / CTA area)",
      rect: { x: 0, y: bottomZoneTop, width: CANVAS.width, height: BOTTOM_DEAD_ZONE_PX },
    },
  ];
}

/**
 * The declared gap band between the card's bottom limit and the subtitle lane
 * top (canvas px). Motion here proves the card physically crossed into the
 * lane (subtitles never paint above the lane top).
 */
export function subtitleGapBand() {
  // Card bottom limit = lane top − declared gap (the constraint assertAvatarCardSafe enforces).
  const cardBottomLimit = SUBTITLE_LANE_TOP - AVATAR_CARD.subtitleGap;
  return {
    id: "subtitle gap band",
    rect: {
      x: 0,
      y: cardBottomLimit,
      width: CANVAS.width,
      height: AVATAR_CARD.subtitleGap,
    },
  };
}

/** Scale a canvas-px rect into the audit grid (grid px = canvas px × scale). */
function scaleRect(rect, s) {
  return {
    x: Math.round(rect.x * s),
    y: Math.round(rect.y * s),
    width: Math.max(1, Math.round(rect.width * s)),
    height: Math.max(1, Math.round(rect.height * s)),
  };
}

/** Expand a rect by `pad` px on every side (grid space), clamped to bounds. */
function expandRect(rect, pad, bounds) {
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  return {
    x,
    y,
    width: Math.min(bounds.width, rect.x + rect.width + pad) - x,
    height: Math.min(bounds.height, rect.y + rect.height + pad) - y,
  };
}

// ─── Pure grid analysis (unit-testable without ffmpeg) ───

/**
 * Build a luminance grid from raw RGBA pixel data (pngjs output shape).
 * @param {{width: number, height: number, data: Uint8Array}} png
 * @returns {{width: number, height: number, lum: Float32Array}}
 */
export function toLuminanceGrid(png) {
  const n = png.width * png.height;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i << 2;
    lum[i] = 0.299 * png.data[j] + 0.587 * png.data[j + 1] + 0.114 * png.data[j + 2];
  }
  return { width: png.width, height: png.height, lum };
}

/**
 * Accumulate per-pixel mean/std across frames (Welford-free two-pass: sums
 * are exact enough at Float64 for ≤60 frames of ≤127K pixels).
 * @returns {{sum: Float64Array, sumSq: Float64Array, count: number, width: number, height: number}}
 */
export function createVarianceAccumulator(width, height) {
  return { sum: new Float64Array(width * height), sumSq: new Float64Array(width * height), count: 0, width, height };
}

/** Add one luminance grid to the accumulator. */
export function accumulateFrame(acc, grid) {
  if (grid.width !== acc.width || grid.height !== acc.height) {
    throw new Error(
      `frame size mismatch: got ${grid.width}×${grid.height}, expected ${acc.width}×${acc.height}`,
    );
  }
  for (let i = 0; i < acc.sum.length; i++) {
    acc.sum[i] += grid.lum[i];
    acc.sumSq[i] += grid.lum[i] * grid.lum[i];
  }
  acc.count++;
}

/** Per-pixel std-dev grid from the accumulator (empty accumulator → throw). */
export function varianceGridOf(acc) {
  if (acc.count === 0) throw new Error("variance accumulator has no frames");
  const std = new Float32Array(acc.sum.length);
  for (let i = 0; i < std.length; i++) {
    const mean = acc.sum[i] / acc.count;
    const variance = Math.max(0, acc.sumSq[i] / acc.count - mean * mean);
    std[i] = Math.sqrt(variance);
  }
  return { width: acc.width, height: acc.height, lum: std };
}

/** Mean |diff| between two grids inside a rect (grid space). */
export function meanAbsDiff(gridA, gridB, rect) {
  let sum = 0;
  let count = 0;
  for (let y = rect.y; y < rect.y + rect.height && y < gridA.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width && x < gridA.width; x++) {
      const i = gridA.width * y + x;
      sum += Math.abs(gridA.lum[i] - gridB.lum[i]);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Fraction of dynamic pixels inside a rect of the variance grid.
 * @param {{width:number,height:number,lum:Float32Array}} varGrid - std-dev grid
 * @param {{x:number,y:number,width:number,height:number}} rect - grid space
 * @param {number} threshold - std above which a pixel is dynamic
 */
export function dynamicRatioInRect(varGrid, rect, threshold) {
  let dyn = 0;
  let total = 0;
  const xEnd = Math.min(rect.x + rect.width, varGrid.width);
  const yEnd = Math.min(rect.y + rect.height, varGrid.height);
  for (let y = Math.max(0, rect.y); y < yEnd; y++) {
    for (let x = Math.max(0, rect.x); x < xEnd; x++) {
      if (varGrid.lum[varGrid.width * y + x] > threshold) dyn++;
      total++;
    }
  }
  return total > 0 ? dyn / total : 0;
}

/**
 * Diagnostic bounding box (percentile) of dynamic pixels inside `region` —
 * the "actual rendered motion position" recorded in gate metrics/evidence.
 * Returns null when the region holds no dynamic pixels.
 */
export function detectMotionBox(varGrid, region, threshold, lowPct = 0.02, highPct = 0.98) {
  const xs = [];
  const ys = [];
  const xEnd = Math.min(region.x + region.width, varGrid.width);
  const yEnd = Math.min(region.y + region.height, varGrid.height);
  for (let y = Math.max(0, region.y); y < yEnd; y++) {
    for (let x = Math.max(0, region.x); x < xEnd; x++) {
      if (varGrid.lum[varGrid.width * y + x] > threshold) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const pick = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  return {
    x: pick(xs, lowPct),
    y: pick(ys, lowPct),
    width: Math.max(1, pick(xs, highPct) - pick(xs, lowPct)),
    height: Math.max(1, pick(ys, highPct) - pick(ys, lowPct)),
  };
}

/**
 * Flood-fill the STRONG-motion pixels connected to the card rect's eroded
 * interior. The card div is clipped to its declared rect, so its content can
 * only appear beyond the rect as a CONNECTED strong-motion extension (scale
 * override, lane crossing); unconnected strong motion is scene background,
 * which legitimately animates (real E2E render: bottom dead zone holds 8.6%
 * strong-motion px, connected 0).
 *
 * @param {{width:number,height:number,lum:Float32Array}} varGrid - std-dev grid
 * @param {{x:number,y:number,width:number,height:number}} expectedGrid - grid space
 * @param {number} erosionGrid - seed erosion, grid px (skips edge ringing)
 * @returns {{component: Uint8Array, size: number}} 1 = pixel in the card's component
 */
export function strongCardComponent(varGrid, expectedGrid, erosionGrid = 1) {
  const { width, height, lum } = varGrid;
  const isStrong = (i) => lum[i] > STRONG_MOTION_THRESHOLD;
  const component = new Uint8Array(width * height);
  const x0 = Math.max(0, expectedGrid.x + erosionGrid);
  const y0 = Math.max(0, expectedGrid.y + erosionGrid);
  const x1 = Math.min(width, expectedGrid.x + expectedGrid.width - erosionGrid);
  const y1 = Math.min(height, expectedGrid.y + expectedGrid.height - erosionGrid);
  const stack = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = width * y + x;
      if (isStrong(i) && !component[i]) {
        component[i] = 1;
        stack.push(i);
      }
    }
  }
  let size = 0;
  while (stack.length > 0) {
    const i = stack.pop();
    size++;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0 && isStrong(i - 1) && !component[i - 1]) {
      component[i - 1] = 1;
      stack.push(i - 1);
    }
    if (x < width - 1 && isStrong(i + 1) && !component[i + 1]) {
      component[i + 1] = 1;
      stack.push(i + 1);
    }
    if (y > 0 && isStrong(i - width) && !component[i - width]) {
      component[i - width] = 1;
      stack.push(i - width);
    }
    if (y < height - 1 && isStrong(i + width) && !component[i + width]) {
      component[i + width] = 1;
      stack.push(i + width);
    }
  }
  return { component, size };
}

/**
 * SAFE-ZONE GATE (pure): presence + protected-zone sweep on a variance grid.
 *
 * Intrusion logic (see module header): (a) a card PRESENT at the declared
 * rect must keep its connected strong-motion component inside rect+tolerance —
 * any connected strong pixel in a zone fails naming that zone; (b) when the
 * card is MISSING from the declared rect, a strong-motion blob ≥ the intrusion
 * ratio inside a zone means the card rendered elsewhere → the zone is named.
 *
 * @param {object} p
 * @param {{width:number,height:number,lum:Float32Array}} p.varGrid
 * @param {number} p.scale - canvas→grid scale (gridWidth / 1080)
 * @param {{x:number,y:number,width:number,height:number}} p.expectedRect - canvas px
 * @returns {{status: "pass"|"fail", detail: string, findings: Array<{zoneId: string|null, kind: string, ratio?: number}>, detectedMotionBox: object|null, metrics: object}}
 */
export function evaluateSafeZoneGate({ varGrid, scale, expectedRect }) {
  const bounds = { width: varGrid.width, height: varGrid.height };
  const expectedGrid = scaleRect(expectedRect, scale);
  const pad = Math.round(EDGE_TOLERANCE_PX * scale);
  const expanded = expandRect(expectedGrid, pad, bounds);
  const erosion = Math.max(1, Math.round(SEED_EROSION_PX * scale));
  const zones = protectedZones();
  const findings = [];
  const zoneMetrics = {};

  // 1. Presence — the card must actually be playing at the declared rect.
  const presenceRatio = dynamicRatioInRect(varGrid, expectedGrid, VARIANCE_DYNAMIC_THRESHOLD);
  const cardPresent = presenceRatio >= CARD_PRESENCE_RATIO;
  if (!cardPresent) {
    findings.push({
      zoneId: null,
      kind: "card-missing",
      detail:
        `no playing card content detected inside the declared rect ` +
        `(canvas ${expectedRect.x},${expectedRect.y} ${expectedRect.width}×${expectedRect.height}; ` +
        `dynamic ratio ${(presenceRatio * 100).toFixed(2)}% < ${(CARD_PRESENCE_RATIO * 100).toFixed(0)}%)`,
    });
  }

  // Per-zone scan of the area OUTSIDE the expanded expected rect.
  const scanZone = (zoneGrid) => {
    let strongCount = 0;
    let total = 0;
    for (let y = Math.max(0, zoneGrid.y); y < Math.min(zoneGrid.y + zoneGrid.height, varGrid.height); y++) {
      for (let x = Math.max(0, zoneGrid.x); x < Math.min(zoneGrid.x + zoneGrid.width, varGrid.width); x++) {
        const inExclusion =
          x >= expanded.x && x < expanded.x + expanded.width && y >= expanded.y && y < expanded.y + expanded.height;
        if (inExclusion) continue;
        total++;
        if (varGrid.lum[varGrid.width * y + x] > STRONG_MOTION_THRESHOLD) strongCount++;
      }
    }
    return { strongCount, total };
  };
  const pushIntrusion = (zone, ratio, kind) => {
    findings.push({
      zoneId: zone.id,
      kind,
      ratio,
      detail:
        `card content intrudes the ${zone.id} ` +
        `(strong-motion ratio ${(ratio * 100).toFixed(2)}% of scanned zone area beyond the declared card rect)`,
    });
  };

  if (cardPresent) {
    // (a) Connected bleed — the clipped card's strong component must stay
    // inside rect+tolerance. Unconnected background motion never fires.
    const { component, size } = strongCardComponent(varGrid, expectedGrid, erosion);
    if (size > 0) {
      for (const zone of zones) {
        const zoneGrid = scaleRect(zone.rect, scale);
        let connected = 0;
        let total = 0;
        for (let y = Math.max(0, zoneGrid.y); y < Math.min(zoneGrid.y + zoneGrid.height, varGrid.height); y++) {
          for (let x = Math.max(0, zoneGrid.x); x < Math.min(zoneGrid.x + zoneGrid.width, varGrid.width); x++) {
            const inExclusion =
              x >= expanded.x && x < expanded.x + expanded.width && y >= expanded.y && y < expanded.y + expanded.height;
            if (inExclusion) continue;
            total++;
            if (component[varGrid.width * y + x]) connected++;
          }
        }
        const ratio = total > 0 ? connected / total : 0;
        zoneMetrics[zone.id] = { ratio, scanned: true };
        if (connected > 0) {
          pushIntrusion(zone, ratio, "zone-intrusion");
        }
      }
      // Diagnostic for the subtitle lane: strong motion in the declared gap
      // band above the lane (crossing signature). Non-gating since the
      // connectivity check already catches a crossing card.
      const lane = zones.find((z) => z.id.startsWith("burned-subtitle"));
      if (lane) {
        const gapBand = scaleRect(subtitleGapBand().rect, scale);
        const gapAboveLane = {
          x: gapBand.x,
          y: gapBand.y + pad,
          width: gapBand.width,
          height: Math.max(1, gapBand.height - pad),
        };
        zoneMetrics[lane.id].gapBandRatio = dynamicRatioInRect(varGrid, gapAboveLane, STRONG_MOTION_THRESHOLD);
      }
    } else {
      // Subtle-motion card: no strong component to trace; presence and the
      // lip gate own any failure here.
      for (const zone of zones) zoneMetrics[zone.id] = { ratio: 0, scanned: false };
    }
  } else {
    // (b) Displaced card — nothing playing at the declared rect, so a strong
    // blob inside a zone IS the card (rendered elsewhere).
    for (const zone of zones) {
      const zoneGrid = scaleRect(zone.rect, scale);
      const { strongCount, total } = scanZone(zoneGrid);
      const ratio = total > 0 ? strongCount / total : 0;
      zoneMetrics[zone.id] = { ratio, scanned: true };
      if (ratio > ZONE_INTRUSION_RATIO) {
        pushIntrusion(zone, ratio, "zone-intrusion");
      }
    }
  }

  const detectedMotionBox = detectMotionBox(
    varGrid,
    expandRect(scaleRect(expectedRect, scale), Math.round(SEARCH_EXPANSION_PX * scale), bounds),
    VARIANCE_DYNAMIC_THRESHOLD,
  );

  const status = findings.length === 0 ? "pass" : "fail";
  const detail =
    status === "pass"
      ? `card present at the declared rect (dynamic ${(presenceRatio * 100).toFixed(1)}%), no protected-zone intrusion`
      : findings.map((f) => f.detail).join("; ");

  return {
    status,
    detail,
    findings,
    detectedMotionBox,
    metrics: {
      presenceRatio,
      zones: zoneMetrics,
      expectedRect,
      detectedMotionBoxCanvas: detectedMotionBox
        ? {
            x: Math.round(detectedMotionBox.x / scale),
            y: Math.round(detectedMotionBox.y / scale),
            width: Math.round(detectedMotionBox.width / scale),
            height: Math.round(detectedMotionBox.height / scale),
          }
        : null,
    },
  };
}

/** Mouth-region rect (canvas px) for a card rect. */
export function mouthRectForCard(cardRect) {
  return {
    x: Math.round(cardRect.x + cardRect.width * MOUTH_REGION_RATIO.x0),
    y: Math.round(cardRect.y + cardRect.height * MOUTH_REGION_RATIO.y0),
    width: Math.round(cardRect.width * (MOUTH_REGION_RATIO.x1 - MOUTH_REGION_RATIO.x0)),
    height: Math.round(cardRect.height * (MOUTH_REGION_RATIO.y1 - MOUTH_REGION_RATIO.y0)),
  };
}

/**
 * LIP GATE (pure): mean TEMPORAL STD of luminance inside the mouth region
 * must reach LIP_MIN_TEMPORAL_STD — a "static face fake video" has nothing
 * but encoder noise there (≤3 std), while any playing talking head spreads
 * the mouth-region pixels far wider (real EchoMimicV3 card: 35.6).
 *
 * Temporal std (not mean inter-frame diff) because 10Hz sampling leaves the
 * mouth still between most sample pairs: the real render's diff mean is 5.2 —
 * under the old fixture-calibrated floor — while its window spread is 10×
 * the noise ceiling.
 *
 * @param {Array<{width:number,height:number,lum:Float32Array}>} grids - sampled frames, time order
 * @param {{x:number,y:number,width:number,height:number}} mouthRectGrid - grid space
 * @returns {{status:"pass"|"fail", detail:string, metrics:object}}
 */
export function evaluateLipGate(grids, mouthRectGrid) {
  if (grids.length < 2) {
    return { status: "fail", detail: "fewer than 2 frames sampled — lip movement unverifiable", metrics: { samples: grids.length } };
  }
  const acc = createVarianceAccumulator(grids[0].width, grids[0].height);
  for (const g of grids) accumulateFrame(acc, g);
  const varGrid = varianceGridOf(acc);
  let sum = 0;
  let count = 0;
  const xEnd = Math.min(mouthRectGrid.x + mouthRectGrid.width, varGrid.width);
  const yEnd = Math.min(mouthRectGrid.y + mouthRectGrid.height, varGrid.height);
  for (let y = Math.max(0, mouthRectGrid.y); y < yEnd; y++) {
    for (let x = Math.max(0, mouthRectGrid.x); x < xEnd; x++) {
      sum += varGrid.lum[varGrid.width * y + x];
      count++;
    }
  }
  const meanStd = count > 0 ? sum / count : 0;

  // Diff series kept as diagnostics (and the sync gate's raw material).
  const energies = [];
  for (let i = 1; i < grids.length; i++) {
    energies.push(meanAbsDiff(grids[i - 1], grids[i], mouthRectGrid));
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const max = Math.max(...energies);
  const activeRatio = energies.filter((e) => e > LIP_ACTIVE_DIFF).length / energies.length;

  const ok = meanStd >= LIP_MIN_TEMPORAL_STD;
  return {
    status: ok ? "pass" : "fail",
    detail: ok
      ? `mouth-region movement present (temporal std ${meanStd.toFixed(1)}, mean inter-frame diff ${mean.toFixed(1)}, active intervals ${(activeRatio * 100).toFixed(0)}%)`
      : `no lip movement detected — static-face video suspected (mouth-region temporal std ${meanStd.toFixed(2)} < ${LIP_MIN_TEMPORAL_STD}, mean inter-frame diff ${mean.toFixed(2)})`,
    metrics: { meanStd, meanDiff: mean, maxDiff: max, activeRatio, intervals: energies.length },
  };
}

// ─── Audio envelope + A/V sync (pure parts) ───

/**
 * RMS energy envelope of PCM samples at `fps` hops.
 * @param {{sampleRate:number, samples:Float32Array}} pcm
 * @param {number} fps - envelope hop rate (Hz)
 * @returns {Float64Array} one RMS value per hop (last partial hop dropped)
 */
export function audioEnvelope(pcm, fps) {
  const hop = Math.max(1, Math.round(pcm.sampleRate / fps));
  const hops = Math.floor(pcm.samples.length / hop);
  const env = new Float64Array(hops);
  for (let h = 0; h < hops; h++) {
    let sumSq = 0;
    for (let i = h * hop; i < (h + 1) * hop; i++) sumSq += pcm.samples[i] * pcm.samples[i];
    env[h] = Math.sqrt(sumSq / hop);
  }
  return env;
}

/**
 * First onset of a series: first sample above ONSET_RATIO × max, as an INDEX
 * on the shared grid (the grid's absolute t0 cancels in the onset difference).
 * Returns null when the series never crosses (its max is 0).
 */
function firstOnsetIndex(arr) {
  let max = 0;
  for (const v of arr) if (v > max) max = v;
  if (max <= 0) return null;
  const thr = max * ONSET_RATIO;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > thr) return i;
  }
  return null;
}

/**
 * A/V SYNC GATE (pure): compare the FIRST speech onset of the TTS audio
 * energy envelope against the first sustained mouth-motion onset.
 *
 * Sign convention: offsetSeconds > 0 means the mouth onset occurs AFTER the
 * audio onset (mouth lags audio / audio leads); < 0 means audio lags mouth.
 *
 * Why onsets, not cross-correlation: the real mouth series is dominated by
 * sparse head-movement spikes over a near-silent baseline, which produces a
 * FLAT correlation landscape (real E2E render: peak 0.305 vs 0.280 at lag 0 —
 * pass/fail decided by noise), while the same data's onset alignment measures
 * +33ms. The correlation approach was replaced after that evidence.
 *
 * Quantization: both series share one grid (SYNC_ENVELOPE_FPS), so bin
 * rounding mostly cancels; the residual ±50ms is inside the tolerance budget
 * (see AV_SYNC_TOLERANCE_SECONDS).
 *
 * @param {object} p
 * @param {Array<{time:number, energy:number}>} p.mouthSeries - video-time series (one per sampled frame ≥2nd)
 * @param {Array<{time:number, energy:number}>} p.audioSeries - video-time envelope (already trimmed to the mouth span by the caller when the card window starts mid-scene)
 * @param {number} [p.tolerance] - default AV_SYNC_TOLERANCE_SECONDS
 * @returns {{status:"pass"|"fail"|"skip", detail:string, metrics:object}}
 */
export function evaluateSyncGate({ mouthSeries, audioSeries, tolerance = AV_SYNC_TOLERANCE_SECONDS }) {
  const n = Math.min(mouthSeries.length, audioSeries.length);
  if (n < 4) {
    return { status: "skip", detail: "too few aligned samples for a sync spot-check", metrics: { samples: n } };
  }
  const period = 1 / SYNC_ENVELOPE_FPS;
  const t0 = Math.min(mouthSeries[0].time, audioSeries[0].time);
  const index = (t) => Math.round((t - t0) / period);
  const gridLen =
    Math.max(index(mouthSeries[mouthSeries.length - 1].time), index(audioSeries[audioSeries.length - 1].time)) + 1;
  const m = new Float64Array(gridLen);
  const a = new Float64Array(gridLen);
  for (const s of mouthSeries) m[index(s.time)] = Math.max(m[index(s.time)], s.energy);
  for (const s of audioSeries) a[index(s.time)] = Math.max(a[index(s.time)], s.energy);

  let aMax = 0;
  for (const v of a) if (v > aMax) aMax = v;
  if (aMax <= 0) {
    return { status: "fail", detail: "audio envelope is flat — scene TTS audio has no usable energy", metrics: { samples: n } };
  }
  let mMax = 0;
  for (const v of m) if (v > mMax) mMax = v;
  if (mMax <= LIP_ACTIVE_DIFF) {
    return {
      status: "skip",
      detail:
        `mouth signal flat (max inter-frame diff ≤ ${LIP_ACTIVE_DIFF}) — sync not measurable ` +
        `(the lip gate already fails this scene)`,
      metrics: { samples: n },
    };
  }

  const mOnset = firstOnsetIndex(m);
  const aOnset = firstOnsetIndex(a);
  if (mOnset === null || aOnset === null) {
    return {
      status: "skip",
      detail: "no measurable onset in the mouth/audio series — sync not measurable",
      metrics: { samples: n },
    };
  }
  const offset = (mOnset - aOnset) * period;
  const ok = Math.abs(offset) <= tolerance + 1e-9;
  return {
    status: ok ? "pass" : "fail",
    detail: ok
      ? `mouth onset aligns with TTS onset within tolerance (offset ${offset >= 0 ? "+" : ""}${offset.toFixed(3)}s, ±${tolerance}s)`
      : `audio/mouth misalignment ${offset >= 0 ? "+" : ""}${offset.toFixed(3)}s ` +
        `(audio ${offset >= 0 ? "leads" : "lags"} mouth) beyond ±${tolerance}s tolerance`,
    metrics: {
      offsetSeconds: offset,
      tolerance,
      samples: n,
      mouthOnsetSeconds: t0 + mOnset * period,
      audioOnsetSeconds: t0 + aOnset * period,
    },
  };
}

// ─── I/O helpers (ffmpeg — one scaled pass per window) ───

/** ffprobe the video's pixel dimensions (audit scale derives from width). */
export function probeVideoSize(videoPath) {
  const raw = execFileSync(
    FFPROBE_PATH,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", videoPath],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
  const [width, height] = raw.split(",").map((v) => parseInt(v, 10));
  if (!width || !height) throw new Error(`cannot probe video dimensions: ${videoPath}`);
  return { width, height };
}

/**
 * Sample uniformly-spaced frames of one audit window at the audit working
 * resolution. One ffmpeg pass (`fps` + `scale` — index-selective native-res
 * extraction in lib/frame-extract.mjs does not fit scaled uniform sampling).
 * The written PNGs ARE the gate evidence frames.
 *
 * @param {object} p
 * @param {string} p.videoPath
 * @param {number} p.fromSeconds - window start on the video timeline
 * @param {number} p.durationSeconds
 * @param {string} p.outDir - evidence dir (created)
 * @param {string} p.prefix - evidence file name prefix
 * @param {number} [p.fps] - AUDIT_SAMPLE_FPS
 * @param {number} [p.width] - AUDIT_FRAME_WIDTH
 * @returns {string[]} absolute frame paths, time order
 */
export function sampleWindowFrames({ videoPath, fromSeconds, durationSeconds, outDir, prefix, fps = AUDIT_SAMPLE_FPS, width = AUDIT_FRAME_WIDTH }) {
  mkdirSync(outDir, { recursive: true });
  const dur = Math.max(0.1, durationSeconds);
  // Cap the frame count by shrinking the sampled span from the window START
  // (speaking onsets — what every gate cares about — stay covered).
  const effDuration = Math.min(dur, MAX_AUDIT_FRAMES_PER_WINDOW / fps);
  const scaleArg = `fps=${fps},scale=${width}:-2`;
  execFileSync(
    FFMPEG_PATH,
    [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      fromSeconds.toFixed(3),
      "-t",
      effDuration.toFixed(3),
      "-i",
      videoPath,
      "-vf",
      scaleArg,
      "-start_number",
      "0",
      join(outDir, `${prefix}-%04d.png`),
    ],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 120000 },
  );
  return readdirSync(outDir)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(".png"))
    .sort()
    .map((f) => join(outDir, f));
}

// ─── Scene audit orchestration ───

/**
 * Audit ONE avatar scene against a composed video (three gates).
 *
 * @param {object} p
 * @param {string} p.videoPath - composed 1080×1920 render
 * @param {number} p.sceneId
 * @param {number} p.sceneStartSeconds - scene start on the video timeline
 * @param {number} p.sceneAudioDurationSeconds - scene TTS audio duration
 * @param {Array<{from:number,to:number>}|null} p.presentIntervals - scene-local card on-screen windows
 * @param {string|null} p.audioPath - scene TTS audio (sync gate; null → sync skips)
 * @param {string} p.evidenceDir - per-scene evidence directory
 * @param {string} [p.position] - avatar position (only "right-card" is rendered)
 * @returns {Promise<object>} { sceneId, ok, gates, evidenceDir, metrics }
 */
export async function auditScene({
  videoPath,
  sceneId,
  sceneStartSeconds,
  sceneAudioDurationSeconds,
  presentIntervals,
  audioPath,
  evidenceDir,
  position = RENDERED_POSITION,
}) {
  if (position !== RENDERED_POSITION) {
    // Fail-closed: no other position has auditable geometry yet.
    const gate = {
      gate: "safe-zone",
      status: "fail",
      detail: `avatar position "${position}" has no auditable geometry — rendered positions: ${RENDERED_POSITION}`,
      evidence: [],
      metrics: {},
    };
    return { sceneId, ok: false, gates: [gate], evidenceDir, metrics: {} };
  }

  const { width } = probeVideoSize(videoPath);
  const scale = AUDIT_FRAME_WIDTH / width;
  const expectedRect = AVATAR_CARD_RECT; // canvas px — the declared geometry

  // Audit windows = present intervals (or the whole audio span) in video time.
  const windows = (presentIntervals?.length ? presentIntervals : [{ from: 0, to: sceneAudioDurationSeconds }])
    .map((iv) => ({
      from: Math.max(0, sceneStartSeconds + iv.from),
      to: sceneStartSeconds + iv.to,
    }))
    .filter((w) => w.to - w.from > 0.2);

  if (windows.length === 0) {
    throw new Error(
      `Scene ${sceneId}: no auditable on-screen window (present intervals empty or shorter than 0.2s)`,
    );
  }

  // Sample frames per window + decode into luminance grids.
  const grids = [];
  const framePaths = [];
  const frameTimes = [];
  const pngjs = await import("pngjs");
  const { PNG } = pngjs;
  for (let w = 0; w < windows.length; w++) {
    const win = windows[w];
    const paths = sampleWindowFrames({
      videoPath,
      fromSeconds: win.from,
      durationSeconds: win.to - win.from,
      outDir: evidenceDir,
      prefix: `scene-${sceneId}-w${w}`,
    });
    if (paths.length === 0) {
      throw new Error(`Scene ${sceneId}: ffmpeg produced no audit frames for window ${w} — is the video readable?`);
    }
    paths.forEach((p, i) => {
      const png = PNG.sync.read(readFileSync(p));
      grids.push(toLuminanceGrid(png));
      framePaths.push(p);
      // Frame k sits at win.from + k/fps (ffmpeg fps filter grid); a diff
      // pair (k-1, k) is stamped at the interval MIDPOINT — same convention
      // as the audio envelope below, so an aligned fixture measures 0 offset.
      frameTimes.push(win.from + (i + 0.5) / AUDIT_SAMPLE_FPS);
    });
  }
  if (grids.length < MIN_AUDIT_FRAMES) {
    throw new Error(
      `Scene ${sceneId}: only ${grids.length} audit frames sampled (< ${MIN_AUDIT_FRAMES}) — window too short to verify`,
    );
  }

  const gridW = grids[0].width;
  const gridH = grids[0].height;
  const acc = createVarianceAccumulator(gridW, gridH);
  for (const g of grids) accumulateFrame(acc, g);
  const varGrid = varianceGridOf(acc);

  // GATE 1 — safe zone (presence + protected-zone sweep).
  const safeZone = evaluateSafeZoneGate({ varGrid, scale, expectedRect });
  const gateSafeZone = {
    gate: "safe-zone",
    status: safeZone.status,
    detail: safeZone.detail,
    findings: safeZone.findings,
    evidence: framePaths.slice(0, 6),
    metrics: safeZone.metrics,
  };

  // GATE 2 — lip movement inside the mouth region.
  const mouthGrid = scaleRect(mouthRectForCard(expectedRect), scale);
  const lip = evaluateLipGate(grids, mouthGrid);
  const gateLip = {
    gate: "lip-sync",
    status: lip.status,
    detail: lip.detail,
    evidence: framePaths.slice(0, 6),
    metrics: lip.metrics,
  };

  // GATE 3 — A/V sync: TTS envelope (video time) vs mouth diff series.
  const mouthSeries = grids.slice(1).map((g, i) => ({ time: frameTimes[i], energy: meanAbsDiff(grids[i], g, mouthGrid) }));
  let gateSync;
  if (!audioPath || !existsSync(audioPath)) {
    gateSync = {
      gate: "av-sync",
      status: "skip",
      detail: `scene TTS audio not available (${audioPath ?? "no path"}) — sync not checked`,
      evidence: [],
      metrics: {},
    };
  } else {
    const workWav = join(evidenceDir, `scene-${sceneId}-audio-8k.wav`);
    decodeToWavFile(audioPath, workWav, 8000);
    const pcm = readWavPcm(workWav);
    const env = audioEnvelope(pcm, SYNC_ENVELOPE_FPS);
    // The scene's TTS audio starts at the scene's timeline offset; each
    // envelope hop is stamped at its MIDPOINT (matches the mouth-diff pairs).
    const audioSeries = Array.from(env, (energy, i) => ({
      time: sceneStartSeconds + (i + 0.5) / SYNC_ENVELOPE_FPS,
      energy,
    }));
    // The sync gate compares FIRST onsets, so when the card's on-screen window
    // starts mid-scene the audio must be trimmed to the same span — an onset
    // from before the window would otherwise count as "audio leading".
    const mFirst = mouthSeries[0].time;
    const mLast = mouthSeries[mouthSeries.length - 1].time;
    const audioInWindow = audioSeries.filter((s) => s.time >= mFirst - 0.5 / SYNC_ENVELOPE_FPS && s.time <= mLast + 0.5 / SYNC_ENVELOPE_FPS);
    const sync = evaluateSyncGate({
      mouthSeries,
      audioSeries: audioInWindow.length >= 4 ? audioInWindow : audioSeries,
    });
    gateSync = { gate: "av-sync", status: sync.status, detail: sync.detail, evidence: framePaths.slice(0, 6), metrics: sync.metrics };
  }

  const gates = [gateSafeZone, gateLip, gateSync];
  const ok = gates.every((g) => g.status !== "fail");
  return {
    sceneId,
    ok,
    gates,
    evidenceDir,
    metrics: {
      framesSampled: grids.length,
      windows,
      expectedRect,
      detectedMotionBoxCanvas: safeZone.metrics.detectedMotionBoxCanvas,
    },
  };
}

// ─── Package-level audit (CLI backend) ───

/**
 * Read every scene's duration for timeline offsets: audio/scene-durations.json
 * first (written by the TTS chain for ALL scenes), falling back to per-scene
 * scene-*.tts-meta.json. Fail-closed: a scene without any duration record
 * makes every later offset wrong.
 *
 * @param {string} audioDir - output/{pipelineId}/audio
 * @param {number} expectedSceneCount - scene count in the composed video
 * @returns {Array<{sceneId:number, duration:number}>} ordered by sceneId
 */
export function readSceneDurationsForTimeline(audioDir, expectedSceneCount) {
  const byId = new Map();
  const durationsPath = join(audioDir, "scene-durations.json");
  if (existsSync(durationsPath)) {
    try {
      const all = JSON.parse(readFileSync(durationsPath, "utf8"));
      for (const entry of Array.isArray(all) ? all : all?.scenes ?? []) {
        if (typeof entry?.sceneId === "number" && typeof entry?.duration === "number" && entry.duration > 0) {
          byId.set(entry.sceneId, entry.duration);
        }
      }
    } catch {
      // corrupt file → fall through to tts-meta scan
    }
  }
  if (byId.size < expectedSceneCount && existsSync(audioDir)) {
    for (const f of readdirSync(audioDir)) {
      const m = f.match(/^scene-(\d+)\.tts-meta\.json$/);
      if (!m) continue;
      const sceneId = parseInt(m[1], 10);
      if (byId.has(sceneId)) continue;
      try {
        const meta = JSON.parse(readFileSync(join(audioDir, f), "utf8"));
        if (typeof meta.duration === "number" && meta.duration > 0) byId.set(sceneId, meta.duration);
      } catch {
        // unreadable meta → the completeness check below reports it
      }
    }
  }
  const scenes = [...byId.entries()]
    .map(([sceneId, duration]) => ({ sceneId, duration }))
    .sort((a, b) => a.sceneId - b.sceneId);
  if (scenes.length < expectedSceneCount) {
    throw new Error(
      `only ${scenes.length} of ${expectedSceneCount} scene durations found in ${audioDir} ` +
        `(scene-durations.json / scene-*.tts-meta.json) — scene timeline offsets cannot be trusted; ` +
        `run the TTS pipeline first`,
    );
  }
  return scenes;
}

/**
 * Audit every avatar scene of a package against the composed render.
 * Reads the plan (kind: digital-human-plan, ticket-03 schema) for the avatar
 * scene list / audio paths / present intervals, and the scene durations for
 * timeline offsets. Writes the machine-readable result JSON + per-scene
 * evidence frames; never touches scene-data or the plan.
 *
 * @param {object} p
 * @param {object} p.plan - parsed digital-human-plan.json
 * @param {string} p.videoPath - composed render to audit
 * @param {string} p.outputDir - output/{pipelineId} (evidence + result JSON live here)
 * @param {number} p.totalSceneCount - scenes in the composed video (timeline)
 * @param {string} [p.audioDir] - defaults to {outputDir}/audio
 * @returns {Promise<object>} result (also written to disk)
 */
export async function auditDigitalHumanPackage({ plan, videoPath, outputDir, totalSceneCount, audioDir }) {
  if (plan?.kind !== "digital-human-plan") {
    throw new Error(`not a digital-human-plan (kind=${JSON.stringify(plan?.kind)})`);
  }
  const audio = audioDir ?? join(outputDir, "audio");
  const durations = readSceneDurationsForTimeline(audio, totalSceneCount);
  const timeline = sceneTimelineFromDurations(durations);

  const rootEvidence = join(outputDir, "avatar", "frame-audit");
  mkdirSync(rootEvidence, { recursive: true });
  const sceneResults = [];
  for (const planScene of plan.scenes) {
    const entry = timeline.find((t) => t.sceneId === planScene.sceneId);
    const evidenceDir = join(rootEvidence, `scene-${planScene.sceneId}`);
    const result = await auditScene({
      videoPath,
      sceneId: planScene.sceneId,
      sceneStartSeconds: entry.offset,
      sceneAudioDurationSeconds: planScene.durationSeconds,
      presentIntervals: planScene.presentIntervals ?? null,
      audioPath: planScene.audioPath ?? null,
      evidenceDir,
    });
    sceneResults.push(result);
  }

  const failedGates = sceneResults.flatMap((r) =>
    r.gates.filter((g) => g.status === "fail").map((g) => ({ sceneId: r.sceneId, gate: g.gate, detail: g.detail })),
  );
  const result = {
    schemaVersion: 1,
    kind: "digital-human-frame-audit",
    pipelineId: plan.pipelineId,
    videoPath,
    auditedAt: new Date().toISOString(),
    scenes: sceneResults,
    totals: {
      scenes: sceneResults.length,
      scenesPassed: sceneResults.filter((r) => r.ok).length,
      scenesFailed: sceneResults.filter((r) => !r.ok).length,
      failedGates,
    },
    ok: failedGates.length === 0,
  };
  const resultPath = join(outputDir, "avatar", FRAME_AUDIT_RESULT_NAME);
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  return { ...result, resultPath };
}

/** Minimal local timeline builder (same frame math as lib/timeline.mjs — the
 *  audit never mutates the timeline, it only needs scene start offsets). */
function sceneTimelineFromDurations(durations) {
  const FPS = 30;
  const SCENE_BUFFER = 0.5;
  const timeline = [];
  let offset = 0;
  for (const { sceneId, duration } of durations) {
    const clipFrames = Math.max(1, Math.ceil((duration + SCENE_BUFFER) * FPS - 1e-6));
    timeline.push({ sceneId, offset, clipDuration: clipFrames / FPS });
    offset += clipFrames / FPS;
  }
  return timeline;
}
