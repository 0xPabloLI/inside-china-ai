/**
 * Tests for lib/asr-repetition-guard.mjs — 转写重复幻觉护栏（JS 生产侧）。
 *
 * The Python reference lives in lib/asr_repetition_guard.py; this port covers
 * the whisper.cpp exit (`video-understand.mjs`), the only live production
 * transcript producer. Two implementations only stay honest if they agree, so
 * the last block runs both over shared vectors and compares.
 *
 * Boundary notes are the point of several cases: the guard is deliberately
 * conservative (miss rather than delete real speech), and the corpus-measured
 * gaps are pinned here so a future change is a conscious one.
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

  it("records the multi-token phrase loop as a known gap", () => {
    // "Thank you." ×8 is the MLX long-audio failure shape (1pHkv4KUiFY).
    // worst_run only counts stride-1 n-gram repeats, so a phrase loop stays
    // invisible unless coverage clears the 40-word floor at >0.50. Pinned so
    // widening the rule has to be deliberate.
    const stats = inspectTranscript(Array(8).fill("Thank you.").join(" "));
    expect(stats.contaminated).toBe(false);
    expect(stats.worstRun).toBe(1);
  });

  it("records the production FEMA loop as detected-but-not-collapsed", () => {
    // Real whisper.cpp output (live smoke 2026-10-10, `-mc 0`, video
    // 0ag_Qi5OEd0): 17 segments over 488s, only 4 distinct texts. The loop
    // unit is a multi-word phrase, so the guard flags it but never rewrites —
    // a detector here, not a fixer.
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
    expect(stats.worstRun).toBe(1);
    expect(collapseRepetition(segments.join(" "))).toBe(segments.join(" "));
  });

  it("records the top-n-gram blind spot for consecutive runs", () => {
    // 7E6i3E-fsj4: "Hard." ×20 is a real consecutive loop, but worst_run is
    // measured on the most frequent n-gram only — "stay in the" ×23 (scattered)
    // wins, so the run is invisible.
    const scattered = " stay in the corner".repeat(23);
    const text = `Ball can't go. ${Array(20).fill("Hard.").join(" ")}${scattered}`;
    const stats = inspectTranscript(text);
    expect(stats.topNgram).toEqual(["stay", "in", "the"]);
    expect(stats.worstRun).toBe(1); // the 18-token "Hard." run is not measured
  });
});

describe("collapseRepetition", () => {
  it("collapses a single-token loop to its first occurrence plus a marker", () => {
    const text = "intro " + Array(26).fill("Kampung").join(" ") + " outro";
    const out = collapseRepetition(text);
    expect(out).not.toBe(text);
    // First 3-gram block kept, marker inserted, the 2 trailing words before
    // "outro" no longer form a full loop block — 5 tokens survive in total.
    expect(out).toBe("intro Kampung Kampung Kampung [重复×8已收敛] Kampung Kampung outro");
    expect(out.startsWith("intro ")).toBe(true);
    expect(out.endsWith(" outro")).toBe(true);
  });

  it("leaves genuine repeated shouting alone", () => {
    // 2Gg4OQo7-zA: real football commentary, "Goal!" ×10 over 11.6s.
    const text =
      "It's for Iniesta. " +
      Array(10).fill("Goal!").join(" ") +
      " Oh that's a terrible back-hitter";
    expect(inspectTranscript(text).contaminated).toBe(true);
    expect(collapseRepetition(text)).toBe(text);
  });

  it("is idempotent", () => {
    const text = "intro " + Array(26).fill("Kampung").join(" ") + " outro";
    const once = collapseRepetition(text);
    expect(collapseRepetition(once)).toBe(once);
  });

  it("never rewrites input that inspect did not flag", () => {
    for (const text of [
      "",
      "hello world",
      "大家好".repeat(50),
      Array(8).fill("Thank you.").join(" "),
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
    "we ship it fast. the team is here. we ship it fast. done.",
    "大家好".repeat(50),
    "",
    "hello world",
    "a b c d e f g h i j k l m n o p q r s t u v w x y z",
    "One is red, " + Array(9).fill("one is red").join(", ") + ".",
    Array(12).fill("아").join(" ") + " 끝",
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
