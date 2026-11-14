/**
 * #1212 — the quantitative half of the QA final review: mechanical thresholds
 * measured on the ENCODED mp4, calibrated on 29 finished packs (2026-11-14).
 *
 * The contract these tests pin down:
 * - the static-segment gate flags exactly the one legacy slideshow pack in the
 *   calibration corpus and nothing else (fixture replay below),
 * - lane debris is WARN only until a real positive sample exists,
 * - an uncalibrated threshold never reads as a PASS (fail-closed),
 * - the probe geometry is derived from safe-zones.mjs, not a second table.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  CALIBRATION,
  DEBRIS,
  LUMA_PROBE,
  STATIC_SEGMENT,
  SUBTITLE_LANE_RECT,
  evaluateMechanics,
  longestStaticRun,
  meanAbsDiffSeries,
  peakWindowMean,
  saturatedRatioSeries,
  sceneScanWindows,
} from "../lib/qa-mechanics.mjs";
import {
  CANVAS,
  SUBTITLE_LANE,
  SUBTITLE_LANE_BOTTOM,
  SUBTITLE_LANE_TOP,
} from "../lib/safe-zones.mjs";
import { FPS, TRANSITION_FRAMES, sceneTimeline } from "../lib/timeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadFixture = (pack) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", "qa-mechanics", `${pack}.json`), "utf8"));

const DURATIONS = [
  { sceneId: 1, duration: 5.0 },
  { sceneId: 2, duration: 4.0 },
  { sceneId: 3, duration: 4.5 },
];

describe("sceneScanWindows", () => {
  it("starts after the crossfade and excludes the closing hold window", () => {
    const { fps, windows } = sceneScanWindows(DURATIONS);
    expect(fps).toBe(FPS);
    const schedule = sceneTimeline(DURATIONS, { fps: FPS, transitionOverlap: TRANSITION_FRAMES });
    expect(windows.length).toBe(schedule.length);
    windows.forEach((w, i) => {
      expect(w.sceneId).toBe(schedule[i].sceneId);
      expect(w.start).toBe(schedule[i].visualStartFrames + TRANSITION_FRAMES);
      expect(w.end).toBe(
        schedule[i].visualStartFrames + schedule[i].clipFrames - STATIC_SEGMENT.holdExclusionFrames,
      );
      expect(w.end).toBeGreaterThan(w.start);
    });
  });

  it("throws on missing durations — a scan window is only meaningful on a real timeline", () => {
    expect(() => sceneScanWindows([])).toThrow();
    expect(() => sceneScanWindows(null)).toThrow();
  });

  it("throws on a malformed holdFrames", () => {
    expect(() => sceneScanWindows(DURATIONS, { holdFrames: -1 })).toThrow();
    expect(() => sceneScanWindows(DURATIONS, { holdFrames: 1.5 })).toThrow();
  });

  it("throws when a scene is too short to have a live window", () => {
    const tiny = [{ sceneId: 1, duration: 1.0 }];
    expect(() => sceneScanWindows(tiny)).toThrow(/no live window/);
  });
});

describe("meanAbsDiffSeries", () => {
  const { width, height } = LUMA_PROBE;
  const frameSize = width * height;
  const black = Buffer.alloc(frameSize, 0);
  const white = Buffer.alloc(frameSize, 255);

  it("is 0 for identical consecutive frames and 255 for a black→white cut", () => {
    const series = meanAbsDiffSeries(Buffer.concat([black, black, white]), { width, height });
    expect(series.length).toBe(3);
    expect(series[0]).toBe(0);
    expect(series[1]).toBe(0);
    expect(series[2]).toBe(255);
  });

  it("rejects a buffer that cannot hold one frame", () => {
    expect(() => meanAbsDiffSeries(Buffer.alloc(3), { width, height })).toThrow();
  });
});

describe("longestStaticRun", () => {
  it("finds the longest consecutive run at or below eps, with its bounds", () => {
    const diffs = Float64Array.from([1, 0.05, 0.05, 0.1, 1, 0.05, 0.05, 1, 1, 1]);
    // eps is inclusive: a frame at exactly 0.1 still counts as still.
    const run = longestStaticRun(diffs, { start: 0, end: 10 });
    expect(run.frames).toBe(3);
    expect(run.from).toBe(1);
    expect(run.to).toBe(3);
  });

  it("clips to the requested window", () => {
    const diffs = Float64Array.from([0, 0, 0, 0, 0]);
    expect(longestStaticRun(diffs, { start: 1, end: 4 }).frames).toBe(3);
    expect(longestStaticRun(diffs, { start: 1, end: 4 }).from).toBe(1);
  });

  it("returns zero frames for an all-motion window", () => {
    const diffs = Float64Array.from([1, 1, 1]);
    const run = longestStaticRun(diffs, { start: 0, end: 3 });
    expect(run.frames).toBe(0);
    expect(run.from).toBeNull();
  });

  it("throws on an invalid window", () => {
    const diffs = Float64Array.from([0, 0]);
    expect(() => longestStaticRun(diffs, { start: 2, end: 2 })).toThrow();
    expect(() => longestStaticRun(diffs, { start: -1, end: 2 })).toThrow();
    expect(() => longestStaticRun(diffs, { start: 0, end: 2, eps: -1 })).toThrow();
  });
});

describe("saturatedRatioSeries", () => {
  const { width, height } = SUBTITLE_LANE_RECT;
  const frameSize = width * height;

  const rgbFrame = (fill) => {
    const buf = Buffer.alloc(frameSize * 3);
    for (let p = 0; p < frameSize; p += 1) {
      buf[p * 3] = fill[0];
      buf[p * 3 + 1] = fill[1];
      buf[p * 3 + 2] = fill[2];
    }
    return buf;
  };

  it("counts saturated+ bright pixels only", () => {
    // Saturated red (S=1, V=255), dim dark gray (V<128), bright desaturated white (S=0).
    const red = rgbFrame([255, 0, 0]);
    const dim = rgbFrame([20, 20, 20]);
    const white = rgbFrame([255, 255, 255]);
    const series = saturatedRatioSeries(Buffer.concat([red, dim, white]), { width, height });
    expect(series.length).toBe(3);
    expect(series[0]).toBe(1);
    expect(series[1]).toBe(0);
    expect(series[2]).toBe(0);
  });

  it("defaults to the DEBRIS saturation and value floors", () => {
    expect(DEBRIS.minSaturation).toBe(0.6);
    expect(DEBRIS.minValue).toBe(128);
  });

  it("rejects a buffer that cannot hold one frame", () => {
    expect(() => saturatedRatioSeries(Buffer.alloc(3), { width, height })).toThrow();
  });
});

describe("peakWindowMean", () => {
  it("finds the highest mean over a sliding window and its first frame", () => {
    const series = Float64Array.from([0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.1, 0.1]);
    const peak = peakWindowMean(series, 3);
    expect(peak.peak).toBeCloseTo(0.5, 10);
    expect(peak.at).toBe(3);
  });

  it("averages everything when the series is shorter than the window", () => {
    const peak = peakWindowMean(Float64Array.from([0.2, 0.4]), 10);
    expect(peak.peak).toBeCloseTo(0.3, 10);
    expect(peak.at).toBe(0);
  });

  it("returns a zero peak for an empty series", () => {
    expect(peakWindowMean(Float64Array.from([]), 3)).toEqual({ peak: 0, at: null });
  });

  it("throws on a non-positive window", () => {
    expect(() => peakWindowMean(Float64Array.from([1]), 0)).toThrow();
  });
});

describe("evaluateMechanics", () => {
  const baseWindows = [{ sceneId: 1, start: 0, end: 400 }];

  it("passes a pack with motion everywhere and a clean lane", () => {
    const diffs = Float64Array.from({ length: 400 }, () => 1.0);
    const laneSeries = Float64Array.from({ length: 134 }, () => 0.01);
    const result = evaluateMechanics({ windows: baseWindows, diffs, laneSeries });
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
    expect(result.staticSegment.worstFrames).toBe(0);
    expect(result.debris.peakRatio).toBeCloseTo(0.01, 10);
  });

  it("fails a scene that freezes beyond maxStaticFrames (P1, static-segment)", () => {
    const diffs = Float64Array.from({ length: 400 }, (_, i) => (i < 200 ? 0 : 1.0));
    const laneSeries = Float64Array.from({ length: 134 }, () => 0);
    const result = evaluateMechanics({ windows: baseWindows, diffs, laneSeries });
    expect(result.status).toBe("fail");
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].severity).toBe("P1");
    expect(result.findings[0].code).toBe("static-segment");
    expect(result.findings[0].detail).toContain("200 consecutive still frames");
    expect(result.staticSegment.worstFrames).toBe(200);
    expect(result.staticSegment.worstSceneId).toBe(1);
  });

  it("warns on lane debris instead of failing (P2, lane-debris)", () => {
    const diffs = Float64Array.from({ length: 400 }, () => 1.0);
    const laneSeries = Float64Array.from({ length: 134 }, () => 0.3);
    const result = evaluateMechanics({ windows: baseWindows, diffs, laneSeries });
    expect(result.status).toBe("warn");
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].severity).toBe("P2");
    expect(result.findings[0].code).toBe("lane-debris");
  });

  it("fails closed on an uncalibrated threshold — no number, no PASS", () => {
    const diffs = Float64Array.from({ length: 400 }, () => 1.0);
    const laneSeries = Float64Array.from({ length: 134 }, () => 0);
    const result = evaluateMechanics({
      windows: baseWindows,
      diffs,
      laneSeries,
      thresholds: { maxStaticFrames: Number.NaN },
    });
    expect(result.status).toBe("uncalibrated");
    expect(result.findings[0].severity).toBe("P1");
    expect(result.findings[0].code).toBe("uncalibrated");
    expect(result.staticSegment).toBeNull();
    expect(result.debris).toBeNull();
  });

  it("throws on missing measurement inputs", () => {
    const diffs = Float64Array.from({ length: 400 }, () => 1.0);
    const laneSeries = Float64Array.from({ length: 134 }, () => 0);
    expect(() => evaluateMechanics({ windows: [], diffs, laneSeries })).toThrow();
    expect(() => evaluateMechanics({ windows: baseWindows, diffs: null, laneSeries })).toThrow();
    expect(() => evaluateMechanics({ windows: baseWindows, diffs, laneSeries: null })).toThrow();
  });
});

describe("fixture replay — the calibration corpus must reproduce its verdicts", () => {
  // Both fixtures carry the REAL series of a REAL finished pack (luma probe
  // 72x128, lane sampling every 3rd frame). If a threshold change or a
  // measurement refactor moves a verdict, these two tests fail first and the
  // corpus must be re-measured before the new gate ships.
  it("vidu-s2-ai-streamer (legacy slideshow) FAILS the static gate", () => {
    const f = loadFixture("vidu-s2-ai-streamer");
    const result = evaluateMechanics({
      windows: f.windows,
      diffs: Float64Array.from(f.diffs),
      laneSeries: Float64Array.from(f.lane),
    });
    expect(result.status).toBe("fail");
    const finding = result.findings.find((x) => x.code === "static-segment");
    expect(finding).toBeTruthy();
    expect(finding.severity).toBe("P1");
    expect(result.staticSegment.worstFrames).toBeGreaterThan(STATIC_SEGMENT.maxStaticFrames);
    // The calibration corpus says 230; the fixture is rounded to 4 decimals.
    expect(result.staticSegment.worstFrames).toBeGreaterThanOrEqual(225);
    expect(result.staticSegment.worstFrames).toBeLessThanOrEqual(235);
  });

  it("qwen4-gamefeel (a compliant pack) PASSES both metrics", () => {
    const f = loadFixture("qwen4-gamefeel");
    const result = evaluateMechanics({
      windows: f.windows,
      diffs: Float64Array.from(f.diffs),
      laneSeries: Float64Array.from(f.lane),
    });
    expect(result.status).toBe("pass");
    expect(result.staticSegment.worstFrames).toBe(60);
    expect(result.staticSegment.worstFrames).toBeLessThanOrEqual(STATIC_SEGMENT.maxStaticFrames);
    expect(result.debris.peakRatio).toBeGreaterThan(0.09);
    expect(result.debris.peakRatio).toBeLessThan(0.11);
    expect(result.debris.peakRatio).toBeLessThan(DEBRIS.laneRatioWarn);
  });
});

describe("threshold provenance", () => {
  it("derives the lane rect from safe-zones.mjs — no second geometry table", () => {
    expect(SUBTITLE_LANE_RECT.x).toBe(SUBTITLE_LANE.marginL);
    expect(SUBTITLE_LANE_RECT.y).toBe(SUBTITLE_LANE_TOP);
    expect(SUBTITLE_LANE_RECT.width).toBe(
      CANVAS.width - SUBTITLE_LANE.marginL - SUBTITLE_LANE.marginR,
    );
    expect(SUBTITLE_LANE_RECT.height).toBe(SUBTITLE_LANE_BOTTOM - SUBTITLE_LANE_TOP);
  });

  it("records the calibration run a later renderer must be compared against", () => {
    expect(CALIBRATION.packs).toBe(29);
    expect(CALIBRATION.measuredAt).toBe("2026-11-14");
    expect(CALIBRATION.command).toMatch(/qa-threshold-calibration\.mjs/);
    expect(CALIBRATION.staticSegment.max).toBeGreaterThan(STATIC_SEGMENT.maxStaticFrames);
    expect(CALIBRATION.debrisWindow.max).toBeLessThan(DEBRIS.laneRatioWarn);
  });

  it("freezes every threshold object", () => {
    expect(Object.isFrozen(STATIC_SEGMENT)).toBe(true);
    expect(Object.isFrozen(DEBRIS)).toBe(true);
    expect(Object.isFrozen(CALIBRATION)).toBe(true);
    expect(Object.isFrozen(SUBTITLE_LANE_RECT)).toBe(true);
  });
});
