import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { bakePayload, candleBakeJobs, resolveDataFilePath, seriesEqual } from "../bake-quotes.mjs";

const CONTENT = "/repo/scripts/short-video/content/zhipu-valuation";

const ROWS = [
  { date: "2026-06-01", open: 1511, close: 1466, high: 1612, low: 1394, volume: 1684800 },
  { date: "2026-11-12", open: 499, close: 454, high: 505, low: 448, volume: 900000 },
];

function quote(overrides = {}) {
  return {
    symbol: "HKEX:2513",
    name: "智谱",
    currency: "HKD",
    fqt: 1,
    range: { from: "2026-06-01", to: "2026-11-14" },
    fetchedAt: "2026-11-17T02:00:00.000Z",
    sources: [
      { name: "eastmoney", url: "https://eastmoney.example" },
      { name: "tencent", url: "https://tencent.example" },
    ],
    rows: ROWS,
    ...overrides,
  };
}

describe("data file resolution", () => {
  it("resolves a pack-relative path", () => {
    expect(resolveDataFilePath(CONTENT, "data/2513-daily.json")).toBe(
      join(CONTENT, "data/2513-daily.json"),
    );
  });

  it("refuses to escape the content pack", () => {
    expect(() => resolveDataFilePath(CONTENT, "../../other/data.json")).toThrow(
      /escapes the content pack/,
    );
    expect(() => resolveDataFilePath(CONTENT, "/tmp/data.json")).toThrow(/relative POSIX path/);
    expect(() => resolveDataFilePath(CONTENT, "data\\2513.json")).toThrow(/relative POSIX path/);
  });

  it("requires a declared file", () => {
    expect(() => resolveDataFilePath(CONTENT, "")).toThrow(/missing info.dataFile/);
  });
});

describe("candle bake jobs", () => {
  it("collects only candle scenes and requires symbol + window", () => {
    const jobs = candleBakeJobs([
      {
        id: 1,
        info: {
          chart: "candle",
          symbol: "HKEX:2513",
          dataFile: "data/a.json",
          time: { from: "2026-06-01", to: "2026-11-14" },
        },
      },
      { id: 2, info: { chart: "column", data: [] } },
      { id: 3 },
    ]);
    expect(jobs).toEqual([
      {
        id: 1,
        symbol: "HKEX:2513",
        from: "2026-06-01",
        to: "2026-11-14",
        dataFile: "data/a.json",
      },
    ]);
  });

  it("fails a candle scene with no window instead of baking an open range", () => {
    expect(() =>
      candleBakeJobs([{ id: 1, info: { chart: "candle", symbol: "HKEX:2513" } }]),
    ).toThrow(/requires info.time/);
    expect(() =>
      candleBakeJobs([{ id: 1, info: { chart: "candle", dataFile: "x.json" } }]),
    ).toThrow(/requires info.symbol/);
  });
});

describe("bake payload", () => {
  it("serializes with a fixed key order", () => {
    const payload = bakePayload(quote());
    expect(Object.keys(payload)).toEqual([
      "symbol",
      "name",
      "currency",
      "fqt",
      "range",
      "fetchedAt",
      "sources",
      "rows",
    ]);
    expect(JSON.stringify(payload)).toBe(JSON.stringify(bakePayload(quote())));
  });

  it("compares content by rows, not by fetch time", () => {
    expect(seriesEqual(ROWS, [...ROWS])).toBe(true);
    expect(seriesEqual(ROWS, [{ ...ROWS[0], close: 1400 }, ROWS[1]])).toBe(false);
    expect(seriesEqual(ROWS, ROWS.slice(0, 1))).toBe(false);
  });
});
