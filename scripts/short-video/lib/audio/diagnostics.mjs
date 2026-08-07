/**
 * Failure diagnostics — the fail-loud closure.
 *
 * When verification fails, the pipeline stops (exit 1) — but a red exit
 * without evidence still leaves the human to re-run the manual ffprobe hunt
 * that diagnosed the original drift bug. This module packages that hunt: on
 * FAIL, `writeDiagnosticsBundle` drops a self-contained folder under
 * output/{pipelineId}/diagnostics/{ts}/ with the drift table, audio packet
 * gaps, stream durations, and a copy of the report.
 *
 * Hard rules:
 * - PASS paths never call this module (zero bytes written).
 * - Everything here is best-effort: collection errors are recorded into the
 *   bundle, never thrown — a diagnostics failure must not mask the exit code
 *   that `summary.passed` already decided.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/** Packet gaps strictly larger than this (seconds) are reported. */
export const PACKET_GAP_THRESHOLD = 0.1;

/** Shared ffprobe csv bridge: `-v quiet <extra> -show_entries <entries> -of csv=p=0`. */
function runFfprobeCsv(videoPath, showEntries, extraFlags = "") {
  return execSync(
    `ffprobe -v quiet ${extraFlags} -show_entries ${showEntries} -of csv=p=0 "${videoPath}"`,
    { stdio: ["pipe", "pipe", "pipe"] },
  ).toString();
}

/**
 * Parse ffprobe `-show_entries packet=pts_time -of csv=p=0` output.
 * The csv writer emits one "value," per line (trailing comma), the first
 * audio packet often carries negative AAC priming pts, and empty lines can
 * appear — all tolerated here.
 *
 * @param {string|null} raw
 * @returns {number[]}
 */
export function parsePacketPts(raw) {
  const pts = [];
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    const trimmed = line.trim().replace(/,$/, "");
    if (!trimmed) continue;
    const value = Number(trimmed);
    if (Number.isFinite(value)) pts.push(value);
  }
  return pts;
}

/**
 * Find timestamp jumps larger than `minGapSeconds` in a packet pts sequence.
 *
 * @param {number[]} pts
 * @param {number} [minGapSeconds]
 * @returns {Array<{at: number, gapMs: number}>} jump point (seconds) + gap size (ms)
 */
export function findGaps(pts, minGapSeconds = PACKET_GAP_THRESHOLD) {
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    const delta = pts[i] - pts[i - 1];
    // Negative deltas (non-monotonic pts) are rewinds, not gaps.
    if (delta > minGapSeconds) {
      gaps.push({ at: pts[i], gapMs: Math.round(delta * 1000) });
    }
  }
  return gaps;
}

/**
 * Measure the shipped audio's packet continuity — the container-level
 * evidence that answers "did the gap structure come back?".
 * Never throws: failures become an `error` field.
 *
 * @param {string} videoPath
 * @param {number} [minGapSeconds]
 * @returns {{packets: number, firstPts: number|null, lastPts: number|null, gaps: Array, error: string|null}}
 */
export function collectPacketGaps(videoPath, minGapSeconds = PACKET_GAP_THRESHOLD) {
  try {
    const raw = runFfprobeCsv(videoPath, "packet=pts_time", "-select_streams a");
    const pts = parsePacketPts(raw);
    if (pts.length === 0) {
      return {
        packets: 0,
        firstPts: null,
        lastPts: null,
        gaps: [],
        error: "no audio packets found (video has no audio stream?)",
      };
    }
    return {
      packets: pts.length,
      firstPts: pts[0],
      lastPts: pts[pts.length - 1],
      gaps: findGaps(pts, minGapSeconds),
      error: null,
    };
  } catch (e) {
    return {
      packets: 0,
      firstPts: null,
      lastPts: null,
      gaps: [],
      error: `ffprobe failed: ${e.message}`,
    };
  }
}

/**
 * Compare video vs audio stream durations — the "is audio running short
 * again?" evidence (the original bug: 73.4s audio inside a 73.9s video).
 * Never throws; a stream that exists but reports no duration yields `null`
 * for that stream, and a video with only one stream type is not an error.
 *
 * @param {string} videoPath
 * @returns {{video: number|null, audio: number|null, error: string|null}}
 */
export function collectStreamDurations(videoPath) {
  try {
    const raw = runFfprobeCsv(videoPath, "stream=codec_type,duration");

    const durations = { video: null, audio: null };
    let seenAny = false;
    for (const line of raw.split(/\r?\n/)) {
      const m = /^(video|audio),(.*)$/.exec(line.trim().replace(/,$/, ""));
      if (!m) continue;
      seenAny = true;
      const value = Number(m[2]);
      durations[m[1]] = Number.isFinite(value) ? value : null;
    }

    return {
      ...durations,
      error: seenAny ? null : "no video/audio streams found",
    };
  } catch (e) {
    return { video: null, audio: null, error: `ffprobe failed: ${e.message}` };
  }
}

function sign(v) {
  return v > 0 ? "+" : "";
}

function formatSeconds(value) {
  return value === null ? "missing" : `${value.toFixed(3)}s`;
}

function buildSummaryText({ report, videoPath, packet, streams, errors }) {
  const lines = [];
  lines.push("# Verification diagnostics — FAIL");
  lines.push(`generatedAt: ${new Date().toISOString()}`);
  lines.push(`video: ${videoPath}`);
  lines.push(`summary: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`);

  lines.push("", "## Why it failed");
  if (report.wordSequence) {
    lines.push(`- word sequence: ${JSON.stringify(report.wordSequence)}`);
  }
  const a = report.audioSync;
  if (a) {
    lines.push(
      `- audio sync: ${JSON.stringify({
        errored: a.errored,
        error: a.error ?? null,
        checked: a.checked,
        skipped: a.skipped,
        errors: a.errors,
      })}`,
    );
  } else {
    lines.push("- audio sync: not run (no output-dir)");
  }

  lines.push("", "## Audio sync drift");
  if (a) {
    for (const s of a.scenes ?? []) {
      lines.push(
        `scene ${s.sceneId}: expected ${s.expected.toFixed(3)}s, measured ${s.measured.toFixed(3)}s, ` +
          `drift ${sign(s.driftMs)}${Math.round(s.driftMs)}ms, ${s.ok ? "OK" : "OFF"}`,
      );
    }
    lines.push(
      `failed to measure: ${(a.failedScenes ?? []).map((f) => `scene ${f.sceneId} (${f.reason})`).join(", ") || "(none)"}`,
    );
    lines.push(`skipped (missing audio): ${(a.skippedScenes ?? []).join(", ") || "(none)"}`);
  } else {
    lines.push("(no audio sync data)");
  }

  lines.push("", `## Packet gaps (threshold >${PACKET_GAP_THRESHOLD * 1000}ms)`);
  if (packet.gaps.length === 0) {
    lines.push(`0 gap(s) across ${packet.packets} packet(s)`);
  } else {
    lines.push(`${packet.gaps.length} gap(s) across ${packet.packets} packet(s):`);
    for (const g of packet.gaps.slice(0, 30)) {
      lines.push(`- at ${g.at.toFixed(3)}s jump ${g.gapMs}ms`);
    }
    if (packet.gaps.length > 30) {
      lines.push(`… and ${packet.gaps.length - 30} more (full list in packet-gaps.json)`);
    }
  }

  lines.push("", "## Stream durations");
  lines.push(`video: ${formatSeconds(streams.video)}`);
  lines.push(`audio: ${formatSeconds(streams.audio)}`);

  lines.push("", "## Collection errors");
  if (errors.length === 0) {
    lines.push("(none)");
  } else {
    for (const err of errors) lines.push(`- ${err}`);
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Write the five bundle files into an existing `bundleDir`. Split from
 * `writeDiagnosticsBundle` so tests can inject partial failures; every write
 * is individually caught and recorded.
 *
 * @param {string} bundleDir
 * @param {{report: object, videoPath: string}} options
 * @returns {{dir: string, errors: string[]}}
 */
export function writeBundleFiles(bundleDir, { report, videoPath }) {
  const errors = [];
  const packet = collectPacketGaps(videoPath);
  const streams = collectStreamDurations(videoPath);
  if (packet.error) errors.push(`packet gaps: ${packet.error}`);
  if (streams.error) errors.push(`streams: ${streams.error}`);

  const write = (name, content) => {
    try {
      writeFileSync(join(bundleDir, name), content);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  };

  write("drift.json", JSON.stringify(report.audioSync ?? null, null, 2));
  write("packet-gaps.json", JSON.stringify(packet, null, 2));
  write("streams.json", JSON.stringify(streams, null, 2));
  write("verification-report.json", JSON.stringify(report, null, 2));
  write("summary.txt", buildSummaryText({ report, videoPath, packet, streams, errors }));

  return { dir: bundleDir, errors };
}

/** `2026-08-07T08-30-00-123Z` — colon/dot-free so it is shell- and path-friendly. */
export function defaultTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Create `{outputDir}/diagnostics/{ts}/` (suffixed `-2`, `-3`, … if the
 * timestamp dir already exists, so no two failures ever overwrite each other)
 * and fill it. Returns the bundle dir, or null if even the directory cannot
 * be created — never throws.
 *
 * @param {object} options
 * @param {string} options.outputDir - output/{pipelineId}
 * @param {object} options.report - the verification report (FAIL)
 * @param {string} options.videoPath
 * @param {string} [options.ts] - injected timestamp (tests)
 * @returns {string|null}
 */
export function writeDiagnosticsBundle({ outputDir, report, videoPath, ts }) {
  const root = join(outputDir, "diagnostics");
  const base = ts ?? defaultTimestamp();
  let bundleDir = join(root, base);
  let suffix = 2;
  while (existsSync(bundleDir)) {
    bundleDir = join(root, `${base}-${suffix++}`);
  }
  try {
    mkdirSync(bundleDir, { recursive: true });
  } catch (e) {
    console.error(`  ⚠️  Could not create diagnostics dir ${bundleDir}: ${e.message}`);
    return null;
  }
  const { errors } = writeBundleFiles(bundleDir, { report, videoPath });
  if (errors.length > 0) {
    // Visible in the pipeline log as well as inside summary.txt — the bundle
    // may be incomplete, so the failure must not be silent.
    console.error(
      `  ⚠️  ${errors.length} diagnostic collection issue(s) — see ${join(bundleDir, "summary.txt")}`,
    );
  }
  return bundleDir;
}
