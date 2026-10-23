import os from "node:os";
import { promises as fs } from "node:fs";
import { describe, it, expect, afterAll } from "vitest";
import {
  parseNetIo,
  parseMemoryFreePct,
  nextParkState,
  decidePark,
  isSearxngAutoStartEnabled,
  ensureSearxng,
  parkSearxng,
} from "../searxng/lifecycle.mjs";

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

  it("does not park under pressure while NetIO moved recently", () => {
    expect(
      decidePark({
        ...base,
        freePct: 10,
        idleMs: 600_000,
        lastChangeAt: base.now - 30_000,
      }),
    ).toEqual({ park: false, reason: null });
  });

  it("parks under pressure after the quiet grace window", () => {
    expect(
      decidePark({
        ...base,
        freePct: 10,
        idleMs: 600_000,
        lastChangeAt: base.now - 120_000,
        pressureGraceMs: 120_000,
      }),
    ).toEqual({ park: true, reason: "pressure" });
  });

  it("does not park under pressure on the first sample", () => {
    expect(decidePark({ ...base, freePct: 10, lastChangeAt: undefined, lastNetIo: null })).toEqual({
      park: false,
      reason: null,
    });
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

describe("isSearxngAutoStartEnabled", () => {
  it("is enabled unless SEARXNG_AUTO_START=0", () => {
    const original = process.env.SEARXNG_AUTO_START;
    try {
      delete process.env.SEARXNG_AUTO_START;
      expect(isSearxngAutoStartEnabled()).toBe(true);
      process.env.SEARXNG_AUTO_START = "0";
      expect(isSearxngAutoStartEnabled()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.SEARXNG_AUTO_START;
      else process.env.SEARXNG_AUTO_START = original;
    }
  });
});

describe("ensureSearxng", () => {
  it("skips without touching docker when SEARXNG_AUTO_START=0", async () => {
    const original = process.env.SEARXNG_AUTO_START;
    process.env.SEARXNG_AUTO_START = "0";
    try {
      await expect(ensureSearxng()).resolves.toEqual({
        ok: false,
        skipped: true,
        reason: "auto-start-disabled",
      });
    } finally {
      if (original === undefined) delete process.env.SEARXNG_AUTO_START;
      else process.env.SEARXNG_AUTO_START = original;
    }
  });
});

describe("parkSearxng settle recheck", () => {
  const statePath = os.tmpdir() + `/searxng-park-test-${process.pid}.json`;

  afterAll(() => fs.rm(statePath, { force: true }));

  it("aborts the stop when NetIO moves during the settle window", async () => {
    await fs.writeFile(
      statePath,
      JSON.stringify({ netIo: "10MB / 5MB", lastChangeAt: Date.now() - 600_000 }),
    );
    let reads = 0;
    const stopped = [];
    const result = await parkSearxng({
      apply: true,
      settleMs: 1,
      statePath,
      platform: "darwin",
      deps: {
        colimaRunning: async () => true,
        containerRunning: async () => true,
        readNetIo: async () => (reads++ === 0 ? "10MB / 5MB" : "12MB / 7MB"),
        readMemoryFreePct: async () => 9,
        docker: async (args) => stopped.push(args),
      },
    });
    expect(result.park).toBe(false);
    expect(result.reason).toBe("netio-moved-during-settle");
    expect(stopped).toHaveLength(0);
  });

  it("stops when NetIO stays flat through the settle window", async () => {
    await fs.writeFile(
      statePath,
      JSON.stringify({ netIo: "10MB / 5MB", lastChangeAt: Date.now() - 600_000 }),
    );
    const stopped = [];
    const result = await parkSearxng({
      apply: true,
      settleMs: 1,
      statePath,
      platform: "darwin",
      deps: {
        colimaRunning: async () => true,
        containerRunning: async () => true,
        readNetIo: async () => "10MB / 5MB",
        readMemoryFreePct: async () => 9,
        docker: async (args) => stopped.push(args),
      },
    });
    expect(result.park).toBe(true);
    expect(stopped).toEqual([["stop", "searxng"]]);
  });
});
