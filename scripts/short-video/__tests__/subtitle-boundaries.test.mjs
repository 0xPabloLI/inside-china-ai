import { describe, it, expect } from "vitest";
import { isSentenceEnd, isClauseBreak } from "../lib/subtitles/boundaries.mjs";

// #746 — sentence-end detection over real alignment tokens. Measured on the
// 35 packs under scripts/short-video/output (1063 segments / 5042 words):
//   - 33 distinct tokens end in `:` or `;` ("Distillation:", "target:", "scale:")
//     and the old `/[.!?:;]$/` flushed a chunk on each of them (40 chunks).
//   - 0 tokens are abbreviations or dotted acronyms, so those classes are
//     unit-level guards only; no real-data baseline exists for them.
//   - number-final periods ("and 4.7.", "since 2019.") ARE sentence ends, so
//     the external source's BARE_NUMBER class is deliberately NOT implemented.

describe("isSentenceEnd", () => {
  it("ends a sentence on . ! ?", () => {
    expect(isSentenceEnd("KPIs.")).toBe(true);
    expect(isSentenceEnd("Really?")).toBe(true);
    expect(isSentenceEnd("Stop!")).toBe(true);
  });

  it("does not treat a colon or semicolon as a sentence end", () => {
    // These are clause boundaries: the sentence continues after them.
    expect(isSentenceEnd("Distillation:")).toBe(false);
    expect(isSentenceEnd("target:")).toBe(false);
    expect(isSentenceEnd("spread;")).toBe(false);
  });

  it("does not end a sentence on a known abbreviation", () => {
    for (const t of ["Dr.", "Mr.", "Inc.", "Ltd.", "etc.", "vs.", "Fig."]) {
      expect(isSentenceEnd(t), t).toBe(false);
    }
  });

  it("does not end a sentence on a single initial or a dotted acronym", () => {
    expect(isSentenceEnd("J.")).toBe(false);
    expect(isSentenceEnd("U.S.")).toBe(false);
    expect(isSentenceEnd("U.K.")).toBe(false);
  });

  it("still ends a sentence on a number-final period", () => {
    // Real corpus: "Fable 5.1 managed 40.", "and 4.7.", "May to July 2026."
    expect(isSentenceEnd("40.")).toBe(true);
    expect(isSentenceEnd("4.7.")).toBe(true);
    expect(isSentenceEnd("2026.")).toBe(true);
  });

  it("ignores empty and undefined input", () => {
    expect(isSentenceEnd("")).toBe(false);
    expect(isSentenceEnd(undefined)).toBe(false);
  });
});

describe("isClauseBreak", () => {
  it("recognises comma, colon and semicolon as clause boundaries", () => {
    expect(isClauseBreak("scale,")).toBe(true);
    expect(isClauseBreak("Distillation:")).toBe(true);
    expect(isClauseBreak("spread;")).toBe(true);
  });

  it("treats a sentence terminator as a breakable boundary too", () => {
    expect(isClauseBreak("KPIs.")).toBe(true);
  });

  it("does not treat a plain word as a clause boundary", () => {
    expect(isClauseBreak("denoising")).toBe(false);
    expect(isClauseBreak("")).toBe(false);
  });
});
