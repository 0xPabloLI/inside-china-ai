/**
 * Tests for internal-pause trimming (#786, decision #279 方案 A).
 *
 * Policy under test:
 * - Internal pauses longer than the 250 ms floor are cut to at most the floor.
 * - Head and tail silence are never touched (they carry the scene transition).
 * - Pauses at or under the floor stay as they are (no needless reselect).
 * - The filter expression keeps a continuous timeline (`asetpts`) so atempo /
 *   rubberband see the right timestamps.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SILENCE_FLOOR_MS,
  FRAME_QUANTIZATION_GUARD_SEC,
  TRIM_FRAME_SAMPLES,
  buildTrimFilters,
  mergeSilences,
  parseSilenceDetect,
  planSilenceTrim,
  verifySilenceFloor,
} from "../lib/tts/silence-trim.mjs";

describe("parseSilenceDetect", () => {
  it("parses start/end pairs and ignores silence_duration lines", () => {
    const stderr = [
      "[Parsed_silencedetect_0 @ 0x1] silence_start: 0.493061",
      "[Parsed_silencedetect_0 @ 0x1] silence_end: 0.573129 | silence_duration: 0.080068",
      "[Parsed_silencedetect_0 @ 0x1] silence_start: 1.005261",
      "[Parsed_silencedetect_0 @ 0x1] silence_end: 1.110998 | silence_duration: 0.105737",
    ].join("\n");
    expect(parseSilenceDetect(stderr)).toEqual([
      { start: 0.493061, end: 0.573129 },
      { start: 1.005261, end: 1.110998 },
    ]);
  });

  it("closes an unterminated interval at the media duration (trailing silence)", () => {
    const stderr = "[Parsed_silencedetect_0 @ 0x1] silence_start: 3.4";
    expect(parseSilenceDetect(stderr, 4.0)).toEqual([{ start: 3.4, end: 4.0 }]);
  });

  it("returns an empty list for output without silences", () => {
    expect(parseSilenceDetect("size=N/A time=00:00:04.80")).toEqual([]);
    expect(parseSilenceDetect(undefined)).toEqual([]);
  });
});

describe("planSilenceTrim", () => {
  const floor = DEFAULT_SILENCE_FLOOR_MS;

  it("caps an internal pause at the floor and keeps head/tail intact", () => {
    const plan = planSilenceTrim({
      duration: 4.0,
      silences: [
        { start: 0, end: 0.5 }, // head — never trimmed
        { start: 1.5, end: 2.4 }, // 900 ms internal pause — trimmed
        { start: 3.4, end: 4.0 }, // tail — never trimmed
      ],
      floorMs: floor,
    });

    expect(plan.drops).toHaveLength(1);
    expect(plan.drops[0].start).toBeCloseTo(1.5 + floor / 1000 - FRAME_QUANTIZATION_GUARD_SEC, 4);
    expect(plan.drops[0].end).toBeCloseTo(2.4, 4);
    expect(plan.removedSec).toBeCloseTo(0.9 - (floor / 1000 - FRAME_QUANTIZATION_GUARD_SEC), 4);
    // keep covers [0, ...] continuously so head/tail samples survive verbatim.
    expect(plan.keep[0].start).toBe(0);
    expect(plan.keep[plan.keep.length - 1].end).toBe(4.0);
  });

  it("leaves pauses at or under the floor untouched, trims the first one over it", () => {
    const plan = planSilenceTrim({
      duration: 3.0,
      silences: [
        { start: 0.5, end: 0.74 }, // 240 ms — under the floor
        { start: 1.5, end: 1.768 }, // 268 ms — a real-take pause that is over the cap
      ],
      floorMs: floor,
    });
    // 268 ms is only 18 ms over the floor: the guard must not be read as
    // "extra allowance", or such pauses survive above the cap (measured on
    // v41-flash-1017 scene 7 before this was fixed).
    expect(plan.drops).toHaveLength(1);
    expect(plan.drops[0].start).toBeCloseTo(1.5 + floor / 1000 - FRAME_QUANTIZATION_GUARD_SEC, 4);
    expect(plan.drops[0].end).toBeCloseTo(1.768, 4);
  });

  it("returns no plan when every pause already sits under the floor", () => {
    const plan = planSilenceTrim({
      duration: 3.0,
      silences: [
        { start: 0.5, end: 0.75 }, // exactly the floor
        { start: 1.5, end: 1.74 }, // 240 ms
      ],
      floorMs: floor,
    });
    expect(plan.keep).toBeNull();
    expect(plan.removedSec).toBe(0);
  });

  it("trims several internal pauses and preserves order", () => {
    const plan = planSilenceTrim({
      duration: 6.0,
      silences: [
        { start: 1.0, end: 1.6 },
        { start: 2.0, end: 2.8 },
        { start: 4.0, end: 4.9 },
      ],
      floorMs: floor,
    });
    expect(plan.drops.map((d) => Number(d.end.toFixed(2)))).toEqual([1.6, 2.8, 4.9]);
    const kept = plan.keep.map((k) => [Number(k.start.toFixed(3)), Number(k.end.toFixed(3))]);
    // Starts at 0, ends at duration, and every gap is exactly a dropped range.
    expect(kept[0][0]).toBe(0);
    expect(kept[kept.length - 1][1]).toBe(6);
    const droppedEnds = plan.drops.map((d) => Number(d.end.toFixed(3)));
    for (let i = 1; i < kept.length; i++) {
      expect(kept[i][0]).toBeCloseTo(droppedEnds[i - 1], 3);
      expect(kept[i][0]).toBeGreaterThan(kept[i - 1][1]);
    }
  });

  it("returns a null plan for unusable duration or empty input", () => {
    expect(planSilenceTrim({ duration: NaN, silences: [], floorMs: floor }).keep).toBeNull();
    expect(planSilenceTrim({ duration: 2, silences: [], floorMs: floor }).keep).toBeNull();
  });
});

describe("mergeSilences", () => {
  it("joins stretches split by a sub-threshold tick into one pause", () => {
    // Real take (embodied-ai scene 2): silencedetect reported 3.494-3.903 and
    // 3.903-4.008 as two intervals; they are one 514 ms pause.
    const merged = mergeSilences([
      { start: 3.494, end: 3.903 },
      { start: 3.903, end: 4.008 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBeCloseTo(3.494, 3);
    expect(merged[0].end).toBeCloseTo(4.008, 3);
  });

  it("keeps pauses separated by real speech apart", () => {
    const merged = mergeSilences([
      { start: 1.0, end: 1.5 },
      { start: 1.8, end: 2.2 }, // 300 ms of speech in between
    ]);
    expect(merged).toHaveLength(2);
  });

  it("sorts and drops degenerate intervals", () => {
    const merged = mergeSilences([
      { start: 2.0, end: 2.4 },
      { start: 1.0, end: 1.4 },
      { start: 3, end: 3 },
      { start: NaN, end: 1 },
    ]);
    expect(merged.map((m) => m.start)).toEqual([1.0, 2.0]);
  });
});

describe("planSilenceTrim — split pauses", () => {
  it("cuts a pause that the detector delivered in two pieces", () => {
    const plan = planSilenceTrim({
      duration: 6.0,
      silences: [
        { start: 3.494, end: 3.903 }, // 409 ms
        { start: 3.903, end: 4.008 }, // 105 ms — same pause, split by a tick
      ],
      floorMs: DEFAULT_SILENCE_FLOOR_MS,
    });
    expect(plan.drops).toHaveLength(1);
    // One cut over the whole merged region, not two cuts over the pieces.
    expect(plan.drops[0].start).toBeCloseTo(3.494 + 0.25 - FRAME_QUANTIZATION_GUARD_SEC, 3);
    expect(plan.drops[0].end).toBeCloseTo(4.008, 3);
  });
});

describe("verifySilenceFloor", () => {
  it("accepts a delivered pause at the floor", () => {
    const check = verifySilenceFloor({
      duration: 4.0,
      silences: [
        { start: 0, end: 0.3 },
        { start: 1.5, end: 1.73 },
      ],
    });
    expect(check.violations).toEqual([]);
    expect(check.maxMs).toBe(230);
    expect(check.checked).toBe(1);
  });

  it("flags a pause left above the floor and ignores head/tail silence", () => {
    const check = verifySilenceFloor({
      duration: 4.0,
      silences: [
        { start: 0, end: 0.6 }, // head — intentional
        { start: 1.5, end: 1.85 }, // 350 ms — violation
        { start: 3.3, end: 4.0 }, // tail — intentional
      ],
    });
    expect(check.violations).toHaveLength(1);
    expect(check.violations[0].ms).toBe(350);
    expect(check.maxMs).toBe(350);
  });

  it("treats two tick-split stretches as one pause before judging", () => {
    const check = verifySilenceFloor({
      duration: 4.0,
      silences: [
        { start: 1.5, end: 1.65 },
        { start: 1.65, end: 1.9 },
      ],
    });
    // 400 ms combined → violation, even though each piece is under the floor.
    expect(check.violations).toHaveLength(1);
    expect(check.violations[0].ms).toBe(400);
  });
});

describe("buildTrimFilters", () => {
  it("re-slices the stream, then masks the dropped ranges and resets the timeline", () => {
    const plan = planSilenceTrim({
      duration: 4.0,
      silences: [{ start: 1.5, end: 2.4 }],
      floorMs: DEFAULT_SILENCE_FLOOR_MS,
    });
    const filters = buildTrimFilters(plan.drops);
    expect(filters).toHaveLength(3);
    // WAV takes decode as 4096-sample frames (~93 ms); without this the cut
    // lands too late and the pause survives above the floor.
    expect(filters[0]).toBe(`asetnsamples=n=${TRIM_FRAME_SAMPLES}:p=0`);
    expect(filters[1]).toMatch(/^aselect='not\(between\(t,1\.\d+,2\.4000\)\)'$/);
    expect(filters[2]).toBe("asetpts=N/SR/TB");
    // No silenceremove: that filter cannot keep the tail.
    expect(filters.join(",")).not.toContain("silenceremove");
  });

  it("emits nothing when there is no plan", () => {
    expect(buildTrimFilters(null)).toEqual([]);
    expect(buildTrimFilters([])).toEqual([]);
  });
});
