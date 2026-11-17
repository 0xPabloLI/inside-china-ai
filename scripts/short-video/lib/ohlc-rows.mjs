/**
 * Structural sanity for a daily OHLC row (#1405).
 *
 * Extracted from `quote-fetch.mjs` because both sides of the pipeline need it
 * and they must not disagree: the bake checks the rows before writing them,
 * and `info-grammar.mjs` checks the same rows again at preflight. The grammar
 * runs inside the render graph (charts import it), and that graph is contract-
 * bound to contain no clock or entropy source — so the shared check lives in
 * its own module rather than travelling in with the network/clock code that
 * fetches the quotes.
 *
 * @param {Array<object>} rows
 * @throws when a row is not a possible bar, or the dates are not ascending
 */
export function assertRowShape(rows) {
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
