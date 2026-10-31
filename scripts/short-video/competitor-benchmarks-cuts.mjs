/**
 * Second-source retime for competitor breakdown records (#749).
 *
 * Reads a persisted analysis directory (`analysis-recompute/` by default),
 * detects shot cuts for each record's video with ffmpeg's scene filter, and
 * writes a sibling directory (`analysis-cuts/`) whose collapsed layers are
 * re-anchored on that measured cut grid. Healthy layers keep their items
 * unchanged; `evidence.timing` is recomputed for every copied record so all
 * records carry the same field set (and the retimed verdict is read from the
 * same place). This tool never re-runs ASR or the VLM, so it is the cheap way
 * to re-judge §10.1's six collapsed records.
 *
 * Every output is reproducible without the audio track: the cut timestamps live
 * in `<handle>/<id>.cuts.json`, the ASR evidence is copied beside the record,
 * and `cuts-report.json` carries the per-layer comparison the ticket asks for
 * ("two sources agree / diverge", which source prevails, and why).
 *
 * Comparison criteria (chosen before looking at the results, from the same
 * measurement semantics the runner documents):
 *   - an item is *comparable* only if its `anchorSegment` resolves to a real
 *     ASR segment; an out-of-range anchor is the model enumerating items, not a
 *     measured claim, so it counts as `unmeasured`;
 *   - for a comparable item the sources **agree** when the cut-derived start
 *     lies inside its anchored ASR segment (start ≤ cut < end), else they
 *     **diverge**;
 *   - a layer **agrees** when at least half its comparable items agree.
 *
 * Precedence: a collapsed layer uses the cut grid (its ASR resolution is below
 * the collapse threshold by definition, and cuts are measured independently);
 * a healthy layer keeps ASR (speech-aligned beats are semantically anchored,
 * cuts can fall mid-sentence). The report states the verdict per layer either
 * way, so a divergence is visible rather than silently overridden.
 *
 * Usage:
 *   node scripts/short-video/competitor-benchmarks-cuts.mjs [--dir <analysis dir>]
 *        [--out <dir>] [--threshold 0.15] [--only handle/id,...]
 *
 * @module competitor-benchmarks-cuts
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { cutsArtifact, DEFAULT_CUT_THRESHOLD, detectCuts } from "./lib/cut-detect.mjs";
import {
  cutsEvidence,
  isTimelineCollapsed,
  measurableSegments,
  resolveTimings,
  timingEvidence,
} from "./analyze-competitor-videos.mjs";
import { LAYERS, loadRecords } from "./competitor-benchmarks-timing-health.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_VIDEO_ROOT = join(__dirname, "output/competitor-benchmarks");

/** Retimed output directory for a source analysis dir. */
function defaultOutDir(dir) {
  return join(dirname(dir), "analysis-cuts");
}

/** An anchor that resolves to a measurable ASR segment (1-based). */
function anchorInRange(item, segmentCount) {
  const n = Number(item?.anchorSegment);
  return Number.isInteger(n) && n >= 1 && n <= segmentCount;
}

/**
 * Compare a layer's ASR anchors with its cut-derived starts, item by item.
 *
 * @param {object} args
 * @param {Array<object>} args.items - the layer, each with `anchorSegment`
 * @param {Array<{start: number, end: number, text: string}>} args.segments
 * @param {number[]} args.cutStarts - one start per item, from `resolveCutStarts`
 * @returns {{compared: number, agree: number, diverge: number, unmeasured: number,
 *   verdict: "agree"|"diverge"|"unmeasurable", diverged: Array<object>}}
 */
export function compareCutTimeline({ items, segments, cutStarts }) {
  const segs = measurableSegments(segments).map((segment) => ({
    start: Math.round(Number(segment.start) || 0),
    end: Math.round(Number(segment.end) || 0),
  }));
  let agree = 0;
  let diverge = 0;
  let unmeasured = 0;
  const diverged = [];
  items.forEach((item, index) => {
    const n = Number(item?.anchorSegment);
    const start = cutStarts[index];
    if (!anchorInRange(item, segs.length) || !Number.isFinite(start)) {
      unmeasured++;
      return;
    }
    const segment = segs[n - 1];
    if (start >= segment.start && start < segment.end) {
      agree++;
    } else {
      diverge++;
      diverged.push({
        item: index + 1,
        anchorSegment: n,
        asrSegment: [segment.start, segment.end],
        cutStartMs: start,
      });
    }
  });
  const compared = agree + diverge;
  const verdict = compared === 0 ? "unmeasurable" : agree * 2 >= compared ? "agree" : "diverge";
  return { compared, agree, diverge, unmeasured, verdict, diverged };
}

/**
 * Largest item-wise difference between two ordered start lists.
 *
 * @param {number[]} before
 * @param {number[]} after
 * @returns {{maxDeltaMs: number, item: number}} 1-based item index of the max
 */
export function maxStartDelta(before, after) {
  let maxDeltaMs = 0;
  let item = 0;
  const n = Math.min(before.length, after.length);
  for (let i = 0; i < n; i++) {
    const delta = Math.abs(before[i] - after[i]);
    if (delta > maxDeltaMs) {
      maxDeltaMs = delta;
      item = i + 1;
    }
  }
  return { maxDeltaMs, item };
}

/** First measurable segment's span — the §10.3 impact threshold. */
export function firstSegmentSpanMs(segments) {
  const first = measurableSegments(segments)[0];
  if (!first) return null;
  const span = Math.round(Number(first.end) || 0) - Math.round(Number(first.start) || 0);
  return span > 0 ? span : null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function copyIfPresent(from, to) {
  if (!existsSync(from)) return false;
  copyFileSync(from, to);
  return true;
}

/**
 * Detect cuts for every record's video and write the retimed sibling directory.
 *
 * @param {object} [opts]
 * @param {string} [opts.dir] - source analysis dir
 * @param {string} [opts.outDir] - destination (defaults to sibling `analysis-cuts`)
 * @param {number} [opts.threshold]
 * @param {string[]|null} [opts.only] - restrict to these `handle/id` keys
 * @param {string} [opts.videoRoot] - root holding `<handle>/<id>.mp4`
 * @param {string} [opts.asrDir] - fallback root for `<id>.asr.json`
 * @returns {object} report
 */
export function retimeWithCuts({
  dir = join(DEFAULT_VIDEO_ROOT, "analysis-recompute"),
  outDir = defaultOutDir(dir),
  threshold = DEFAULT_CUT_THRESHOLD,
  only = null,
  // Videos live beside the analysis dir (`<root>/<handle>/<id>.mp4`) and the
  // original ASR evidence in `<root>/analysis/`; deriving them from `dir` lets
  // the CLI run from a checkout that only holds code (e.g. a session worktree)
  // while reading the outputs of the one that ran the batch.
  videoRoot = dirname(dir),
  asrDir = join(dirname(dir), "analysis"),
} = {}) {
  const records = loadRecords(dir);
  mkdirSync(outDir, { recursive: true });
  const report = {
    schemaVersion: "competitor-cuts-report-v1",
    source: dir,
    outDir,
    threshold,
    records: records.length,
    processed: 0,
    skipped: [],
    summary: {
      cutsDetected: 0,
      cutsTotal: 0,
      noCutRecords: 0,
      repairedLayers: 0,
      repairedRecords: 0,
      stillCollapsedLayers: 0,
      agree: 0,
      diverge: 0,
      unmeasurable: 0,
    },
    layers: [],
  };

  for (const { key, record } of records) {
    if (only && !only.includes(key)) continue;
    const [handle, id] = key.split("/");
    const outHandle = join(outDir, handle);
    mkdirSync(outHandle, { recursive: true });
    const outRecordPath = join(outHandle, `${id}.json`);
    const recordCopy = structuredClone(record);

    const videoPath = join(videoRoot, handle, `${id}.mp4`);
    const asrPath = [
      join(dir, handle, `${id}.asr.json`),
      join(asrDir, handle, `${id}.asr.json`),
    ].find((path) => existsSync(path));
    const durationMs =
      Number(record.evidence?.timing?.durationMs) ||
      (Number(record.meta?.durationSec) > 0 ? Math.round(record.meta.durationSec * 1000) : 0);

    const skipAndCopy = (entry) => {
      report.skipped.push({ key, ...entry });
      writeFileSync(outRecordPath, JSON.stringify(recordCopy, null, 2));
    };

    if (!existsSync(videoPath) || !asrPath || durationMs <= 0) {
      skipAndCopy({
        reason: !existsSync(videoPath)
          ? "video-missing"
          : !asrPath
            ? "asr-missing"
            : "duration-missing",
      });
      continue;
    }

    let segments;
    try {
      segments = readJson(asrPath).segments ?? [];
    } catch (error) {
      skipAndCopy({ reason: "asr-unreadable", error: error.message });
      continue;
    }

    let cuts;
    try {
      cuts = detectCuts(videoPath, { threshold });
    } catch (error) {
      // One undecodable video must not abort the pass (the runner treats cut
      // detection as non-fatal too); copy the record untouched and say why.
      skipAndCopy({ reason: "cuts-failed", error: error.message });
      continue;
    }
    const artifact = `${id}.cuts.json`;
    writeFileSync(join(outHandle, artifact), JSON.stringify(cutsArtifact(id, cuts), null, 2));
    copyIfPresent(asrPath, join(outHandle, `${id}.asr.json`));

    const layerState = LAYERS.map((layer) => {
      const items = Array.isArray(record[layer]) ? record[layer] : [];
      return {
        layer,
        items,
        before: resolveTimings(items, segments, durationMs, null),
        after: resolveTimings(items, segments, durationMs, cuts.cutsMs),
      };
    });
    for (const state of layerState) recordCopy[state.layer] = state.after.items;
    const [beatsAfter, shotsAfter] = layerState.map((state) => state.after);
    recordCopy.evidence ??= {};
    recordCopy.evidence.timing = timingEvidence(beatsAfter, shotsAfter, durationMs);
    recordCopy.evidence.cuts = cutsEvidence({ ...cuts, artifact });
    writeFileSync(outRecordPath, JSON.stringify(recordCopy, null, 2));

    report.processed++;
    if (cuts.cutsMs.length === 0) report.summary.noCutRecords++;
    else {
      report.summary.cutsDetected++;
      report.summary.cutsTotal += cuts.cutsMs.length;
    }

    const segmentCount = measurableSegments(segments).length;
    const anchorsOutOfRange = (items) =>
      items.filter((item) => !anchorInRange(item, segmentCount)).length;

    let repairedHere = 0;
    for (const { layer, items, before, after } of layerState) {
      if (items.length === 0) continue;
      const wasCollapsed = before.anchorSource !== "asr";
      const collapsedAfter = isTimelineCollapsed(items.length, after.rawDistinctStarts);
      if (collapsedAfter) report.summary.stillCollapsedLayers++;
      if (!wasCollapsed || after.anchorSource !== "cuts") continue;

      const cutStarts = after.items.map((item) => item.startMs);
      const comparison = compareCutTimeline({ items, segments, cutStarts });
      const delta = maxStartDelta(
        before.items.map((item) => item.startMs),
        cutStarts,
      );
      const span = firstSegmentSpanMs(segments);
      // Exact 1..N anchors are the model counting its own items, and a high
      // out-of-range count (e.g. 1,1,2,2… beyond the transcript) is the same
      // enumeration shape — neither is an independent measured claim, which is
      // why a divergence is adjudicated in favour of the cut grid.
      const anchorsSequential = items.every(
        (item, index) => Number(item?.anchorSegment) === index + 1,
      );
      report.layers.push({
        key,
        layer,
        items: items.length,
        cuts: cuts.cutsMs.length,
        distinctCutStarts: new Set(cutStarts).size,
        collapsedBefore: true,
        collapsedAfter,
        anchorsSequential,
        anchorsOutOfRange: anchorsOutOfRange(items),
        sourceBefore: before.anchorSource,
        sourceAfter: after.anchorSource,
        comparison,
        delta,
        firstSegmentSpanMs: span,
        exceedsFirstSegmentSpan: span !== null && delta.maxDeltaMs > span,
        startsBefore: before.items.map((item) => item.startMs),
        startsAfter: cutStarts,
      });
      if (comparison.verdict === "agree") report.summary.agree++;
      else if (comparison.verdict === "diverge") report.summary.diverge++;
      else report.summary.unmeasurable++;
      repairedHere++;
    }
    if (repairedHere > 0) report.summary.repairedRecords++;
    report.summary.repairedLayers += repairedHere;
  }

  writeFileSync(join(outDir, "cuts-report.json"), JSON.stringify(report, null, 2));
  return report;
}

function formatReport(report) {
  const s = report.summary;
  const lines = [
    `source: ${report.source}`,
    `out:    ${report.outDir}`,
    `scene threshold: ${report.threshold}`,
    `records: ${report.records} (processed ${report.processed}, skipped ${report.skipped.length})`,
  ];
  if (report.skipped.length) {
    lines.push(
      `  skipped: ${report.skipped.map((entry) => `${entry.key} (${entry.reason})`).join(", ")}`,
    );
  }
  lines.push(
    `cuts: ${s.cutsDetected} records with cuts (${s.cutsTotal} events), ${s.noCutRecords} without ` +
      `— no-cut records keep the ASR-span interpolation`,
    `repaired layers: ${s.repairedLayers} across ${s.repairedRecords} records ` +
      `(${s.stillCollapsedLayers} layer(s) still below the collapse threshold afterward)`,
    `two-source verdicts: agree ${s.agree} · diverge ${s.diverge} · unmeasurable ${s.unmeasurable}`,
  );
  for (const entry of report.layers) {
    lines.push(
      `\n${entry.key} · ${entry.layer} — ${entry.items} items, ${entry.cuts} cuts ` +
        `→ ${entry.distinctCutStarts} distinct starts (${entry.collapsedAfter ? "still collapsed" : "healthy"})`,
    );
    lines.push(
      `  verdict ${entry.comparison.verdict}: agree ${entry.comparison.agree} / ` +
        `diverge ${entry.comparison.diverge} / unmeasured ${entry.comparison.unmeasured}`,
    );
    lines.push(
      `  max Δ vs interpolation ${entry.delta.maxDeltaMs}ms (item ${entry.delta.item}); ` +
        `first segment span ${entry.firstSegmentSpanMs}ms`,
    );
    if (entry.layer === "beats") {
      lines.push(
        entry.exceedsFirstSegmentSpan
          ? "  → §10.3 update required (Δ exceeds the first segment span)"
          : "  → §10.3 number unchanged (Δ within the first segment span)",
      );
      lines.push(`  interpolated starts: ${entry.startsBefore.join(", ")}`);
      lines.push(`  cut starts:          ${entry.startsAfter.join(", ")}`);
    }
    if (entry.anchorsSequential) {
      lines.push(
        "  model anchors are a 1..N enumeration (item index, not segment references) — " +
          "the ASR claim is not independent of the list order",
      );
    } else if (entry.anchorsOutOfRange > 0) {
      lines.push(
        `  ${entry.anchorsOutOfRange}/${entry.items} anchors fall outside the transcript's ` +
          "segment range — an enumeration, not measured segment references",
      );
    }
    for (const hit of entry.comparison.diverged.slice(0, 5)) {
      lines.push(
        `  ! item ${hit.item} anchored seg ${hit.anchorSegment} ` +
          `[${hit.asrSegment[0]}, ${hit.asrSegment[1]}) but cut start ${hit.cutStartMs}ms`,
      );
    }
    if (entry.comparison.diverged.length > 5) {
      lines.push(`  … ${entry.comparison.diverged.length - 5} more divergent items in the report`);
    }
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = {
    dir: join(DEFAULT_VIDEO_ROOT, "analysis-recompute"),
    outDir: null,
    threshold: DEFAULT_CUT_THRESHOLD,
    only: null,
  };
  const requireValue = (flag, value) => {
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") args.dir = requireValue("--dir", argv[++i]);
    else if (argv[i] === "--out") args.outDir = requireValue("--out", argv[++i]);
    else if (argv[i] === "--threshold") {
      const value = Number(requireValue("--threshold", argv[++i]));
      if (!Number.isFinite(value) || value <= 0 || value >= 1) {
        throw new Error("--threshold must be a number in (0,1)");
      }
      args.threshold = value;
    } else if (argv[i] === "--only") {
      const keys = requireValue("--only", argv[++i]).split(",").filter(Boolean);
      if (keys.length === 0) throw new Error("--only requires comma-separated handle/id keys");
      args.only = keys;
    }
  }
  return args;
}

const isMain =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const report = retimeWithCuts({
    dir: args.dir,
    outDir: args.outDir ?? defaultOutDir(args.dir),
    threshold: args.threshold,
    only: args.only,
  });
  console.log(formatReport(report));
  console.log(`\nreport: ${join(report.outDir, "cuts-report.json")}`);
}
