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
  it("restores a hyphenated dotted version carried as one spoken token", () => {
    // Regression: normalize-tts-text once recorded only the digits of
    // "GPT-5.6" ({original:"5.6", spoken:["five","point","six"]}), while the
    // spoken track held "GPT-five point six". The first spoken token
    // ("GPT-five") never matched ["five"], the run was left unconsumed, and the
    // timing kept the spoken form → Gate 1 failed against the display voiceover.
    const vScenes = [
      {
        id: 7,
        voiceover: "It beat GPT-5.6 on nine of eleven.",
        ttsText: "It beat GPT-five point six on nine of eleven.",
        ttsReplacements: [{ original: "GPT-5.6", spoken: ["GPT-five", "point", "six"] }],
      },
    ];
    const timing = [
      {
        sceneId: 7,
        segments: [
          {
            text: "It beat GPT-five point six on nine of eleven.",
            start: 0,
            end: 1,
            words: [
              word("It", 0, 0.1),
              word("beat", 0.1, 0.2),
              word("GPT-five", 0.2, 0.3),
              word("point", 0.3, 0.4),
              word("six", 0.4, 0.5),
              word("on", 0.5, 0.6),
              word("nine", 0.6, 0.7),
              word("of", 0.7, 0.8),
              word("eleven.", 0.8, 0.9),
            ],
          },
        ],
      },
    ];

    restoreTimingTokens(timing, vScenes);

    const texts = timing[0].segments.flatMap((s) => s.words.map((w) => w.text));
    expect(texts).toContain("GPT-5.6");
    expect(texts).not.toContain("GPT-five");
  });

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
    const timing = [
      { sceneId: 9, segments: [{ text: "x", start: 0, end: 1, words: [word("x", 0, 1)] }] },
    ];
    const before = JSON.stringify(timing);
    restoreTimingTokens(timing, scenes);
    expect(JSON.stringify(timing)).toBe(before);
  });
});

describe("restoreTimingTokens longest-run-first (#753)", () => {
  it("does not split a larger number with a shorter run from the same scene", () => {
    // Real package (alibaba-ai-megabet scene 6): "maybe 2." records
    // ["two"], "2030 target" records ["two","thousand","thirty"]. Trying the
    // short run first restored "2030" as "2 thousand thirty".
    const vScenes = [
      {
        id: 8,
        voiceover: "It pays back in 3 years, maybe 2. 2030 target: 100 billion cloud.",
        ttsText:
          "It pays back in three years, maybe two. two thousand thirty target: one hundred billion cloud.",
        ttsReplacements: [
          { original: "3", spoken: ["three"] },
          { original: "2", spoken: ["two"] },
          { original: "2030", spoken: ["two", "thousand", "thirty"] },
          { original: "100", spoken: ["one", "hundred"] },
        ],
      },
    ];
    const words = vScenes[0].ttsText.split(" ").map((text, i) => ({ text, start: i, end: i + 1 }));
    const timing = [{ sceneId: 8, segments: [{ text: vScenes[0].ttsText, words }] }];

    restoreTimingTokens(timing, vScenes);

    const texts = timing[0].segments[0].words.map((w) => w.text);
    expect(texts).toContain("2030");
    expect(texts).toContain("100");
    expect(texts).not.toContain("thousand");
    expect(texts.join(" ")).toContain("maybe 2.");
  });
});
