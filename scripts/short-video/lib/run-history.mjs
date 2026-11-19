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
 * Decisions (durable contract: docs/archive/specs/spec-run-history-stage3.md):
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

import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { containedPath } from "./path-safety.mjs";
import { isJsonObject, readJsonFile, writeJsonAtomic } from "./json-file.mjs";
import { listPendingAnalysis } from "./pending-analysis.mjs";

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

function patchRun({ root, slug, runId, status, artifacts, meta, now }) {
  const clean = assertSafeSlug(slug);
  const id = assertRunId(runId);
  const manifest = readManifest(root, clean);
  const entry = manifest.runs.find((run) => run.runId === id);
  if (!entry) throw new Error(`run history: run ${id} is not in the manifest for ${clean}`);

  if (status !== undefined) {
    if (!Object.values(RUN_STATUS).includes(status)) {
      throw new Error(`run history: unknown status ${JSON.stringify(status)}`);
    }
    entry.status = status;
  }
  entry.updatedAt = now.toISOString();
  if (status !== undefined && status !== RUN_STATUS.RUNNING && !entry.endedAt) {
    entry.endedAt = now.toISOString();
  }
  if (isJsonObject(artifacts)) entry.artifacts = { ...(entry.artifacts ?? {}), ...artifacts };
  if (isJsonObject(meta)) entry.meta = { ...(entry.meta ?? {}), ...meta };
  writeManifest(root, clean, manifest);
  return entry;
}

/**
 * Record artifacts/metadata on a known run without touching its status or the
 * latest pointer. S4 uses this for guide/draft receipts: the run keeps its
 * render status until an actual publish happens, but the receipt path and
 * method still become auditable from the manifest.
 */
export function updateRun({ root, slug, runId, artifacts, meta, now = new Date() } = {}) {
  return patchRun({ root, slug, runId, artifacts, meta, now });
}

/**
 * Update one run. Moving `latest` is limited to terminal success, which is what
 * keeps a failed run from displacing the previous package.
 */
export function markRun({ root, slug, runId, status, artifacts, meta, now = new Date() } = {}) {
  if (status === undefined) {
    throw new Error("run history: markRun needs a status (use updateRun for metadata only)");
  }
  const entry = patchRun({ root, slug, runId, status, artifacts, meta, now });

  if (SUCCESS_STATUSES.has(status)) {
    writeJsonAtomic(latestFile(root, slug), {
      runId: entry.runId,
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

// ─── Maintenance: footprint, listing, legacy migration, prune (#1432 S5) ───

const SHARED_LEGACY_NAMES = new Set(["runs", "latest.json", "manifest.json", ".DS_Store"]);

/**
 * Recursive size of a run directory. Counted per file (a hardlinked TTS take
 * counts at each link), which is the honest question for "how much can be
 * reclaimed by deleting this tree".
 */
export function runFootprint(dir) {
  if (!dir || !existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const walk = (current) => {
    for (const dirent of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, dirent.name);
      if (dirent.isDirectory()) {
        walk(full);
      } else if (dirent.isFile()) {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  };
  walk(dir);
  return { files, bytes };
}

function receiptSummary(root, slug, runId) {
  const file = join(runDir(root, slug, runId), "publish", "receipt.json");
  if (!existsSync(file)) return null;
  const parsed = readJsonFile(file, "publish receipt");
  return isJsonObject(parsed) ? parsed : null;
}

/**
 * Operator view of every run in a slug (or every slug that has runs):
 * status, footprint, latest flag, and publish receipt if one exists.
 */
export function listRuns({ root, slug = null } = {}) {
  const slugs = [];
  if (slug) {
    slugs.push(assertSafeSlug(slug));
  } else {
    const outputRoot = containedPath(root, "output");
    if (existsSync(outputRoot)) {
      for (const dirent of readdirSync(outputRoot, { withFileTypes: true })) {
        if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
        if (existsSync(manifestFile(root, dirent.name))) slugs.push(dirent.name);
      }
    }
  }

  const rows = [];
  for (const clean of slugs) {
    const manifest = readManifest(root, clean);
    const latest = readLatest(root, clean);
    for (const run of manifest.runs) {
      const receipt = receiptSummary(root, clean, run.runId);
      const footprint = runFootprint(runDir(root, clean, run.runId));
      rows.push({
        slug: clean,
        runId: run.runId,
        status: run.status,
        createdAt: run.createdAt ?? null,
        updatedAt: run.updatedAt ?? null,
        latest: latest?.runId === run.runId,
        receiptState: receipt?.state ?? null,
        postGroupId: receipt?.postGroupId ?? null,
        dir: runDir(root, clean, run.runId),
        ...footprint,
      });
    }
  }
  rows.sort((a, b) => `${a.slug}:${a.createdAt}`.localeCompare(`${b.slug}:${b.createdAt}`));
  return rows;
}

function collectTree(dir, prefix = "") {
  const files = [];
  let bytes = 0;
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (dirent.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${dirent.name}` : dirent.name;
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      const nested = collectTree(full, rel);
      files.push(...nested.files);
      bytes += nested.bytes;
    } else if (dirent.isFile()) {
      files.push(rel);
      bytes += statSync(full).size;
    }
    // Symlinks are skipped deliberately: a legacy pack that links outside its
    // own tree must not be adopted as a self-contained run.
  }
  return { files, bytes };
}

function linkOrCopy(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  try {
    linkSync(source, target);
  } catch {
    copyFileSync(source, target);
  }
}

/**
 * Adopt the legacy `output/<slug>/` tree as a run, without deleting the
 * original and without touching shared caches beyond a hardlink. Dry-run is
 * the default; `apply: true` is the explicit confirmation.
 *
 * The run id is derived from the legacy tree's mtime and real path, so the
 * dry-run and the apply agree and a repeat call is idempotent rather than
 * creating a second copy.
 */
export function migrateLegacyRun({ root, slug, apply = false, now = new Date() } = {}) {
  const clean = assertSafeSlug(slug);
  const legacyRoot = slugRoot(root, clean);
  if (!existsSync(legacyRoot) || !statSync(legacyRoot).isDirectory()) {
    return { action: "missing", slug: clean, legacyRoot };
  }

  const entries = readdirSync(legacyRoot, { withFileTypes: true })
    .filter(
      (dirent) =>
        !SHARED_LEGACY_NAMES.has(dirent.name) &&
        !dirent.name.startsWith(".") &&
        (dirent.isDirectory() || dirent.isFile()),
    )
    .map((dirent) => {
      const full = join(legacyRoot, dirent.name);
      const tree = dirent.isDirectory()
        ? collectTree(full, dirent.name)
        : { files: [dirent.name], bytes: statSync(full).size };
      return {
        name: dirent.name,
        kind: dirent.isDirectory() ? "dir" : "file",
        files: tree.files.length,
        bytes: tree.bytes,
      };
    });

  const totals = entries.reduce(
    (acc, entry) => ({ files: acc.files + entry.files, bytes: acc.bytes + entry.bytes }),
    { files: 0, bytes: 0 },
  );
  if (entries.length === 0) {
    return { action: "empty", slug: clean, legacyRoot };
  }

  const mtime = statSync(legacyRoot).mtime;
  // The id must stay stable across the apply: creating runs/ inside the legacy
  // root bumps its mtime, and a second call must find the same run rather than
  // migrate a second copy. Birth time survives that write; mtime is the
  // fallback on filesystems that do not record it.
  const identityTime = statSync(legacyRoot).birthtimeMs || mtime.getTime();
  const hash = createHash("sha1").update(realpathSync(legacyRoot)).digest("hex").slice(0, 6);
  const id = generateRunId(new Date(identityTime), hash);
  const manifest = readManifest(root, clean);
  if (manifest.runs.some((run) => run.runId === id)) {
    return { action: "already-migrated", slug: clean, runId: id, legacyRoot };
  }
  const target = runDir(root, clean, id);
  if (existsSync(target)) {
    // A crashed earlier attempt left a directory the manifest does not know.
    // Refuse instead of writing a second, partial copy over it.
    return {
      action: "partial",
      slug: clean,
      runId: id,
      legacyRoot,
      dir: target,
      message: `run directory exists but is not registered: ${target}`,
    };
  }

  const plan = {
    action: apply ? "migrated" : "would-migrate",
    slug: clean,
    legacyRoot,
    runId: id,
    dir: target,
    entries,
    ...totals,
  };
  if (!apply) return plan;

  mkdirSync(target, { recursive: true });
  for (const entry of entries) {
    const source = join(legacyRoot, entry.name);
    if (entry.kind === "dir") {
      mkdirSync(join(target, entry.name), { recursive: true });
      const collectFiles = (dir, prefix) => {
        for (const dirent of readdirSync(dir, { withFileTypes: true })) {
          if (dirent.name.startsWith(".")) continue;
          const rel = prefix ? `${prefix}/${dirent.name}` : dirent.name;
          const full = join(dir, dirent.name);
          if (dirent.isDirectory()) {
            mkdirSync(join(target, rel), { recursive: true });
            collectFiles(full, rel);
          } else if (dirent.isFile()) linkOrCopy(full, join(target, rel));
        }
      };
      collectFiles(source, entry.name);
    } else {
      linkOrCopy(source, join(target, entry.name));
    }
  }

  const createdAt = mtime.toISOString();
  manifest.runs.push({
    runId: id,
    createdAt,
    endedAt: createdAt,
    status: RUN_STATUS.RENDERED,
    legacy: true,
    migratedAt: now.toISOString(),
    migratedFrom: `output/${clean}`,
  });
  writeManifest(root, clean, manifest);
  writeJsonAtomic(latestFile(root, clean), {
    runId: id,
    status: RUN_STATUS.RENDERED,
    updatedAt: now.toISOString(),
  });
  return plan;
}

/**
 * Delete one run, but only when nothing still points at it. The reference
 * guards are the whole point: keep-all is the policy, and a prune that loses a
 * published post's receipt or an analytics record is unrecoverable.
 *
 * Guards: latest pointer, in-flight (`running`), any publish receipt, any
 * pending-analysis record carrying the runId, and an unknown target. Dry-run
 * is the default; `apply: true` deletes.
 */
export function pruneRun({ root, slug, runId, apply = false } = {}) {
  const clean = assertSafeSlug(slug);
  const id = assertRunId(runId);
  const manifest = readManifest(root, clean);
  const entry = manifest.runs.find((run) => run.runId === id);
  if (!entry) {
    return {
      action: "blocked",
      slug: clean,
      runId: id,
      guards: [{ kind: "unknown-run", detail: `run ${id} is not in the manifest for ${clean}` }],
    };
  }

  const guards = [];
  const latest = readLatest(root, clean);
  if (latest?.runId === id) {
    guards.push({ kind: "latest", detail: `latest.json points at ${id}` });
  }
  if (entry.status === RUN_STATUS.RUNNING) {
    guards.push({ kind: "running", detail: "run is still marked running (in-flight)" });
  }
  const receipt = receiptSummary(root, clean, id);
  if (receipt) {
    guards.push({
      kind: "receipt",
      detail: `publish receipt recorded (${receipt.state}${receipt.postGroupId ? `, ${receipt.postGroupId}` : ""})`,
    });
  }
  const pending = listPendingAnalysis(root).filter((record) => record.record?.runId === id);
  if (pending.length > 0) {
    guards.push({
      kind: "pending-analysis",
      detail: `referenced by ${pending.map((record) => record.path).join(", ")}`,
    });
  }

  const dir = runDir(root, clean, id);
  const footprint = runFootprint(dir);
  if (guards.length > 0) {
    return { action: "blocked", slug: clean, runId: id, guards, dir, ...footprint };
  }
  if (!apply) {
    return { action: "would-delete", slug: clean, runId: id, guards: [], dir, ...footprint };
  }

  rmSync(dir, { recursive: true, force: true });
  manifest.runs = manifest.runs.filter((run) => run.runId !== id);
  writeManifest(root, clean, manifest);
  return { action: "deleted", slug: clean, runId: id, dir, ...footprint };
}
