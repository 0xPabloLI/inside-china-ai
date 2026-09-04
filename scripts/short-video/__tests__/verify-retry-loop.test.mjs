import { describe, it, expect, vi } from "vitest";
import { verifyWithRetry } from "../lib/verify-retry.mjs";

// Mock the verifySubtitles function and repair functions.
// Tests the loop logic: retry count, rollback, acceptance criteria.

function makeReport(passed, errors = 0, audioSyncErrors = 0) {
  return {
    summary: { passed, errors, warnings: 0 },
    wordSequence: { matches: true },
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
  it("rolls back when repair doesn't reduce errors", async () => {
    const mockVerify = vi
      .fn()
      .mockReturnValueOnce(makeReport(false, 2, 2)) // FAIL: 2 errors
      .mockReturnValueOnce(makeReport(false, 2, 2)) // Still 2 after repair → rollback
      .mockReturnValueOnce(makeReport(false, 2, 2)); // Still 2 after 2nd repair → exhaust

    const mockRepair = vi.fn().mockReturnValue({ success: false });

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
    const mockRepair = vi.fn().mockReturnValue({ success: false });

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
  it("handles repair function throwing and continues", async () => {
    const mockVerify = vi
      .fn()
      .mockReturnValueOnce(makeReport(false, 1, 1))
      .mockReturnValueOnce(makeReport(false, 1, 1));

    const mockRepair = vi.fn().mockImplementation(() => {
      throw new Error("ffprobe crashed");
    });

    const result = await verifyWithRetry({
      verifyFn: mockVerify,
      repairFn: mockRepair,
      maxRetries: 1,
      videoPath: "/tmp/video.mp4",
      assPath: "/tmp/subs.ass",
    });

    expect(result.report.summary.passed).toBe(false);
    expect(mockRepair).toHaveBeenCalledTimes(1);
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
