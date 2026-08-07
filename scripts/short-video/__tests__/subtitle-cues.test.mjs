import { describe, it, expect } from "vitest";
import { chunkWords, buildCues } from "../lib/subtitles/cues.mjs";
import { measureWidth } from "../lib/subtitles/measure.mjs";
import { SUBTITLE_LANE } from "../lib/safe-zones.mjs";

// Expectations below are hand-computed from the timing rules in
// docs/archive/spec-subtitle-karaoke-timeline.md (30fps):
//   lead-in    2 frames = 0.066667s
//   chain gap  2 frames = 0.066667s
//   min cue    0.8s
//   hold-out   0.5s past end of speech
//   gaps under 0.5s are closed to exactly 2 frames

const FRAME = 1 / 30;

function words(...specs) {
  return specs.map(([text, start, end]) => ({ text, start, end }));
}

describe("chunkWords", () => {
  it("keeps the sentence-final word in its own chunk", () => {
    const input = words(
      ["DeepSeek", 0.04, 0.457],
      ["has", 0.483, 0.659],
      ["no", 0.724, 0.88],
      ["KPIs.", 0.925, 1.524],
    );
    const chunks = chunkWords(input);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("DeepSeek has no KPIs.");
    expect(chunks[0].words.map((w) => w.text)).toEqual(["DeepSeek", "has", "no", "KPIs."]);
  });

  it("derives chunk text from its own word list, so text and words cannot diverge", () => {
    const input = words(["No", 0, 0.2], ["org", 0.25, 0.4], ["chart.", 0.45, 0.8]);
    const [chunk] = chunkWords(input);
    expect(chunk.text).toBe(chunk.words.map((w) => w.text).join(" "));
  });

  it("never drops a word, whatever the sentence structure", () => {
    const input = words(
      ["They", 0.0, 0.2],
      ["started", 0.2, 0.6],
      ["as", 0.6, 0.7],
      ["ordinary", 0.7, 1.1],
      ["people.", 1.1, 1.6],
      ["No", 1.8, 2.0],
      ["money,", 2.0, 2.4],
      ["no", 2.4, 2.5],
      ["chips,", 2.5, 2.9],
      ["no", 2.9, 3.0],
      ["fame.", 3.0, 3.5],
    );
    const chunks = chunkWords(input);
    const emitted = chunks.flatMap((c) => c.words.map((w) => w.text));
    expect(emitted).toEqual(input.map((w) => w.text));
  });

  it("splits a long run at 6 words maximum", () => {
    const input = words(
      ["one", 0, 0.1],
      ["two", 0.1, 0.2],
      ["three", 0.2, 0.3],
      ["four", 0.3, 0.4],
      ["five", 0.4, 0.5],
      ["six", 0.5, 0.6],
      ["seven", 0.6, 0.7],
      ["eight", 0.7, 0.8],
    );
    const chunks = chunkWords(input);
    for (const chunk of chunks) {
      expect(chunk.words.length).toBeLessThanOrEqual(6);
    }
    expect(chunks.flatMap((c) => c.words).length).toBe(8);
  });

  it("keeps every emitted line within the hard pixel limit (single-line guarantee)", () => {
    const input = words(
      ["Unwritten,", 0, 0.5],
      ["but", 0.5, 0.7],
      ["everyone", 0.7, 1.2],
      ["absolutely", 1.2, 1.8],
      ["feels", 1.8, 2.1],
      ["it.", 2.1, 2.4],
    );
    const chunks = chunkWords(input);
    // At 60px this line exceeds the 720px lane, so it splits — every emitted
    // chunk must still fit the hard limit.
    for (const chunk of chunks) {
      expect(measureWidth(chunk.text)).toBeLessThanOrEqual(SUBTITLE_LANE.maxWidth);
    }
  });

  it("splits lines that fit in characters but exceed the pixel limit", () => {
    // 6 short uppercase words: only 29 characters — old char limit (49)
    // would emit one line, but the measured width is ~1443px > 720px.
    const big = "WWWW";
    const input = words(
      [big, 0, 0.1],
      [big, 0.1, 0.2],
      [big, 0.2, 0.3],
      [big, 0.3, 0.4],
      [big, 0.4, 0.5],
      [big, 0.5, 0.6],
    );
    const chunks = chunkWords(input);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(measureWidth(chunk.text)).toBeLessThanOrEqual(SUBTITLE_LANE.maxWidth);
    }
    // No word is ever dropped by the pixel splitting
    expect(chunks.flatMap((c) => c.words.map((w) => w.text))).toEqual(input.map((w) => w.text));
  });

  it("splits worst-case wide words before the hard pixel limit (no over-limit merge)", () => {
    // 8-char uppercase words: any 2-word line measures ~923px > 720px, so the
    // splitter must keep lines at 1 word and refuse an orphan merge that
    // would push the line over the limit.
    const w = "WWWWWWWW";
    const input = words(
      [w, 0, 0.1],
      [w, 0.1, 0.2],
      [w, 0.2, 0.3],
      [w, 0.3, 0.4],
      [`${w}.`, 0.4, 0.5],
    );
    const chunks = chunkWords(input);
    for (const chunk of chunks) {
      expect(measureWidth(chunk.text)).toBeLessThanOrEqual(SUBTITLE_LANE.maxWidth);
    }
    expect(chunks.flatMap((c) => c.words.map((x) => x.text))).toEqual(input.map((x) => x.text));
  });

  it("merges a trailing single-word chunk back into the previous line", () => {
    // "Go now." ends a sentence, so "Fast." would flush as its own one-word
    // chunk; since the combined line ("Go now. Fast.", ~393px) fits the 720px
    // lane, the orphan is merged back rather than left to blink alone.
    const input = words(["Go", 0, 0.3], ["now.", 0.35, 0.7], ["Fast.", 0.8, 1.2]);
    const chunks = chunkWords(input);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].words.map((w) => w.text)).toEqual(["Go", "now.", "Fast."]);
    expect(chunks[0].text).toBe("Go now. Fast.");
  });

  it("returns nothing for an empty word list", () => {
    expect(chunkWords([])).toEqual([]);
  });
});

describe("buildCues", () => {
  const sceneDurations = [
    { sceneId: 1, duration: 10.0 },
    { sceneId: 2, duration: 5.0 },
  ];
  // scene 1 clip: ceil(10.5 * 30) = 315 frames = 10.5s, offset 0
  // scene 2 clip: ceil(5.5 * 30)  = 165 frames = 5.5s,  offset 10.5s

  it("closes a sub-half-second gap to exactly two frames", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Hello world.",
            start: 0.5,
            end: 1.2,
            words: words(["Hello", 0.5, 0.8], ["world.", 0.85, 1.2]),
          },
          {
            text: "Next line.",
            start: 1.5,
            end: 2.2,
            words: words(["Next", 1.5, 1.8], ["line.", 1.85, 2.2]),
          },
        ],
      },
    ];
    const cues = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    expect(cues).toHaveLength(2);
    expect(cues[1].start - cues[0].end).toBeCloseTo(2 * FRAME, 6);
    // cue 2 still starts one lead-in before its speech
    expect(cues[1].start).toBeCloseTo(1.5 - 2 * FRAME, 6);
  });

  it("holds a cue half a second past the speech when the next cue is far away", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Hello world.",
            start: 0.5,
            end: 1.2,
            words: words(["Hello", 0.5, 0.8], ["world.", 0.85, 1.2]),
          },
          {
            text: "Next line.",
            start: 3.0,
            end: 3.7,
            words: words(["Next", 3.0, 3.3], ["line.", 3.35, 3.7]),
          },
        ],
      },
    ];
    const cues = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    expect(cues[0].end).toBeCloseTo(1.2 + 0.5, 6);
  });

  it("clamps the first cue to zero instead of a negative lead-in", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Go now.",
            start: 0.04,
            end: 0.9,
            words: words(["Go", 0.04, 0.4], ["now.", 0.45, 0.9]),
          },
        ],
      },
    ];
    const [cue] = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    expect(cue.start).toBe(0);
  });

  it("offsets later scenes by frame-aligned clip durations", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Scene one.",
            start: 0.5,
            end: 1.2,
            words: words(["Scene", 0.5, 0.8], ["one.", 0.85, 1.2]),
          },
        ],
      },
      {
        sceneId: 2,
        segments: [
          {
            text: "Scene two.",
            start: 0.3,
            end: 1.0,
            words: words(["Scene", 0.3, 0.6], ["two.", 0.65, 1.0]),
          },
        ],
      },
    ];
    const cues = buildCues(timing, sceneDurations);
    // scene 2 offset = 315 frames = 10.5s; first word at 0.3 -> 10.8s
    expect(cues[1].words[0].start).toBeCloseTo(10.8, 6);
    expect(cues[1].start).toBeCloseTo(10.8 - 2 * FRAME, 6);
  });

  it("keeps scene offsets correct when a scene produces no cues", () => {
    const timing = [
      { sceneId: 1, segments: [] },
      {
        sceneId: 2,
        segments: [
          {
            text: "Scene two.",
            start: 0.3,
            end: 1.0,
            words: words(["Scene", 0.3, 0.6], ["two.", 0.65, 1.0]),
          },
        ],
      },
    ];
    const cues = buildCues(timing, sceneDurations);
    expect(cues).toHaveLength(1);
    expect(cues[0].words[0].start).toBeCloseTo(10.8, 6);
  });

  it("falls back to a static cue when alignment produced no word timings", () => {
    const timing = [
      { sceneId: 1, segments: [{ text: "No word timings here.", start: 1.0, end: 2.5 }] },
    ];
    const [cue] = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    expect(cue.text).toBe("No word timings here.");
    expect(cue.words).toEqual([]);
    expect(cue.start).toBeCloseTo(1.0 - 2 * FRAME, 6);
  });

  it("clamps word timings that run past the end of the scene audio", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Way too long.",
            start: 1.0,
            end: 9.0,
            words: words(["Way", 1.0, 1.4], ["too", 1.4, 1.8], ["long.", 1.8, 12.0]),
          },
        ],
      },
    ];
    const [cue] = buildCues(timing, [{ sceneId: 1, duration: 2.0 }]);
    // scene audio is 2.0s; clip is ceil(2.5*30)=75 frames = 2.5s
    expect(cue.words[2].end).toBeCloseTo(2.0, 6);
    expect(cue.end).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it("does not emit a negative fill for inverted word timings", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Odd timing.",
            start: 1.0,
            end: 1.6,
            words: words(["Odd", 1.0, 0.9], ["timing.", 1.2, 1.6]),
          },
        ],
      },
    ];
    const [cue] = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    for (const w of cue.words) {
      expect(w.end).toBeGreaterThanOrEqual(w.start);
    }
  });

  it("gives every cue at least the minimum readable duration when room allows", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Hi there.",
            start: 1.0,
            end: 1.2,
            words: words(["Hi", 1.0, 1.05], ["there.", 1.1, 1.2]),
          },
        ],
      },
    ];
    const [cue] = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    expect(cue.end - cue.start).toBeGreaterThanOrEqual(0.8);
  });

  it("borrows time by merging cues that cannot fit the minimum duration", () => {
    // Two 2-word cues 0.35s apart: neither can hold 0.8s without overlapping.
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Go now.",
            start: 1.0,
            end: 1.25,
            words: words(["Go", 1.0, 1.1], ["now.", 1.15, 1.25]),
          },
          {
            text: "Right here.",
            start: 1.35,
            end: 1.6,
            words: words(["Right", 1.35, 1.45], ["here.", 1.5, 1.6]),
          },
        ],
      },
    ];
    const cues = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    expect(cues).toHaveLength(1);
    expect(cues[0].words.map((w) => w.text)).toEqual(["Go", "now.", "Right", "here."]);
    expect(cues[0].end - cues[0].start).toBeGreaterThanOrEqual(0.8);
  });

  it("throws when a scene has alignment data but no recorded duration", () => {
    const timing = [
      {
        sceneId: 7,
        segments: [{ text: "Orphan.", start: 0.1, end: 0.5, words: words(["Orphan.", 0.1, 0.5]) }],
      },
    ];
    expect(() => buildCues(timing, [{ sceneId: 1, duration: 10.0 }])).toThrow(/scene 7/i);
  });

  it("emits cues sorted by start time with no overlaps", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "First one.",
            start: 0.5,
            end: 1.2,
            words: words(["First", 0.5, 0.8], ["one.", 0.85, 1.2]),
          },
          {
            text: "Second one.",
            start: 1.5,
            end: 2.4,
            words: words(["Second", 1.5, 2.0], ["one.", 2.05, 2.4]),
          },
          {
            text: "Third one.",
            start: 4.0,
            end: 4.9,
            words: words(["Third", 4.0, 4.5], ["one.", 4.55, 4.9]),
          },
        ],
      },
    ];
    const cues = buildCues(timing, [{ sceneId: 1, duration: 10.0 }]);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end);
    }
  });
});
