/**
 * Run identity and artifact history for the short-video pipeline (#1432 Stage 3,
 * slice 1).
 *
 * The pipeline used to write every artifact into `output/<slug>/`, so a second
 * run of the same slug silently overwrote the first: the final video, the
 * per-scene audio, the profile, and the publish package had no run dimension.
 * This module introduces that dimension on the read side of the filesystem:
 *
 *   output/<slug>/runs/manifest.json   append-only index of every run
 *   output/<slug>/runs/<runId>/        artifacts belonging to one run
 *   output/<slug>/latest.json          pointer to the last SUCCESSFUL run
 *   output/<slug>/                     legacy layout, still readable
 *
 * Decisions (durable contract: docs/specs/spec-run-history-stage3.md):
 *
 * - runId is `r-<UTC timestamp>-<6 hex>`; a collision with an existing run or
 *   directory is refused, not overwritten.
 * - `latest` moves only on a terminal SUCCESS status (`rendered` or
 *   `published`). A failed or interrupted run stays listed in the manifest with
 *   its own artifacts but never becomes latest, so it cannot shadow the last
 *   good package.
 * - Retention is keep-all: this slice never deletes a run. An explicit prune
 *   with reference guards is a later slice, so no default can destroy data.
 * - Consumers resolve a run through `resolveRun`: explicit id first, then the
 *   latest pointer, then the legacy directory. Reading is therefore
 *   backwards-compatible for packs produced before run history existed.
 */

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { containedPath } from "./path-safety.mjs";
import { isJsonObject, readJsonFile, writeJsonAtomic } from "./json-file.mjs";

export const RUN_STATUS = Object.freeze({
  RUNNING: "running",
  RENDERED: "rendered",
  PUBLISHED: "published",
  FAILED: "failed",
});

const SUCCESS_STATUSES = new Set([RUN_STATUS.RENDERED, RUN_STATUS.PUBLISHED]);
const MANIFEST_VERSION = 1;
const RUN_ID_PATTERN = /^r-\d{8}T\d{6}-[0-9a-f]{6}$/;

function assertSafeSlug(slug) {
  const clean = String(slug ?? "").trim();
  if (!clean) throw new Error("run history: articleSlug is empty");
  // containedPath owns the segment rules; calling it here makes the slug
  // fail before any filesystem access and keeps the error message local.
  containedPath("/", clean);
  return clean;
}

function assertRunId(runId) {
  const clean = String(runId ?? "").trim();
  if (!RUN_ID_PATTERN.test(clean)) {
    throw new Error(`run history: invalid runId ${JSON.stringify(runId)}`);
  }
  return clean;
}

function compactTimestamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .slice(0, 15);
}

/**
 * Generate a fresh run id: `r-YYYYMMDDTHHMMSS-<6 hex>` (UTC).
 *
 * `suffix` exists for tests; production callers omit it and get random bytes.
 */
export function generateRunId(date = new Date(), suffix = randomBytes(3).toString("hex")) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("run history: generateRunId needs a valid Date");
  }
  const hex = String(suffix ?? "");
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    throw new Error(`run history: run id suffix must be 6 lowercase hex chars, got ${hex}`);
  }
  return `r-${compactTimestamp(date)}-${hex}`;
}

function slugRoot(root, slug) {
  return containedPath(root, "output", assertSafeSlug(slug));
}

function runsRoot(root, slug) {
  return containedPath(slugRoot(root, slug), "runs");
}

export function runDir(root, slug, runId) {
  return containedPath(runsRoot(root, slug), assertRunId(runId));
}

export function manifestFile(root, slug) {
  return containedPath(runsRoot(root, slug), "manifest.json");
}

export function latestFile(root, slug) {
  return containedPath(slugRoot(root, slug), "latest.json");
}

function emptyManifest(slug) {
  return { version: MANIFEST_VERSION, slug, runs: [] };
}

/**
 * Read the run index. A missing manifest is an empty index (a legacy pack);
 * a corrupt one is an error, never silently replaced.
 */
export function readManifest(root, slug) {
  const file = manifestFile(root, slug);
  if (!existsSync(file)) return emptyManifest(assertSafeSlug(slug));
  const parsed = readJsonFile(file, "run history manifest");
  if (!isJsonObject(parsed) || !Array.isArray(parsed.runs)) {
    throw new Error(`run history: manifest at ${file} has no runs array`);
  }
  return parsed;
}

function writeManifest(root, slug, manifest) {
  const clean = assertSafeSlug(slug);
  const file = manifestFile(root, clean);
  mkdirSync(runsRoot(root, clean), { recursive: true });
  writeJsonAtomic(file, { ...manifest, version: MANIFEST_VERSION, slug: clean });
}

/**
 * Allocate a run and its directory. Refuses an existing id instead of reusing
 * the directory, so two runs can never share artifact space.
 *
 * @returns {{runId: string, dir: string, manifest: object}}
 */
export function createRun({ root, slug, runId, now = new Date(), contentDir = null } = {}) {
  const clean = assertSafeSlug(slug);
  const manifest = readManifest(root, clean);
  let id = runId ? assertRunId(runId) : generateRunId(now);
  if (
    runId &&
    (manifest.runs.some((run) => run.runId === id) || existsSync(runDir(root, clean, id)))
  ) {
    throw new Error(`run history: run ${id} already exists for ${clean}`);
  }
  // Generated ids retry on collision; only an explicit id is a hard error.
  for (let attempt = 0; !runId && existsSync(runDir(root, clean, id)); attempt += 1) {
    if (attempt >= 5)
      throw new Error(`run history: could not allocate a unique run id for ${clean}`);
    id = generateRunId(now);
  }

  const dir = runDir(root, clean, id);
  mkdirSync(dir, { recursive: true });
  const entry = {
    runId: id,
    createdAt: now.toISOString(),
    status: RUN_STATUS.RUNNING,
    contentDir: contentDir ?? clean,
  };
  manifest.runs.push(entry);
  writeManifest(root, clean, manifest);
  return { runId: id, dir, manifest };
}

/**
 * Update one run. Moving `latest` is limited to terminal success, which is what
 * keeps a failed run from displacing the previous package.
 */
export function markRun({ root, slug, runId, status, artifacts, meta, now = new Date() } = {}) {
  const clean = assertSafeSlug(slug);
  const id = assertRunId(runId);
  if (!Object.values(RUN_STATUS).includes(status)) {
    throw new Error(`run history: unknown status ${JSON.stringify(status)}`);
  }
  const manifest = readManifest(root, clean);
  const entry = manifest.runs.find((run) => run.runId === id);
  if (!entry) throw new Error(`run history: run ${id} is not in the manifest for ${clean}`);

  entry.status = status;
  entry.updatedAt = now.toISOString();
  if (status !== RUN_STATUS.RUNNING && !entry.endedAt) entry.endedAt = now.toISOString();
  if (isJsonObject(artifacts)) entry.artifacts = { ...(entry.artifacts ?? {}), ...artifacts };
  if (isJsonObject(meta)) entry.meta = { ...(entry.meta ?? {}), ...meta };
  writeManifest(root, clean, manifest);

  if (SUCCESS_STATUSES.has(status)) {
    writeJsonAtomic(latestFile(root, clean), {
      runId: id,
      status,
      updatedAt: entry.updatedAt,
    });
  }
  return entry;
}

export function readLatest(root, slug) {
  const file = latestFile(root, slug);
  if (!existsSync(file)) return null;
  const parsed = readJsonFile(file, "run history latest pointer");
  if (!isJsonObject(parsed) || typeof parsed.runId !== "string") {
    throw new Error(`run history: latest pointer at ${file} has no runId`);
  }
  return parsed;
}

/**
 * Resolve which artifact directory a consumer should read.
 *
 * Precedence: explicit id → latest pointer → legacy `output/<slug>`. A pointer
 * whose directory has disappeared falls back to legacy and says so, instead of
 * reading a half-deleted path.
 *
 * @returns {{runId: string|null, dir: string, source: "explicit"|"latest"|"legacy"}}
 */
export function resolveRun({ root, slug, runId = null } = {}) {
  const clean = assertSafeSlug(slug);
  if (runId) {
    const id = assertRunId(runId);
    const dir = runDir(root, clean, id);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new Error(`run history: run ${id} does not exist for ${clean}`);
    }
    return { runId: id, dir, source: "explicit" };
  }

  const latest = readLatest(root, clean);
  if (latest) {
    const dir = runDir(root, clean, latest.runId);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      return { runId: latest.runId, dir, source: "latest" };
    }
  }

  const legacy = slugRoot(root, clean);
  if (existsSync(legacy) && statSync(legacy).isDirectory()) {
    return { runId: null, dir: legacy, source: "legacy" };
  }
  throw new Error(`run history: no runs and no legacy output for ${clean}`);
}

/**
 * True when a slug has at least one run directory. Used by callers that want to
 * distinguish "run history exists" from "only the legacy layout exists".
 */
export function hasRuns(root, slug) {
  const dir = runsRoot(root, slug);
  if (!existsSync(dir)) return false;
  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name),
  );
}
