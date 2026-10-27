/**
 * Asset gap ledger (#293).
 *
 * Stage 3 sourcing records what it could not satisfy; Stage 0 of the next
 * package reads that record before it starts, so the asset library grows
 * instead of every topic starting from zero. The ledger is the durable home —
 * `output/<slug>/media-patch.json` is a per-run artifact that dies with the
 * package.
 *
 * Why this module is a leaf:
 *   - derivation from artifacts (`scenes` + `media-patch` + optional
 *     `stock-relevance-report`) is pure input→output, so it can be replayed
 *     over historical packages to bootstrap the ledger;
 *   - the merge rule (same need seen again → count it, a satisfied gap that
 *     misses again → reopen it) has to live in one place or the pipeline and
 *     the CLI drift apart;
 *   - no I/O, no CLI parsing: the caller owns paths and printing.
 *
 * A "gap" is not "a bad image". It is a scene that asked for stock media
 * (`assetNeed` + a stock-first `mediaStrategy`) and got none. The three
 * reasons keep tool failure apart from a content verdict, the same split
 * `relevance-verdict.mjs` makes for individual candidates (#294).
 */

import { createHash } from "node:crypto";
import { skipsMediaSourcing } from "./claim-keywords.mjs";
import { GENERATING_STRATEGIES } from "./scene-rules.mjs";

/** Internal: the ledger file's schema tag, read and written only in here. */
const ASSET_GAP_SCHEMA_VERSION = 1;

/** Why a scene stayed empty after sourcing. */
export const GAP_REASON = {
  /** Nothing reachable at all: no candidate was downloaded for the scene. */
  NO_CANDIDATES: "no-candidates",
  /** Candidates existed and were scored, none was admissible. */
  RELEVANCE_REJECTED: "relevance-rejected",
  /** Candidates existed but the VLM produced no parseable score. Tool failure. */
  VLM_UNAVAILABLE: "vlm-unavailable",
  /** Sourcing produced nothing usable and the scene fell through to generation. */
  FELL_THROUGH_TO_GENERATION: "fell-through-to-generation",
  /** Replayed from artifacts that carry no per-scene evidence. */
  UNCLASSIFIED: "unclassified",
};

export const GAP_STATUS = { OPEN: "open", SATISFIED: "satisfied" };

/**
 * Strategies that never buy stock: the generating vocabulary minus the
 * `asset-then-*` ones, which try the library first.
 *
 * Derived from `scene-rules.mjs`, which owns the vocabulary, so a new strategy
 * lands on the correct side here without a second literal set to keep in sync.
 * The `asset-then-*` prefix is the pipeline's own naming convention for
 * "sourcing first, generation as the fallback".
 */
export const GENERATION_ONLY_STRATEGIES = new Set(
  [...GENERATING_STRATEGIES].filter((strategy) => !strategy.startsWith("asset-then-")),
);

const NEED_MAX_CHARS = 240;
const OCCURRENCE_MAX = 20;

const nowIso = (value) => (value instanceof Date ? value.toISOString() : String(value));

/**
 * Normalize a need for identity. Case, surrounding whitespace and repeated
 * spaces are not part of the identity; wording is (semantic dedupe would be a
 * guess, and a wrong guess silently drops a real gap).
 *
 * @param {unknown} need
 * @returns {string}
 */
export function normalizeNeed(need) {
  if (typeof need !== "string") return "";
  return need
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[.;,]+$/u, "");
}

/**
 * Stable id for a need. Eight hex chars of SHA-1 is plenty for a ledger that
 * grows by packages, not by thousands per day.
 *
 * @param {string} need
 * @returns {string}
 */
export function gapId(need) {
  const normalized = normalizeNeed(need);
  if (!normalized) return "";
  return `gap-${createHash("sha1").update(normalized).digest("hex").slice(0, 8)}`;
}

/**
 * Whether a scene asked for stock media and still has none. This is the one
 * definition of "should be in the ledger".
 *
 * The policy exclusions (text-only visual types, hooks, `media: null`,
 * `mediaOptOut`) are read from `skipsMediaSourcing`, the predicate sourcing
 * itself applies (#191, #299). A scene sourcing never tries can therefore
 * never be reported as a sourcing miss — otherwise every replay would
 * re-derive a gap that `--satisfy` could never close.
 *
 * `stockAttempted` widens it for the one case the strategy alone would hide:
 * a scene that was judged against stock and only then switched to generation.
 *
 * @param {object} scene
 * @param {{stockAttempted?: boolean}} [opts]
 * @returns {boolean}
 */
export function hasStockIntent(scene, { stockAttempted = false } = {}) {
  if (!scene || typeof scene !== "object") return false;
  if (scene.media) return false;
  if (skipsMediaSourcing(scene)) return false;
  if (GENERATION_ONLY_STRATEGIES.has(scene.mediaStrategy) && !stockAttempted) return false;
  return normalizeNeed(scene.assetNeed).length > 0;
}

const reportStatusByScene = (report) => {
  const map = new Map();
  for (const result of Array.isArray(report?.results) ? report.results : []) {
    if (result?.sceneId != null) map.set(result.sceneId, result);
  }
  return map;
};

const rejectionBand = (entry) => entry?.relevanceBand ?? null;

/**
 * @typedef {object} SceneEvidence
 * @property {Array<object>} rejections - media-patch entries bound to this scene
 * @property {object|null} reportResult - this scene's 8b relevance result
 * @property {Array<object>|null} candidates - sourcing candidates, in-process runs only
 * @property {object|null} brollEntry - this scene's b-roll report entry
 * @property {Array<object>} patches - the whole media-patch (evidence of attempts)
 * @property {boolean} bindingsAvailable - whether rejections can be attributed
 *   to a scene at all (bound entries or an in-process candidate list)
 */

/**
 * Classify one unmet scene. Evidence precedence: the 8b relevance report
 * (per-scene, explicit status) → the b-roll report (the scene fell through
 * sourcing into generation) → the media-patch rejections bound to that scene
 * → the in-process candidate pool → no evidence.
 *
 * @param {SceneEvidence} evidence
 * @returns {string}
 */
function classifyUnmet(evidence) {
  const { rejections, reportResult, candidates, brollEntry, patches, bindingsAvailable } = evidence;
  const status = typeof reportResult?.status === "string" ? reportResult.status.toLowerCase() : "";
  if (status === "fail") return GAP_REASON.RELEVANCE_REJECTED;
  if (status === "unavailable") return GAP_REASON.VLM_UNAVAILABLE;

  // A b-roll entry means the scene reached the generation stage. For an
  // `asset-then-*` strategy that is the definition of "sourcing produced
  // nothing usable" — Stage 4's view of the same miss.
  if (brollEntry && String(brollEntry.strategy ?? "").startsWith("asset-then-")) {
    return GAP_REASON.FELL_THROUGH_TO_GENERATION;
  }

  if (rejections.length > 0) {
    if (rejections.some((entry) => rejectionBand(entry) === "unavailable")) {
      return GAP_REASON.VLM_UNAVAILABLE;
    }
    if (rejections.some((entry) => rejectionBand(entry))) return GAP_REASON.RELEVANCE_REJECTED;
    // Rejected for a non-relevance reason (reuse cap, duplicate path, scene
    // filled meanwhile): the loop knows why, the artifacts do not.
    return GAP_REASON.UNCLASSIFIED;
  }

  if (Array.isArray(candidates)) {
    const downloaded = candidates.filter((asset) => asset?.path);
    if (downloaded.length === 0) return GAP_REASON.NO_CANDIDATES;
    const scored = downloaded.filter(
      (asset) => typeof asset.relevanceScore === "number" && Number.isFinite(asset.relevanceScore),
    );
    return scored.length === 0 ? GAP_REASON.VLM_UNAVAILABLE : GAP_REASON.RELEVANCE_REJECTED;
  }

  // No rejection was bound to this scene. With binding support that means
  // nothing was downloaded for it — the "search produced zero" case the
  // ledger exists to surface. Media-patch files written before #293 carry no
  // `claimSceneId`, so an unattributable rejection cannot be told apart from
  // no candidate: report `unclassified` rather than guess.
  if (patches.length > 0 && !bindingsAvailable) return GAP_REASON.UNCLASSIFIED;

  return GAP_REASON.NO_CANDIDATES;
}

/**
 * Derive this run's gaps from the pipeline's own artifacts.
 *
 * @param {object} params
 * @param {string} params.contentSlug
 * @param {Array<object>} [params.scenes]
 * @param {Array<object>} [params.patches] - media-patch entries (assigned + unassigned)
 * @param {Array<object>|null} [params.assets] - sourcing candidates (in-process runs only)
 * @param {object|null} [params.report] - stock-relevance report (Stage 3 8b)
 * @param {object|null} [params.brollReport] - b-roll report (Stage 4, `scenes` keyed by id)
 * @param {string|Date} [params.runAt]
 * @returns {Array<object>} gap records, one per unmet scene
 */
export function deriveGaps({
  contentSlug,
  scenes = [],
  patches = [],
  assets = null,
  report = null,
  brollReport = null,
  runAt = new Date(),
} = {}) {
  const seenAt = nowIso(runAt);
  const patchList = Array.isArray(patches) ? patches : [];
  const assignedSceneIds = new Set(
    patchList
      .filter((entry) => entry?.status === "assigned" && entry.sceneId != null)
      .map((entry) => entry.sceneId),
  );
  const rejectionsByScene = new Map();
  for (const entry of patchList) {
    if (entry?.status !== "unassigned" || entry.claimSceneId == null) continue;
    const list = rejectionsByScene.get(entry.claimSceneId) ?? [];
    list.push(entry);
    rejectionsByScene.set(entry.claimSceneId, list);
  }
  const candidatesByScene = new Map();
  if (Array.isArray(assets)) {
    for (const asset of assets) {
      if (asset?.claimSceneId == null) continue;
      const list = candidatesByScene.get(asset.claimSceneId) ?? [];
      list.push(asset);
      candidatesByScene.set(asset.claimSceneId, list);
    }
  }
  const reportByScene = reportStatusByScene(report);
  const brollByScene = brollReport?.scenes ?? {};
  const bindingsAvailable =
    Array.isArray(assets) || patchList.some((entry) => entry?.claimSceneId != null);

  const gaps = [];
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const reportResult = reportByScene.get(scene.id) ?? null;
    // A scene judged against stock and only then switched to generation still
    // owes the library an asset — the 8b report is what keeps that visible.
    const stockAttempted = reportResult != null;
    if (!hasStockIntent(scene, { stockAttempted })) continue;
    if (assignedSceneIds.has(scene.id)) continue;
    const normalizedNeed = normalizeNeed(scene.assetNeed);
    // Identity comes from the whole need; only the stored text is bounded, so
    // two long needs that share a prefix cannot collapse into one gap.
    const id = gapId(normalizedNeed);
    if (!id) continue;
    gaps.push({
      id,
      need: normalizedNeed.slice(0, NEED_MAX_CHARS),
      reason: classifyUnmet({
        rejections: rejectionsByScene.get(scene.id) ?? [],
        reportResult,
        candidates: Array.isArray(assets) ? (candidatesByScene.get(scene.id) ?? []) : null,
        brollEntry: brollByScene[String(scene.id)] ?? null,
        patches: patchList,
        bindingsAvailable,
      }),
      contentSlug,
      sceneId: scene.id ?? null,
      sceneName: scene.name ?? null,
      mediaStrategy: scene.mediaStrategy ?? "asset",
      lastSeen: seenAt,
    });
  }
  return gaps;
}

/** @returns {{schemaVersion: number, updatedAt: string, gaps: Array<object>}} */
function emptyLedger(now = new Date()) {
  return { schemaVersion: ASSET_GAP_SCHEMA_VERSION, updatedAt: nowIso(now), gaps: [] };
}

const occurrenceKey = (occurrence) => `${occurrence.content}#${occurrence.sceneId ?? "?"}`;

const sortOccurrences = (occurrences) =>
  [...occurrences].sort((a, b) => occurrenceKey(a).localeCompare(occurrenceKey(b)));

const byLastSeen = (a, b) => String(a.lastSeen).localeCompare(String(b.lastSeen));

/** The most recent package that hit this need, or null when unknown. */
const latestOccurrence = (occurrences) => [...(occurrences ?? [])].sort(byLastSeen).at(-1) ?? null;

/**
 * Keep the newest occurrences. Sorting by key alone would drop `pkg-25` and
 * keep `pkg-9` (string order), so the trim is by last-seen time; equal
 * timestamps keep insertion order (Array.sort is stable), which is the order
 * the packages arrived in.
 */
const trimOccurrences = (occurrences) => {
  if (occurrences.length <= OCCURRENCE_MAX) return sortOccurrences(occurrences);
  const kept = new Set([...occurrences].sort(byLastSeen).slice(-OCCURRENCE_MAX).map(occurrenceKey));
  return sortOccurrences(occurrences.filter((item) => kept.has(occurrenceKey(item))));
};

const sortGaps = (gaps) =>
  [...gaps].sort((a, b) => {
    if (a.status !== b.status) return a.status === GAP_STATUS.OPEN ? -1 : 1;
    if ((b.seenCount ?? 0) !== (a.seenCount ?? 0)) return (b.seenCount ?? 0) - (a.seenCount ?? 0);
    return String(a.need).localeCompare(String(b.need));
  });

/**
 * Fold one run's gaps into the ledger.
 *
 * - a need seen again in **another** package/scene increments `seenCount` and
 *   refreshes `lastSeen`;
 * - replaying the same package and scene is not a new observation: it only
 *   refreshes that occurrence (and its reason, which a re-run of the stage can
 *   change), so `--record` twice leaves the same ledger;
 * - a satisfied gap that misses again is reopened — the library has an asset,
 *   yet sourcing still could not use it, and hiding that would make the
 *   ledger lie. A replay is not "again": it would reopen a gap the library
 *   has already closed;
 * - occurrences stay bounded (newest packages win) so the file cannot grow
 *   without limit.
 *
 * @param {object} ledger
 * @param {Array<object>} gaps
 * @param {{now?: string|Date}} [opts]
 * @returns {object} new ledger
 */
export function mergeGaps(ledger, gaps, { now = new Date() } = {}) {
  const seenAt = nowIso(now);
  const base = ledger && Array.isArray(ledger.gaps) ? ledger : emptyLedger(seenAt);
  const byId = new Map((base.gaps ?? []).map((gap) => [gap.id, { ...gap }]));

  for (const gap of Array.isArray(gaps) ? gaps : []) {
    if (!gap?.id || !gap.need) continue;
    const existing = byId.get(gap.id);
    const occurrence = {
      content: gap.contentSlug ?? "unknown",
      sceneId: gap.sceneId ?? null,
      lastSeen: gap.lastSeen ?? seenAt,
    };
    if (!existing) {
      byId.set(gap.id, {
        id: gap.id,
        need: gap.need,
        status: GAP_STATUS.OPEN,
        reason: gap.reason ?? GAP_REASON.UNCLASSIFIED,
        firstSeen: seenAt,
        lastSeen: seenAt,
        seenCount: 1,
        occurrences: [occurrence],
      });
      continue;
    }
    const occurrences = new Map(
      (existing.occurrences ?? []).map((item) => [occurrenceKey(item), item]),
    );
    const key = occurrenceKey(occurrence);
    // Re-recording a package is a replay of evidence the ledger already holds,
    // not a second sighting: no count, no reopen, and the stored occurrence
    // keeps its original timestamp.
    existing.reason = gap.reason ?? existing.reason;
    if (occurrences.has(key)) continue;
    occurrences.set(key, occurrence);
    existing.occurrences = trimOccurrences([...occurrences.values()]);
    existing.lastSeen = seenAt;
    existing.seenCount = (existing.seenCount ?? 0) + 1;
    if (existing.status === GAP_STATUS.SATISFIED) {
      existing.status = GAP_STATUS.OPEN;
      existing.reopenedAt = seenAt;
      delete existing.satisfiedAt;
      delete existing.satisfiedBy;
    }
  }

  return {
    schemaVersion: ASSET_GAP_SCHEMA_VERSION,
    updatedAt: seenAt,
    gaps: sortGaps([...byId.values()]),
  };
}

/**
 * Parse a ledger file. Malformed input is an empty ledger, not a crash: a
 * missing or corrupt ledger must not block a production run (the same
 * fail-open stance as the used-asset index).
 *
 * @param {string|null|undefined} text
 * @returns {{schemaVersion: number, updatedAt: string, gaps: Array<object>}}
 */
export function parseLedger(text) {
  if (typeof text !== "string" || text.trim() === "") return emptyLedger();
  try {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.gaps)) return emptyLedger();
    return {
      schemaVersion: parsed.schemaVersion ?? ASSET_GAP_SCHEMA_VERSION,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      gaps: sortGaps(parsed.gaps.filter((gap) => gap && typeof gap.id === "string")),
    };
  } catch {
    return emptyLedger();
  }
}

/** Serialize deterministically (2-space JSON + trailing newline). */
export function serializeLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

const termsOf = (terms) =>
  (Array.isArray(terms) ? terms : String(terms ?? "").split(","))
    .map((term) => normalizeNeed(term))
    .filter(Boolean);

/**
 * Find gaps relevant to a topic. Matching is deliberately simple — a term is
 * a normalized substring of the need — because Stage 0 only needs a shortlist
 * to review, and a fuzzy match that hides a reusable gap is worse than an
 * extra line to read.
 *
 * @param {object} ledger
 * @param {string|string[]} terms
 * @param {{status?: string|null, limit?: number}} [opts]
 * @returns {Array<object>}
 */
export function queryGaps(ledger, terms, { status = GAP_STATUS.OPEN, limit = 20 } = {}) {
  const needles = termsOf(terms);
  const matches = [];
  for (const gap of Array.isArray(ledger?.gaps) ? ledger.gaps : []) {
    if (status && gap.status !== status) continue;
    const haystack = normalizeNeed(gap.need);
    const hits = needles.filter((needle) => haystack.includes(needle)).length;
    if (needles.length > 0 && hits === 0) continue;
    matches.push({ gap, hits });
  }
  matches.sort(
    (a, b) =>
      b.hits - a.hits ||
      (b.gap.seenCount ?? 0) - (a.gap.seenCount ?? 0) ||
      String(b.gap.lastSeen).localeCompare(String(a.gap.lastSeen)),
  );
  return matches.slice(0, Math.max(0, limit)).map(({ gap }) => gap);
}

/**
 * Mark gaps satisfied after the library gained an asset for them.
 *
 * @param {object} ledger
 * @param {string} selector - a gap id (`gap-xxxxxxxx`) or a substring of the need
 * @param {{by?: string|null, now?: string|Date}} [opts]
 * @returns {{ledger: object, matched: Array<object>}}
 */
export function satisfyGaps(ledger, selector, { by = null, now = new Date() } = {}) {
  const seenAt = nowIso(now);
  const needle = normalizeNeed(selector);
  const idPrefix = typeof selector === "string" ? selector.trim().toLowerCase() : "";
  const base = ledger && Array.isArray(ledger.gaps) ? ledger : emptyLedger(seenAt);
  const matched = [];
  const gaps = base.gaps.map((gap) => {
    const isIdMatch = idPrefix.startsWith("gap-") && gap.id.toLowerCase() === idPrefix;
    const isTermMatch = needle.length > 0 && normalizeNeed(gap.need).includes(needle);
    if (!isIdMatch && !isTermMatch) return gap;
    const next = { ...gap, status: GAP_STATUS.SATISFIED, satisfiedAt: seenAt };
    if (by) next.satisfiedBy = by;
    matched.push(next);
    return next;
  });
  return {
    ledger: { ...base, updatedAt: seenAt, gaps: sortGaps(gaps) },
    matched,
  };
}

/** Human-readable one-liner for CLI output. */
export function formatGapLine(gap) {
  const latest = latestOccurrence(gap.occurrences);
  const where = latest ? ` last ${latest.lastSeen} in ${latest.content}#${latest.sceneId}` : "";
  return `${gap.id}  ${gap.seenCount ?? 1}x  ${gap.reason}  ${gap.need}${where}`;
}
