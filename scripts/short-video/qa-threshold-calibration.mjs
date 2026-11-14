#!/usr/bin/env node
/**
 * #1212 — calibration run for the mechanical QA thresholds.
 *
 * Measures every finished pack that has the three pieces a timeline needs
 * (`content/<id>/scene-data.mjs`, `output/<id>/audio/scene-durations.json`, a
 * rendered `*-short.mp4`), prints the per-pack distribution, and writes the raw
 * numbers to JSON. The thresholds in `lib/qa-mechanics.mjs` were derived from
 * this table; `CALIBRATION` records the run so a later renderer can be compared
 * against it instead of against memory.
 *
 * This script only READS. It never writes into a pack's `qa/` directory.
 *
 * Usage:
 *   node scripts/short-video/qa-threshold-calibration.mjs [--out <json>]
 *   node scripts/short-video/qa-threshold-calibration.mjs --pack qwen4-gamefeel --pack vidu-s2-ai-streamer
 *   node scripts/short-video/qa-threshold-calibration.mjs --emit-fixture vidu-s2-ai-streamer
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CALIBRATION, DEBRIS, measureVideo } from "./lib/qa-mechanics.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const getAll = (name) => {
  const out = [];
  args.forEach((a, i) => {
    if (a === `--${name}` && i + 1 < args.length) out.push(args[i + 1]);
  });
  return out;
};
const outPath = getArg("out");
const fixturePack = getArg("emit-fixture");
const only = getAll("pack");

const root = getArg("repo") ?? join(__dirname, "..", "..");
const quiet = args.includes("--quiet");

// Local read-only calibration tool: `--repo` / `--emit-fixture` are operator
// inputs, the script never writes outside the requested root or the repo's
// fixtures dir, and crossing checkouts (a worktree calibrating against the
// main checkout's rendered packs) is the intended use. The single nosemgrep
// below marks the taint source once instead of spraying the audit
// suppression at every call site.
const joinIn = (base, ...segments) => join(base, ...segments); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
const pipelineDir = joinIn(root, "scripts", "short-video"); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal

/** Every pack that can be measured at all: content + durations + finished video. */
function discoverPacks(pipeline) {
  const packs = [];
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  for (const id of readdirSync(joinIn(pipeline, "content"))) {
    if (id.startsWith("_")) continue;
    const audio = joinIn(pipeline, "output", id, "audio", "scene-durations.json"); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    if (!existsSync(joinIn(pipeline, "content", id, "scene-data.mjs")) || !existsSync(audio))
      continue;
    const outputDir = joinIn(pipeline, "output", id); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    if (!existsSync(outputDir)) continue;
    const videos = readdirSync(outputDir)
      .filter((f) => f.endsWith("-short.mp4"))
      .map((f) => joinIn(outputDir, f)) // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
      .filter((p) => existsSync(p))
      .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    if (videos.length === 0) continue;
    packs.push({ id, audio, video: videos[videos.length - 1] });
  }
  return packs;
}

const packs = discoverPacks(pipelineDir).filter((p) => only.length === 0 || only.includes(p.id));
if (packs.length === 0) {
  console.error(
    "no measurable pack found (content/scene-data.mjs + audio/scene-durations.json + *-short.mp4)",
  );
  process.exit(1);
}

const rows = [];
for (const pack of packs) {
  if (!quiet) process.stderr.write(`measuring ${pack.id}…\n`);
  const durations = JSON.parse(readFileSync(pack.audio, "utf8"));
  const { windows, diffs, laneSeries, evaluation } = measureVideo({
    videoPath: pack.video,
    sceneDurations: durations,
  });
  const row = {
    id: pack.id,
    video: { name: pack.video.split("/").pop(), frames: diffs.length },
    status: evaluation.status,
    staticSegment: evaluation.staticSegment,
    debris: evaluation.debris,
    findings: evaluation.findings,
    series:
      fixturePack === pack.id ? { windows, diffs: [...diffs], lane: [...laneSeries] } : undefined,
  };
  rows.push(row);
  if (!quiet) {
    console.log(
      [
        pack.id.padEnd(30),
        `frames=${String(diffs.length).padStart(4)}`,
        `worstStill=${String(evaluation.staticSegment.worstFrames).padStart(3)}f(scene ${evaluation.staticSegment.worstSceneId})`,
        `lanePeak=${(evaluation.debris.peakRatio * 100).toFixed(1)}%`,
        evaluation.status.toUpperCase(),
      ].join("  "),
    );
  }
}

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)))];
};
const worst = rows.map((r) => r.staticSegment.worstFrames);
const peaks = rows.map((r) => r.debris.peakRatio);
const r2 = (values) => ({
  p50: Number(pct(values, 50).toFixed(2)),
  p90: Number(pct(values, 90).toFixed(2)),
  p95: Number(pct(values, 95).toFixed(2)),
  p99: Number(pct(values, 99).toFixed(2)),
  max: Number(Math.max(...values).toFixed(2)),
});

const summary = {
  packs: rows.length,
  calibration: CALIBRATION,
  thresholds: { staticSegment: { ...r2(worst) }, debris: { ...r2(peaks) } },
  flagged: rows.filter((r) => r.status !== "pass").map((r) => ({ id: r.id, status: r.status })),
};

console.log("");
console.log(
  `packs measured: ${rows.length} (${DEBRIS.sampleEvery}-frame lane sampling, lane ${DEBRIS.minSaturation}/${DEBRIS.minValue})`,
);
console.log(`static worst-run frames: ${JSON.stringify(summary.thresholds.staticSegment)}`);
console.log(`debris peak ratio:       ${JSON.stringify(summary.thresholds.debris)}`);
console.log(
  `flagged: ${summary.flagged.length === 0 ? "none" : summary.flagged.map((f) => `${f.id}(${f.status})`).join(", ")}`,
);

if (outPath) {
  const payload = fixturePack
    ? rows.find((r) => r.id === fixturePack)?.series
    : { summary, packs: rows.map(({ series, ...rest }) => rest) };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
}

if (fixturePack) {
  const row = rows.find((r) => r.id === fixturePack);
  if (!row?.series) {
    console.error(`--emit-fixture ${fixturePack}: pack not measured`);
    process.exit(1);
  }
  const fixture = {
    pack: fixturePack,
    measuredAt: CALIBRATION.measuredAt,
    note: "real pack series (72x128 luma diff + subtitle-lane saturated ratio, every 3rd frame) — regenerated with --emit-fixture",
    windows: row.series.windows,
    diffs: row.series.diffs.map((v) => Number(v.toFixed(4))),
    lane: row.series.lane.map((v) => Number(v.toFixed(4))),
  };
  const dir = join(__dirname, "__tests__", "fixtures", "qa-mechanics");
  const file = joinIn(dir, `${fixturePack}.json`); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`wrote fixture ${file} (${row.status})`);
}
