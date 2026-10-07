import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluateRows, type IsDrop } from "./ranking-alert-preview";

// Same predicate shape as keyword-tracking's isDrop, inlined so this test
// stays hermetic (the real module drags server-function chains into any
// importing test).
const isDropFn = vi.fn(
  (current: number | null, previous: number | null, threshold = 3, lost = true): boolean => {
    if (previous === null) return false;
    if (current === null) return lost;
    return current - previous >= threshold;
  },
);

beforeEach(() => isDropFn.mockClear());

describe("evaluateRows", () => {
  const threshold = "3";

  // S: invalid threshold string → nothing is valid, no alerts fire
  it("marks rows invalid when the threshold is not a positive integer", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "8", to: "14" }],
      "0",
      true,
      isDropFn,
    );
    expect(row.valid).toBe(false);
    expect(row.wouldAlert).toBe(false);
    expect(row.reason).toBe("Incomplete input");
  });

  // S: non-integer threshold ("2.5") → invalid
  it("rejects non-integer thresholds", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "8", to: "14" }],
      "2.5",
      true,
      isDropFn,
    );
    expect(row.valid).toBe(false);
  });

  // S: drop past the threshold → would alert with the drop reason
  it("flags a position drop at or past the threshold", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "8", to: "14" }],
      threshold,
      true,
      isDropFn,
    );
    expect(row.valid).toBe(true);
    expect(row.wouldAlert).toBe(true);
    expect(row.alertType).toBe("drop");
    expect(row.reason).toBe("Fell from #8 to #14 (−6), at or past the 3-position threshold");
  });

  // S: improvement (to < from) → never alerts
  it("does not alert on improvements", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "14", to: "8" }],
      threshold,
      true,
      isDropFn,
    );
    expect(row.wouldAlert).toBe(false);
    expect(row.reason).toBe("Moved ↑6 — below the 3-position threshold");
  });

  // S: movement below the threshold → no alert
  it("does not alert when the drop is below the threshold", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "8", to: "10" }],
      threshold,
      true,
      isDropFn,
    );
    expect(row.wouldAlert).toBe(false);
  });

  // S: left the top 100 with lost-ranking alerts on → "lost" alert
  it("flags leaving the top 100 when lost-ranking alerts are on", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "8", to: "" }],
      threshold,
      true,
      isDropFn,
    );
    expect(row.wouldAlert).toBe(true);
    expect(row.alertType).toBe("lost");
    expect(row.reason).toBe("Left the top 100 (was #8)");
  });

  // S: left the top 100 with lost-ranking alerts off → no alert
  it("suppresses the lost-ranking alert when the switch is off", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "8", to: "" }],
      threshold,
      false,
      isDropFn,
    );
    expect(row.wouldAlert).toBe(false);
    expect(row.reason).toBe("Left top 100 but lost-ranking alerts are off");
  });

  // S: missing previous position → invalid row
  it("marks rows without a previous position invalid", () => {
    const [row] = evaluateRows(
      [{ id: 1, keyword: "kw", from: "", to: "3" }],
      threshold,
      true,
      isDropFn,
    );
    expect(row.valid).toBe(false);
    expect(row.reason).toBe("Incomplete input");
  });
});
