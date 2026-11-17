/**
 * Daily OHLC quotes for self-rendered candlestick charts (#1405).
 *
 * The K-line used to be a chart-img.com screenshot: 800×600, a CHART-IMG.COM
 * watermark through the middle, one API call per frame, ~15 min delay. This
 * module replaces the *data* half of that trade: fetch the daily series from
 * two independent endpoints, compare them row by row, and hand the caller a
 * baked, closed-window series the renderer can draw with zero network access.
 *
 * Sources (verified live 2026-11-17):
 *   - Eastmoney `push2his.eastmoney.com/api/qt/stock/kline/get` — primary.
 *     `secid=116.02513` for HKEX 2513, `fqt=1` (forward-adjusted), 3-decimal
 *     prices, OHLCV + turnover.
 *   - Tencent `web.ifzq.gtimg.cn/appstock/app/fqkline/get` — check source.
 *     `param=hk02513,day,<from>,<to>,200,qfq`; same OHLCV values, no turnover.
 *     Yahoo v8 (403) and Stooq (JS challenge) were probed on the same date and
 *     are not usable from this machine.
 *
 * The two sources are not alternatives: one is data, the other is the reason
 * to believe it. Any field that disagrees on any row is a hard error — a
 * "take whichever answers" fallback would put one source's typo on screen
 * with the other source's name in the credit.
 *
 * Non-goals (ticket #1405): no intraday/live quotes (the narrative chart consumes
 * closed daily bars only), no markets beyond HKEX (the `116.` Eastmoney segment),
 * no TradingView scraping (ToS).
 */

const EASTMONEY_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const TENCENT_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const QUOTE_TIMEOUT_MS = 30000;
/** Both endpoints are happy with a browser UA; the bare Node UA is refused. */
const QUOTE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};
/** Price fields are 3-decimal strings on both sources; anything below this is
 * the same quote written twice. */
const PRICE_TOLERANCE = 0.0015;
/** Share volume is an integer count on Eastmoney but a 3-decimal string on
 * Tencent ("1684800.000"); sub-share drift is not a disagreement. */
const VOLUME_TOLERANCE = 0.5;

/**
 * A HKEX instrument in the `EXCHANGE:SYMBOL` form the chart map already uses.
 *
 * @typedef {{exchange: string, code: string, eastmoneySecid: string,
 *           tencentCode: string, symbol: string}} HkInstrument
 */

/**
 * Resolve an instrument identifier to both endpoints' parameter shapes.
 *
 * Only HKEX is accepted: the ticket scoped this release to the `116.` segment,
 * and a silently "best effort" NYSE path would be a second quote convention
 * with no second-source check behind it.
 *
 * @param {string} symbol - `HKEX:2513` (also accepts `2513.HK` and bare `2513`)
 * @returns {HkInstrument}
 * @throws when the symbol is malformed or not an HKEX listing
 */
export function resolveQuoteSymbol(symbol) {
  const raw = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
  const full = /^HKEX:([0-9]{1,5})$/.exec(raw);
  const dotted = /^([0-9]{1,5})\.HK$/.exec(raw);
  const bare = /^([0-9]{1,5})$/.exec(raw);
  const code = (full?.[1] ?? dotted?.[1] ?? bare?.[1] ?? "").replace(/^0+/, "");
  if (!code) {
    throw new Error(
      `quote symbol ${JSON.stringify(symbol)} is not a HKEX listing; use the full EXCHANGE:SYMBOL form (e.g. "HKEX:2513")`,
    );
  }
  const padded = code.padStart(5, "0");
  return {
    exchange: "HKEX",
    code,
    symbol: `HKEX:${code}`,
    eastmoneySecid: `116.${padded}`,
    tencentCode: `hk${padded}`,
  };
}

/**
 * The Hong Kong calendar date an ISO timestamp falls on.
 *
 * A `...T16:00:00.000Z` instant is already the NEXT day in HKT (UTC+8). Baking
 * a window by UTC date would ask for a bar the market had not printed yet and
 * then "verify" it against the same wrong window on the second source. Every
 * date that leaves this module is a HK trading date.
 *
 * @param {string} iso - ISO 8601 date or timestamp
 * @returns {string} `YYYY-MM-DD` in Asia/Hong_Kong
 * @throws when the value is not a parseable date
 */
export function toHongKongDate(iso) {
  const value = typeof iso === "string" ? iso.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new Error(`quote range bound is not an ISO date: ${JSON.stringify(iso)}`);
  }
  // A bare calendar date has no instant to shift — it already IS the trading
  // date the author wrote (2026-11-14, not "14:00 UTC on the 13th").
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) throw new Error(`invalid quote range bound: ${iso}`);
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid quote range bound: ${iso}`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

/** `2026-11-14` → `20261114` for Eastmoney's `beg`/`end` parameters. */
function compactDate(isoDate) {
  return isoDate.replace(/-/g, "");
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: QUOTE_HEADERS,
    signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${label} quote endpoint returned HTTP ${response.status}`);
  }
  const body = await response.json();
  if (!body || typeof body !== "object") {
    throw new Error(`${label} quote endpoint returned a non-object body`);
  }
  return body;
}

/** Parse one Eastmoney `klines` row: date,open,close,high,low,volume,amount,… */
function parseEastmoneyRow(line) {
  const parts = String(line).split(",");
  if (parts.length < 6) throw new Error(`Eastmoney kline row is short: ${line}`);
  return {
    date: parts[0],
    open: Number(parts[1]),
    close: Number(parts[2]),
    high: Number(parts[3]),
    low: Number(parts[4]),
    volume: Number(parts[5]),
  };
}

/** Tencent row: [date, open, close, high, low, volume]. */
function parseTencentRow(row) {
  if (!Array.isArray(row) || row.length < 6) {
    throw new Error(`Tencent kline row is malformed: ${JSON.stringify(row)}`);
  }
  return {
    date: row[0],
    open: Number(row[1]),
    close: Number(row[2]),
    high: Number(row[3]),
    low: Number(row[4]),
    volume: Number(row[5]),
  };
}

/**
 * Fetch the Eastmoney daily series.
 *
 * @param {string} symbol - accepted by {@link resolveQuoteSymbol}
 * @param {{from: string, to: string}} range
 * @returns {Promise<{name: string, decimals: number, rows: Array<object>, url: string}>}
 */
export async function fetchEastmoneyDaily(symbol, range) {
  const instrument = resolveQuoteSymbol(symbol);
  const from = toHongKongDate(range?.from);
  const to = toHongKongDate(range?.to);
  const url =
    `${EASTMONEY_URL}?secid=${instrument.eastmoneySecid}&klt=101&fqt=1` +
    `&beg=${compactDate(from)}&end=${compactDate(to)}` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
  const body = await fetchJson(url, "Eastmoney");
  if (body.rc !== 0 || !body.data) {
    throw new Error(
      `Eastmoney refused ${instrument.symbol}: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  const klines = body.data.klines;
  if (!Array.isArray(klines) || klines.length === 0) {
    throw new Error(
      `Eastmoney returned no daily bars for ${instrument.symbol} in ${from}..${to} — empty range or a suspended instrument`,
    );
  }
  return {
    name: typeof body.data.name === "string" ? body.data.name : "",
    decimals: Number.isInteger(body.data.decimal) ? body.data.decimal : 3,
    rows: klines.map(parseEastmoneyRow),
    url,
  };
}

/**
 * Fetch the Tencent forward-adjusted daily series (the check source).
 *
 * @param {string} symbol - accepted by {@link resolveQuoteSymbol}
 * @param {{from: string, to: string}} range
 * @returns {Promise<{rows: Array<object>, url: string}>}
 */
export async function fetchTencentDaily(symbol, range) {
  const instrument = resolveQuoteSymbol(symbol);
  const from = toHongKongDate(range?.from);
  const to = toHongKongDate(range?.to);
  const url = `${TENCENT_URL}?param=${instrument.tencentCode},day,${from},${to},200,qfq`;
  const body = await fetchJson(url, "Tencent");
  if (body.code !== 0 || !body.data) {
    throw new Error(`Tencent refused ${instrument.symbol}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  const block = body.data[instrument.tencentCode];
  // `qfqday` when the adjustment actually applies; `day` when the instrument
  // has no corporate action in the window. Both are the same series here.
  const rows = block?.qfqday ?? block?.day;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `Tencent returned no daily bars for ${instrument.symbol} in ${from}..${to} — empty range or a suspended instrument`,
    );
  }
  return { rows: rows.map(parseTencentRow), url };
}

function sameNumber(a, b, tolerance) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

/**
 * Compare two series row by row.
 *
 * @param {Array<object>} primary
 * @param {Array<object>} check
 * @returns {{ok: boolean, divergences: Array<{date: string, field?: string,
 *            primary?: number|string, check?: number|string, reason?: string}>}}
 */
export function compareDailySeries(primary, check) {
  const divergences = [];
  const primaryByDate = new Map(primary.map((row) => [row.date, row]));
  const checkByDate = new Map(check.map((row) => [row.date, row]));
  for (const date of primaryByDate.keys()) {
    if (!checkByDate.has(date)) divergences.push({ date, reason: "missing in check source" });
  }
  for (const date of checkByDate.keys()) {
    if (!primaryByDate.has(date)) divergences.push({ date, reason: "missing in primary source" });
  }
  for (const [date, row] of primaryByDate) {
    const other = checkByDate.get(date);
    if (!other) continue;
    for (const field of ["open", "high", "low", "close"]) {
      if (!sameNumber(row[field], other[field], PRICE_TOLERANCE)) {
        divergences.push({ date, field, primary: row[field], check: other[field] });
      }
    }
    if (!sameNumber(row.volume, other.volume, VOLUME_TOLERANCE)) {
      divergences.push({ date, field: "volume", primary: row.volume, check: other.volume });
    }
  }
  return { ok: divergences.length === 0, divergences };
}

/** Structural sanity every baked row must satisfy, regardless of source. */
function assertRowShape(rows) {
  let previous = "";
  for (const [index, row] of rows.entries()) {
    const where = `row ${index} (${row.date ?? "no date"})`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date))) {
      throw new Error(`quote ${where}: date is not YYYY-MM-DD`);
    }
    for (const field of ["open", "high", "low", "close", "volume"]) {
      if (!Number.isFinite(row[field])) throw new Error(`quote ${where}: ${field} is not finite`);
    }
    if (row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close)) {
      throw new Error(`quote ${where}: OHLC is impossible (high/low do not bracket open/close)`);
    }
    if (row.date <= previous) {
      throw new Error(`quote ${where}: dates must be unique and ascending`);
    }
    previous = row.date;
  }
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Fetch one instrument's closed daily window from both sources and return the
 * baked payload only when every row agrees.
 *
 * @param {string} symbol - `HKEX:2513` (see {@link resolveQuoteSymbol})
 * @param {{from: string, to: string}} range - ISO dates / timestamps; converted to HK trading dates
 * @param {{fetchedAt?: string}} [options] - injectable for tests
 * @returns {Promise<{symbol: string, name: string, currency: string, fqt: number,
 *           range: {from: string, to: string}, fetchedAt: string,
 *           sources: Array<{name: string, url: string}>,
 *           rows: Array<{date: string, open: number, close: number,
 *                         high: number, low: number, volume: number}>}>}
 * @throws when a source fails, the window is not closed, the window is empty,
 *         or the two sources disagree on any field of any row
 */
export async function fetchDailyOhlc(symbol, range, options = {}) {
  const instrument = resolveQuoteSymbol(symbol);
  const from = toHongKongDate(range?.from);
  const to = toHongKongDate(range?.to);
  if (from > to) throw new Error(`quote window is inverted: ${from} > ${to}`);

  const fetchedAt = options.fetchedAt ? new Date(options.fetchedAt) : new Date();
  if (Number.isNaN(fetchedAt.getTime())) throw new Error("fetchedAt is not a valid timestamp");
  const fetchedOn = toHongKongDate(fetchedAt.toISOString());
  if (to >= fetchedOn) {
    throw new Error(
      `quote window ends ${to}, which is not before the fetch date ${fetchedOn}; ` +
        "bake only closed daily bars (the narrative chart must not show an intraday bar)",
    );
  }

  const [primary, check] = await Promise.all([
    fetchEastmoneyDaily(instrument.symbol, { from, to }),
    fetchTencentDaily(instrument.symbol, { from, to }),
  ]);
  const verdict = compareDailySeries(primary.rows, check.rows);
  if (!verdict.ok) {
    const lines = verdict.divergences
      .slice(0, 12)
      .map((item) =>
        item.reason
          ? `${item.date}: ${item.reason}`
          : `${item.date} ${item.field}: eastmoney=${item.primary} tencent=${item.check}`,
      );
    throw new Error(
      `quote sources disagree on ${verdict.divergences.length} row/field(s) for ${instrument.symbol}: ` +
        `${lines.join("; ")}${verdict.divergences.length > 12 ? "; …" : ""}`,
    );
  }

  const rows = [...primary.rows]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((row) => ({
      date: row.date,
      open: round(row.open, 3),
      close: round(row.close, 3),
      high: round(row.high, 3),
      low: round(row.low, 3),
      volume: Math.round(row.volume),
    }));
  assertRowShape(rows);
  if (rows[0].date < from || rows[rows.length - 1].date > to) {
    throw new Error(`quote series escaped the requested window ${from}..${to}`);
  }

  return {
    symbol: instrument.symbol,
    name: primary.name,
    currency: "HKD",
    fqt: 1,
    range: { from, to },
    fetchedAt: fetchedAt.toISOString(),
    sources: [
      { name: "eastmoney", url: primary.url },
      { name: "tencent", url: check.url },
    ],
    rows,
  };
}
