/**
 * #89 P1 (issue #140): escalating random backoff for CDP retries.
 *
 * Retry schedule: 3-5s → 6-10s → 12-20s, then give up. HTTP 429/503 backs
 * off an order of magnitude longer. The seams (extractFn/sleepFn) keep the
 * retry loop testable without a live CDP proxy.
 */
import { describe, it, expect } from "vitest";
import {
  BACKOFF_RANGES_MS,
  RATE_LIMIT_BACKOFF_MS,
  backoffDelayMs,
  rateLimitBackoffDelayMs,
  extractWithRetry,
} from "../lib/cdp-client.mjs";

describe("backoffDelayMs", () => {
  it("delays fall inside the per-attempt ranges", () => {
    for (let i = 0; i < 50; i++) {
      expect(backoffDelayMs(1)).toBeGreaterThanOrEqual(3000);
      expect(backoffDelayMs(1)).toBeLessThanOrEqual(5000);
      expect(backoffDelayMs(2)).toBeGreaterThanOrEqual(6000);
      expect(backoffDelayMs(2)).toBeLessThanOrEqual(10000);
      expect(backoffDelayMs(3)).toBeGreaterThanOrEqual(12000);
      expect(backoffDelayMs(3)).toBeLessThanOrEqual(20000);
    }
  });

  it("returns null (give up) beyond the third retry", () => {
    expect(backoffDelayMs(4)).toBeNull();
    expect(backoffDelayMs(0)).toBeNull();
  });

  it("respects the RNG seam", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(3000);
    expect(backoffDelayMs(1, () => 1)).toBe(5000);
    expect(backoffDelayMs(3, () => 0.5)).toBe(16000);
  });
});

describe("rateLimitBackoffDelayMs", () => {
  it("backs off an order of magnitude longer than normal retries", () => {
    for (let i = 0; i < 50; i++) {
      const delay = rateLimitBackoffDelayMs();
      expect(delay).toBeGreaterThanOrEqual(RATE_LIMIT_BACKOFF_MS[0]);
      expect(delay).toBeLessThanOrEqual(RATE_LIMIT_BACKOFF_MS[1]);
      expect(delay).toBeGreaterThan(BACKOFF_RANGES_MS[2][1]);
    }
  });
});

describe("extractWithRetry", () => {
  it("returns first successful extraction without sleeping", async () => {
    const sleeps = [];
    let calls = 0;
    const articles = await extractWithRetry("t1", "script", {
      extractFn: async () => (++calls === 1 ? [{ title: "a" }] : []),
      sleepFn: async (ms) => sleeps.push(ms),
    });
    expect(articles).toEqual([{ title: "a" }]);
    expect(sleeps).toEqual([]);
    expect(calls).toBe(1);
  });

  it("retries with escalating delays and stops at first success", async () => {
    const sleeps = [];
    let calls = 0;
    const articles = await extractWithRetry("t1", "script", {
      extractFn: async () => (++calls < 3 ? [] : [{ title: "late" }]),
      sleepFn: async (ms) => sleeps.push(ms),
    });
    expect(articles).toEqual([{ title: "late" }]);
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(6000);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  it("gives up after 3 retries (4 extractions total) and returns empty", async () => {
    const sleeps = [];
    let calls = 0;
    const articles = await extractWithRetry("t1", "script", {
      extractFn: async () => {
        calls++;
        return [];
      },
      sleepFn: async (ms) => sleeps.push(ms),
    });
    expect(articles).toEqual([]);
    expect(calls).toBe(4); // initial + 3 retries
    expect(sleeps).toHaveLength(3);
  });
});
