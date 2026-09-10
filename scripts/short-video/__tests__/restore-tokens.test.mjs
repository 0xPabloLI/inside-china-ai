/**
 * Tests for restore-tokens.mjs — spoken→display token mapping.
 */
import { describe, it, expect } from "vitest";
import { restoreTimingTokens } from "../lib/subtitles/restore-tokens.mjs";

const scenes = [
  {
    id: 1,
    voiceover: "Dropped V4.1 Flash. Expires on 0910.",
    ttsText: "Dropped V four point one Flash. Expires on September tenth.",
    ttsReplacements: [
      { original: "V4.1", spoken: ["V", "four", "point", "one"] },
      { original: "0910", spoken: ["September", "tenth"] },
    ],
  },
];

function word(text, start, end) {
  return { text, start, end };
}

describe("restoreTimingTokens", () => {
  it("replaces spoken runs with the original token and unions timing", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "Dropped V four point one Flash.",
            start: 0,
            end: 3,
            words: [
              word("Dropped", 0, 0.6),
              word("V", 0.6, 0.8),
              word("four", 0.8, 1.0),
              word("point", 1.0, 1.2),
              word("one", 1.2, 1.4),
              word("Flash.", 1.4, 1.9),
            ],
          },
        ],
      },
    ];
    restoreTimingTokens(timing, scenes);
    const seg = timing[0].segments[0];
    expect(seg.words.map((w) => w.text)).toEqual(["Dropped", "V4.1", "Flash."]);
    const v41 = seg.words[1];
    expect(v41.start).toBe(0.6);
    expect(v41.end).toBe(1.4);
    expect(seg.text).toBe("Dropped V4.1 Flash.");
  });

  it("handles case and punctuation drift from the aligner", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "expires on september tenth",
            start: 4,
            end: 6,
            words: [
              word("expires", 4, 4.4),
              word("on", 4.4, 4.6),
              word("september", 4.6, 5.2),
              word("tenth.", 5.2, 5.8),
            ],
          },
        ],
      },
    ];
    restoreTimingTokens(timing, scenes);
    expect(timing[0].segments[0].words.map((w) => w.text)).toEqual([
      "expires",
      "on",
      // sentence-final period from "tenth." must survive the restore
      "0910.",
    ]);
    expect(timing[0].segments[0].text).toBe("expires on 0910.");
  });

  it("keeps spoken words when no replacement matches (never worse)", () => {
    const timing = [
      {
        sceneId: 1,
        segments: [
          {
            text: "nothing special here",
            start: 0,
            end: 2,
            words: [word("nothing", 0, 0.5), word("special", 0.5, 1), word("here", 1, 2)],
          },
        ],
      },
    ];
    const before = JSON.stringify(timing[0].segments);
    restoreTimingTokens(timing, scenes);
    expect(JSON.stringify(timing[0].segments)).toBe(before);
  });

  it("leaves scenes without replacements untouched", () => {
    const timing = [{ sceneId: 9, segments: [{ text: "x", start: 0, end: 1, words: [word("x", 0, 1)] }] }];
    const before = JSON.stringify(timing);
    restoreTimingTokens(timing, scenes);
    expect(JSON.stringify(timing)).toBe(before);
  });
});