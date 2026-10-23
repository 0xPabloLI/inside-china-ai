import { describe, it, expect } from "vitest";
import {
  parseNetIo,
  parseMemoryFreePct,
  nextParkState,
  decidePark,
} from "../../searxng/lifecycle.mjs";

describe("parseNetIo", () => {
  it("normalizes Docker's cumulative NetIO reading", () => {
    expect(parseNetIo("43.2MB / 15.1MB")).toBe("43.2MB / 15.1MB");
    expect(parseNetIo("  43.2MB/15.1MB\n")).toBe("43.2MB / 15.1MB");
    expect(parseNetIo("0B / 0B")).toBe("0B / 0B");
  });

  it("returns null for an unreadable reading", () => {
    expect(parseNetIo("")).toBeNull();
    expect(parseNetIo("not-a-reading")).toBeNull();
    expect(parseNetIo(undefined)).toBeNull();
  });
});

describe("parseMemoryFreePct", () => {
  it("reads the free percentage from memory_pressure output", () => {
    expect(parseMemoryFreePct("System-wide memory free percentage: 68%\n")).toBe(68);
    expect(parseMemoryFreePct("System-wide memory free percentage: 9%")).toBe(9);
  });

  it("returns null when the line is absent", () => {
    expect(parseMemoryFreePct("Pageouts: 815257")).toBeNull();
    expect(parseMemoryFreePct("")).toBeNull();
  });
});

describe("nextParkState", () => {
  it("starts the idle clock on the first sample", () => {
    expect(nextParkState({ now: 100, netIo: "1B / 1B", previous: null })).toEqual({
      netIo: "1B / 1B",
      lastChangeAt: 100,
    });
  });

  it("keeps the previous timestamp when NetIO is unchanged", () => {
    const previous = { netIo: "1B / 1B", lastChangeAt: 100 };
    expect(nextParkState({ now: 500, netIo: "1B / 1B", previous })).toBe(previous);
  });

  it("resets the clock when NetIO moves", () => {
    const previous = { netIo: "1B / 1B", lastChangeAt: 100 };
    expect(nextParkState({ now: 500, netIo: "2B / 2B", previous })).toEqual({
      netIo: "2B / 2B",
      lastChangeAt: 500,
    });
  });

  it("leaves the state untouched when NetIO cannot be read", () => {
    const previous = { netIo: "1B / 1B", lastChangeAt: 100 };
    expect(nextParkState({ now: 500, netIo: null, previous })).toBe(previous);
  });
});

describe("decidePark", () => {
  const base = {
    now: 2_000,
    lastChangeAt: 0,
    netIo: "1B / 1B",
    lastNetIo: "1B / 1B",
    freePct: 50,
    idleMs: 1_000,
    pressureFreePct: 15,
  };

  it("parks under memory pressure even when the container is active", () => {
    expect(decidePark({ ...base, freePct: 10 })).toEqual({ park: true, reason: "pressure" });
  });

  it("parks after the idle window with unchanged NetIO", () => {
    expect(decidePark(base)).toEqual({ park: true, reason: "idle" });
  });

  it("does not park before the idle window elapses", () => {
    expect(decidePark({ ...base, now: 999 })).toEqual({ park: false, reason: null });
  });

  it("does not park when NetIO moved since the last sample", () => {
    expect(decidePark({ ...base, netIo: "2B / 2B" })).toEqual({ park: false, reason: null });
  });

  it("does not park at exactly the pressure threshold", () => {
    expect(decidePark({ ...base, freePct: 15, lastChangeAt: base.now })).toEqual({
      park: false,
      reason: null,
    });
  });

  it("does not park when there is no baseline sample", () => {
    expect(decidePark({ ...base, lastChangeAt: undefined, lastNetIo: null })).toEqual({
      park: false,
      reason: null,
    });
  });
});
