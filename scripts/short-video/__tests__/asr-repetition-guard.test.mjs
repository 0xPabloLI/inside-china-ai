/**
 * Tests for lib/asr-repetition-guard.mjs — 转写重复幻觉护栏（JS 生产侧）。
 *
 * The Python reference lives in lib/asr_repetition_guard.py; this port covers
 * the whisper.cpp exit (`video-understand.mjs`), the only live production
 * transcript producer. Two implementations only stay honest if they agree, so
 * the last block runs both over shared vectors and compares.
 *
 * 2026-10-10 rule extension (measured over 148 real transcripts: 145 MLX
 * ctx-off + 3 whisper.cpp): collapse is now period-aware — any loop unit of
 * p ≤ 16 words repeating ≥ 6 times over ≥ 18 words — and worstRun measures
 * every n-gram, not just the most frequent one. Both boundaries are pinned by
 * cases below; widening either is a conscious change.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { inspectTranscript, collapseRepetition } from "../lib/asr-repetition-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = join(__dirname, "..", "lib");

describe("inspectTranscript", () => {
  it("flags a single-token loop with worst_run", () => {
    const text = "intro " + Array(26).fill("Kampung").join(" ") + " outro";
    const stats = inspectTranscript(text);
    expect(stats.contaminated).toBe(true);
    expect(stats.worstRun).toBe(24); // 26 words → 24 consecutive 3-grams
    expect(stats.words).toBe(28);
  });

  it("does not flag normal speech with scattered repeats", () => {
    const text =
      "we ship it fast. the team is here. we ship it fast. " +
      "the team is here. we ship it fast. done.";
    expect(inspectTranscript(text).contaminated).toBe(false);
  });

  it("skips wordless scripts instead of mis-measuring them", () => {
    const stats = inspectTranscript("大家好".repeat(50));
    expect(stats.skipped).toBe("wordless-script");
    expect(stats.contaminated).toBe(false);
  });

  it("skips input too short for the n-gram window", () => {
    expect(inspectTranscript("").skipped).toBe("too-short");
    expect(inspectTranscript("hello world").skipped).toBe("too-short");
  });

  it("measures worstRun over all n-grams, not just the most frequent", () => {
    // 7E6i3E-fsj4: "Hard." ×20 is a real consecutive loop, while the most
    // frequent 3-gram is "stay in the" ×23 (scattered). The old rule measured
    // the top gram only, so the run was invisible (worstRun=1); the extended
    // rule reports the run itself.
    const scattered = " stay in the corner".repeat(23);
    const text = `Ball can't go. ${Array(20).fill("Hard.").join(" ")}${scattered}`;
    const stats = inspectTranscript(text);
    expect(stats.topNgram).toEqual(["stay", "in", "the"]);
    expect(stats.worstRun).toBe(18); // 20 words → 18 consecutive 3-grams
    expect(stats.contaminated).toBe(true);
  });

  it("flags a contiguous phrase loop whose unit is longer than the n-gram", () => {
    // -XpJeDGh8No (real MLX output): "I'm not sure if I can do this." ×14 —
    // stride-1 3-grams never repeat, so the old rule missed it entirely
    // (contaminated=false). The period-aware run scan sees the p=8 loop.
    const text = "I'm not sure if I can do this. ".repeat(14) + "tail";
    const stats = inspectTranscript(text);
    expect(stats.contaminated).toBe(true);
    expect(stats.worstRun).toBe(1); // still no stride-1 n-gram run
  });

  it("spares a short phrase loop below the 18-word run floor", () => {
    // 1pHkv4KUiFY: "Thank you." ×8 (16 words, p=2) — a real MLX long-audio
    // failure, but below the run floor; spared because the same shape occurs
    // in real speech (CwzjlmBLfrQ: a presenter thanking 6× in a 92-word
    // transcript). Pinned so lowering the floor is deliberate.
    const stats = inspectTranscript(Array(8).fill("Thank you.").join(" "));
    expect(stats.contaminated).toBe(false);
    expect(stats.worstRun).toBe(1);
  });

  it("records the production FEMA loop as detected-but-not-collapsed", () => {
    // Real whisper.cpp output (live smoke 2026-10-10, `-mc 0`, video
    // 0ag_Qi5OEd0, re-captured raw: 17 segments over 488s, 4 distinct texts).
    // The loop is *interleaved* (fema / thank-you alternating, irregular run
    // lengths) — no single ≥18-word periodic run exists, so the guard still
    // flags it (coverage) without rewriting. A detector here, not a fixer;
    // the root cause is low-SNR/music audio (VAD territory).
    const segments = [
      "The End",
      "For more information, visit www.fema.org",
      ...Array(8).fill("Thank you."),
      "For more information, visit www.fema.org",
      ...Array(4).fill("Thank you."),
      "For more information visit www.fema.org",
      "Thank you.",
    ];
    const stats = inspectTranscript(segments.join(" "));
    expect(stats.contaminated).toBe(true);
    expect(collapseRepetition(segments.join(" "))).toBe(segments.join(" "));
  });
});

describe("collapseRepetition", () => {
  it("collapses a single-token loop to its first occurrence plus a marker", () => {
    const text = "intro " + Array(26).fill("Kampung").join(" ") + " outro";
    const out = collapseRepetition(text);
    expect(out).not.toBe(text);
    expect(out).toBe("intro Kampung [重复×26已收敛] outro");
    expect(out.startsWith("intro ")).toBe(true);
    expect(out.endsWith(" outro")).toBe(true);
  });

  it("collapses a contiguous phrase loop to one unit plus a marker", () => {
    const unit = "I'm not sure if I can do this.";
    const text = `${unit} `.repeat(14) + "tail";
    const out = collapseRepetition(text);
    expect(out).toBe(`${unit} [重复×14已收敛] tail`);
  });

  it("collapses a run whose period does not align with the n-gram", () => {
    // "Stay in the corner." ×23 (p=4, 92 words) — 7E6i3E-fsj4. The old rule
    // collapsed only stride-3-aligned blocks and missed it.
    const text = "Ball can't go. " + Array(23).fill("Stay in the corner.").join(" ") + " Watch out.";
    const out = collapseRepetition(text);
    expect(out).toContain("Stay in the corner. [重复×23已收敛]");
    expect(out.startsWith("Ball can't go. Stay in the corner. [")).toBe(true);
    expect(out.endsWith(" Watch out.")).toBe(true);
  });

  it("leaves genuine repeated shouting alone", () => {
    // 2Gg4OQo7-zA: real football commentary, "Goal!" ×10 over 11.6s (10 words
    // < the 18-word floor) — and "Bang," ×14 in real song lyrics.
    const text =
      "It's for Iniesta. " +
      Array(10).fill("Goal!").join(" ") +
      " Oh that's a terrible back-hitter";
    expect(inspectTranscript(text).contaminated).toBe(true);
    expect(collapseRepetition(text)).toBe(text);
  });

  it("is idempotent", () => {
    for (const text of [
      "intro " + Array(26).fill("Kampung").join(" ") + " outro",
      "I'm not sure if I can do this. ".repeat(14) + "tail",
    ]) {
      const once = collapseRepetition(text);
      expect(collapseRepetition(once)).toBe(once);
    }
  });

  it("never rewrites input that inspect did not flag", () => {
    for (const text of [
      "",
      "hello world",
      "大家好".repeat(50),
      Array(8).fill("Thank you.").join(" "),
      Array(10).fill("Goal!").join(" "),
    ]) {
      expect(collapseRepetition(text)).toBe(text);
    }
  });
});

// ─── cross-language equivalence ─────────────────────────────────

describe("Python ↔ JS equivalence", () => {
  const vectors = [
    "intro " + Array(26).fill("Kampung").join(" ") + " outro",
    "It's for Iniesta. " + Array(10).fill("Goal!").join(" ") + " tail",
    Array(8).fill("Thank you.").join(" "),
    "I'm not sure if I can do this. ".repeat(14) + "tail",
    "Ball can't go. " + Array(23).fill("Stay in the corner.").join(" ") + " Watch out.",
    `Ball can't go. ${Array(20).fill("Hard.").join(" ")}${" stay in the corner".repeat(23)}`,
    "we ship it fast. the team is here. we ship it fast. done.",
    "大家好".repeat(50),
    "",
    "hello world",
    "a b c d e f g h i j k l m n o p q r s t u v w x y z",
    "One is red, " + Array(9).fill("one is red").join(", ") + ".",
    Array(12).fill("아").join(" ") + " 끝",
    "The End For more information, visit www.fema.org " +
      Array(8).fill("Thank you.").join(" ") + " tail",
  ];

  it("matches the Python reference on every vector", () => {
    const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(LIB)})
from asr_repetition_guard import inspect_transcript, collapse_repetition
vectors = json.load(sys.stdin)
out = []
for text in vectors:
    s = inspect_transcript(text)
    out.append({
        "words": s["words"],
        "topNgram": list(s["top_ngram"]) if s["top_ngram"] else None,
        "topCount": s["top_count"],
        "coverage": s["coverage"],
        "worstRun": s["worst_run"],
        "contaminated": s["contaminated"],
        "skipped": s["skipped"],
        "collapsed": collapse_repetition(text),
    })
json.dump(out, sys.stdout, ensure_ascii=False)
`;
    const stdout = execFileSync("python3", ["-c", py], {
      input: JSON.stringify(vectors),
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const reference = JSON.parse(stdout);

    vectors.forEach((text, i) => {
      const mine = inspectTranscript(text);
      const theirs = reference[i];
      expect({
        words: mine.words,
        topNgram: mine.topNgram,
        topCount: mine.topCount,
        coverage: mine.coverage,
        worstRun: mine.worstRun,
        contaminated: mine.contaminated,
        skipped: mine.skipped,
        collapsed: collapseRepetition(text),
      }).toEqual(theirs);
    });
  });
});
