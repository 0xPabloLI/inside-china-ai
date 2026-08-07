import { describe, it, expect } from "vitest";
import { checkBodyTextVoRedundancy } from "../lib/scene-rules.mjs";
import { THRESHOLDS } from "../lib/tiktok-rules.mjs";

// ── checkBodyTextVoRedundancy ──
// Guards the "three-tier repetition" principle: on-screen text, subtitle and
// voiceover should carry different words; verbatim overlap wastes the screen.

const MIN = THRESHOLDS.bodyTextDuplicateMinWords;

function bodyScene(id, voiceover, texts) {
  return { id, name: "body", visualType: "narrative", voiceover, texts };
}

function run(scenes) {
  const results = checkBodyTextVoRedundancy(scenes);
  return {
    warns: results.filter((r) => r.level === "warn"),
    passes: results.filter((r) => r.level === "pass"),
  };
}

describe("checkBodyTextVoRedundancy", () => {
  it("warns when on-screen text repeats a verbatim VO phrase (>= min words)", () => {
    const scenes = [
      bodyScene(1, "Hook sentence.", { line1: "HOOK" }),
      bodyScene(2, "Unwritten, but everyone feels it.", {
        note: "Unwritten, but everyone feels it",
      }),
      bodyScene(3, "Closing line.", { line1: "CLOSE" }),
    ];
    const { warns } = run(scenes);
    expect(warns).toHaveLength(1);
    expect(warns[0].check).toContain("duplicates VO");
    expect(warns[0].detail).toContain("Scene 2");
    expect(warns[0].detail).toContain("unwritten but everyone feels");
  });

  it("warns regardless of case and punctuation (normalization)", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "For DeepSeek, it's intentional.", {
        insight: "FOR DEEPSEEK, IT'S INTENTIONAL!",
      }),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    expect(run(scenes).warns).toHaveLength(1);
  });

  it("passes when overlap is shorter than the min word count", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "cut prices by 75 percent", { change: "-75%", note: "PRICE CUT" }),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    const { warns, passes } = run(scenes);
    expect(warns).toHaveLength(0);
    expect(passes.length).toBeGreaterThan(0);
  });

  it("passes on empty on-screen texts", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "Some voiceover words here.", {}),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    expect(run(scenes).warns).toHaveLength(0);
  });

  it("passes on missing voiceover", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "", { note: "any text" }),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    expect(run(scenes).warns).toHaveLength(0);
  });

  it("excludes the hook scene (index 0)", () => {
    const scenes = [
      bodyScene(1, "A leaked memo reveals the whole story today.", {
        line1: "A leaked memo reveals the whole story today",
      }),
      bodyScene(2, "Normal body line.", { note: "FINE" }),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    expect(run(scenes).warns).toHaveLength(0);
  });

  it("excludes the CTA scene (last index)", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "Normal body line.", { note: "FINE" }),
      bodyScene(3, "Follow for part 2 tomorrow.", { action: "Follow for part 2 tomorrow" }),
    ];
    expect(run(scenes).warns).toHaveLength(0);
  });

  it("flags multiple offending scenes", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "the vision requires it today", { note: "the vision requires it" }),
      bodyScene(3, "kindness over profit always", { note: "kindness over profit always" }),
      bodyScene(4, "Close.", { line1: "C" }),
    ];
    expect(run(scenes).warns).toHaveLength(2);
  });

  it("returns a single pass result when everything is clean", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "Completely different voiceover wording.", { note: "OTHER WORDS" }),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    const { warns, passes } = run(scenes);
    expect(warns).toHaveLength(0);
    expect(passes).toHaveLength(1);
    expect(passes[0].level).toBe("pass");
    expect(passes[0].category).toBe("De-AI");
  });

  it("treats numbers as tokens without false positives on partial matches", () => {
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "AI will be 10 percent of global GDP.", {
        stat: "10%",
        context: "OF GLOBAL GDP",
      }),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    const { warns } = run(scenes);
    // "of global gdp" is a 3-word phrase, below the min word count → pass
    expect(warns).toHaveLength(0);
  });

  it(`uses THRESHOLDS.bodyTextDuplicateMinWords (${MIN}) as the window size`, () => {
    expect(MIN).toBeGreaterThanOrEqual(3);
    // A verbatim 4-word phrase always warns when MIN <= 4
    const scenes = [
      bodyScene(1, "Hook.", { line1: "H" }),
      bodyScene(2, "one two three four five six", { note: "one two three four" }),
      bodyScene(3, "Close.", { line1: "C" }),
    ];
    const { warns } = run(scenes);
    if (MIN <= 4) expect(warns).toHaveLength(1);
  });
});
