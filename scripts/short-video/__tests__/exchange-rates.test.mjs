/**
 * Exchange-rate resolver (#1415).
 *
 * One keyless quote per run; every failure path must degrade to the authored
 * fallback constants instead of throwing, because Step 0.5 sits in front of
 * TTS and a network hiccup must never abort a render.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_RATES,
  RATE_PROVIDER,
  readFreshRateReport,
  readRateReport,
  resolveExchangeRates,
  writeRateReport,
} from "../lib/exchange-rates.mjs";

const okBody = {
  result: "success",
  time_last_update_utc: "Tue, 17 Nov 2026 00:02:31 +0000",
  rates: { USD: 1, CNY: 7.0, HKD: 7.8 },
};

const okFetch = async () => ({ ok: true, json: async () => okBody });

describe("resolveExchangeRates", () => {
  it("inverts provider units-per-USD into USD-per-unit", async () => {
    const report = await resolveExchangeRates({
      fetchImpl: okFetch,
      now: () => new Date("2026-11-17T08:00:00Z"),
    });

    expect(report.fallback).toBe(false);
    expect(report.source).toBe(RATE_PROVIDER);
    expect(report.rates.CNY).toBeCloseTo(1 / 7, 10);
    expect(report.rates.HKD).toBeCloseTo(1 / 7.8, 10);
    expect(report.providerTime).toBe("Tue, 17 Nov 2026 00:02:31 +0000");
    expect(report.fetchedAt).toBe("2026-11-17T08:00:00.000Z");
  });

  it("falls back on an HTTP error", async () => {
    const report = await resolveExchangeRates({
      fetchImpl: async () => ({ ok: false, status: 503 }),
    });

    expect(report.fallback).toBe(true);
    expect(report.source).toBe("fallback");
    expect(report.error).toContain("HTTP 503");
    expect(report.rates).toEqual(DEFAULT_RATES);
    expect(report.providerTime).toBeNull();
  });

  it("falls back when the payload is missing a rate", async () => {
    const report = await resolveExchangeRates({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ result: "success", rates: { CNY: 7.0 } }),
      }),
    });

    expect(report.fallback).toBe(true);
    expect(report.error).toContain("HKD");
  });

  it("falls back when the provider reports an error result", async () => {
    const report = await resolveExchangeRates({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ result: "error", "error-type": "unsupported-code" }),
      }),
    });

    expect(report.fallback).toBe(true);
    expect(report.error).toContain("unsupported-code");
  });

  it("names the timeout instead of leaking an abort error", async () => {
    const report = await resolveExchangeRates({
      timeoutMs: 25,
      fetchImpl: async () => {
        const err = new Error("The operation was aborted");
        err.name = "TimeoutError";
        throw err;
      },
    });

    expect(report.fallback).toBe(true);
    expect(report.error).toBe("timed out after 25ms");
  });

  it("falls back when fetch is unavailable", async () => {
    const report = await resolveExchangeRates({ fetchImpl: null });
    expect(report.fallback).toBe(true);
    expect(report.error).toContain("fetch is unavailable");
  });
});

describe("rate report sidecar", () => {
  const report = {
    rates: { CNY: 0.1497, HKD: 0.1274 },
    source: RATE_PROVIDER,
    providerTime: "Tue, 17 Nov 2026 00:02:31 +0000",
    fetchedAt: "2026-11-17T10:00:00.000Z",
    fallback: false,
  };

  it("round-trips through writeRateReport/readRateReport", () => {
    const dir = mkdtempSync(join(tmpdir(), "rates-"));
    const file = join(dir, "nested", "currency-rates.json");
    try {
      expect(writeRateReport(file, report)).toBe(true);
      expect(readRateReport(file)).toEqual(report);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null for a missing or malformed sidecar", () => {
    const dir = mkdtempSync(join(tmpdir(), "rates-"));
    try {
      expect(readRateReport(join(dir, "absent.json"))).toBeNull();
      expect(readRateReport(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readFreshRateReport (#1528 cache coherence)", () => {
  const report = {
    rates: { CNY: 0.14, HKD: 0.13 },
    source: "open.er-api.com",
    providerTime: "Tue, 17 Nov 2026 00:02:31 +0000",
    fetchedAt: "2026-11-26T00:00:00.000Z",
    fallback: false,
  };

  it("reuses a report inside the freshness window", () => {
    const dir = mkdtempSync(join(tmpdir(), "rates-fresh-"));
    try {
      const file = join(dir, "currency-rates.json");
      writeRateReport(file, report);
      const now = Date.parse(report.fetchedAt) + 60 * 60 * 1000;
      expect(readFreshRateReport(file, { now })).toEqual(report);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a stale report so a new quote can land", () => {
    const dir = mkdtempSync(join(tmpdir(), "rates-stale-"));
    try {
      const file = join(dir, "currency-rates.json");
      writeRateReport(file, report);
      const now = Date.parse(report.fetchedAt) + 25 * 60 * 60 * 1000;
      expect(readFreshRateReport(file, { now })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a report stamped in the future and a missing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "rates-future-"));
    try {
      const file = join(dir, "currency-rates.json");
      writeRateReport(file, report);
      const now = Date.parse(report.fetchedAt) - 60 * 1000;
      expect(readFreshRateReport(file, { now })).toBeNull();
      expect(readFreshRateReport(join(dir, "absent.json"))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
