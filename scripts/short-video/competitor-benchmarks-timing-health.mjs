/**
 * Timing-health verifier for competitor breakdown records (#729 / #730 follow-up).
 *
 * `docs/research/competitor-video-benchmarks-research.md` §10.1 reports three
 * numbers that came out of one throwaway local script: how many records failed
 * (#729), how many are timeline-collapsed (#730), and which anchor source each
 * layer used. Re-checking them used to mean re-running the 20-minute-per-video
 * VLM pass, or re-writing the script. This reads the persisted JSON instead and
 * reports the same signal `analyze-competitor-videos.mjs` writes to
 * `index.json`, so the numbers in §10.1 stay falsifiable without a re-run.
 *
 * Reads either directory, and the difference matters:
 *   `analysis/`            — 2026-10-17 original run (pre-fix): one record is
 *                            `error: unparseable-json`, no `evidence.timing`
 *                            at all, so health is judged from the stored starts
 *   `analysis-recompute/`  — 2026-10-18 post-fix re-run; §10's numbers come from here
 *
 * Usage:
 *   node scripts/short-video/competitor-benchmarks-timing-health.mjs [--dir <path>] [--json]
 *
 * @module competitor-benchmarks-timing-health
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { isTimelineCollapsed } from "./analyze-competitor-videos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, "output/competitor-benchmarks/analysis-recompute");
const LAYERS = ["beats", "shots"];

/**
 * Health of one layer, from the most honest source available.
 *
 * The trap: after #730's fallback runs, the stored `startMs` values are rebuilt
 * back to many distinct starts, so counting them alone would report a collapsed
 * record as healthy — the exact false negative the criterion was fixed for.
 * But counting is the *only* independent source for a record that was never
 * rebuilt, where the persisted verdict may itself be the stale pre-fix one
 * (`analysis/` stores `beatsCollapsed: false` for a layer that has 2 distinct
 * starts). So the source depends on whether the layer was rebuilt — which is
 * what `<layer>AnchorSource: "interpolated"` says:
 *
 *   1. `measuredDistinctStarts` (`<layer>MeasuredDistinctStarts`, added in the
 *      `c09ebb77` follow-up, PR #741): the pre-fallback count, so the criterion
 *      is re-judged here from raw evidence. Wins whenever present.
 *   2. rebuilt (`interpolated`) and no measured count → `persistedCollapsed`
 *      (`<layer>Collapsed`): written by the runner from the pre-fallback
 *      count, so it is faithful for these runs.
 *   3. not rebuilt → recount from the items' own `startMs`. Independent, and
 *      it is what exposes a stale persisted verdict (`storedCollapsed` in the
 *      result).
 *
 * `basis` reports which path was taken, so a reader can tell an independent
 * re-judgement from a re-read of the runner's own boolean.
 */
export function layerHealth(
  items,
  { measuredDistinctStarts, persistedCollapsed, anchorSource } = {},
) {
  const total = items.length;
  const recalled = () => new Set(items.map((item) => item.startMs)).size;
  const storedCollapsed = typeof persistedCollapsed === "boolean" ? persistedCollapsed : undefined;
  if (typeof measuredDistinctStarts === "number") {
    return {
      total,
      distinctStarts: measuredDistinctStarts,
      collapsed: isTimelineCollapsed(total, measuredDistinctStarts),
      basis: "measured",
      storedCollapsed,
    };
  }
  if (anchorSource === "interpolated") {
    if (storedCollapsed !== undefined) {
      return {
        total,
        distinctStarts: recalled(),
        collapsed: storedCollapsed,
        basis: "persisted",
        storedCollapsed,
      };
    }
    // Should not happen for a rebuilt layer; flag it rather than silently
    // reporting the (under-reporting) recount as if it were independent.
    const distinctStarts = recalled();
    return {
      total,
      distinctStarts,
      collapsed: isTimelineCollapsed(total, distinctStarts),
      basis: "items-rebuilt",
      storedCollapsed,
    };
  }
  const distinctStarts = recalled();
  return {
    total,
    distinctStarts,
    collapsed: isTimelineCollapsed(total, distinctStarts),
    basis: "items",
    storedCollapsed,
  };
}

/** Aggregate one directory's records into the §10.1 numbers. */
export function summarizeRecords(records) {
  const summary = {
    total: records.length,
    valid: 0,
    errors: [],
    repaired: [],
    beats: emptyLayerSummary(),
    shots: emptyLayerSummary(),
  };
  for (const { key, record } of records) {
    if (record.error) {
      summary.errors.push(key);
      continue;
    }
    summary.valid += 1;
    if (record.evidence?.breakdownRepaired) summary.repaired.push(key);
    for (const layer of LAYERS) {
      const items = record[layer];
      if (!Array.isArray(items) || items.length === 0) continue;
      const timing = record.evidence?.timing ?? {};
      const health = layerHealth(items, {
        measuredDistinctStarts: timing[`${layer}MeasuredDistinctStarts`],
        persistedCollapsed: timing[`${layer}Collapsed`],
        anchorSource: timing[`${layer}AnchorSource`],
      });
      const bucket = summary[layer];
      bucket.records += 1;
      bucket.items += health.total;
      bucket.basis[health.basis] = (bucket.basis[health.basis] ?? 0) + 1;
      if (
        health.basis === "items" &&
        typeof health.storedCollapsed === "boolean" &&
        health.storedCollapsed !== health.collapsed
      ) {
        bucket.staleVerdict.push({ key, storedCollapsed: health.storedCollapsed });
      }
      if (health.collapsed) bucket.collapsed.push({ key, ...health });
      const source = timing[`${layer}AnchorSource`] ?? "unrecorded";
      bucket.anchorSource[source] = (bucket.anchorSource[source] ?? 0) + 1;
    }
  }
  return summary;
}

function emptyLayerSummary() {
  return {
    records: 0,
    items: 0,
    collapsed: [],
    anchorSource: {},
    basis: {},
    staleVerdict: [],
  };
}

/** Read `<dir>/<handle>/<id>.json` records; skips the `<id>.asr.json` evidence files. */
export function loadRecords(dir) {
  if (!existsSync(dir)) throw new Error(`analysis directory not found: ${dir}`);
  const records = [];
  for (const handle of readdirSync(dir, { withFileTypes: true })) {
    if (!handle.isDirectory()) continue;
    for (const file of readdirSync(join(dir, handle.name))) {
      if (!file.endsWith(".json") || file.endsWith(".asr.json")) continue;
      records.push({
        key: `${handle.name}/${file.slice(0, -".json".length)}`,
        record: JSON.parse(readFileSync(join(dir, handle.name, file), "utf8")),
      });
    }
  }
  return records.sort((a, b) => a.key.localeCompare(b.key));
}

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") args.dir = argv[++i];
    else if (argv[i] === "--json") args.json = true;
  }
  return args;
}

function formatCounts(counts) {
  const entries = Object.entries(counts).map(([name, n]) => `${name}=${n}`);
  return entries.length ? entries.join(" ") : "-";
}

function formatReport(dir, summary) {
  const lines = [
    `dir: ${dir}`,
    `records: ${summary.total} (valid ${summary.valid}, error ${summary.errors.length})`,
  ];
  if (summary.errors.length) lines.push(`  error: ${summary.errors.join(", ")}`);
  if (summary.repaired.length) lines.push(`  repaired: ${summary.repaired.join(", ")}`);
  for (const layer of LAYERS) {
    const bucket = summary[layer];
    lines.push(
      `${layer}: ${bucket.records} records / ${bucket.items} items · collapsed ${bucket.collapsed.length} · ` +
        `anchorSource ${formatCounts(bucket.anchorSource)} · basis ${formatCounts(bucket.basis)}`,
    );
    for (const hit of bucket.collapsed) {
      lines.push(
        `  ! ${hit.key} — ${hit.total} items, ${hit.distinctStarts} distinct starts (${hit.basis})`,
      );
    }
    if (bucket.staleVerdict.length) {
      lines.push(
        `  stale verdict: ${bucket.staleVerdict
          .map((entry) => `${entry.key} stored ${entry.storedCollapsed}`)
          .join(", ")}`,
      );
    }
  }
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = summarizeRecords(loadRecords(args.dir));
  console.log(args.json ? JSON.stringify(summary, null, 2) : formatReport(args.dir, summary));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
