#!/usr/bin/env node
/**
 * Bake daily quotes for a content pack (#1405).
 *
 *   npm run bake:quotes -- <pack> [--force] [--dry-run]
 *
 * The render must never touch the network: a K-line scene declares its window
 * in scene-data and the rows arrive here, once, as a checked-in JSON file
 * under `content/<pack>/`. Re-running on an unchanged series is a no-op, byte
 * for byte — `fetchedAt` is kept from the previous file so a repeated bake
 * produces no diff. Every run refetches (that is the point: the check source
 * must answer again); `--force` only skips the unchanged comparison, so the
 * file is rewritten with the new timestamp and an unreadable file is replaced
 * instead of blocking the bake.
 *
 * The two sources are compared field by field inside `quote-fetch.mjs`; this
 * CLI only decides *where* the result lands and whether anything changed.
 */
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDailyOhlc, toHongKongDate } from "./lib/quote-fetch.mjs";
import { resolveEntitySymbol } from "./lib/candle-data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positional = args.filter((arg) => !arg.startsWith("--"));

/** Only run when invoked directly (see implementation-workflow §12 on guards). */
const isMain = (() => {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

/**
 * Resolve a pack-relative data file and refuse to leave the pack directory.
 * `dataFile` is authored in scene-data, so a `../../` typo must not overwrite
 * another pack's data or reach outside the content tree.
 *
 * @param {string} contentDir
 * @param {string} dataFile
 * @returns {string} absolute path
 */
export function resolveDataFilePath(contentDir, dataFile) {
  if (typeof dataFile !== "string" || dataFile.trim() === "") {
    throw new Error("candle scene is missing info.dataFile");
  }
  if (dataFile.startsWith("/") || dataFile.includes("\\")) {
    throw new Error(`info.dataFile must be a relative POSIX path: ${JSON.stringify(dataFile)}`);
  }
  const absolute = resolve(contentDir, dataFile);
  const prefix = resolve(contentDir) + sep;
  if (!absolute.startsWith(prefix)) {
    throw new Error(`info.dataFile escapes the content pack: ${JSON.stringify(dataFile)}`);
  }
  return absolute;
}

/**
 * Candle scenes that declare a bake window.
 *
 * @param {Array<object>} scenes
 * @returns {Array<{id: number, symbol: string, from: string, to: string, dataFile: string}>}
 */
export function candleBakeJobs(scenes) {
  const jobs = [];
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const info = scene?.info;
    if (!info || info.chart !== "candle") continue;
    const symbol = typeof info.symbol === "string" && info.symbol.trim() ? info.symbol : "";
    const entity = typeof info.entity === "string" && info.entity.trim() ? info.entity : "";
    if (!symbol && !entity) {
      throw new Error(
        `scene ${scene.id}: candle chart requires info.symbol (e.g. "HKEX:2513") or info.entity`,
      );
    }
    if (!info.time || !info.time.from || !info.time.to) {
      throw new Error(`scene ${scene.id}: candle chart requires info.time { from, to }`);
    }
    jobs.push({
      id: scene.id,
      symbol: symbol || resolveEntitySymbol(entity),
      from: info.time.from,
      to: info.time.to,
      dataFile: info.dataFile,
    });
  }
  return jobs;
}

/**
 * Payload written to disk. Key order is fixed so two bakes of the same series
 * serialize identically.
 *
 * @param {object} quote - {@link fetchDailyOhlc} result
 * @returns {object}
 */
export function bakePayload(quote) {
  return {
    symbol: quote.symbol,
    name: quote.name,
    currency: quote.currency,
    fqt: quote.fqt,
    range: { from: quote.range.from, to: quote.range.to },
    fetchedAt: quote.fetchedAt,
    sources: quote.sources,
    rows: quote.rows,
  };
}

/**
 * @param {string} path
 * @param {boolean} [force] - a corrupt file is treated as absent when forcing a rewrite
 * @returns {object|null}
 */
function readExisting(path, force = false) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    // `--force` exists to make a re-bake land no matter what is on disk; a
    // truncated or hand-edited file is exactly the case it is for. Without the
    // flag the comparison cannot be trusted, so the bake stops instead of
    // silently overwriting content it could not read.
    if (force) {
      console.warn(
        `[bake] ignoring unreadable ${path} because --force was given: ${error.message}`,
      );
      return null;
    }
    throw new Error(`existing quote file is not valid JSON (${path}): ${error.message}`);
  }
}

/** Same rows → same content, regardless of when it was fetched. */
export function seriesEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return (
      row.date === other.date &&
      row.open === other.open &&
      row.close === other.close &&
      row.high === other.high &&
      row.low === other.low &&
      row.volume === other.volume
    );
  });
}

async function main() {
  const pack = positional[0];
  if (!pack) {
    fail("usage: npm run bake:quotes -- <pack> [--force] [--dry-run]");
  }
  if (!/^[a-z0-9_][a-z0-9._-]*$/.test(pack)) {
    fail(`pack id must be a content directory name, got ${JSON.stringify(pack)}`);
  }
  const contentDir = join(__dirname, "content", pack);
  if (!existsSync(join(contentDir, "scene-data.mjs"))) {
    fail(`no scene-data.mjs in ${relative(__dirname, contentDir)}`);
  }
  const { scenes } = await import(join(contentDir, "scene-data.mjs"));
  const jobs = candleBakeJobs(scenes);
  if (jobs.length === 0) {
    console.log(`ℹ️  ${pack}: no candle scenes declaring info.chart "candle" — nothing to bake`);
    return;
  }

  for (const job of jobs) {
    const path = resolveDataFilePath(contentDir, job.dataFile);
    const range = { from: toHongKongDate(job.from), to: toHongKongDate(job.to) };
    console.log(`🔎 ${job.symbol} ${range.from}..${range.to} → ${relative(contentDir, path)}`);
    if (flags.has("--dry-run")) {
      console.log("   dry run — no fetch, no write");
      continue;
    }

    const quote = await fetchDailyOhlc(job.symbol, { from: job.from, to: job.to });
    const existing = readExisting(path, flags.has("--force"));
    const payload = bakePayload(quote);
    if (
      existing &&
      !flags.has("--force") &&
      seriesEqual(existing.rows, payload.rows) &&
      existing.symbol === payload.symbol
    ) {
      // Keep the old bytes: fetchedAt is provenance, not content. Rewriting the
      // same series with a newer timestamp turns every re-bake into a diff.
      console.log(`   ✅ unchanged (${payload.rows.length} rows) — file kept as-is`);
      continue;
    }

    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}`;
    writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    renameSync(temp, path);
    console.log(
      `   ✅ wrote ${payload.rows.length} rows ` +
        `(${payload.rows[0].date} → ${payload.rows[payload.rows.length - 1].date})`,
    );
  }
}

if (isMain) {
  main().catch((error) => fail(error.message));
}
