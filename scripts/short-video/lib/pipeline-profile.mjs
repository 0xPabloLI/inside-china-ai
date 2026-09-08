/**
 * Pipeline step profiler (#225 acceptance 1) — lightweight wall-clock
 * instrumentation for main.mjs.
 *
 * Records per-step durations by name, including overlapping steps (the
 * parallel voice/media tracks from #225 optimization 1), persists a JSON
 * profile to the pipeline output dir, and prints a summary sorted by
 * duration so the next optimization target is always evidence-backed.
 *
 * Output:
 *   output/<pipelineId>/profile-<version>.json  (per-run)
 *   output/<pipelineId>/last-profile.json       (stable name for tooling)
 *
 * The clock is injectable for deterministic tests. When `onExit` is true
 * (the default) a process "exit" hook writes the profile synchronously, so
 * even a failed run leaves partial timing evidence behind.
 *
 * @module pipeline-profile
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Create a profiler instance.
 *
 * @param {object} opts
 * @param {string} opts.outputDir - pipeline output dir (profile files land here)
 * @param {string} opts.version - run version string (from main.mjs)
 * @param {() => number} [opts.now] - monotonic ms clock (defaults to performance.now)
 * @param {boolean} [opts.onExit=true] - register a process exit hook that writes the profile
 */
export function createProfiler({ outputDir, version, now = () => performance.now(), onExit = true } = {}) {
  const steps = [];
  const open = new Map();
  const t0 = now();
  const startedAt = new Date().toISOString();

  if (onExit && typeof process.on === "function") {
    process.on("exit", () => write());
  }

  function totalMs() {
    return now() - t0;
  }

  /** Start timing a named step. `meta` fields are merged into the record. */
  function mark(name, meta = {}) {
    open.set(name, { start: now(), meta });
  }

  /** Stop timing a named step. Returns the duration, or null if unknown. */
  function end(name) {
    const o = open.get(name);
    if (!o) return null;
    open.delete(name);
    const durationMs = now() - o.start;
    steps.push({ name, startedAt: o.start, durationMs, ...o.meta });
    return durationMs;
  }

  /** Time an async fn: `const r = await prof.wrap("name", fn, meta?)`. */
  async function wrap(name, fn, meta = {}) {
    mark(name, meta);
    try {
      return await fn();
    } finally {
      end(name);
    }
  }

  /** Persist the profile JSON (per-run file + stable last-profile.json). */
  function write() {
    try {
      // Steps still open at write time (process.exit on a failure path) are
      // snapshotted as unfinished so a failed run leaves timing evidence.
      const snapshot = [...steps];
      const seen = new Set(snapshot.map((s) => s.name));
      for (const [name, o] of open) {
        if (!seen.has(name)) {
          snapshot.push({ name, startedAt: o.start, durationMs: now() - o.start, unfinished: true, ...o.meta });
        }
      }
      mkdirSync(outputDir, { recursive: true });
      const payload = JSON.stringify(
        { version, startedAt, totalMs: totalMs(), steps: snapshot },
        null,
        2,
      );
      writeFileSync(join(outputDir, `profile-${version}.json`), payload);
      writeFileSync(join(outputDir, "last-profile.json"), payload);
    } catch (err) {
      console.warn(`  ⚠️  Profile write failed: ${err.message}`);
    }
  }

  /** Print the step summary, sorted by duration descending. */
  function summary() {
    if (steps.length === 0) return;
    console.log("\n⏱  Step profile (#225) — sorted by duration:");
    const sorted = [...steps].sort((a, b) => b.durationMs - a.durationMs);
    for (const s of sorted) {
      const pct = totalMs() > 0 ? ((s.durationMs / totalMs()) * 100).toFixed(0) : "?";
      const track = s.track ? ` [${s.track}]` : "";
      console.log(`   ${s.name}${track}: ${(s.durationMs / 1000).toFixed(1)}s (${pct}%)`);
    }
    console.log(`   TOTAL: ${(totalMs() / 1000).toFixed(1)}s\n`);
  }

  return { mark, end, wrap, steps, write, summary, totalMs };
}
