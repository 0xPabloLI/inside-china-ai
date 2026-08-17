import { describe, it, expect } from "vitest";
import { classifyFailure } from "../lib/verify-retry.mjs";

// Spec: classifyFailure(report) → category string or null
// Categories: "audio-sync-drift", "subtitle-alignment", "cue-gaps",
//             "audio-sync-skipped", "unknown", null (PASS)

describe("classifyFailure — PASS report", () => {
  it("returns null when summary.passed is true", () => {
    const report = { summary: { passed: true, errors: 0 } };
    expect(classifyFailure(report)).toBeNull();
  });

  it("returns null even if some fields have warnings (not errors)", () => {
    const report = {
      summary: { passed: true, errors: 0, warnings: 3 },
      wordSequence: { matches: true },
      audioSync: { passed: true, errors: 0, checked: 5, skipped: 0 },
      gaps: { violations: [] },
    };
    expect(classifyFailure(report)).toBeNull();
  });
});

describe("classifyFailure — audio-sync-drift", () => {
  it("returns 'audio-sync-drift' when audioSync has scenes with ok: false", () => {
    const report = {
      summary: { passed: false, errors: 2 },
      audioSync: {
        passed: false,
        errors: 2,
        checked: 5,
        skipped: 0,
        scenes: [
          { sceneId: 1, ok: true, drift: 0.02 },
          { sceneId: 2, ok: false, drift: -0.157 },
          { sceneId: 3, ok: false, drift: -0.357 },
        ],
      },
      wordSequence: { matches: true },
      gaps: { violations: [] },
    };
    expect(classifyFailure(report)).toBe("audio-sync-drift");
  });

  it("returns 'audio-sync-drift' as highest priority when multiple categories fail", () => {
    const report = {
      summary: { passed: false, errors: 5 },
      audioSync: {
        passed: false,
        errors: 3,
        checked: 5,
        skipped: 0,
        scenes: [
          { sceneId: 1, ok: false },
          { sceneId: 2, ok: false },
          { sceneId: 3, ok: false },
        ],
      },
      wordSequence: { matches: false, firstMismatch: { index: 2 } },
      gaps: { violations: [{ index: 1 }] },
    };
    expect(classifyFailure(report)).toBe("audio-sync-drift");
  });
});

describe("classifyFailure — subtitle-alignment", () => {
  it("returns 'subtitle-alignment' when wordSequence.matches is false", () => {
    const report = {
      summary: { passed: false, errors: 1 },
      wordSequence: { matches: false, firstMismatch: { index: 0, expected: "Hello", rendered: null } },
      audioSync: null,
      gaps: { violations: [] },
    };
    expect(classifyFailure(report)).toBe("subtitle-alignment");
  });

  it("returns 'subtitle-alignment' over 'cue-gaps' when both fail (priority tie-break)", () => {
    const report = {
      summary: { passed: false, errors: 2 },
      wordSequence: { matches: false, firstMismatch: { index: 0 } },
      gaps: { violations: [{ index: 1 }] },
      audioSync: null,
    };
    expect(classifyFailure(report)).toBe("subtitle-alignment");
  });
});

describe("classifyFailure — cue-gaps", () => {
  it("returns 'cue-gaps' when gaps.violations is non-empty and no higher-priority failure", () => {
    const report = {
      summary: { passed: false, errors: 1 },
      wordSequence: { matches: true },
      gaps: { violations: [{ index: 2, gap: 0.14 }] },
      audioSync: null,
    };
    expect(classifyFailure(report)).toBe("cue-gaps");
  });
});

describe("classifyFailure — audio-sync-skipped", () => {
  it("returns 'audio-sync-skipped' when checked=0 and skipped>0", () => {
    const report = {
      summary: { passed: false, errors: 1 },
      audioSync: {
        passed: false,
        errored: false,
        checked: 0,
        skipped: 7,
        errors: 1,
        scenes: [],
      },
      wordSequence: { matches: true },
      gaps: { violations: [] },
    };
    expect(classifyFailure(report)).toBe("audio-sync-skipped");
  });
});

describe("classifyFailure — unknown", () => {
  it("returns 'unknown' for other FAIL patterns", () => {
    const report = {
      summary: { passed: false, errors: 1 },
      wordSequence: { matches: true },
      audioSync: { passed: true, errors: 0, checked: 5, skipped: 0 },
      gaps: { violations: [] },
    };
    expect(classifyFailure(report)).toBe("unknown");
  });
});

describe("classifyFailure — null/undefined handling", () => {
  it("handles null audioSync (no outputDir)", () => {
    const report = {
      summary: { passed: false, errors: 1 },
      wordSequence: { matches: false },
      audioSync: null,
      gaps: { violations: [] },
    };
    expect(classifyFailure(report)).toBe("subtitle-alignment");
  });

  it("handles undefined report fields", () => {
    const report = {
      summary: { passed: false, errors: 1 },
    };
    expect(classifyFailure(report)).toBe("unknown");
  });

  it("handles empty/null report", () => {
    expect(classifyFailure(null)).toBe("unknown");
    expect(classifyFailure(undefined)).toBe("unknown");
    expect(classifyFailure({})).toBe("unknown");
  });
});
