import { describe, it, expect } from "vitest";
import {
  SYNC_TOLERANCE,
  expectedWordTimes,
  compareWordSequence,
  analyzeSync,
  analyzeGaps,
  analyzeCueDurations,
  analyzeWordsPerLine,
  analyzeCoverage,
  buildReport,
  parseSilenceOutput,
  parseDuration,
} from "../lib/verify-subtitles.mjs";
import { renderAss, parseAss } from "../lib/subtitles/ass.mjs";
import { buildCues } from "../lib/subtitles/cues.mjs";

// The verifier reads the artifact that will actually be burned in, and compares
// it against the alignment data. It must never recompute the generator's layout
// rules — otherwise it can only ever agree with the generator.

const FRAME = 1 / 30;

function words(...specs) {
  return specs.map(([text, start, end]) => ({ text, start, end }));
}

const timingData = [
  {
    sceneId: 1,
    segments: [
      {
        text: "DeepSeek has no KPIs.",
        start: 0.04,
        end: 1.524,
        words: words(
          ["DeepSeek", 0.04, 0.457],
          ["has", 0.483, 0.659],
          ["no", 0.724, 0.88],
          ["KPIs.", 0.925, 1.524],
        ),
      },
      {
        text: "No org chart.",
        start: 2.233,
        end: 2.931,
        words: words(["No", 2.233, 2.388], ["org", 2.434, 2.59], ["chart.", 2.615, 2.931]),
      },
    ],
  },
];
const sceneDurations = [{ sceneId: 1, duration: 4.022676 }];

function renderedCues() {
  return parseAss(renderAss(buildCues(timingData, sceneDurations)));
}

describe("expectedWordTimes", () => {
  it("places each aligned word on the absolute timeline", () => {
    const expected = expectedWordTimes(timingData, sceneDurations);
    expect(expected.map((w) => w.text)).toEqual([
      "DeepSeek",
      "has",
      "no",
      "KPIs.",
      "No",
      "org",
      "chart.",
    ]);
    expect(expected[0].start).toBeCloseTo(0.04, 6);
  });

  it("offsets later scenes by frame-aligned clip lengths", () => {
    const expected = expectedWordTimes(
      [
        ...timingData,
        {
          sceneId: 2,
          segments: [{ text: "Next.", start: 0.2, end: 0.6, words: words(["Next.", 0.2, 0.6]) }],
        },
      ],
      [...sceneDurations, { sceneId: 2, duration: 3.0 }],
    );
    // scene 1 clip = ceil(4.522676 * 30) = 136 frames = 4.533333s
    expect(expected[expected.length - 1].start).toBeCloseTo(136 / 30 + 0.2, 6);
  });
});

describe("compareWordSequence", () => {
  it("passes when the rendered subtitles contain every aligned word in order", () => {
    const result = compareWordSequence(
      renderedCues(),
      expectedWordTimes(timingData, sceneDurations),
    );
    expect(result.matches).toBe(true);
    expect(result.rendered).toBe(7);
    expect(result.expected).toBe(7);
  });

  it("fails and names the missing word when a cue drops one", () => {
    const cues = renderedCues();
    cues[0].words = cues[0].words.filter((w) => w.text !== "KPIs.");
    const result = compareWordSequence(cues, expectedWordTimes(timingData, sceneDurations));
    expect(result.matches).toBe(false);
    expect(result.firstMismatch.expected).toBe("KPIs.");
  });

  it("fails when the rendered subtitles contain a word that was never spoken", () => {
    const cues = renderedCues();
    cues[0].words.push({ text: "extra", onset: 1.9, fill: 0.2 });
    const result = compareWordSequence(cues, expectedWordTimes(timingData, sceneDurations));
    expect(result.matches).toBe(false);
  });
});

describe("analyzeSync", () => {
  it("reports near-zero deviation for freshly generated subtitles", () => {
    const result = analyzeSync(renderedCues(), expectedWordTimes(timingData, sceneDurations));
    expect(result.maxDeviation).toBeLessThanOrEqual(0.002);
    expect(result.offenders).toEqual([]);
  });

  it("flags a word whose highlight drifts past the tolerance", () => {
    const cues = renderedCues();
    cues[0].words[3].onset += 0.12;
    const result = analyzeSync(cues, expectedWordTimes(timingData, sceneDurations));
    expect(result.offenders).toHaveLength(1);
    expect(result.offenders[0].text).toBe("KPIs.");
    expect(result.offenders[0].delta).toBeCloseTo(0.12, 2);
    expect(result.maxDeviation).toBeGreaterThan(SYNC_TOLERANCE);
  });

  it("accepts a word that drifts just under the tolerance", () => {
    const cues = renderedCues();
    cues[0].words[1].onset += SYNC_TOLERANCE - 0.005;
    expect(analyzeSync(cues, expectedWordTimes(timingData, sceneDurations)).offenders).toEqual([]);
  });
});

describe("analyzeGaps", () => {
  it("accepts a two-frame chained gap", () => {
    const cues = [
      { start: 0, end: 1.0, words: [] },
      { start: 1.0 + 2 * FRAME, end: 2.0, words: [] },
    ];
    expect(analyzeGaps(cues).violations).toEqual([]);
  });

  it("accepts a gap of half a second or more", () => {
    const cues = [
      { start: 0, end: 1.0, words: [] },
      { start: 1.6, end: 2.4, words: [] },
    ];
    expect(analyzeGaps(cues).violations).toEqual([]);
  });

  it("rejects a gap in the blink band between two frames and half a second", () => {
    const cues = [
      { start: 0, end: 1.0, words: [] },
      { start: 1.14, end: 2.0, words: [] },
    ];
    const { violations } = analyzeGaps(cues);
    expect(violations).toHaveLength(1);
    expect(violations[0].gap).toBeCloseTo(0.14, 6);
  });

  it("accepts a blink-band gap that straddles a scene change", () => {
    // A cue is not allowed to cross a shot change, so the truncated out-time
    // leaves a gap the chaining rule cannot close. That is expected, not a bug.
    const cues = [
      { start: 0, end: 4.533333, words: [] },
      { start: 4.647, end: 5.6, words: [] },
    ];
    expect(analyzeGaps(cues, [4.533333]).violations).toEqual([]);
  });

  it("still rejects a blink-band gap that sits inside one scene", () => {
    const cues = [
      { start: 0, end: 1.0, words: [] },
      { start: 1.14, end: 2.0, words: [] },
    ];
    expect(analyzeGaps(cues, [4.533333]).violations).toHaveLength(1);
  });

  it("rejects overlapping cues", () => {
    const cues = [
      { start: 0, end: 1.2, words: [] },
      { start: 1.0, end: 2.0, words: [] },
    ];
    expect(analyzeGaps(cues).violations).toHaveLength(1);
  });

  it("accepts freshly generated subtitles", () => {
    expect(analyzeGaps(renderedCues()).violations).toEqual([]);
  });
});

describe("analyzeCueDurations", () => {
  it("flags a cue shorter than the readable minimum", () => {
    const { tooShort } = analyzeCueDurations([{ start: 0, end: 0.5, text: "Hi", words: [] }]);
    expect(tooShort).toHaveLength(1);
  });

  it("passes cues at or above the minimum", () => {
    expect(analyzeCueDurations([{ start: 0, end: 0.8, text: "Hi", words: [] }]).tooShort).toEqual(
      [],
    );
  });
});

describe("analyzeWordsPerLine", () => {
  it("flags a line carrying more words than the karaoke sweep can track", () => {
    const cue = {
      start: 0,
      end: 3,
      text: "a b c d e f g",
      words: Array.from({ length: 7 }, (_, i) => ({ text: `w${i}`, onset: i * 0.2, fill: 0.2 })),
    };
    expect(analyzeWordsPerLine([cue]).overLong).toHaveLength(1);
  });

  it("passes freshly generated subtitles", () => {
    expect(analyzeWordsPerLine(renderedCues()).overLong).toEqual([]);
  });
});

describe("analyzeCoverage", () => {
  it("reports the uncovered stretches of the video", () => {
    const coverage = analyzeCoverage([{ start: 0, end: 2 }], 5);
    expect(coverage.gaps).toHaveLength(1);
    expect(coverage.gaps[0].duration).toBeCloseTo(3, 6);
    expect(coverage.percent).toBeCloseTo(40, 1);
  });

  it("reports full coverage when there are no gaps over the threshold", () => {
    expect(analyzeCoverage([{ start: 0, end: 5 }], 5).gaps).toEqual([]);
  });
});

describe("buildReport", () => {
  const expected = expectedWordTimes(timingData, sceneDurations);

  it("passes for subtitles generated from the same alignment data", () => {
    const report = buildReport({
      cues: renderedCues(),
      expectedWords: expected,
      videoDuration: 4.533333,
      silenceSegments: [],
    });
    expect(report.summary.passed).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  it("does not fail a run because cues stop at scene changes", () => {
    const cues = [
      { start: 0, end: 4.533333, text: "One.", words: [] },
      { start: 4.647, end: 5.6, text: "Two.", words: [] },
    ];
    const report = buildReport({
      cues,
      expectedWords: [],
      videoDuration: 5.6,
      silenceSegments: [],
      sceneBoundaries: [4.533333],
    });
    expect(report.gaps.violations).toEqual([]);
    expect(report.summary.passed).toBe(true);
  });

  it("fails when a word is missing from the rendered subtitles", () => {
    const cues = renderedCues();
    cues[1].words = cues[1].words.slice(0, -1);
    const report = buildReport({
      cues,
      expectedWords: expected,
      videoDuration: 4.533333,
      silenceSegments: [],
    });
    expect(report.summary.passed).toBe(false);
    expect(report.wordSequence.matches).toBe(false);
  });

  it("fails when a word highlight is out of sync", () => {
    const cues = renderedCues();
    cues[0].words[0].onset += 0.2;
    const report = buildReport({
      cues,
      expectedWords: expected,
      videoDuration: 4.533333,
      silenceSegments: [],
    });
    expect(report.summary.passed).toBe(false);
    expect(report.sync.offenders).toHaveLength(1);
  });

  it("treats short cues as a warning, not a failure", () => {
    const report = buildReport({
      cues: [{ start: 0, end: 0.4, text: "Hi", words: [] }],
      expectedWords: [],
      videoDuration: 0.5,
      silenceSegments: [],
    });
    expect(report.durations.tooShort).toHaveLength(1);
    expect(report.summary.warnings).toBeGreaterThan(0);
    expect(report.summary.passed).toBe(true);
  });
});

describe("ffmpeg output parsing", () => {
  it("pairs silence start and end markers", () => {
    const output = [
      "[silencedetect @ 0x1] silence_start: 1.5",
      "[silencedetect @ 0x1] silence_end: 2.1 | silence_duration: 0.6",
    ].join("\n");
    expect(parseSilenceOutput(output)).toEqual([{ start: 1.5, end: 2.1 }]);
  });

  it("ignores an unterminated silence marker", () => {
    expect(parseSilenceOutput("silence_start: 1.5")).toEqual([]);
  });

  it("parses an ffprobe duration", () => {
    expect(parseDuration("73.899675\n")).toBeCloseTo(73.899675, 6);
    expect(parseDuration("")).toBeNull();
  });
});
