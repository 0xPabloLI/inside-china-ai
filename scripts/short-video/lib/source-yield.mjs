/**
 * Source yield assertions (#779) — pure arithmetic over persisted run data.
 *
 * Contract fixtures catch upstream response-shape drift; they cannot say
 * "this source contributed 0 media candidates in this run". This module adds
 * that assertion: per-source contributed media count vs a baseline derived
 * from prior runs, with a visible `[SOURCE-YIELD-DROP]` warning and a
 * persisted report/history pair.
 *
 * Properties:
 *   - no network requests, no model calls;
 *   - baselines are recomputable from persisted JSONL alone (deterministic,
 *     no runtime randomness, no log parsing);
 *   - the history baseline is the LOWEST POSITIVE contribution over the last
 *     `YIELD_BASELINE_WINDOW` prior runs — zeros mean "this run observed
 *     nothing", not "the source's normal supply is zero", so they are ignored
 *     instead of ratcheting the baseline down to 0.
 *
 * @module source-yield
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, dirname, extname, join } from "path";

export const SOURCE_YIELD_SCHEMA_VERSION = 1;
export const YIELD_HISTORY_FILE = "source-yield-history.jsonl";
export const YIELD_REPORT_FILE = "source-yield-report.json";
export const YIELD_BASELINE_WINDOW = 10;

/** Pipeline-synthesized sources (cache reuse), never upstream supply. */
const SYNTHETIC_SOURCES = new Set(["cached-media"]);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const ENVIRONMENTAL_SKIP_RE = /no API key|rate limit/i;
const MAX_REASONS_PER_SOURCE = 3;

/**
 * Per-source observation counts for baselines produced by deriveBaselines().
 *
 * Kept in a WeakMap, not on the returned object: `{ [source]: number }` must
 * stay plain JSON, while buildSourceYieldReport() still needs to report how
 * many prior runs actually observed each source (`observedRuns`). A JSON
 * round-trip of the baselines loses the metadata, which is fine — observation
 * counts are informational only.
 */
const baselineObservationCounts = new WeakMap();

function compareNames(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedByKey(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => compareNames(a, b)));
}

/**
 * Resolve an asset's media capability.
 *
 * `asset.type` wins when it is image/video. Otherwise infer from the path
 * extension (legacy artifacts predate reliable `type`). Text-only assets and
 * null paths have no media type.
 *
 * @param {object|null} asset
 * @returns {"image"|"video"|null}
 */
export function mediaTypeOfAsset(asset) {
  if (!asset || typeof asset !== "object") return null;
  if (asset.type === "image" || asset.type === "video") return asset.type;
  if (asset.type === "text") return null;
  const path = typeof asset.path === "string" ? asset.path.split("?")[0] : "";
  if (!path) return null;
  const extension = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return null;
}

/**
 * Count contributed media assets per source.
 *
 * Text-only assets (article references) and the synthetic `cached-media`
 * source are excluded — neither represents upstream supply for a source.
 *
 * @param {Array<object>} assets
 * @returns {Record<string, number>}
 */
export function collectContributedCounts(assets) {
  const counts = {};
  for (const asset of assets || []) {
    const source = asset?.source || asset?.from;
    if (!source || SYNTHETIC_SOURCES.has(source)) continue;
    if (!mediaTypeOfAsset(asset)) continue;
    counts[source] = (counts[source] || 0) + 1;
  }
  return sortedByKey(counts);
}

/**
 * Collect unique attempt reasons per source from skipped/failed records.
 *
 * Skipped records carry `reason`; failed records carry `error`. Order is the
 * input order (skipped first, then failed), capped at 3 per source.
 *
 * @param {Array<object>} skipped
 * @param {Array<object>} failed
 * @returns {Record<string, string[]>}
 */
export function collectAttemptReasons(skipped, failed) {
  const bySource = new Map();
  for (const entry of [...(skipped || []), ...(failed || [])]) {
    if (!entry || typeof entry.source !== "string") continue;
    const raw =
      typeof entry.reason === "string" && entry.reason.trim()
        ? entry.reason
        : typeof entry.error === "string" && entry.error.trim()
          ? entry.error
          : "";
    const reason = raw.trim();
    if (!reason) continue;
    const reasons = bySource.get(entry.source) || [];
    if (reasons.length < MAX_REASONS_PER_SOURCE && !reasons.includes(reason)) {
      reasons.push(reason);
    }
    bySource.set(entry.source, reasons);
  }
  return sortedByKey(Object.fromEntries(bySource));
}

/**
 * Select the history entries that feed a baseline: runs strictly before the
 * cutoff, last `window` entries in file order. Malformed entries are ignored.
 *
 * @param {Array<object>} historyEntries
 * @param {{before: string, window?: number}} options
 * @returns {Array<object>}
 */
export function selectBaselineWindow(
  historyEntries,
  { before, window = YIELD_BASELINE_WINDOW } = {},
) {
  if (!Array.isArray(historyEntries)) return [];
  const beforeMs = Date.parse(before);
  if (!Number.isFinite(beforeMs)) return [];
  const windowSize = Number.isFinite(window) && window > 0 ? Math.floor(window) : 0;
  if (windowSize === 0) return [];
  const eligible = historyEntries.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const runAtMs = Date.parse(entry.runAt);
    return Number.isFinite(runAtMs) && runAtMs < beforeMs;
  });
  return eligible.slice(-windowSize);
}

/**
 * Derive per-source baselines from persisted history.
 *
 * Rule: over the last `window` runs before `before`, take the minimum POSITIVE
 * contributed count per source. Sources with no positive observation get no
 * baseline (absent key). Pure and deterministic.
 *
 * @param {Array<object>} historyEntries
 * @param {{before: string, window?: number}} options
 * @returns {Record<string, number>}
 */
export function deriveBaselines(historyEntries, { before, window = YIELD_BASELINE_WINDOW } = {}) {
  const entries = selectBaselineWindow(historyEntries, { before, window });
  const minima = new Map();
  const observations = {};
  for (const entry of entries) {
    if (!Array.isArray(entry.sources)) continue;
    const seen = new Set();
    for (const item of entry.sources) {
      if (!item || typeof item.source !== "string") continue;
      if (!seen.has(item.source)) {
        seen.add(item.source);
        observations[item.source] = (observations[item.source] || 0) + 1;
      }
      const contributed = item.contributed;
      if (!Number.isFinite(contributed) || contributed <= 0) continue;
      const current = minima.get(item.source);
      if (current === undefined || contributed < current) {
        minima.set(item.source, contributed);
      }
    }
  }
  const baselines = sortedByKey(Object.fromEntries(minima));
  baselineObservationCounts.set(baselines, sortedByKey(observations));
  return baselines;
}

function countEntriesBySource(entries) {
  const counts = {};
  for (const entry of entries || []) {
    if (!entry || typeof entry.source !== "string") continue;
    counts[entry.source] = (counts[entry.source] || 0) + 1;
  }
  return counts;
}

/**
 * Status precedence (first match wins):
 *   1. not-run     — conditional Tier-3 source, Tier 3 did not run, no output
 *   2. skipped     — below baseline (or no baseline) with an environmental
 *                    reason (`no API key` / `rate limit`) — not a regression
 *   3. drop        — below a known baseline, including 0 (the visible alarm)
 *   4. no-baseline — nothing to assert yet
 *   5. ok          — contributed >= baseline
 * Unexpected (non-expected) rows are informational (`observed`), never drops.
 */
function classifyStatus({ expected, conditional, tier3Ran, contributed, baseline, reasons }) {
  if (!expected) return "observed";
  if (conditional && !tier3Ran && contributed === 0 && reasons.length === 0) return "not-run";
  const environmental = reasons.some((reason) => ENVIRONMENTAL_SKIP_RE.test(reason));
  if ((baseline === null || contributed < baseline) && environmental) return "skipped";
  if (baseline !== null && contributed < baseline) return "drop";
  if (baseline === null) return "no-baseline";
  return "ok";
}

/**
 * Build the per-run source yield report.
 *
 * @param {object} input
 * @param {string} input.contentSlug
 * @param {string} input.runAt - ISO timestamp captured at run start
 * @param {Array<{source: string, capabilities: string[], conditional: boolean}>} input.expectedSources
 * @param {Array<object>} input.assets - allAssets from the run
 * @param {Array<object>} input.skipped
 * @param {Array<object>} input.failed
 * @param {Record<string, number>} input.baselines - deriveBaselines() output
 * @param {boolean} input.tier3Ran
 * @param {number} [input.priorRuns] - history entries that fed the baseline
 * @returns {object}
 */
export function buildSourceYieldReport({
  contentSlug = null,
  runAt = null,
  expectedSources = [],
  assets = [],
  skipped = [],
  failed = [],
  baselines = {},
  tier3Ran = false,
  priorRuns = 0,
} = {}) {
  const contributedBySource = collectContributedCounts(assets);
  const reasonsBySource = collectAttemptReasons(skipped, failed);
  const skippedBySource = countEntriesBySource(skipped);
  const failedBySource = countEntriesBySource(failed);
  const observationCounts =
    baselines && typeof baselines === "object"
      ? baselineObservationCounts.get(baselines) || {}
      : {};

  const expectedByName = new Map();
  for (const item of expectedSources || []) {
    if (!item || typeof item.source !== "string") continue;
    const merged = expectedByName.get(item.source) || {
      capabilities: new Set(),
      conditional: false,
    };
    for (const capability of item.capabilities || []) {
      if (capability === "image" || capability === "video") merged.capabilities.add(capability);
    }
    merged.conditional = merged.conditional || item.conditional === true;
    expectedByName.set(item.source, merged);
  }

  const names = new Set([
    ...expectedByName.keys(),
    ...Object.keys(contributedBySource),
    ...Object.keys(reasonsBySource),
    ...Object.keys(skippedBySource),
    ...Object.keys(failedBySource),
  ]);

  const sources = [...names]
    .filter((source) => !SYNTHETIC_SOURCES.has(source))
    .sort(compareNames)
    .map((source) => {
      const config = expectedByName.get(source);
      const expected = Boolean(config);
      const contributed = contributedBySource[source] || 0;
      const rawBaseline = baselines?.[source];
      const baseline = Number.isFinite(rawBaseline) ? rawBaseline : null;
      const reasons = reasonsBySource[source] || [];
      const conditional = config ? config.conditional : false;
      return {
        source,
        capabilities: config
          ? ["image", "video"].filter((capability) => config.capabilities.has(capability))
          : [],
        conditional,
        expected,
        contributed,
        skipped: skippedBySource[source] || 0,
        failed: failedBySource[source] || 0,
        reasons,
        baseline,
        observedRuns: observationCounts[source] || 0,
        status: classifyStatus({
          expected,
          conditional,
          tier3Ran,
          contributed,
          baseline,
          reasons,
        }),
      };
    });

  return {
    schemaVersion: SOURCE_YIELD_SCHEMA_VERSION,
    content: contentSlug,
    runAt,
    baseline: {
      rule: "min-positive",
      window: YIELD_BASELINE_WINDOW,
      historyFile: YIELD_HISTORY_FILE,
      priorRuns,
    },
    tier3Ran,
    sources,
    drops: sources.filter((row) => row.status === "drop"),
  };
}

/**
 * Standalone-only exit decision: drops become a non-zero exit only when the
 * caller explicitly asked for strict mode. Pure so this branch is testable
 * without running main().
 *
 * @param {object|null} report
 * @param {boolean} strict
 * @returns {0|1}
 */
export function strictYieldExitCode(report, strict) {
  return strict === true && (report?.drops?.length ?? 0) > 0 ? 1 : 0;
}

/**
 * Render the exact one-line drop warning.
 *
 * @param {object} row - report row with status "drop"
 * @returns {string}
 */
export function formatSourceYieldDropLine(row) {
  const reasons = row?.reasons?.length ? row.reasons.join("; ") : "no candidates returned";
  return `⚠️ [SOURCE-YIELD-DROP] ${row?.source}: actual ${row?.contributed} < baseline ${row?.baseline} — ${reasons}`;
}

/**
 * Render the human-readable summary: baseline rule header, compact table, and
 * one `[SOURCE-YIELD-DROP]` line per drop.
 *
 * @param {object} report
 * @returns {string[]}
 */
export function renderSourceYieldSummary(report) {
  const windowSize = report?.baseline?.window ?? YIELD_BASELINE_WINDOW;
  const lines = [
    `📉 Source yield (baseline = lowest positive contribution over the last ${windowSize} prior runs)`,
    "source | cap | contributed | skipped | failed | baseline | status",
  ];
  for (const row of report?.sources || []) {
    const capability = row.capabilities?.length ? row.capabilities.join("+") : "-";
    const baseline =
      row.baseline === null || row.baseline === undefined ? "-" : String(row.baseline);
    lines.push(
      `${row.source} | ${capability} | ${row.contributed} | ${row.skipped} | ${row.failed} | ${baseline} | ${row.status}`,
    );
  }
  for (const row of report?.drops || []) {
    lines.push(formatSourceYieldDropLine(row));
  }
  return lines;
}

/**
 * Load persisted history entries. Missing file → []; malformed lines are
 * ignored (fail-open, never throws).
 *
 * @param {string} filePath
 * @returns {Array<object>}
 */
export function loadYieldHistory(filePath) {
  try {
    if (!filePath || !existsSync(filePath)) return [];
    const entries = [];
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          entries.push(parsed);
        }
      } catch {
        // Malformed line — ignore so one bad write cannot poison the baseline.
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Append one run to the persisted history. Expected rows only (zeros
 * included); synthetic and unexpected rows are skipped.
 *
 * A write failure returns `{ok: false, error}` instead of throwing: at the run
 * boundary this is a warning, never a reason to kill an already-completed run.
 *
 * @param {string} filePath
 * @param {object} report
 * @returns {{ok: boolean, error?: string}}
 */
export function appendYieldHistory(filePath, report) {
  try {
    if (!filePath) return { ok: false, error: "missing history path" };
    const sources = (report?.sources || [])
      .filter((row) => row && row.expected === true && !SYNTHETIC_SOURCES.has(row.source))
      .sort((a, b) => compareNames(a.source, b.source))
      .map((row) => ({
        source: row.source,
        contributed: row.contributed,
        status: row.status,
      }));
    const entry = {
      schemaVersion: report?.schemaVersion ?? SOURCE_YIELD_SCHEMA_VERSION,
      runAt: report?.runAt,
      content: report?.content,
      sources,
    };
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

/**
 * Write one run's yield report. Fail-open at the run boundary: a full disk or
 * a permission error is a warning, never a reason to fail an already-completed
 * sourcing run.
 *
 * @param {string} filePath
 * @param {object} report
 * @returns {{ok: boolean, error?: string}}
 */
export function writeYieldReport(filePath, report) {
  try {
    if (!filePath) return { ok: false, error: "missing report path" };
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n", "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function readBootstrapObservation(filePath, kind) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
  let assets;
  let content;
  if (kind === "report") {
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.assets)) return null;
    assets = parsed.assets;
    content = typeof parsed.content === "string" ? parsed.content : null;
  } else {
    const patches = Array.isArray(parsed) ? parsed : parsed?.patches;
    if (!Array.isArray(patches)) return null;
    assets = patches;
    content = basename(dirname(filePath));
  }
  const counts = collectContributedCounts(assets);
  const sources = Object.entries(counts)
    .filter(([, contributed]) => contributed > 0)
    .sort(([a], [b]) => compareNames(a, b))
    .map(([source, contributed]) => ({ source, contributed, status: "observed" }));
  if (sources.length === 0) return null;
  return {
    mtimeMs: stat.mtimeMs,
    filePath,
    entry: {
      schemaVersion: SOURCE_YIELD_SCHEMA_VERSION,
      runAt: new Date(stat.mtimeMs).toISOString(),
      content,
      sources,
    },
  };
}

/**
 * Seed the history from run artifacts persisted before this feature existed.
 *
 * `output/asset-report.json` and `output/<slug>/media-patch.json` are the
 * per-run records the pipeline already wrote, so the first run can assert
 * against real history instead of waiting for the ledger to fill. Runs only
 * when the ledger has no valid entry; artifacts at or after `before` (this
 * run's own writes) are excluded. Deterministic for a given artifact set.
 *
 * @param {{outputDir: string, historyPath: string, before: string}} options
 * @returns {{ok: boolean, bootstrapped: boolean, entries: number, error?: string}}
 */
export function bootstrapYieldHistory({ outputDir, historyPath, before } = {}) {
  try {
    if (!outputDir || !historyPath) {
      return {
        ok: false,
        bootstrapped: false,
        entries: 0,
        error: "missing outputDir or historyPath",
      };
    }
    if (loadYieldHistory(historyPath).length > 0) {
      return { ok: true, bootstrapped: false, entries: 0 };
    }
    if (!existsSync(outputDir)) {
      return { ok: true, bootstrapped: false, entries: 0 };
    }
    const beforeMs = Date.parse(before);
    if (!Number.isFinite(beforeMs)) {
      return { ok: false, bootstrapped: false, entries: 0, error: "invalid before cutoff" };
    }

    const candidates = [];
    const reportPath = join(outputDir, "asset-report.json");
    if (existsSync(reportPath)) candidates.push({ filePath: reportPath, kind: "report" });
    for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const patchPath = join(outputDir, entry.name, "media-patch.json");
      if (existsSync(patchPath)) candidates.push({ filePath: patchPath, kind: "patch" });
    }

    const observations = [];
    for (const { filePath, kind } of candidates) {
      const observation = readBootstrapObservation(filePath, kind);
      if (!observation || !(observation.mtimeMs < beforeMs)) continue;
      observations.push(observation);
    }
    if (observations.length === 0) return { ok: true, bootstrapped: false, entries: 0 };

    observations.sort((a, b) => a.mtimeMs - b.mtimeMs || compareNames(a.filePath, b.filePath));
    mkdirSync(dirname(historyPath), { recursive: true });
    appendFileSync(
      historyPath,
      observations.map((observation) => JSON.stringify(observation.entry)).join("\n") + "\n",
      "utf8",
    );
    return { ok: true, bootstrapped: true, entries: observations.length };
  } catch (error) {
    return {
      ok: false,
      bootstrapped: false,
      entries: 0,
      error: error?.message || String(error),
    };
  }
}
