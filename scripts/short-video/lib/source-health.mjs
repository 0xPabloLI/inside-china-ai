/**
 * Source health tracking (#200).
 *
 * A CDP selector rotting into silent zero-results used to be
 * indistinguishable from "no news today": collectFromSource only surfaced
 * thrown failures, so a dead source never entered failedSources. This module
 * derives per-run zero-result sources from layer trajectories and maintains
 * the cross-run consecutive-zero-run streak in output/source-health.json so
 * selectors that have been silently dead for N runs surface for manual review.
 *
 * Fail-open everywhere: health tracking must never break a discovery run.
 */

/** Consecutive zero-result runs before a source is flagged for review. */
export const REVIEW_THRESHOLD = 3;

/**
 * Fold one run's per-source outcomes into the health log.
 *
 * @param {object|null} prevLog - previously loaded health log (null = fresh)
 * @param {Array<{name: string, count: number}>} runEntries - per-source
 *   collected-article counts for THIS run (sources that threw are excluded
 *   by the caller — they are already visible in failedSources)
 * @param {object} [opts]
 * @param {number} [opts.now] - timestamp override (tests)
 * @returns {{version: 1, sources: Record<string, {consecutiveZeroRuns: number, lastZeroAt: number|null, lastOkAt: number|null}>}}
 */
export function updateSourceHealth(prevLog, runEntries, opts = {}) {
  const now = opts.now ?? Date.now();
  const sources = { ...(prevLog?.sources ?? {}) };
  for (const entry of runEntries ?? []) {
    if (!entry?.name) continue;
    const prev = sources[entry.name] ?? {
      consecutiveZeroRuns: 0,
      lastZeroAt: null,
      lastOkAt: null,
    };
    if ((entry.count ?? 0) > 0) {
      sources[entry.name] = { ...prev, consecutiveZeroRuns: 0, lastOkAt: now };
    } else {
      sources[entry.name] = {
        ...prev,
        consecutiveZeroRuns: (prev.consecutiveZeroRuns ?? 0) + 1,
        lastZeroAt: now,
      };
    }
  }
  return { version: 1, sources };
}

/**
 * Derive this run's zero-result sources from the layer trajectory.
 *
 * A source is zero-result when every recorded layer produced 0 results.
 * Layers that were skipped (e.g. `skipped-same-url-as-api` — apiSearch and
 * CDP hit the same endpoint by design, issue #66) carry an explicit reason
 * so reviewers can tell "no next layer by design" from "all layers broken".
 *
 * @param {Array<{source: string, layer: string, count: number|null, reason?: string}>} attempts
 * @returns {Array<{source: string, attempts: Array, totalResults: number}>}
 */
export function deriveZeroResultSources(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) return [];
  const bySource = new Map();
  for (const e of attempts) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source).push(e);
  }
  const zero = [];
  for (const [source, events] of bySource) {
    const totalResults = events.reduce((sum, e) => sum + (e.count ?? 0), 0);
    if (totalResults === 0 && events.length > 0) {
      zero.push({ source, attempts: events, totalResults });
    }
  }
  return zero;
}
