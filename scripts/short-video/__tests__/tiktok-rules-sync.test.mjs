import { describe, it, expect } from "vitest";
import {
  AI_BLACKLIST,
  DASH_PATTERN,
  DEAD_CLOSER_PATTERN,
  STRONG_WORD_PATTERN,
  NUMBER_PATTERN,
  WRITTEN_OPENER_PATTERN,
  SOURCE_PATTERN,
  CTA_PATTERN,
  CLICKBAIT_PATTERNS,
  WATERMARK_PATTERN,
  GREETING_PATTERN,
  NAMED_SOURCE_PATTERN,
  TARGET_KEYWORDS,
  KNOWN_COMPANIES,
  THRESHOLDS,
} from "../lib/tiktok-rules.mjs";

// ── Drift detection: verify tiktok-rules.mjs constants satisfy invariants ──
// These tests guard against accidental changes that would cause drift
// between the code and docs/tiktok/tiktok-best-practices.md.

describe("tiktok-rules.mjs sync invariants", () => {
  // ── AI_BLACKLIST coverage ──

  it("AI_BLACKLIST has >= 40 entries (full coverage)", () => {
    expect(AI_BLACKLIST.length).toBeGreaterThanOrEqual(40);
  });

  it("AI_BLACKLIST contains written-style verbs", () => {
    expect(AI_BLACKLIST).toContain("leverage");
    expect(AI_BLACKLIST).toContain("utilize");
    expect(AI_BLACKLIST).toContain("facilitate");
    expect(AI_BLACKLIST).toContain("delve");
    expect(AI_BLACKLIST).toContain("harness");
  });

  it("AI_BLACKLIST contains written-style adverbs", () => {
    expect(AI_BLACKLIST).toContain("fundamentally");
    expect(AI_BLACKLIST).toContain("essentially");
    expect(AI_BLACKLIST).toContain("moreover");
    expect(AI_BLACKLIST).toContain("furthermore");
  });

  it("AI_BLACKLIST contains written-style nouns", () => {
    expect(AI_BLACKLIST).toContain("landscape");
    expect(AI_BLACKLIST).toContain("ecosystem");
    expect(AI_BLACKLIST).toContain("paradigm");
    expect(AI_BLACKLIST).toContain("realm");
    expect(AI_BLACKLIST).toContain("tapestry");
    expect(AI_BLACKLIST).toContain("journey");
  });

  it("AI_BLACKLIST contains clichés", () => {
    expect(AI_BLACKLIST).toContain("game-changer");
    expect(AI_BLACKLIST).toContain("deep dive");
    expect(AI_BLACKLIST).toContain("at the end of the day");
    expect(AI_BLACKLIST).toContain("dive in");
    expect(AI_BLACKLIST).toContain("it's not just");
    expect(AI_BLACKLIST).toContain("in today's fast-paced world");
  });

  it("AI_BLACKLIST contains AI tool markers (safety net)", () => {
    expect(AI_BLACKLIST).toContain("oaicite");
    expect(AI_BLACKLIST).toContain("contentreference");
    expect(AI_BLACKLIST).toContain("turn0search0");
  });

  it("AI_BLACKLIST contains AI knowledge cutoff phrases", () => {
    expect(AI_BLACKLIST).toContain("as of my last update");
    expect(AI_BLACKLIST).toContain("i cannot browse");
  });

  it("AI_BLACKLIST contains AI template placeholders", () => {
    expect(AI_BLACKLIST).toContain("[your name]");
    expect(AI_BLACKLIST).toContain("[insert hook]");
    expect(AI_BLACKLIST).toContain("[brand]");
  });

  it("AI_BLACKLIST contains AI packaging phrases", () => {
    expect(AI_BLACKLIST).toContain("certainly!");
    expect(AI_BLACKLIST).toContain("sure, here is");
    expect(AI_BLACKLIST).toContain("i hope this helps");
  });

  it("AI_BLACKLIST contains greeting/opening filler", () => {
    expect(AI_BLACKLIST).toContain("hey guys");
    expect(AI_BLACKLIST).toContain("what's up everyone");
    expect(AI_BLACKLIST).toContain("without further ado");
  });

  // ── Pattern validity ──

  it("all patterns are valid RegExp", () => {
    expect(DASH_PATTERN).toBeInstanceOf(RegExp);
    expect(DEAD_CLOSER_PATTERN).toBeInstanceOf(RegExp);
    expect(STRONG_WORD_PATTERN).toBeInstanceOf(RegExp);
    expect(NUMBER_PATTERN).toBeInstanceOf(RegExp);
    expect(WRITTEN_OPENER_PATTERN).toBeInstanceOf(RegExp);
    expect(SOURCE_PATTERN).toBeInstanceOf(RegExp);
    expect(CTA_PATTERN).toBeInstanceOf(RegExp);
    expect(WATERMARK_PATTERN).toBeInstanceOf(RegExp);
    expect(GREETING_PATTERN).toBeInstanceOf(RegExp);
    expect(NAMED_SOURCE_PATTERN).toBeInstanceOf(RegExp);
    expect(CLICKBAIT_PATTERNS.every((p) => p instanceof RegExp)).toBe(true);
  });

  // ── GREETING_PATTERN coverage ──

  it("GREETING_PATTERN covers documented greetings", () => {
    expect(GREETING_PATTERN.test("hey guys")).toBe(true);
    expect(GREETING_PATTERN.test("what's up everyone")).toBe(true);
    expect(GREETING_PATTERN.test("welcome back")).toBe(true);
    expect(GREETING_PATTERN.test("good morning")).toBe(true);
    expect(GREETING_PATTERN.test("hello")).toBe(true);
    expect(GREETING_PATTERN.test("yo")).toBe(true);
  });

  it("GREETING_PATTERN does not match non-greetings", () => {
    expect(GREETING_PATTERN.test("a leaked memo")).toBe(false);
    expect(GREETING_PATTERN.test("deepseek paused")).toBe(false);
  });

  // ── THRESHOLDS match documented values ──

  it("THRESHOLDS match documented values", () => {
    expect(THRESHOLDS.maxVoiceoverWords).toBe(180);
    expect(THRESHOLDS.maxOneBreathWords).toBe(25);
    expect(THRESHOLDS.minScenes).toBe(6);
    expect(THRESHOLDS.maxScenes).toBe(10);
    expect(THRESHOLDS.hookTextOverlapFailThreshold).toBe(0.8);
    expect(THRESHOLDS.hookTextOverlapWarnThreshold).toBe(0.5);
    expect(THRESHOLDS.bodyTextDuplicateMinWords).toBe(4);
    expect(THRESHOLDS.minSourceScenes).toBe(2);
    expect(THRESHOLDS.minKeywordScenes).toBe(2);
    expect(THRESHOLDS.minDataSceneRatio).toBe(0.5);
    expect(THRESHOLDS.teleprompterMaxDeviation).toBe(0.15);
    expect(THRESHOLDS.ctaStackThreshold).toBe(3);
    expect(THRESHOLDS.maxGoalSignals).toBe(2);
    expect(THRESHOLDS.maxCaptionLength).toBe(2200);
    expect(THRESHOLDS.maxTitleLength).toBe(60);
    expect(THRESHOLDS.minHashtags).toBe(3);
    expect(THRESHOLDS.maxHashtags).toBe(5);
    expect(THRESHOLDS.greetingCheckWords).toBe(3);
  });

  // ── Keyword lists ──

  it("TARGET_KEYWORDS contains china, ai, deepseek", () => {
    expect(TARGET_KEYWORDS).toEqual(["china", "ai", "deepseek"]);
  });

  it("KNOWN_COMPANIES contains major China AI companies", () => {
    expect(KNOWN_COMPANIES).toContain("deepseek");
    expect(KNOWN_COMPANIES).toContain("huawei");
    expect(KNOWN_COMPANIES).toContain("bytedance");
    expect(KNOWN_COMPANIES.length).toBeGreaterThanOrEqual(10);
  });
});
