import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareDailySeries,
  fetchDailyOhlc,
  fetchEastmoneyDaily,
  fetchTencentDaily,
  resolveQuoteSymbol,
  toHongKongDate,
} from "../lib/quote-fetch.mjs";

const ROWS = [
  { date: "2026-06-01", open: 1511, close: 1466, high: 1612, low: 1394, volume: 1684800 },
  { date: "2026-06-02", open: 1460, close: 1412, high: 1522, low: 1363, volume: 1290915 },
  { date: "2026-11-12", open: 499, close: 454, high: 505, low: 448, volume: 900000 },
];

function eastmoneyBody(rows = ROWS) {
  return {
    rc: 0,
    data: {
      code: "02513",
      market: 116,
      name: "智谱",
      decimal: 3,
      klines: rows.map(
        (row) =>
          `${row.date},${row.open.toFixed(3)},${row.close.toFixed(3)},${row.high.toFixed(3)},` +
          `${row.low.toFixed(3)},${row.volume},0,0,0,0,0`,
      ),
    },
  };
}

function tencentBody(rows = ROWS) {
  return {
    code: 0,
    data: {
      hk02513: {
        qfqday: rows.map((row) => [
          row.date,
          row.open.toFixed(3),
          row.close.toFixed(3),
          row.high.toFixed(3),
          row.low.toFixed(3),
          `${row.volume}.000`,
        ]),
      },
    },
  };
}

function stubFetch({ east = eastmoneyBody(), tencent = tencentBody() } = {}) {
  return vi.fn(async (url) => {
    const body = String(url).includes("eastmoney") ? east : tencent;
    return { ok: true, status: 200, json: async () => body };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("quote symbol resolution", () => {
  it("maps HKEX listings to both endpoint parameter shapes", () => {
    expect(resolveQuoteSymbol("HKEX:2513")).toEqual({
      exchange: "HKEX",
      code: "2513",
      symbol: "HKEX:2513",
      eastmoneySecid: "116.02513",
      tencentCode: "hk02513",
    });
  });

  it("accepts the dotted and bare HK forms", () => {
    expect(resolveQuoteSymbol("2513.HK").eastmoneySecid).toBe("116.02513");
    expect(resolveQuoteSymbol("02513").tencentCode).toBe("hk02513");
  });

  it("refuses a non-HKEX instrument instead of guessing a market", () => {
    expect(() => resolveQuoteSymbol("NASDAQ:NVDA")).toThrow(/not a HKEX listing/);
    expect(() => resolveQuoteSymbol("")).toThrow(/not a HKEX listing/);
  });
});

describe("Hong Kong trading-date conversion", () => {
  it("keeps a bare calendar date as written", () => {
    expect(toHongKongDate("2026-11-14")).toBe("2026-11-14");
  });

  it("shifts a UTC instant across the HKT day boundary", () => {
    // 20:00Z on the 13th is 04:00 HKT on the 14th — same bar as 11-14.
    expect(toHongKongDate("2026-11-13T20:00:00.000Z")).toBe("2026-11-14");
    // 08:00Z is 16:00 HKT, still the 13th.
    expect(toHongKongDate("2026-11-13T08:00:00.000Z")).toBe("2026-11-13");
  });

  it("rejects a non-ISO bound", () => {
    expect(() => toHongKongDate("June 2026")).toThrow(/not an ISO date/);
  });
});

describe("dual-source comparison", () => {
  it("passes identical series", () => {
    expect(compareDailySeries(ROWS, ROWS)).toEqual({ ok: true, divergences: [] });
  });

  it("names the exact row and field that disagree", () => {
    const drifted = ROWS.map((row) =>
      row.date === "2026-06-02" ? { ...row, close: row.close + 3 } : row,
    );
    const verdict = compareDailySeries(ROWS, drifted);
    expect(verdict.ok).toBe(false);
    expect(verdict.divergences).toEqual([
      { date: "2026-06-02", field: "close", primary: 1412, check: 1415 },
    ]);
  });

  it("reports a date present in only one source", () => {
    const verdict = compareDailySeries(ROWS, ROWS.slice(0, -1));
    expect(verdict.divergences).toEqual([
      { date: "2026-11-12", reason: "missing in check source" },
    ]);
  });
});

describe("source adapters", () => {
  it("parses Eastmoney OHLC in the documented column order", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const result = await fetchEastmoneyDaily("HKEX:2513", { from: "2026-06-01", to: "2026-11-12" });
    expect(result.rows[0]).toEqual(ROWS[0]);
    expect(result.name).toBe("智谱");
  });

  it("parses Tencent qfqday rows", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const result = await fetchTencentDaily("HKEX:2513", { from: "2026-06-01", to: "2026-11-12" });
    expect(result.rows).toEqual(ROWS);
  });

  it("falls back to Tencent's day block when no adjustment applies", async () => {
    const body = tencentBody();
    body.data.hk02513.day = body.data.hk02513.qfqday;
    delete body.data.hk02513.qfqday;
    vi.stubGlobal("fetch", stubFetch({ tencent: body }));
    const result = await fetchTencentDaily("HKEX:2513", { from: "2026-06-01", to: "2026-11-12" });
    expect(result.rows).toEqual(ROWS);
  });

  it("fails loudly on an empty range instead of baking an empty chart", async () => {
    vi.stubGlobal("fetch", stubFetch({ east: eastmoneyBody([]) }));
    await expect(
      fetchEastmoneyDaily("HKEX:2513", { from: "2026-06-01", to: "2026-11-12" }),
    ).rejects.toThrow(/no daily bars/);
  });
});

describe("fetchDailyOhlc", () => {
  it("returns a baked payload with provenance and fqt", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const quote = await fetchDailyOhlc(
      "HKEX:2513",
      { from: "2026-06-01T00:00:00.000Z", to: "2026-11-13T00:00:00.000Z" },
      { fetchedAt: "2026-11-17T02:00:00.000Z" },
    );
    expect(quote.symbol).toBe("HKEX:2513");
    expect(quote.fqt).toBe(1);
    expect(quote.currency).toBe("HKD");
    expect(quote.range).toEqual({ from: "2026-06-01", to: "2026-11-13" });
    expect(quote.sources.map((source) => source.name)).toEqual(["eastmoney", "tencent"]);
    expect(quote.rows.map((row) => row.date)).toEqual(["2026-06-01", "2026-06-02", "2026-11-12"]);
  });

  it("blocks a window that is not closed (to >= fetch date)", async () => {
    vi.stubGlobal("fetch", stubFetch());
    await expect(
      fetchDailyOhlc(
        "HKEX:2513",
        { from: "2026-06-01", to: "2026-11-17" },
        { fetchedAt: "2026-11-17T02:00:00.000Z" },
      ),
    ).rejects.toThrow(/not before the fetch date/);
  });

  it("refuses to pick a winner when the sources disagree", async () => {
    const drifted = ROWS.map((row) =>
      row.date === "2026-11-12" ? { ...row, high: row.high + 1 } : row,
    );
    vi.stubGlobal("fetch", stubFetch({ tencent: tencentBody(drifted) }));
    await expect(
      fetchDailyOhlc(
        "HKEX:2513",
        { from: "2026-06-01", to: "2026-11-13" },
        { fetchedAt: "2026-11-17T02:00:00.000Z" },
      ),
    ).rejects.toThrow(/2026-11-12 high: eastmoney=505 tencent=506/);
  });

  it("rejects an impossible OHLC row", async () => {
    const broken = [{ ...ROWS[0], high: 1400 }];
    vi.stubGlobal(
      "fetch",
      stubFetch({ east: eastmoneyBody(broken), tencent: tencentBody(broken) }),
    );
    await expect(
      fetchDailyOhlc(
        "HKEX:2513",
        { from: "2026-06-01", to: "2026-06-02" },
        { fetchedAt: "2026-11-17T02:00:00.000Z" },
      ),
    ).rejects.toThrow(/OHLC is impossible/);
  });
});
