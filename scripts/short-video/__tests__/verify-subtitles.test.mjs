import { describe, it, expect } from "vitest";
import {
  computeAbsoluteTimestamps,
  analyzeCoverage,
  analyzeDurations,
  compareSync,
  generateReport,
  parseSilenceOutput,
  parseDuration,
} from "../lib/verify-subtitles.mjs";

// ── computeAbsoluteTimestamps ──
// Shared helper: converts per-scene timing data to absolute timestamps
// Must match generate-srt.mjs logic (sceneOffset + START_OFFSET -0.3, 0.5s buffer)

describe("computeAbsoluteTimestamps", () => {
  const timingData = [
    {
      sceneId: 1,
      segments: [
        { text: "Hello world", start: 0.0, end: 2.0 },
        { text: "Second line", start: 2.5, end: 5.0 },
      ],
    },
    {
      sceneId: 2,
      segments: [
        { text: "Scene two", start: 0.0, end: 3.0 },
      ],
    },
  ];
  const sceneDurations = [
    { sceneId: 1, duration: 5.0 },
    { sceneId: 2, duration: 3.0 },
  ];

  it("converts per-scene segments to absolute timestamps", () => {
    const subs = computeAbsoluteTimestamps(timingData, sceneDurations);
    expect(subs).toHaveLength(3);
    // Scene 1, seg 1: start = max(0 + 0.0 - 0.3, 0) = 0, end = 0 + min(2.0, 5.0) = 2.0
    expect(subs[0].start).toBe(0);
    expect(subs[0].end).toBe(2.0);
    expect(subs[0].sceneId).toBe(1);
    // Scene 1, seg 2: start = max(0 + 2.5 - 0.3, 0) = 2.2, end = 0 + min(5.0, 5.0) = 5.0
    expect(subs[1].start).toBe(2.2);
    expect(subs[1].end).toBe(5.0);
    // Scene 2, seg 1: sceneOffset = 5.0 + 0.5 = 5.5
    // start = max(5.5 + 0.0 - 0.3, 0) = 5.2, end = 5.5 + min(3.0, 3.0) = 8.5
    expect(subs[2].start).toBe(5.2);
    expect(subs[2].end).toBe(8.5);
    expect(subs[2].sceneId).toBe(2);
  });

  it("clamps first subtitle start to 0 (START_OFFSET -0.3)", () => {
    const single = [
      { sceneId: 1, segments: [{ text: "First", start: 0.0, end: 1.0 }] },
    ];
    const dur = [{ sceneId: 1, duration: 1.0 }];
    const subs = computeAbsoluteTimestamps(single, dur);
    expect(subs[0].start).toBe(0); // max(-0.3, 0) = 0
  });

  it("returns empty array for empty timing data (#4)", () => {
    expect(computeAbsoluteTimestamps([], [])).toEqual([]);
  });

  it("handles missing sceneDurations gracefully", () => {
    const data = [{ sceneId: 99, segments: [{ text: "x", start: 0, end: 1 }] }];
    const subs = computeAbsoluteTimestamps(data, []);
    // sceneDur defaults to 0
    expect(subs).toHaveLength(1);
    expect(subs[0].end).toBe(0); // 0 + min(1, 0) = 0
  });
});

// ── analyzeCoverage ──
// Checks for gaps > 1.0s between subtitles and at the end

describe("analyzeCoverage", () => {
  it("returns 100% coverage when no gaps (#8 no-gap case)", () => {
    const subs = [
      { start: 0, end: 5.0, sceneId: 1, text: "a" },
      { start: 5.0, end: 10.0, sceneId: 1, text: "b" },
    ];
    const result = analyzeCoverage(subs, 10.0);
    expect(result.percent).toBe(100);
    expect(result.gaps).toEqual([]);
  });

  it("flags gaps > 1.0s between subtitles (#8)", () => {
    const subs = [
      { start: 0, end: 3.0, sceneId: 1, text: "a" },
      { start: 5.0, end: 8.0, sceneId: 2, text: "b" }, // 2.0s gap
    ];
    const result = analyzeCoverage(subs, 8.0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].from).toBe(3.0);
    expect(result.gaps[0].to).toBe(5.0);
    expect(result.gaps[0].duration).toBe(2.0);
    expect(result.percent).toBeLessThan(100);
  });

  it("flags gap at end when video extends past last subtitle", () => {
    const subs = [{ start: 0, end: 5.0, sceneId: 1, text: "a" }];
    const result = analyzeCoverage(subs, 10.0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].from).toBe(5.0);
    expect(result.gaps[0].to).toBe(10.0);
  });

  it("does not flag gap when video is shorter than last subtitle (#5)", () => {
    const subs = [{ start: 0, end: 10.0, sceneId: 1, text: "a" }];
    const result = analyzeCoverage(subs, 8.0);
    // videoDuration (8.0) < lastEnd (10.0) → no end gap
    expect(result.gaps).toEqual([]);
  });

  it("handles empty subtitles (#4)", () => {
    const result = analyzeCoverage([], 10.0);
    expect(result.percent).toBe(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].from).toBe(0);
    expect(result.gaps[0].to).toBe(10.0);
  });

  it("does not flag gaps <= 1.0s", () => {
    const subs = [
      { start: 0, end: 4.5, sceneId: 1, text: "a" },
      { start: 5.0, end: 10.0, sceneId: 2, text: "b" }, // 0.5s gap
    ];
    const result = analyzeCoverage(subs, 10.0);
    expect(result.gaps).toEqual([]);
  });
});

// ── analyzeDurations ──
// Flags subtitles shorter than 0.5s

describe("analyzeDurations", () => {
  it("returns empty tooShort when all subtitles >= 0.5s", () => {
    const subs = [
      { start: 0, end: 2.0, sceneId: 1, text: "ok" },
      { start: 2.0, end: 3.0, sceneId: 2, text: "fine" },
    ];
    const result = analyzeDurations(subs);
    expect(result.tooShort).toEqual([]);
  });

  it("flags subtitles shorter than 0.5s (#7)", () => {
    const subs = [
      { start: 0, end: 2.0, sceneId: 1, text: "ok" },
      { start: 2.0, end: 2.3, sceneId: 2, text: "too short" }, // 0.3s
    ];
    const result = analyzeDurations(subs);
    expect(result.tooShort).toHaveLength(1);
    expect(result.tooShort[0].sceneId).toBe(2);
    expect(result.tooShort[0].duration).toBeCloseTo(0.3, 1);
  });

  it("handles empty subtitles", () => {
    expect(analyzeDurations([]).tooShort).toEqual([]);
  });

  it("does not flag subtitles exactly 0.5s", () => {
    const subs = [{ start: 0, end: 0.5, sceneId: 1, text: "edge" }];
    const result = analyzeDurations(subs);
    expect(result.tooShort).toEqual([]);
  });
});

// ── compareSync ──
// Compares subtitle timestamps to audio silence segments

describe("compareSync", () => {
  it("returns no deviations when silence segments match subtitle starts", () => {
    const subs = [
      { start: 0, end: 5.0, sceneId: 1, text: "a" },
      { start: 5.2, end: 10.0, sceneId: 2, text: "b" },
    ];
    const silence = [
      { start: 5.0, end: 5.2 }, // gap between speech
    ];
    const result = compareSync(subs, silence);
    // Sub 2 starts at 5.2, nearest silence starts at 5.0, delta = 0.2 (< 0.5)
    expect(result.deviations).toEqual([]);
  });

  it("flags deviations > 0.5s", () => {
    const subs = [
      { start: 0, end: 5.0, sceneId: 1, text: "a" },
      { start: 7.0, end: 10.0, sceneId: 2, text: "b" },
    ];
    const silence = [
      { start: 5.0, end: 6.0 }, // silence ends at 6.0, but sub starts at 7.0
    ];
    const result = compareSync(subs, silence);
    expect(result.deviations).toHaveLength(1);
    expect(result.deviations[0].delta).toBeGreaterThan(0.5);
  });

  it("returns empty deviations when no silence segments (#6)", () => {
    const subs = [
      { start: 0, end: 5.0, sceneId: 1, text: "a" },
    ];
    const result = compareSync(subs, []);
    expect(result.deviations).toEqual([]);
  });

  it("handles empty subtitles", () => {
    const result = compareSync([], [{ start: 1.0, end: 2.0 }]);
    expect(result.deviations).toEqual([]);
  });
});

// ── parseSilenceOutput ──
// Parses FFmpeg silencedetect stderr output

describe("parseSilenceOutput (#11)", () => {
  it("parses valid silencedetect output", () => {
    const stdout = `
[silencedetect @ 0x140000] silence_start: 5.2
[silencedetect @ 0x140000] silence_end: 6.1 | silence_duration: 0.9
[silencedetect @ 0x140000] silence_start: 12.0
[silencedetect @ 0x140000] silence_end: 13.5 | silence_duration: 1.5
`;
    const segments = parseSilenceOutput(stdout);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ start: 5.2, end: 6.1 });
    expect(segments[1]).toEqual({ start: 12.0, end: 13.5 });
  });

  it("skips invalid/unrelated lines", () => {
    const stdout = `
Some random ffmpeg output
[silencedetect @ 0x140000] silence_start: 5.2
unrelated noise
[silencedetect @ 0x140000] silence_end: 6.1 | silence_duration: 0.9
frame=  120 fps= 30 q=24.0
`;
    const segments = parseSilenceOutput(stdout);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ start: 5.2, end: 6.1 });
  });

  it("returns empty array for empty output", () => {
    expect(parseSilenceOutput("")).toEqual([]);
    expect(parseSilenceOutput("no silence info here")).toEqual([]);
  });

  it("handles unpaired silence_start (no matching end)", () => {
    const stdout = `[silencedetect @ 0x140000] silence_start: 5.2
[silencedetect @ 0x140000] silence_end: 6.1 | silence_duration: 0.9
[silencedetect @ 0x140000] silence_start: 10.0
`; // no end for 10.0
    const segments = parseSilenceOutput(stdout);
    expect(segments).toHaveLength(1); // only the paired one
    expect(segments[0]).toEqual({ start: 5.2, end: 6.1 });
  });
});

// ── parseDuration ──
// Parses ffprobe duration output

describe("parseDuration (#12)", () => {
  it("parses valid ffprobe output", () => {
    expect(parseDuration("45.234\n")).toBe(45.234);
    expect(parseDuration("  12.5  \n")).toBe(12.5);
  });

  it("returns null for invalid output", () => {
    expect(parseDuration("N/A")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("not a number")).toBeNull();
  });
});

// ── generateReport ──
// Combines all analysis into a single report object

describe("generateReport", () => {
  it("combines coverage, durations, and sync into a report", () => {
    const subs = [
      { start: 0, end: 5.0, sceneId: 1, text: "hello" },
      { start: 5.0, end: 10.0, sceneId: 2, text: "world" },
    ];
    const silence = [{ start: 4.8, end: 5.2 }];
    const report = generateReport(subs, 10.0, silence);

    expect(report.videoDuration).toBe(10.0);
    expect(report.totalSubtitles).toBe(2);
    expect(report.coverage).toBeDefined();
    expect(report.coverage.percent).toBe(100);
    expect(report.durations).toBeDefined();
    expect(report.sync).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(report.summary.totalIssues).toBe(0);
    expect(report.summary.passed).toBe(true);
  });

  it("counts issues correctly", () => {
    const subs = [
      { start: 0, end: 3.0, sceneId: 1, text: "short" },
      { start: 5.0, end: 5.2, sceneId: 2, text: "tiny" }, // gap 2.0s + duration 0.2s
    ];
    const report = generateReport(subs, 5.2, []);

    // Issues: 1 gap (3.0→5.0) + 1 tooShort (0.2s) = 2
    expect(report.summary.totalIssues).toBe(2);
    expect(report.summary.passed).toBe(false);
  });

  it("handles empty subtitles", () => {
    const report = generateReport([], 10.0, []);
    expect(report.totalSubtitles).toBe(0);
    expect(report.coverage.percent).toBe(0);
    expect(report.summary.passed).toBe(false);
  });
});
