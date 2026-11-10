/**
 * #735 — minimal final-review loop: two declared acceptance frames per scene,
 * 3x4 QA sheets, and a frame-numbered report written by an INDEPENDENT reviewer.
 *
 * The declaration is in RELATIVE frames. Absolute frame numbers are derived
 * from lib/timeline.mjs so a TTS retake cannot silently invalidate the plan
 * (the lesson of the SFX pinned-frame expressions in repo-survey-tracking.md).
 * No quantitative thresholds live here: those need a vertical-format
 * calibration on a real pack and were explicitly excluded by the 2026-11-09
 * HITL decision (option A).
 */
import { describe, it, expect } from "vitest";
import {
  ACCEPTANCE_OFFSETS,
  SHEET_LAYOUT,
  planAcceptanceFrames,
  renderReviewRequest,
  validateReviewReport,
  decideReviewOutcome,
  buildSheetCommand,
} from "../lib/qa-final-review.mjs";

const DURATIONS = [
  { sceneId: 1, duration: 4.0, voiceover: "Hook: a robot opens a door." },
  { sceneId: 2, duration: 3.5, voiceover: "It climbs four meters." },
  { sceneId: 3, duration: 5.0, voiceover: "Subscribe for the next one." },
];

describe("planAcceptanceFrames", () => {
  it("declares exactly two distinct frames inside each scene's own window", () => {
    const plan = planAcceptanceFrames(DURATIONS);
    expect(plan.scenes).toHaveLength(3);
    for (const scene of plan.scenes) {
      expect(scene.frames).toHaveLength(2);
      expect(scene.frames.map((f) => f.label)).toEqual(["entry", "exit"]);
      expect(new Set(scene.frames.map((f) => f.frame)).size).toBe(2);
      for (const f of scene.frames) {
        expect(f.frame).toBeGreaterThanOrEqual(scene.visualStartFrames);
        expect(f.frame).toBeLessThan(scene.visualStartFrames + scene.clipFrames);
        expect(f.frame).toBeLessThan(plan.totalFrames);
      }
    }
    expect(plan.frames).toHaveLength(6);
  });

  it("keeps the declaration relative while absolute frames follow the timeline", () => {
    const before = planAcceptanceFrames(DURATIONS);
    const after = planAcceptanceFrames([{ ...DURATIONS[0], duration: 8.0 }, ...DURATIONS.slice(1)]);
    // The declaration is a pair of fixed offsets; only the derived absolute
    // positions move when the TTS take changes.
    for (const scene of [0, 1, 2]) {
      expect(after.scenes[scene].frames.map((f) => [f.offset, f.offsetFrom])).toEqual(
        before.scenes[scene].frames.map((f) => [f.offset, f.offsetFrom]),
      );
    }
    expect(after.scenes[0].frames.map((f) => f.relativeFrame)).not.toEqual(
      before.scenes[0].frames.map((f) => f.relativeFrame),
    );
    expect(after.scenes[1].frames[0].frame).toBeGreaterThan(before.scenes[1].frames[0].frame);
    expect(after.declaration).toMatchObject(ACCEPTANCE_OFFSETS);
  });

  it("fails closed when a scene is too short to hold two distinct frames", () => {
    expect(() => planAcceptanceFrames([{ sceneId: 1, duration: 0.01 }])).toThrow(/too short/i);
  });

  it("fails closed on a non-positive duration", () => {
    expect(() => planAcceptanceFrames([{ sceneId: 1, duration: 0 }])).toThrow(/duration/i);
  });

  it("stays inside the composition; the very last frame keeps its existing gate", () => {
    const plan = planAcceptanceFrames(DURATIONS);
    const last = plan.scenes.at(-1).frames.at(-1);
    expect(last).toMatchObject({ offsetFrom: "end", offset: -ACCEPTANCE_OFFSETS.exit });
    expect(last.frame).toBe(plan.totalFrames - 1 - ACCEPTANCE_OFFSETS.exit);
  });

  it("groups frames into 3x4 sheets with a stable grid address", () => {
    const many = planAcceptanceFrames(
      Array.from({ length: 7 }, (_, i) => ({ sceneId: i + 1, duration: 4.0 })),
    );
    expect(SHEET_LAYOUT).toEqual({ cols: 3, rows: 4 });
    expect(many.sheets).toHaveLength(2);
    expect(many.sheets[0].cells).toHaveLength(12);
    expect(many.sheets[1].cells).toHaveLength(2);
    expect(many.sheets[0].cells[0]).toMatchObject({ row: 1, col: 1 });
    expect(many.sheets[0].cells[4]).toMatchObject({ row: 2, col: 2 });
    expect(many.sheets[1].cells[0]).toMatchObject({ row: 1, col: 1 });
    expect(many.sheets[0].cells[0].frame).toBe(many.frames[0].frame);
  });
});

describe("renderReviewRequest", () => {
  it("carries frame numbers, grid addresses, voiceover and the independence rule", () => {
    const plan = planAcceptanceFrames(DURATIONS);
    const md = renderReviewRequest(plan, {
      contentId: "demo-pack",
      videoPath: "/tmp/demo.mp4",
      implementer: "session-impl",
    });
    for (const f of plan.frames) {
      expect(md).toContain(`frame ${f.frame}`);
      expect(md).toContain(`scene ${f.sceneId}`);
    }
    expect(md).toContain("sheet-01");
    expect(md).toContain("r1c1");
    expect(md).toContain("opens a door");
    expect(md).toContain("independent");
    expect(md).toContain("session-impl");
    expect(md).toContain("P0");
  });
});

describe("validateReviewReport", () => {
  const plan = planAcceptanceFrames(DURATIONS);
  const valid = (patch = {}) => ({
    reviewer: "review-agent",
    implementer: "session-impl",
    round: 1,
    verdict: "pass",
    findings: [],
    packetVersion: 7,
    // A pass report still has to cite every frame it reviewed — otherwise
    // "no findings" is indistinguishable from "no review".
    reviewedFrames: plan.frames.map((f) => f.frame),
    ...patch,
  });

  it("accepts a clean independent report", () => {
    expect(validateReviewReport(valid(), plan)).toEqual({ ok: true, errors: [] });
  });

  it("rejects a frame that is not in the acceptance declaration", () => {
    const res = validateReviewReport(
      valid({
        verdict: "changes-required",
        findings: [{ frame: 9999, severity: "P1", evidence: "looks wrong" }],
      }),
      plan,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/9999/);
  });

  it("rejects self-review", () => {
    const res = validateReviewReport(valid({ reviewer: "session-impl" }), plan);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/independent|reviewer/i);
  });

  it("rejects a fourth round", () => {
    const res = validateReviewReport(valid({ round: 4 }), plan);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/round/i);
  });

  it("rejects a pass verdict that still carries a P0", () => {
    const res = validateReviewReport(
      valid({
        findings: [{ frame: plan.frames[0].frame, severity: "P0", evidence: "black frame" }],
      }),
      plan,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/P0|verdict/i);
  });

  it("requires evidence text on every finding", () => {
    const res = validateReviewReport(
      valid({
        verdict: "changes-required",
        findings: [{ frame: plan.frames[0].frame, severity: "P2", evidence: "  " }],
      }),
      plan,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/evidence/i);
  });

  it("requires a pass report to cite every declared frame", () => {
    const res = validateReviewReport(valid({ reviewedFrames: [] }), plan);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/reviewedFrames/);
  });

  it("rejects an undeclared frame in reviewedFrames", () => {
    const res = validateReviewReport(
      valid({ reviewedFrames: [...plan.frames.map((f) => f.frame), 9999] }),
      plan,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/reviewedFrames/);
  });

  it("binds the report to the implementer recorded in the packet", () => {
    const res = validateReviewReport(valid(), plan, { expectedImplementer: "packet-impl" });
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/implementer/i);
  });

  it("accepts a report matching the packet implementer", () => {
    expect(validateReviewReport(valid(), plan, { expectedImplementer: "session-impl" })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("rejects a reviewer equal to the packet implementer even if the report claims another", () => {
    const res = validateReviewReport(valid({ reviewer: "packet-impl" }), plan, {
      expectedImplementer: "packet-impl",
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/independent/i);
  });

  it("binds a report to the packet version it reviewed", () => {
    const res = validateReviewReport(valid(), plan, {
      expectedImplementer: "session-impl",
      expectedPacketVersion: 6,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/packetVersion/);
  });

  it("accepts a report for the current packet version", () => {
    expect(
      validateReviewReport(valid(), plan, {
        expectedImplementer: "session-impl",
        expectedPacketVersion: 7,
      }),
    ).toEqual({ ok: true, errors: [] });
  });
});

describe("decideReviewOutcome", () => {
  const plan = planAcceptanceFrames(DURATIONS);
  const report = (round, findings) => ({
    reviewer: "review-agent",
    implementer: "session-impl",
    round,
    verdict: findings.length ? "changes-required" : "pass",
    findings,
    reviewedFrames: plan.frames.map((f) => f.frame),
  });
  const p0 = () => [{ frame: plan.frames[0].frame, severity: "P0", evidence: "black frame" }];

  it("passes when only P2 notes remain", () => {
    expect(
      decideReviewOutcome(
        report(1, [{ frame: plan.frames[0].frame, severity: "P2", evidence: "nit" }]),
        plan,
      ).status,
    ).toBe("pass");
  });

  it("asks for one more fix round when a P0 is found", () => {
    expect(decideReviewOutcome(report(1, p0()), plan)).toMatchObject({
      status: "fix-required",
      nextRound: 2,
    });
  });

  it("stops at three cumulative rounds", () => {
    expect(decideReviewOutcome(report(3, p0()), plan).status).toBe("exhausted");
  });
});

describe("buildSheetCommand", () => {
  it("builds a deterministic ffmpeg tile command with 3x4 geometry", () => {
    const plan = planAcceptanceFrames(DURATIONS);
    const argv = buildSheetCommand({
      framePaths: plan.sheets[0].cells.map((c) => `/qa/frames/frame-${c.frame}.png`),
      outPath: "/qa/sheets/sheet-01.jpg",
    });
    expect(argv[0]).toBe("ffmpeg");
    expect(argv).toContain("-frames:v");
    expect(argv.join(" ")).toContain("tile=3x4");
    expect(argv.at(-1)).toBe("/qa/sheets/sheet-01.jpg");
  });
});
