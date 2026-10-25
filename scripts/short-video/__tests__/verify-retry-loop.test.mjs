import { describe, it, expect, vi } from "vitest";
import { verifyWithRetry, isRetryable } from "../lib/verify-retry.mjs";

// Mock the verifySubtitles function and repair functions.
// Tests the loop logic: retry count, rollback, acceptance criteria.

function makeReport(passed, errors = 0, audioSyncErrors = 0, wordMismatch = false) {
  return {
    summary: { passed, errors, warnings: 0 },
    wordSequence: wordMismatch
      ? { matches: false, rendered: 18, expected: 19, firstMismatch: { index: 3 } }
      : { matches: true },
    audioSync:
      audioSyncErrors > 0
        ? {
            passed: false,
            errors: audioSyncErrors,
            checked: 5,
            skipped: 0,
            scenes: [{ sceneId: 1, ok: false, drift: -0.157, expected: 0, measured: -0.157 }],
          }
        : { passed: true, errors: 0, checked: 5, skipped: 0, scenes: [] },
    gaps: { violations: [] },
  };
}

describe("verifyWithRetry — PASS on first attempt", () => {
  it("returns immediately without repair", async () => {
    const mockVerify = vi.fn().mockReturnValue(makeReport(true, 0));
    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });
    expect(result.report.summary.passed).toBe(true);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});

describe("verifyWithRetry — FAIL then PASS after repair", () => {
  it("retries on FAIL and passes when repair reduces errors", async () => {
    const mockVerify = vi
      .fn()
      .mockReturnValueOnce(makeReport(false, 3, 3)) // FAIL: 3 errors
      .mockReturnValueOnce(makeReport(true, 0)); // PASS after repair

    const mockRepair = vi.fn().mockReturnValue({ success: true });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(true);
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockRepair).toHaveBeenCalledTimes(1);
  });
});

describe("verifyWithRetry — rollback on non-decreasing errors", () => {
  it("rolls back when a repair that ran doesn't reduce errors", async () => {
    const mockVerify = vi
      .fn()
      .mockReturnValueOnce(makeReport(false, 2, 2)) // FAIL: 2 errors
      .mockReturnValueOnce(makeReport(false, 2, 2)) // Still 2 after repair → rollback
      .mockReturnValueOnce(makeReport(false, 2, 2)); // Still 2 after 2nd repair → exhaust

    // `success: true` is the load-bearing part: the repair ran and rewrote the
    // files, it just did not help. That is what the rollback path is for.
    const mockRepair = vi.fn().mockReturnValue({ success: true });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(false);
    expect(mockRepair).toHaveBeenCalledTimes(2);
  });
});

describe("verifyWithRetry — exhausts retries and returns final report", () => {
  it("stops after maxRetries and returns the last report", async () => {
    const mockVerify = vi.fn().mockReturnValue(makeReport(false, 1, 1));
    const mockRepair = vi.fn().mockReturnValue({ success: true });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(false);
    // 1 initial + 2 retries = 3 total verify calls
    expect(mockVerify).toHaveBeenCalledTimes(3);
    expect(mockRepair).toHaveBeenCalledTimes(2);
  });
});

describe("verifyWithRetry — maxRetries 0 (single-shot)", () => {
  it("does not retry when maxRetries is 0", async () => {
    const mockVerify = vi.fn().mockReturnValue(makeReport(false, 1, 1));

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      maxRetries: 0,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(false);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});

describe("verifyWithRetry — repair crash handling", () => {
  it("stops instead of re-verifying when the repair never ran", async () => {
    const mockVerify = vi.fn().mockReturnValue(makeReport(false, 1, 1));

    const mockRepair = vi.fn().mockImplementation(() => {
      throw new Error("ffprobe crashed");
    });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(false);
    expect(mockRepair).toHaveBeenCalledTimes(1);
    // A repair that threw before writing left the files as they were —
    // re-reading them can only reproduce the same report, so the loop must not
    // spend the budget (#818).
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it("stops even when a failed repair already rewrote a file", async () => {
    // main.mjs's repairs rewrite the .ass and only then re-burn the video, so a
    // failed burn leaves a new .ass beside the old video. Re-verifying would
    // judge that half-applied state, and a "pass" would describe an artifact
    // the repair never produced — the shipped video still carries the old
    // subtitles. Stopping keeps the pre-repair report, and the caller fails
    // closed on it (#818).
    const mockVerify = vi.fn().mockReturnValue(makeReport(false, 2, 0));
    const mockRepair = vi.fn().mockImplementation((_category, _report, state) => {
      // "wrote" the corrected .ass, then the burn failed
      state.assPath = "/tmp/subs.ass";
      return { success: false };
    });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(false);
    expect(result.report.summary.errors).toBe(2);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});

// ─── #818 — a category whose repair cannot change the verdict ───
describe("verifyWithRetry — non-retryable failure categories (#818)", () => {
  it("classifies a word-sequence mismatch as non-retryable", () => {
    expect(isRetryable("subtitle-alignment")).toBe(false);
    expect(isRetryable("audio-sync-drift")).toBe(true);
    expect(isRetryable("cue-gaps")).toBe(true);
  });

  it("does not attempt a repair for a word-sequence mismatch", async () => {
    const mockVerify = vi.fn().mockReturnValue(makeReport(false, 1, 0, true));
    const mockRepair = vi.fn();

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(false);
    expect(mockRepair).not.toHaveBeenCalled();
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it("says the category is not retryable instead of reporting a rollback", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockVerify = vi.fn().mockReturnValue(makeReport(false, 1, 0, true));
    const mockRepair = vi.fn();

    await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    const calls = consoleSpy.mock.calls.map((c) => c.join(" "));
    expect(calls.some((s) => s.includes("subtitle-alignment") && s.includes("not retryable"))).toBe(
      true,
    );
    // "rolled back" claims a repair ran and was reverted. Nothing ran here.
    expect(calls.some((s) => s.includes("rolled back"))).toBe(false);
    consoleSpy.mockRestore();
  });

  it("still retries a retryable category that fails alongside one", async () => {
    // audio-sync-drift has the most errors, so it is the classification winner
    // and gets its repair — the non-retryable category must not veto it.
    const mockVerify = vi
      .fn()
      .mockReturnValueOnce(makeReport(false, 3, 3, true))
      .mockReturnValueOnce(makeReport(true, 0));
    const mockRepair = vi.fn().mockReturnValue({ success: true });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(mockRepair).toHaveBeenCalledWith(
      "audio-sync-drift",
      expect.anything(),
      expect.anything(),
    );
    expect(result.report.summary.passed).toBe(true);
  });
});

// ─── #870 — the repaired artifact must be the one that gets re-verified ───
describe("verifyWithRetry — repaired paths reach the re-verify (#870)", () => {
  it("verifies the path a repair returned and returns it to the caller", async () => {
    const seen = [];
    const mockVerify = vi.fn().mockImplementation((paths) => {
      seen.push(paths);
      return seen.length === 1 ? makeReport(false, 2, 2) : makeReport(true, 0);
    });
    const mockRepair = vi.fn().mockReturnValue({
      success: true,
      videoPath: "/tmp/repaired.mp4",
      assPath: "/tmp/repaired.ass",
    });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    // The first check reads the initial artifact…
    expect(seen[0]).toEqual({ videoPath: "/tmp/video.mp4", assPath: "/tmp/subs.ass" });
    // …and the re-check must read what the repair produced, not the stale path.
    expect(seen[1]).toEqual({ videoPath: "/tmp/repaired.mp4", assPath: "/tmp/repaired.ass" });
    expect(result.videoPath).toBe("/tmp/repaired.mp4");
    expect(result.assPath).toBe("/tmp/repaired.ass");
  });

  it("keeps the pre-repair paths when the repair is rolled back", async () => {
    const states = [];
    const mockVerify = vi.fn().mockReturnValue(makeReport(false, 2, 2)); // never improves
    const mockRepair = vi.fn().mockImplementation((_category, _report, state) => {
      states.push(state);
      return {
        success: true,
        videoPath: `/tmp/bad-${states.length}.mp4`,
        assPath: `/tmp/bad-${states.length}.ass`,
      };
    });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    // A rolled-back repair must not become the state of the next attempt…
    expect(states[0]).toEqual({ videoPath: "/tmp/video.mp4", assPath: "/tmp/subs.ass" });
    expect(states[1]).toEqual({ videoPath: "/tmp/video.mp4", assPath: "/tmp/subs.ass" });
    // …nor the paths returned alongside the rolled-back report.
    expect(result.videoPath).toBe("/tmp/video.mp4");
    expect(result.assPath).toBe("/tmp/subs.ass");
  });
});

describe("verifyWithRetry — logs attempts", () => {
  it("logs category, repair action, and errors before/after", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockVerify = vi
      .fn()
      .mockReturnValueOnce(makeReport(false, 3, 3))
      .mockReturnValueOnce(makeReport(true, 0));

    const mockRepair = vi.fn().mockReturnValue({ success: true });

    await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 2,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    const calls = consoleSpy.mock.calls.map((c) => c.join(" "));
    expect(calls.some((s) => s.includes("audio-sync-drift"))).toBe(true);
    consoleSpy.mockRestore();
  });
});
