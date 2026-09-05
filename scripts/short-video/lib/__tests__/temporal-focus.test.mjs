import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  TEMPORAL_FOCUS_VERSION,
  aggregateFrameEvidence,
  analyzeTemporalFocus,
  computeTemporalFocusCacheKey,
  getCachedTemporalFocus,
  writeCachedTemporalFocus,
  transformedFocus,
} from "../temporal-focus.mjs";

// ─── #101 P8b: temporal focus for video backgrounds ───
//
// Schema boundary (issue acceptance): baseFocus (image), posterFocus (video
// poster frame) and temporalFocus (windowed multi-frame aggregate) are
// distinct artifacts. temporalFocus carries `kind: "temporal"` and per-frame
// evidence with source millisecond timecodes; nothing here writes into a
// base/poster focus object.

const okFrame = (overrides = {}) => ({
  status: "ok",
  errorCode: null,
  frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
  protectedRegions: [],
  saliency: { available: true, dispersion: 0.3, centroid: [0.5, 0.5] },
  ...overrides,
});

const faceRect = (x, y, w = 0.1, h = 0.15) => ({
  rect: [x, y, w, h],
  kind: "face",
  confidence: null,
  confidenceKind: "not_provided",
});

describe("aggregateFrameEvidence (#101)", () => {
  it("static composition: stable protected regions and low motion", () => {
    // Static product shot: same face region in all frames, saliency steady
    const evidence = [0, 1, 2, 3].map((i) =>
      okFrame({
        protectedRegions: [faceRect(0.4, 0.3)],
        saliency: { available: true, dispersion: 0.4, centroid: [0.45, 0.35] },
      }),
    );
    const artifact = aggregateFrameEvidence(evidence, { startMs: 0, endMs: 8000 });
    expect(artifact.status).toBe("ok");
    expect(artifact.subjectMotion.level).toBe("static");
    expect(artifact.stableProtectedRegions).toHaveLength(1);
    expect(artifact.stableProtectedRegions[0].presenceRatio).toBe(1);
    expect(artifact.stableProtectedRegions[0].kind).toBe("face");
    expect(artifact.evidence).toHaveLength(4);
  });

  it("moving subject: region displacement across frames flags moving risk", () => {
    const evidence = [0, 1, 2, 3].map((i) =>
      okFrame({
        protectedRegions: [faceRect(0.1 + i * 0.25, 0.3)],
        saliency: { available: true, dispersion: 0.4, centroid: [0.15 + i * 0.25, 0.35] },
      }),
    );
    const artifact = aggregateFrameEvidence(evidence, { startMs: 0, endMs: 8000 });
    expect(artifact.subjectMotion.level).toBe("moving");
    expect(artifact.subjectMotion.maxDisplacement).toBeGreaterThan(0.1);
    // A face crossing the whole window is not a stable text-safe anchor
    expect(artifact.stableProtectedRegions).toHaveLength(0);
  });

  it("no subject: all low_information frames yield low_information status", () => {
    const evidence = [0, 1, 2].map(() => okFrame({ status: "low_information", errorCode: null }));
    const artifact = aggregateFrameEvidence(evidence, { startMs: 0, endMs: 6000 });
    expect(artifact.status).toBe("low_information");
    expect(artifact.subjectMotion.level).toBe("none");
    expect(artifact.stableProtectedRegions).toHaveLength(0);
  });

  it("degraded: all frames degraded → degraded status with first errorCode", () => {
    const evidence = [0, 1, 2].map(() =>
      okFrame({ status: "degraded", errorCode: "cannot_read_image" }),
    );
    const artifact = aggregateFrameEvidence(evidence, { startMs: 0, endMs: 6000 });
    expect(artifact.status).toBe("degraded");
    expect(artifact.errorCode).toBe("cannot_read_image");
  });

  it("mixed frames: one usable frame keeps status ok, per-frame statuses preserved", () => {
    const evidence = [
      okFrame({ status: "degraded", errorCode: "cannot_read_image" }),
      okFrame({ protectedRegions: [faceRect(0.2, 0.2)] }),
      okFrame({ status: "low_information" }),
    ];
    const artifact = aggregateFrameEvidence(evidence, { startMs: 0, endMs: 4000 });
    expect(artifact.status).toBe("ok");
    expect(artifact.evidence.map((e) => e.status)).toEqual(["degraded", "ok", "low_information"]);
  });

  it("every evidence frame keeps its source millisecond timecode", () => {
    const evidence = [0, 1, 2, 3].map((i) => okFrame({ frameId: i, timeMs: 1000 + i * 2000 }));
    const artifact = aggregateFrameEvidence(evidence, { startMs: 1000, endMs: 7000 });
    expect(artifact.evidence.map((e) => e.timeMs)).toEqual([1000, 3000, 5000, 7000]);
    expect(artifact.evidence.map((e) => e.frameId)).toEqual([0, 1, 2, 3]);
  });

  it("is deterministic — identical evidence produces identical artifacts", () => {
    const evidence = [0, 1, 2, 3].map((i) =>
      okFrame({ protectedRegions: [faceRect(0.3 + (i % 2) * 0.02, 0.3)] }),
    );
    const a = aggregateFrameEvidence(evidence, { startMs: 0, endMs: 8000 });
    const b = aggregateFrameEvidence(evidence, { startMs: 0, endMs: 8000 });
    expect(a).toEqual(b);
  });
});

describe("analyzeTemporalFocus (#101)", () => {
  let dir;
  let injected;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "temporal-focus-test-"));
    // Injected deps: fake frame extraction + fake focus worker — the unit
    // surface is the pipeline logic, not ffmpeg/OpenCV (real-data smoke
    // covers those on a real video).
    injected = {
      extractFrames: async (videoPath, timesMs) =>
        timesMs.map((t, i) => {
          const p = join(dir, `frame-${i}.png`);
          writeFileSync(p, `frame-bytes-${t}`);
          return p;
        }),
      detectFocus: async (framePath) => okFrame(),
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("samples 3-5 frames across the window including boundaries (never first frame only)", async () => {
    let capturedTimes;
    const fakeExtract = injected.extractFrames;
    injected.extractFrames = async (p, timesMs) => {
      capturedTimes = timesMs;
      return fakeExtract(p, timesMs);
    };
    await analyzeTemporalFocus("video.mp4", {
      startMs: 0,
      endMs: 8000,
      deps: injected,
    });
    expect(capturedTimes.length).toBeGreaterThanOrEqual(3);
    expect(capturedTimes.length).toBeLessThanOrEqual(5);
    expect(capturedTimes[0]).toBe(0);
    expect(capturedTimes[capturedTimes.length - 1]).toBe(8000);
  });

  it("returns a temporal artifact with kind, evidence and aggregation", async () => {
    const artifact = await analyzeTemporalFocus("video.mp4", {
      startMs: 0,
      endMs: 8000,
      deps: injected,
    });
    expect(artifact.kind).toBe("temporal");
    expect(artifact.window).toEqual({ startMs: 0, endMs: 8000 });
    expect(artifact.evidence).toHaveLength(4);
    expect(artifact.evidence[0].timeMs).toBe(0);
    expect(artifact.evidence[3].timeMs).toBe(8000);
    expect(artifact.status).toBe("ok");
  });

  it("degenerate window (endMs <= startMs) clamps to the boundary time", async () => {
    let capturedTimes;
    const fakeExtract = injected.extractFrames;
    injected.extractFrames = async (p, timesMs) => {
      capturedTimes = timesMs;
      return fakeExtract(p, timesMs);
    };
    const artifact = await analyzeTemporalFocus("video.mp4", {
      startMs: 5000,
      endMs: 5000,
      deps: injected,
    });
    expect(capturedTimes.every((t) => t === 5000)).toBe(true);
    expect(artifact.status).toBe("ok");
  });

  it("frame extraction failure degrades instead of throwing", async () => {
    injected.extractFrames = async () => {
      throw new Error("ffmpeg exploded");
    };
    const artifact = await analyzeTemporalFocus("video.mp4", {
      startMs: 0,
      endMs: 4000,
      deps: injected,
    });
    expect(artifact.status).toBe("degraded");
    expect(artifact.errorCode).toBe("frame_extraction_failed");
  });
});

describe("temporal focus cache — #100 protocol (#101)", () => {
  let dir;
  let video;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "temporal-cache-test-"));
    video = join(dir, "clip.mp4");
    writeFileSync(video, "video-bytes");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("version constant is exported", () => {
    expect(typeof TEMPORAL_FOCUS_VERSION).toBe("string");
    expect(TEMPORAL_FOCUS_VERSION.length).toBeGreaterThan(0);
  });

  it("key covers source, window and sampling; changes when any key material changes", async () => {
    const k1 = await computeTemporalFocusCacheKey({
      videoPath: video,
      startMs: 0,
      endMs: 8000,
    });
    const k2 = await computeTemporalFocusCacheKey({
      videoPath: video,
      startMs: 0,
      endMs: 8000,
    });
    const k3 = await computeTemporalFocusCacheKey({
      videoPath: video,
      startMs: 1000,
      endMs: 8000,
    });
    const k4 = await computeTemporalFocusCacheKey({
      videoPath: video,
      startMs: 0,
      endMs: 8000,
      samplingProfile: { frameCount: 5 },
    });
    expect(k1).toBe(k2);
    expect(k3).not.toBe(k1);
    expect(k4).not.toBe(k1);
  });

  it("roundtrips through the unified envelope with versions in meta", async () => {
    const cacheDir = join(dir, "cache");
    const key = await computeTemporalFocusCacheKey({
      videoPath: video,
      startMs: 0,
      endMs: 8000,
    });
    const artifact = { kind: "temporal", status: "ok", evidence: [] };
    writeCachedTemporalFocus(cacheDir, key, {
      data: artifact,
      meta: { durationMs: 1234 },
    });
    const got = getCachedTemporalFocus(cacheDir, key);
    expect(got.data.kind).toBe("temporal");
    expect(got.meta.cacheHit).toBe(true);
    expect(got.meta.temporalFocusVersion).toBe(TEMPORAL_FOCUS_VERSION);
    expect(got.meta.pipelineVersion).toBeTruthy();
  });

  it("refuses to cache a degraded analysis", async () => {
    const cacheDir = join(dir, "cache");
    const key = await computeTemporalFocusCacheKey({
      videoPath: video,
      startMs: 0,
      endMs: 8000,
    });
    writeCachedTemporalFocus(cacheDir, key, {
      data: { kind: "temporal", status: "degraded", errorCode: "frame_extraction_failed" },
      meta: {},
    });
    expect(getCachedTemporalFocus(cacheDir, key)).toBeNull();
    expect(existsSync(cacheDir)).toBe(false);
  });
});

describe("transformedFocus (#101)", () => {
  const sourceFrame = { width: 1920, height: 1080, orientation: "landscape" };

  it("cover-crops a landscape source to 9:16 with the crop rect recorded", () => {
    const focus = {
      kind: "base",
      frame: sourceFrame,
      protectedRegions: [faceRect(0.05, 0.3)],
      saliency: { available: true, dispersion: 0.4, centroid: [0.1, 0.5] },
    };
    const out = transformedFocus(focus, { targetAspect: 9 / 16 });
    // 1080 * 9/16 is not an integer — allow one-pixel rounding
    expect(out.frame.width / out.frame.height).toBeCloseTo(9 / 16, 3);
    expect(out.frame.width).toBe(Math.round(1080 * (9 / 16)));
    expect(out.crop.fit).toBe("cover");
    // Source is much wider than 9:16 — a vertical band is cropped out
    // rect is rounded to 4 decimals in the module contract
    expect(out.crop.rect[2]).toBeCloseTo(9 / 16 / (1920 / 1080), 4);
    expect(out.crop.rect[3]).toBe(1);
  });

  it("saliency-anchored crop keeps the subject in frame and maps its region", () => {
    const focus = {
      kind: "base",
      frame: sourceFrame,
      protectedRegions: [faceRect(0.02, 0.4, 0.08, 0.2)],
      saliency: { available: true, dispersion: 0.4, centroid: [0.06, 0.5] },
    };
    const out = transformedFocus(focus, { targetAspect: 9 / 16, cropPolicy: "saliency" });
    // The face sits at the left edge; a saliency-anchored 9:16 band must
    // include it — the mapped region stays inside the target canvas.
    expect(out.protectedRegions).toHaveLength(1);
    const [x, y, w, h] = out.protectedRegions[0].rect;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(1);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it("regions falling outside the crop are dropped and reported", () => {
    const focus = {
      kind: "base",
      frame: sourceFrame,
      protectedRegions: [faceRect(0.05, 0.4), faceRect(0.9, 0.4)],
      saliency: { available: true, dispersion: 0.4, centroid: [0.05, 0.5] },
    };
    const out = transformedFocus(focus, { targetAspect: 9 / 16, cropPolicy: "saliency" });
    expect(out.droppedRegions.length).toBe(1);
    expect(out.droppedRegions[0].kind).toBe("face");
  });

  it("contain fit maps the full frame with letterbox offsets", () => {
    const focus = {
      kind: "poster",
      frame: sourceFrame,
      protectedRegions: [faceRect(0.4, 0.4)],
      saliency: { available: true, dispersion: 0.3, centroid: [0.5, 0.5] },
    };
    const out = transformedFocus(focus, { targetAspect: 9 / 16, fit: "contain" });
    expect(out.crop.fit).toBe("contain");
    expect(out.protectedRegions).toHaveLength(1);
    const [x, y, w, h] = out.protectedRegions[0].rect;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(1.0001);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y + h).toBeLessThanOrEqual(1.0001);
  });

  it("supports 16:9 and 1:1 target canvases deterministically", () => {
    const focus = {
      kind: "base",
      frame: sourceFrame,
      protectedRegions: [faceRect(0.4, 0.4)],
      saliency: { available: true, dispersion: 0.3, centroid: [0.5, 0.5] },
    };
    const wide = transformedFocus(focus, { targetAspect: 16 / 9 });
    const square = transformedFocus(focus, { targetAspect: 1 });
    expect(wide.frame.width / wide.frame.height).toBeCloseTo(16 / 9, 5);
    expect(square.frame.width / square.frame.height).toBeCloseTo(1, 5);
    expect(transformedFocus(focus, { targetAspect: 9 / 16 })).toEqual(
      transformedFocus(focus, { targetAspect: 9 / 16 }),
    );
  });

  it("passes through temporalFocus stable regions (schema boundary respected)", () => {
    const temporal = {
      kind: "temporal",
      status: "ok",
      frame: sourceFrame,
      stableProtectedRegions: [{ rect: [0.3, 0.3, 0.1, 0.15], kind: "face", presenceRatio: 1 }],
      saliency: { available: true, dispersion: 0.3, centroid: [0.5, 0.5] },
    };
    const out = transformedFocus(temporal, { targetAspect: 9 / 16 });
    expect(out.kind).toBe("temporal");
    expect(out.protectedRegions.length + out.droppedRegions.length).toBe(1);
  });
});
