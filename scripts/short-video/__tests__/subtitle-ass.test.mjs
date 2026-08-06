import { describe, it, expect } from "vitest";
import { renderAss, parseAss } from "../lib/subtitles/ass.mjs";

function cue(start, end, words, text) {
  return {
    start,
    end,
    words: words.map(([t, s, e]) => ({ text: t, start: s, end: e })),
    text: text ?? words.map(([t]) => t).join(" "),
  };
}

describe("renderAss", () => {
  it("declares the 9:16 canvas and the karaoke colours", () => {
    const ass = renderAss([]);
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    // SecondaryColour = unspoken = #F5F5F5, PrimaryColour = spoken = #4d8bff
    // ASS colours are &HAABBGGRR
    expect(ass).toMatch(/Style: Default,[^\n]*&H00FF8B4D,&H00F5F5F5,/);
  });

  it("anchors every word with an absolute \\kt offset from the line start", () => {
    const ass = renderAss([
      cue(0.43, 1.7, [
        ["Hello", 0.5, 0.8],
        ["world.", 0.85, 1.2],
      ]),
    ]);
    // line starts at 0:00:00.43; "Hello" starts 0.07s later and fills for 0.30s
    expect(ass).toContain("{\\kt7\\kf30}Hello ");
    // "world." starts 0.42s after the line start, fills 0.35s
    expect(ass).toContain("{\\kt42\\kf35}world.");
  });

  it("writes sub-centisecond precision as a decimal, which libass reads as milliseconds", () => {
    const ass = renderAss([cue(1.0, 2.0, [["precise", 1.004, 1.317]])]);
    expect(ass).toContain("{\\kt0.4\\kf31.3}precise");
  });

  it("computes \\kt against the centisecond-quantised line start, not the raw float", () => {
    // 0.4333333s is written as 0:00:00.43, so the word is 0.07s (not 0.0667s) later
    const ass = renderAss([cue(0.4333333, 1.7, [["Hello", 0.5, 0.8]])]);
    expect(ass).toContain("{\\kt7\\kf30}Hello");
    expect(ass).not.toContain("\\kt6.7");
  });

  it("renders a cue without word timings as plain text", () => {
    const ass = renderAss([{ start: 1.0, end: 2.5, text: "No word timings here.", words: [] }]);
    expect(ass).toContain("Default,,0,0,0,,No word timings here.");
    expect(ass).not.toContain("\\kf");
  });

  it("escapes ASS control characters in the text", () => {
    const ass = renderAss([cue(0, 1, [["{brace}", 0.1, 0.5]])]);
    expect(ass).toContain("\\{brace\\}");
  });

  it("escapes backslashes so a literal backslash is not read as an escape", () => {
    const ass = renderAss([cue(0, 1, [["a\\b", 0.1, 0.5]])]);
    expect(ass).toContain("a\\\\b");
  });

  it("never emits a negative fill duration", () => {
    const ass = renderAss([cue(0, 1, [["odd", 0.5, 0.4]])]);
    expect(ass).not.toMatch(/\\kf-/);
  });
});

describe("parseAss", () => {
  it("recovers cue times, word order and absolute word onsets", () => {
    const original = [
      cue(0.43, 1.7, [
        ["Hello", 0.5, 0.8],
        ["world.", 0.85, 1.2],
      ]),
    ];
    const parsed = parseAss(renderAss(original));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].start).toBeCloseTo(0.43, 3);
    expect(parsed[0].end).toBeCloseTo(1.7, 3);
    expect(parsed[0].words.map((w) => w.text)).toEqual(["Hello", "world."]);
    expect(parsed[0].words[0].onset).toBeCloseTo(0.5, 3);
    expect(parsed[0].words[1].onset).toBeCloseTo(0.85, 3);
  });

  it("keeps the last word of a long line accurate — \\kt does not accumulate error", () => {
    const seven = cue(2.0, 6.0, [
      ["We", 2.037, 2.144],
      ["started", 2.169, 2.601],
      ["with", 2.683, 2.874],
      ["great", 2.917, 3.164],
      ["kindness", 3.209, 3.781],
      ["toward", 3.863, 4.234],
      ["world.", 4.267, 4.618],
    ]);
    const parsed = parseAss(renderAss([seven]));
    for (const [i, word] of parsed[0].words.entries()) {
      expect(Math.abs(word.onset - seven.words[i].start)).toBeLessThanOrEqual(0.001);
    }
  });

  it("round-trips escaped characters back to their literal form", () => {
    const parsed = parseAss(renderAss([cue(0, 1, [["{brace}", 0.1, 0.5]])]));
    expect(parsed[0].words[0].text).toBe("{brace}");
  });

  it("round-trips a literal backslash", () => {
    const parsed = parseAss(renderAss([cue(0, 1, [["a\\b", 0.1, 0.5]])]));
    expect(parsed[0].words[0].text).toBe("a\\b");
  });

  it("reads a plain-text cue as a cue with no word timings", () => {
    const parsed = parseAss(
      renderAss([{ start: 1.0, end: 2.5, text: "No word timings here.", words: [] }]),
    );
    expect(parsed[0].text).toBe("No word timings here.");
    expect(parsed[0].words).toEqual([]);
  });

  it("follows libass semantics: \\k advances the karaoke clock, \\kt resets it", () => {
    const ass = [
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\k50}{\\kf25}alpha {\\kt200\\kf30}beta",
    ].join("\n");
    const [parsed] = parseAss(ass);
    // \k50 pushes the clock to 0.5s, so "alpha" starts at 1.0 + 0.5
    expect(parsed.words[0].onset).toBeCloseTo(1.5, 3);
    // \kt200 resets the clock to an absolute 2.0s after the line start
    expect(parsed.words[1].onset).toBeCloseTo(3.0, 3);
  });

  it("returns no cues for an ASS file with no dialogue", () => {
    expect(parseAss(renderAss([]))).toEqual([]);
  });
});
