/**
 * Tests for the CDP proxy concurrency scheduler (#273 P0.2).
 *
 * Behaviour under test (issue #273 + triage verdict 2026-09-14, item 4):
 *  - a bounded number of browser-backed operations may be in flight; the rest
 *    queue instead of piling into Chrome (four parallel pipelines terminated
 *    the single proxy process with SIGTERM on 2026-09-12);
 *  - a target that is already being driven is BUSY: a second request for the
 *    same tab waits instead of interleaving navigation state with it, while
 *    requests for other targets keep flowing;
 *  - a saturated queue refuses immediately (QUEUE_FULL) and a request that
 *    cannot be served inside its budget is refused (QUEUE_TIMEOUT) — both 503,
 *    both a "back off and retry" signal, never a source-is-dead signal;
 *  - release is idempotent, because `res` 'close' can fire more than once.
 *
 * Pure logic: no proxy process, no Chrome, no sockets. Timers are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCdpScheduler, CdpSchedulerError } from "../cdp-concurrency.mjs";

let scheduler;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const make = (over = {}) =>
  createCdpScheduler({ maxConcurrent: 2, maxQueued: 3, queueTimeoutMs: 1000, ...over });

describe("cdp scheduler — bounded in-flight work", () => {
  it("admits up to maxConcurrent and queues the rest", async () => {
    scheduler = make();
    const a = await scheduler.acquire();
    const b = await scheduler.acquire();
    expect(scheduler.stats().inFlight).toBe(2);

    const third = scheduler.acquire();
    expect(scheduler.stats().queued).toBe(1);

    a(); // free a slot → the queued request is served
    const release = await third;
    expect(scheduler.stats().inFlight).toBe(2);
    expect(scheduler.stats().queued).toBe(0);
    b();
    release();
    expect(scheduler.stats().inFlight).toBe(0);
  });

  it("serves waiting requests in order when their targets are free", async () => {
    scheduler = make();
    const r1 = await scheduler.acquire();
    const p2 = scheduler.acquire();
    const p3 = scheduler.acquire();
    r1();
    await Promise.all([p2, p3]);
    expect(scheduler.stats().inFlight).toBe(2);
  });
});

describe("cdp scheduler — per-target busy lock", () => {
  it("makes a second request for a busy target wait, without blocking others", async () => {
    scheduler = make();
    const holdA = await scheduler.acquire({ targetId: "A" });
    const holdB = await scheduler.acquire({ targetId: "B" });
    expect(scheduler.stats().busyTargets).toEqual(["A", "B"]);

    const waitingOnA = scheduler.acquire({ targetId: "A" });
    const wantsC = scheduler.acquire({ targetId: "C" });
    expect(scheduler.stats().queued).toBe(2);

    // Free a slot while A is STILL busy: the C request must be served past the
    // queued A waiter, proving a busy target never blocks unrelated targets.
    holdB();
    const releaseC = await wantsC;
    expect([...scheduler.stats().busyTargets].sort()).toEqual(["A", "C"]);
    releaseC();

    holdA();
    const releaseA2 = await waitingOnA;
    expect(scheduler.stats().busyTargets).toEqual(["A"]);
    releaseA2();
    expect(scheduler.stats().inFlight).toBe(0);
  });

  it("interleaving the same tab is prevented until the first op releases", async () => {
    scheduler = make({ maxConcurrent: 4 });
    const first = await scheduler.acquire({ targetId: "tab-9" });
    const second = scheduler.acquire({ targetId: "tab-9" });
    expect(scheduler.stats().inFlight).toBe(1);
    expect(scheduler.stats().queued).toBe(1);
    first();
    const release = await second;
    expect(scheduler.stats().inFlight).toBe(1);
    expect(scheduler.stats().busyTargets).toEqual(["tab-9"]);
    release();
  });
});

describe("cdp scheduler — refusal instead of pushing into Chrome", () => {
  it("rejects immediately when the queue is full (QUEUE_FULL, 503)", async () => {
    scheduler = make({ maxConcurrent: 1, maxQueued: 2 });
    const held = await scheduler.acquire();
    // Rejections must be observed — an unobserved one fails the suite.
    const queued1 = scheduler.acquire().catch((e) => e);
    const queued2 = scheduler.acquire().catch((e) => e);
    expect(scheduler.stats().queued).toBe(2);

    await expect(scheduler.acquire()).rejects.toMatchObject({
      code: "CDP_PROXY_QUEUE_FULL",
      status: 503,
      reason: "queue-full",
    });
    held();
    // Drain fully: each queued request is served in turn and hands back a
    // release function — proof that QUEUE_FULL refused nothing that was queued.
    const release1 = await queued1;
    expect(typeof release1).toBe("function");
    release1();
    const release2 = await queued2;
    release2();
    expect(scheduler.stats().inFlight).toBe(0);
  });

  it("times a waiter out instead of waiting forever (QUEUE_TIMEOUT, 503)", async () => {
    scheduler = make({ maxConcurrent: 1, maxQueued: 5, queueTimeoutMs: 1000 });
    const held = await scheduler.acquire();
    const queued = scheduler.acquire().catch((e) => e);

    await vi.advanceTimersByTimeAsync(1000);
    const err = await queued;
    expect(err).toBeInstanceOf(CdpSchedulerError);
    expect(err.code).toBe("CDP_PROXY_QUEUE_TIMEOUT");
    expect(err.status).toBe(503);
    expect(err.reason).toBe("saturated");
    held();
  });

  it("names a busy target as the reason when the timeout is its fault", async () => {
    scheduler = make({ maxConcurrent: 4, queueTimeoutMs: 1000 });
    await scheduler.acquire({ targetId: "stuck-tab" });
    const queued = scheduler.acquire({ targetId: "stuck-tab" }).catch((e) => e);

    await vi.advanceTimersByTimeAsync(1000);
    const err = await queued;
    expect(err.code).toBe("CDP_PROXY_QUEUE_TIMEOUT");
    expect(err.reason).toBe("target-busy");
    expect(err.targetId).toBe("stuck-tab");
  });

  it("a timed-out waiter no longer occupies queue capacity", async () => {
    scheduler = make({ maxConcurrent: 1, maxQueued: 1, queueTimeoutMs: 500 });
    const held = await scheduler.acquire();
    const first = scheduler.acquire().catch((e) => e);
    const second = scheduler.acquire(); // queue is full → must reject at once
    await expect(second).rejects.toMatchObject({ code: "CDP_PROXY_QUEUE_FULL" });

    await vi.advanceTimersByTimeAsync(500);
    expect((await first).code).toBe("CDP_PROXY_QUEUE_TIMEOUT");
    expect(scheduler.stats().queued).toBe(0);

    held(); // slot freed → a new request is admitted again
    const release = await scheduler.acquire();
    expect(scheduler.stats().inFlight).toBe(1);
    release();
  });
});

describe("cdp scheduler — release hygiene", () => {
  it("release is idempotent (res 'close' can fire more than once)", async () => {
    scheduler = make();
    const release = await scheduler.acquire();
    release();
    release();
    release();
    expect(scheduler.stats().inFlight).toBe(0);
  });

  it("a released target is immediately reusable", async () => {
    scheduler = make();
    for (let i = 0; i < 5; i++) {
      const release = await scheduler.acquire({ targetId: "same-tab" });
      expect(scheduler.stats().busyTargets).toEqual(["same-tab"]);
      release();
      expect(scheduler.stats().busyTargets).toEqual([]);
    }
  });

  it("reports its own configuration in stats()", () => {
    scheduler = make({ maxConcurrent: 2, maxQueued: 3, queueTimeoutMs: 1000 });
    expect(scheduler.stats()).toEqual({
      inFlight: 0,
      queued: 0,
      busyTargets: [],
      maxConcurrent: 2,
      maxQueued: 3,
      queueTimeoutMs: 1000,
    });
  });
});
