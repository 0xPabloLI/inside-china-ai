/**
 * Subtitle compliance gate (#415 ②) — Netflix Timed Text Style Guide limits.
 *
 * The gate measures what actually reaches the screen: visible characters per
 * second (CPS, spaces included — the Subtitle Edit / Netflix convention),
 * characters per line (CPL) and line count, over the cues that feed renderAss.
 *
 * Run with: npx vitest run scripts/short-video/__tests__/subtitle-compliance.test.mjs
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  MAX_CPS,
  MAX_CPS_CHILD,
  MAX_CPL,
  MAX_LINES,
  visibleText,
  cueMetrics,
  checkCueCompliance,
  assertCueCompliance,
} from "../lib/subtitles/compliance.mjs";
import {
  generateSubtitles,
  enforceSubtitleCompliance,
  subtitleComplianceMode,
} from "../lib/subtitles/generate.mjs";

describe("visibleText", () => {
  it("strips karaoke override tags", () => {
    expect(visibleText("{\\kt0\\kf12}Hello {\\kt12\\kf8}world")).toBe("Hello world");
  });

  it("unescapes braces and keeps \\N as a line break", () => {
    expect(visibleText("a \\{b\\} c\\Nd")).toBe("a {b} c\nd");
  });

  it("handles null/undefined without throwing", () => {
    expect(visibleText(null)).toBe("");
    expect(visibleText(undefined)).toBe("");
  });
});

describe("cueMetrics", () => {
  it("counts characters including spaces and divides by duration", () => {
    const m = cueMetrics({ start: 10, end: 11, text: "Hello world" });
    expect(m.chars).toBe(11);
    expect(m.cps).toBeCloseTo(11, 6);
    expect(m.duration).toBeCloseTo(1, 6);
    expect(m.lines).toBe(1);
    expect(m.cpl).toBe(11);
  });

  it("treats a zero-duration cue as infinite CPS (never silently compliant)", () => {
    const m = cueMetrics({ start: 5, end: 5, text: "Hi" });
    expect(m.cps).toBe(Infinity);
  });

  it("measures CPL per line and counts \\N lines", () => {
    const m = cueMetrics({ start: 0, end: 2, text: "short\\Nthis line is longer" });
    expect(m.lines).toBe(2);
    expect(m.cpl).toBe("this line is longer".length);
  });

  it("excludes the line break from the CPS character count", () => {
    // Netflix / Subtitle-Edit count displayed characters only: a two-line cue
    // must not be charged one extra character for the break itself.
    const twoLines = cueMetrics({ start: 0, end: 1, text: "abcd\\Nefgh" });
    const oneLine = cueMetrics({ start: 0, end: 1, text: "abcdefgh" });
    expect(twoLines.lines).toBe(2);
    expect(twoLines.chars).toBe(8);
    expect(twoLines.cps).toBe(oneLine.cps);
  });

  it("measures karaoke cues by their visible words", () => {
    const cue = {
      start: 0,
      end: 1,
      words: [{ text: "Hello" }, { text: "there" }],
      text: "Hello there",
    };
    expect(cueMetrics(cue).chars).toBe(11);
  });
});

describe("checkCueCompliance", () => {
  const okCue = { start: 0, end: 1.5, text: "A short line" };

  it("passes Netflix-compliant cues", () => {
    const r = checkCueCompliance([okCue]);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.checked).toBe(1);
    expect(r.metrics.maxCps).toBeCloseTo(12 / 1.5, 6);
  });

  it("reports a CPS violation with cue index, value and limit", () => {
    // 36 chars over 1.0 s: over the 20 CPS limit, under the 42 CPL limit.
    const fast = { start: 0, end: 1, text: "This line is much too fast to read" };
    const r = checkCueCompliance([okCue, fast]);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    const [v] = r.violations;
    expect(v.code).toBe("cps");
    expect(v.index).toBe(1);
    expect(v.limit).toBe(MAX_CPS);
    expect(v.value).toBeGreaterThan(MAX_CPS);
    expect(v.text).toContain("too fast");
  });

  it("reports CPL and line-count violations separately", () => {
    const wide = { start: 0, end: 4, text: "x".repeat(MAX_CPL + 1) };
    const threeLines = { start: 10, end: 14, text: "a\\Nb\\Nc" };
    const r = checkCueCompliance([wide, threeLines]);
    const codes = r.violations.map((v) => `${v.index}:${v.code}`).sort();
    expect(codes).toContain("0:cpl");
    expect(codes).toContain("1:lines");
  });

  it("honours the child CPS limit override", () => {
    // 28 chars over 1.5 s = 18.7 CPS: fine for adults, too fast for children.
    const cue = { start: 0, end: 1.5, text: "abcdefghijklmnopqrstuvwxyzab" };
    expect(checkCueCompliance([cue]).ok).toBe(true);
    const child = checkCueCompliance([cue], { maxCps: MAX_CPS_CHILD });
    expect(child.ok).toBe(false);
    expect(child.violations[0].code).toBe("cps");
  });

  it("summarises maxima over all cues", () => {
    const r = checkCueCompliance([
      { start: 0, end: 2, text: "abcdefgh" },
      { start: 4, end: 5, text: "abcdefghij" },
    ]);
    expect(r.metrics.maxCps).toBeCloseTo(10, 6);
    expect(r.metrics.maxCpl).toBe(10);
    expect(r.metrics.maxLines).toBe(1);
  });

  it("reports empty metrics for an empty cue list", () => {
    const r = checkCueCompliance([]);
    expect(r.ok).toBe(true);
    expect(r.metrics).toEqual({ maxCps: 0, maxCpl: 0, maxLines: 0 });
  });

  it("exports the Netflix constants as the defaults", () => {
    expect(MAX_CPS).toBe(20);
    expect(MAX_CPS_CHILD).toBe(17);
    expect(MAX_CPL).toBe(42);
    expect(MAX_LINES).toBe(2);
  });
});

describe("assertCueCompliance", () => {
  it("returns the report when compliant", () => {
    const r = assertCueCompliance([{ start: 0, end: 2, text: "fine" }]);
    expect(r.ok).toBe(true);
  });

  it("throws a message listing every violation", () => {
    const bad = { start: 0, end: 0.2, text: "Way too many characters for two tenths of a second" };
    expect(() => assertCueCompliance([bad])).toThrow(/cps/);
    expect(() => assertCueCompliance([bad])).toThrow(/cue 0/);
  });
});

// ─── Wiring into the subtitle generation path (#415 ②) ───

describe("subtitle compliance gate wiring", () => {
  const timing = {
    scenes: [
      {
        sceneId: 1,
        segments: [
          {
            words: [
              { text: "This", start: 0.0, end: 0.2 },
              { text: "is", start: 0.2, end: 0.35 },
              { text: "a", start: 0.35, end: 0.45 },
              { text: "much", start: 0.45, end: 0.7 },
              { text: "too", start: 0.7, end: 0.85 },
              { text: "fast", start: 0.85, end: 1.0 },
            ],
          },
        ],
      },
    ],
  };
  const sceneDurations = [{ sceneId: 1, duration: 2.0 }];

  it("defaults to warn mode", () => {
    expect(subtitleComplianceMode({})).toBe("warn");
    expect(subtitleComplianceMode({ SUBTITLE_COMPLIANCE: "nonsense" })).toBe("warn");
    expect(subtitleComplianceMode({ SUBTITLE_COMPLIANCE: "FAIL" })).toBe("fail");
    expect(subtitleComplianceMode({ SUBTITLE_COMPLIANCE: "off" })).toBe("off");
  });

  it("warns but still writes the .ass when a cue violates the limit", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prev = process.env.SUBTITLE_MAX_CPS;
    process.env.SUBTITLE_MAX_CPS = "1";
    try {
      const out = join(tmpdir(), `compliance-warn-${Date.now()}.ass`);
      const { compliance, cues } = generateSubtitles(timing, sceneDurations, out);
      expect(cues.length).toBeGreaterThan(0);
      expect(compliance.ok).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      expect(existsSync(out)).toBe(true);
      rmSync(out, { force: true });
    } finally {
      if (prev === undefined) delete process.env.SUBTITLE_MAX_CPS;
      else process.env.SUBTITLE_MAX_CPS = prev;
      warnSpy.mockRestore();
    }
  });

  it("throws in fail mode when a cue breaks the reading-speed limit", () => {
    const env = { SUBTITLE_COMPLIANCE: "fail", SUBTITLE_MAX_CPS: "1" };
    expect(() =>
      enforceSubtitleCompliance([{ start: 0, end: 1, text: "way too fast" }], env),
    ).toThrow(/Subtitle compliance gate failed/);
  });

  it("skips the check entirely in off mode", () => {
    expect(
      enforceSubtitleCompliance([{ start: 0, end: 0.01, text: "x".repeat(80) }], {
        SUBTITLE_COMPLIANCE: "off",
      }),
    ).toBeNull();
  });

  it("honours SUBTITLE_MAX_CPS", () => {
    const cue = { start: 0, end: 1, text: "abcdefghijklmnopqrstuv" }; // 22 CPS
    expect(enforceSubtitleCompliance([cue], {})?.ok).toBe(false);
    expect(enforceSubtitleCompliance([cue], { SUBTITLE_MAX_CPS: "30" })?.ok).toBe(true);
  });
});
