/**
 * Temporal Focus (#101 P8b) — windowed multi-frame focus analysis for video
 * backgrounds, plus pure canvas-transformation of any focus artifact.
 *
 * Schema boundary (issue acceptance): image `baseFocus`, video `posterFocus`
 * and video `temporalFocus` are distinct artifacts. A temporalFocus carries
 * `kind: "temporal"`, per-frame `evidence` with source millisecond timecodes,
 * and a deterministic aggregation (`stableProtectedRegions`, `subjectMotion`);
 * nothing in this module mutates a base/poster focus object.
 *
 * Sampling: `samplingProfile.frameCount` (default 4, clamped to 3–5) frames
 * evenly spaced across the P4 window, boundaries included — never the first
 * frame alone. Per-frame analysis reuses the existing Focus worker
 * (focus_detector.py via visual-analyzer.detectFocus) unchanged.
 *
 * Caching: results follow the #100 unified envelope protocol, keyed by
 * source fingerprint + window + sampling + TEMPORAL_FOCUS_VERSION. Degraded
 * analyses are refused at the cache layer (same policy as vlm-cache).
 *
 * Consumer contract: `transformedFocus` output is designed as the `focus`
 * input of the future pure `resolveLayout({ focus, template, textBoxes,
 * safeZones, businessGoal })` (issue #94 / scene visual intent). No template
 * integration is wired here by design (issue non-goal).
 *
 * Window: callers pass the P4 window (asset.window from probeMedia — #69);
 * this module samples it as given and does not re-probe the video.
 *
 * @module temporal-focus
 */

import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { fileFingerprint } from "./vlm-cache.mjs";
import { getCachedResult, writeCachedResult, VLM_CACHE_PIPELINE_VERSION } from "./vlm-cache.mjs";

export const TEMPORAL_FOCUS_VERSION = "v1-2026-09-05";

const FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";

/**
 * Compute the cache key for one temporal focus analysis (#100 protocol).
 *
 * @param {{videoPath: string, startMs: number, endMs: number,
 *          samplingProfile?: {frameCount?: number}}} req
 * @returns {Promise<string>} 64-char hex sha256
 */
export async function computeTemporalFocusCacheKey(req) {
  const frameCount = clampFrameCount(req.samplingProfile?.frameCount);
  const h = createHash("sha256");
  h.update(TEMPORAL_FOCUS_VERSION + "\n");
  // Shared analysis-pipeline version (P7 protocol) — bumping it in
  // vlm-cache.mjs invalidates every analysis cache family together.
  h.update(VLM_CACHE_PIPELINE_VERSION + "\n");
  h.update(fileFingerprint(req.videoPath) + "\n");
  h.update(`${Math.round(req.startMs)}-${Math.round(req.endMs)}\n`);
  h.update(`${frameCount}\n`);
  return h.digest("hex");
}

/**
 * Read a cached temporal focus result (envelope protocol). Returns
 * `{ data, meta }` with `meta.cacheHit = true`, or null on miss/corruption.
 */
export function getCachedTemporalFocus(cacheDir, key) {
  return getCachedResult(cacheDir, key);
}

/**
 * Write a temporal focus result. Degraded analyses are not persisted —
 * a rerun must retry rather than pin a transient failure.
 */
export function writeCachedTemporalFocus(cacheDir, key, opts) {
  if (opts?.data?.status === "degraded") {
    console.warn("  ⚠️  Temporal focus cache: not persisting degraded analysis");
    return;
  }
  writeCachedResult(cacheDir, key, {
    ...opts,
    meta: { ...(opts?.meta || {}), temporalFocusVersion: TEMPORAL_FOCUS_VERSION },
  });
}

function clampFrameCount(n) {
  const v = Math.round(Number(n) || 4);
  return Math.min(5, Math.max(3, v));
}

function sampleTimes(startMs, endMs, frameCount) {
  if (endMs <= startMs) return Array.from({ length: frameCount }, () => startMs);
  return Array.from({ length: frameCount }, (_, i) =>
    Math.round(startMs + ((endMs - startMs) * i) / (frameCount - 1)),
  );
}

/**
 * Extract single frames at the given millisecond timecodes (real impl).
 * Returns absolute PNG paths in a temp directory the caller owns.
 */
async function extractFramesReal(videoPath, timesMs) {
  const dir = mkdtempSync(join(tmpdir(), "temporal-focus-frames-"));
  const paths = [];
  try {
    for (let i = 0; i < timesMs.length; i++) {
      const out = join(dir, `frame-${i}.png`);
      execFileSync(
        FFMPEG_FULL,
        ["-y", "-ss", `${timesMs[i] / 1000}`, "-i", videoPath, "-frames:v", "1", out],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      paths.push(out);
    }
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`frame_extraction_failed: ${err.message}`);
  }
  return { dir, paths };
}

/**
 * Analyze focus across a video time window (#101).
 *
 * @param {string} videoPath
 * @param {{startMs: number, endMs: number,
 *          samplingProfile?: {frameCount?: number},
 *          cacheDir?: string|null,
 *          deps?: {extractFrames?: Function, detectFocus?: Function}}} opts
 * @returns {Promise<object>} temporalFocus artifact
 */
export async function analyzeTemporalFocus(videoPath, opts = {}) {
  const { startMs, endMs } = opts;
  const deps = opts.deps || {};
  const usingInjectedExtract = !!deps.extractFrames;
  const extractFrames = deps.extractFrames || extractFramesReal;
  // Default to the production Focus worker (issue: "复用现有 Focus worker").
  // Dynamic import keeps the module loadable without the Python env for
  // cache-served callers and avoids import cycles.
  const detectFocus = deps.detectFocus ?? (await import("./visual-analyzer.mjs")).detectFocus;
  const frameCount = clampFrameCount(opts.samplingProfile?.frameCount);

  const cacheDir =
    opts.cacheDir && process.env.TEMPORAL_FOCUS_CACHE_DISABLED !== "1" ? opts.cacheDir : null;
  let cacheKey = null;
  if (cacheDir) {
    try {
      cacheKey = await computeTemporalFocusCacheKey({
        videoPath,
        startMs,
        endMs,
        samplingProfile: { frameCount },
      });
      const cached = getCachedTemporalFocus(cacheDir, cacheKey);
      if (cached) {
        console.log(
          `  💾 Temporal focus cache hit: ${videoPath} (${startMs}-${endMs}ms, analyzed ${cached.meta.generatedAt || "unknown"})`,
        );
        return cached.data;
      }
    } catch {
      // Cache read problems never block analysis
    }
  }

  const t0 = Date.now();
  let framePaths;
  let tmpDir = null;
  try {
    const extracted = await extractFrames(videoPath, sampleTimes(startMs, endMs, frameCount));
    // Real impl returns {dir, paths}; injected fakes may return bare paths.
    framePaths = Array.isArray(extracted) ? extracted : extracted.paths;
    tmpDir = Array.isArray(extracted) ? null : extracted.dir;
  } catch (err) {
    // Degraded results are never persisted (writeCachedTemporalFocus
    // refuses them) — a rerun retries extraction.
    return {
      kind: "temporal",
      status: "degraded",
      errorCode: "frame_extraction_failed",
      window: { startMs, endMs },
      sampling: { frameCount, profile: "even" },
      evidence: [],
      stableProtectedRegions: [],
      subjectMotion: { level: "none", maxDisplacement: 0 },
    };
  }

  const times = sampleTimes(startMs, endMs, frameCount);
  const evidence = [];
  try {
    for (let i = 0; i < framePaths.length; i++) {
      const focus = await detectFocus(framePaths[i]);
      evidence.push({
        frameId: i,
        timeMs: times[i],
        status: focus?.status ?? "degraded",
        errorCode: focus?.errorCode ?? null,
        frame: focus?.frame ?? null,
        protectedRegions: focus?.protectedRegions ?? [],
        saliency: focus?.saliency ?? { available: false, dispersion: 0, centroid: [0.5, 0.5] },
      });
    }
  } finally {
    // Only the ffmpeg-owned temp dir is cleaned here — injected test
    // extractors may write frames into caller-owned directories.
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }

  const artifact = aggregateFrameEvidence(evidence, { startMs, endMs });

  if (cacheDir && cacheKey) {
    writeCachedTemporalFocus(cacheDir, cacheKey, {
      data: artifact,
      meta: { durationMs: Date.now() - t0 },
    });
  }
  return artifact;
}

/**
 * Deterministic aggregation of per-frame focus evidence into the
 * temporalFocus artifact. Pure — exported for direct unit testing.
 *
 * @param {Array<{frameId: number, timeMs: number, status: string, errorCode: ?string,
 *                frame: ?object, protectedRegions: Array, saliency: object}>} evidence
 * @param {{startMs: number, endMs: number, frameCount?: number}} window
 */
export function aggregateFrameEvidence(evidence, window) {
  const usable = evidence.filter((e) => e.status === "ok" || e.status === "partial");

  // ── Stable protected regions: cross-frame IoU clustering ──
  // Only usable frames vote — degraded frames carry no trustworthy regions.
  const groups = [];
  for (const e of usable) {
    for (const region of e.protectedRegions || []) {
      const g = groups.find((c) => c.kind === region.kind && iou(c.meanRect, region.rect) >= 0.4);
      if (g) {
        g.members.push(region.rect);
        g.frameIds.push(e.frameId);
        g.meanRect = meanRect(g.members);
      } else {
        groups.push({
          kind: region.kind,
          meanRect: region.rect,
          members: [region.rect],
          frameIds: [e.frameId],
        });
      }
    }
  }
  const stableThreshold = Math.max(2, Math.ceil(usable.length / 2));
  const stableProtectedRegions =
    usable.length === 0
      ? []
      : groups
          .filter((g) => g.frameIds.length >= stableThreshold)
          .map((g) => ({
            rect: g.meanRect,
            kind: g.kind,
            presenceRatio: round(g.frameIds.length / usable.length),
            frameIds: g.frameIds,
          }));

  // ── Subject motion: max displacement of per-frame subject centroids ──
  const centroids = usable
    .map((e) => {
      if (e.saliency?.available) return e.saliency.centroid;
      if ((e.protectedRegions || []).length > 0) {
        const rs = e.protectedRegions;
        return [
          rs.reduce((s, r) => s + r.rect[0] + r.rect[2] / 2, 0) / rs.length,
          rs.reduce((s, r) => s + r.rect[1] + r.rect[3] / 2, 0) / rs.length,
        ];
      }
      return null;
    })
    .filter(Boolean);
  let maxDisplacement = 0;
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      maxDisplacement = Math.max(
        maxDisplacement,
        Math.hypot(centroids[i][0] - centroids[j][0], centroids[i][1] - centroids[j][1]),
      );
    }
  }
  maxDisplacement = round(maxDisplacement);
  // >10% of the frame dimension of travel inside one window means a moving
  // subject — no fixed safe text area can be derived from this window.
  const level = centroids.length === 0 ? "none" : maxDisplacement > 0.1 ? "moving" : "static";

  // ── Status: one usable frame keeps the window usable ──
  let status;
  let errorCode = null;
  if (usable.length > 0) {
    status = "ok";
  } else if (evidence.some((e) => e.status === "low_information")) {
    status = "low_information";
  } else {
    status = "degraded";
    errorCode = evidence[0]?.errorCode || "frame_analysis_failed";
  }

  return {
    kind: "temporal",
    status,
    errorCode,
    // Aggregate-level frame geometry: all frames come from the same video,
    // so the first usable frame's dimensions describe the source canvas for
    // transformedFocus. Null only when no frame was analyzed at all.
    frame: (usable[0] || evidence[0] || {}).frame ?? null,
    window: { startMs: window.startMs, endMs: window.endMs },
    sampling: {
      frameCount: evidence.length,
      profile: "even",
    },
    evidence,
    stableProtectedRegions,
    subjectMotion: { level, maxDisplacement },
  };
}

/**
 * Transform a focus artifact's geometry from source frame coordinates to a
 * target canvas (9:16, 16:9, 1:1, …). Pure and deterministic.
 *
 * Accepts baseFocus/posterFocus (uses `protectedRegions`) or temporalFocus
 * (uses `stableProtectedRegions` — the per-frame evidence is not transformed;
 * any derived coordinate remains traceable to source frames via frameIds).
 *
 * @param {{kind?: string, frame: {width: number, height: number},
 *          protectedRegions?: Array, stableProtectedRegions?: Array,
 *          saliency?: object}} focus
 * @param {{targetAspect?: number, fit?: "cover"|"contain",
 *          cropPolicy?: "center"|"saliency"}} opts
 */
export function transformedFocus(focus, opts = {}) {
  const targetAspect = opts.targetAspect ?? 9 / 16;
  const fit = opts.fit ?? "cover";
  const cropPolicy = opts.cropPolicy ?? "center";

  if (!focus.frame?.width || !focus.frame?.height) {
    throw new Error(
      "transformedFocus requires a focus artifact with frame dimensions — degraded/empty analyses carry no geometry",
    );
  }
  const { width: W, height: H } = focus.frame;
  const sourceAspect = W / H;
  const regions =
    (focus.kind === "temporal" ? focus.stableProtectedRegions : focus.protectedRegions) || [];

  let cropRect; // normalized [x, y, w, h] within the source frame
  if (fit === "cover") {
    if (sourceAspect > targetAspect) {
      const cw = targetAspect / sourceAspect;
      const cx =
        cropPolicy === "saliency" && focus.saliency?.available
          ? clamp(focus.saliency.centroid[0] - cw / 2, 0, 1 - cw)
          : (1 - cw) / 2;
      cropRect = [round(cx), 0, round(cw), 1];
    } else {
      const ch = sourceAspect / targetAspect;
      const cy =
        cropPolicy === "saliency" && focus.saliency?.available
          ? clamp(focus.saliency.centroid[1] - ch / 2, 0, 1 - ch)
          : (1 - ch) / 2;
      cropRect = [0, round(cy), 1, round(ch)];
    }
  } else {
    cropRect = [0, 0, 1, 1];
  }

  // Output canvas: height normalized to 1080 for a concrete pixel frame.
  const outH = 1080;
  const outW = Math.round(outH * targetAspect);

  let mapPoint;
  if (fit === "cover") {
    const [cx, cy, cw, ch] = cropRect;
    mapPoint = (x, y) => [(x - cx) / cw, (y - cy) / ch];
  } else {
    // Contain: letterbox. Content scale s (pixel units), centered offsets.
    const s = Math.min(outW / W, outH / H);
    const ox = (outW - W * s) / 2;
    const oy = (outH - H * s) / 2;
    mapPoint = (x, y) => [(x * W * s + ox) / outW, (y * H * s + oy) / outH];
  }

  const protectedRegions = [];
  const droppedRegions = [];
  for (const region of regions) {
    const [x, y, w, h] = region.rect;
    // Visible fraction in source coords (cover may crop a region away).
    const [ix, iy] = intersectExtent([x, y, w, h], cropRect);
    const visibleRatio = (ix * iy) / (w * h);
    if (visibleRatio < 0.3) {
      droppedRegions.push({ ...region, visibleRatio: round(visibleRatio) });
      continue;
    }
    const [nx1, ny1] = mapPoint(x, y);
    const [nx2, ny2] = mapPoint(x + w, y + h);
    protectedRegions.push({
      ...region,
      rect: [round(nx1), round(ny1), round(nx2 - nx1), round(ny2 - ny1)],
      visibleRatio: round(visibleRatio),
    });
  }

  const saliency = focus.saliency?.available
    ? {
        ...focus.saliency,
        centroid: mapPoint(focus.saliency.centroid[0], focus.saliency.centroid[1]).map(round),
      }
    : { ...focus.saliency };

  return {
    kind: focus.kind,
    frame: {
      width: outW,
      height: outH,
      orientation: outW > outH ? "landscape" : "portrait",
      orientationNormalized: true,
    },
    crop: { fit, rect: cropRect },
    protectedRegions,
    droppedRegions,
    saliency,
  };
}

// Intersection width/height of two normalized rects [x, y, w, h] (0 if none)
function intersectExtent(a, b) {
  const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return [iw, ih];
}

function iou(a, b) {
  const [iw, ih] = intersectExtent(a, b);
  const inter = iw * ih;
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

function meanRect(rects) {
  const avg = [0, 1, 2, 3].map((k) => rects.reduce((s, r) => s + r[k], 0) / rects.length);
  return avg.map(round);
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
