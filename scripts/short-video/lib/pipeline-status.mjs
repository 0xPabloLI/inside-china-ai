/**
 * Pipeline status layout for #462 Stage 1.
 *
 * Source of truth: `<root>/content/<slug>/pipeline-status.json`.
 * Discovery index:  `<root>/output/pipeline-status.json` (thin, gitignored).
 *
 * The legacy layout kept the full status in the discovery file itself. Reads
 * accept both shapes so a checkout mid-migration still resumes; `migrate`
 * rewrites the legacy file into the per-slug file + thin index once. This
 * module is a migration/inspection helper, not a runtime writer — the
 * pipeline still updates the JSON by hand (docs/content-pipeline.md).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export const STATUS_FILENAME = "pipeline-status.json";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertSafeSlug(slug) {
  const clean = String(slug ?? "").trim();
  if (!clean) throw new Error("pipeline status: articleSlug is empty");
  if (clean === "." || clean === ".." || /[/\\]/u.test(clean)) {
    throw new Error(`pipeline status: unsafe articleSlug ${JSON.stringify(clean)}`);
  }
  return clean;
}

function readJson(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`pipeline status: cannot read ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`pipeline status: invalid JSON in ${filePath}: ${error.message}`);
  }
}

function writeJsonAtomic(filePath, value) {
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, filePath);
}

export function isLegacyStatus(value) {
  return (
    isObject(value) && typeof value.articleSlug === "string" && value.articleSlug.trim() !== ""
  );
}

export function statusFileFor(root, slug) {
  return join(root, "content", assertSafeSlug(slug), STATUS_FILENAME);
}

export function buildPipelineIndex(slug, updatedAt = new Date().toISOString()) {
  const clean = assertSafeSlug(slug);
  return {
    activeSlug: clean,
    statusPath: `content/${clean}/${STATUS_FILENAME}`,
    updatedAt,
  };
}

function indexPathFor(root) {
  return join(root, "output", STATUS_FILENAME);
}

function resolveInsideRoot(root, relativePath) {
  const absolute = resolve(root, String(relativePath ?? ""));
  const prefix = `${resolve(root)}${sep}`;
  if (!absolute.startsWith(prefix)) {
    throw new Error(`pipeline status: path escapes the short-video root: ${relativePath}`);
  }
  return absolute;
}

/**
 * Read the active pipeline status, accepting the legacy single-file layout.
 * Returns `null` when neither the index nor the legacy file exists.
 */
export function readPipelineStatus(root) {
  const indexPath = indexPathFor(root);
  if (!existsSync(indexPath)) return null;
  const value = readJson(indexPath);
  if (isLegacyStatus(value)) {
    const slug = assertSafeSlug(value.articleSlug);
    return {
      kind: "legacy",
      slug,
      status: value,
      indexPath,
      statusPath: statusFileFor(root, slug),
    };
  }
  if (!isObject(value) || typeof value.activeSlug !== "string") {
    throw new Error(`pipeline status: ${indexPath} is neither a legacy status nor an index`);
  }
  const slug = assertSafeSlug(value.activeSlug);
  const statusPath = value.statusPath
    ? resolveInsideRoot(root, value.statusPath)
    : statusFileFor(root, slug);
  if (!existsSync(statusPath)) {
    throw new Error(`pipeline status: index points at missing ${statusPath}`);
  }
  return { kind: "indexed", slug, status: readJson(statusPath), indexPath, statusPath };
}

/**
 * Migrate `output/pipeline-status.json` (legacy full status) into
 * `content/<slug>/pipeline-status.json` + a thin index. Dry-run by default.
 *
 * Refuses to overwrite a per-slug file whose content differs from the legacy
 * file: a half-migrated checkout is not something to guess about.
 */
export function migratePipelineStatus(root, { apply = false, now = new Date() } = {}) {
  const indexPath = indexPathFor(root);
  if (!existsSync(indexPath)) {
    return { action: "missing", indexPath };
  }
  const value = readJson(indexPath);
  if (!isLegacyStatus(value)) {
    if (!isObject(value) || typeof value.activeSlug !== "string") {
      throw new Error(`pipeline status: ${indexPath} is neither a legacy status nor an index`);
    }
    return { action: "already-indexed", index: value, indexPath };
  }

  const slug = assertSafeSlug(value.articleSlug);
  const statusPath = statusFileFor(root, slug);
  const backupPath = join(root, "output", `pipeline-status.legacy-${slug}.json`);
  const index = buildPipelineIndex(slug, now.toISOString());

  if (existsSync(statusPath)) {
    const existing = readJson(statusPath);
    if (JSON.stringify(existing) !== JSON.stringify(value)) {
      throw new Error(
        `pipeline status: refusing to overwrite ${statusPath} — it already exists with different content`,
      );
    }
  } else if (apply) {
    mkdirSync(dirname(statusPath), { recursive: true });
    writeJsonAtomic(statusPath, value);
  }

  if (apply) {
    if (!existsSync(backupPath)) writeJsonAtomic(backupPath, value);
    writeJsonAtomic(indexPath, index);
  }

  return {
    action: apply ? "migrated" : "would-migrate",
    slug,
    statusPath,
    backupPath,
    index,
    indexPath,
  };
}
