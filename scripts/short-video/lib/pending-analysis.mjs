/**
 * Pending-analysis layout for #462 Stage 2.
 *
 * Source of truth: `<root>/content/<slug>/pending-analysis.json`.
 * Legacy layout:    `<root>/output/pending-analysis.json` (still read).
 *
 * The publish step writes one record per slug so two posts published close
 * together cannot overwrite each other's analytics reminder. Reads accept both
 * layouts: `content/<slug>/...` wins over a legacy record with the same slug.
 * There is deliberately no index file — a mutable multi-entry index would be a
 * second copy of the truth, and the discovery surface is the `list` CLI.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { containedPath } from "./path-safety.mjs";

const FILENAME = "pending-analysis.json";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`pending analysis: cannot read ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`pending analysis: invalid JSON in ${filePath}: ${error.message}`);
  }
}

function writeJsonAtomic(filePath, value) {
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, filePath);
}

function normalizeSlug(slug, root) {
  if (slug === null || slug === undefined) return null;
  const clean = String(slug).trim();
  if (!clean) return null;
  // containedPath validates the segment (no empty/./../backslash/NUL, and
  // nested slugs such as `distillation/pt1` are allowed).
  contentFileFor(root, clean);
  return clean;
}

export function contentFileFor(root, slug) {
  return containedPath(root, "content", slug, FILENAME);
}

export function legacyFileFor(root) {
  return containedPath(root, "output", FILENAME);
}

/**
 * Read every pending-analysis record, merging per-slug files with the legacy
 * single file. Per-slug records win when both carry the same slug.
 *
 * @returns {Array<{kind: "slug"|"legacy", slug: string|null, path: string, record: object}>}
 */
export function listPendingAnalysis(root) {
  const entries = [];
  const contentRoot = containedPath(root, "content");
  if (existsSync(contentRoot)) {
    const walk = (dir, rel) => {
      for (const dirent of readdirSync(dir, { withFileTypes: true })) {
        if (dirent.name.startsWith(".") || dirent.name === "node_modules") continue;
        const nextRel = rel ? `${rel}/${dirent.name}` : dirent.name;
        if (dirent.isDirectory()) {
          walk(containedPath(contentRoot, nextRel), nextRel);
        } else if (dirent.isFile() && dirent.name === FILENAME) {
          entries.push({
            kind: "slug",
            slug: rel || null,
            path: containedPath(contentRoot, nextRel),
            record: readJson(containedPath(contentRoot, nextRel)),
          });
        }
      }
    };
    walk(contentRoot, "");
  }

  const legacyPath = legacyFileFor(root);
  if (existsSync(legacyPath)) {
    const record = readJson(legacyPath);
    if (!isObject(record)) {
      throw new Error(`pending analysis: ${legacyPath} is not a JSON object`);
    }
    const slug = typeof record.slug === "string" && record.slug.trim() ? record.slug.trim() : null;
    const shadowed = slug && entries.some((entry) => entry.slug === slug);
    if (!shadowed) entries.push({ kind: "legacy", slug, path: legacyPath, record });
  }

  return entries.sort((a, b) => {
    const at = String(a.record.publishedAt ?? "");
    const bt = String(b.record.publishedAt ?? "");
    return bt.localeCompare(at);
  });
}

/**
 * Write one record. A `slug` goes to `content/<slug>/pending-analysis.json`;
 * no slug keeps the legacy `output/pending-analysis.json` fallback so a
 * standalone publish without `--slug` still behaves like before.
 */
export function writePendingAnalysis(root, { slug = null, record } = {}) {
  if (!isObject(record)) throw new Error("pending analysis: record must be a JSON object");
  const clean = normalizeSlug(slug, root);
  const target = clean ? contentFileFor(root, clean) : legacyFileFor(root);
  mkdirSync(dirname(target), { recursive: true });
  writeJsonAtomic(target, record);
  return { kind: clean ? "slug" : "legacy", slug: clean, path: target };
}

/**
 * Move the legacy record into the per-slug layout. Dry-run by default.
 *
 * `slug` can supply a slug for a legacy record whose own `slug` is null (the
 * record predates per-slug publishing). If the legacy record already names a
 * slug, an override that disagrees is refused rather than guessed.
 */
export function migratePendingAnalysis(root, { apply = false, slug = null } = {}) {
  const legacyPath = legacyFileFor(root);
  if (!existsSync(legacyPath)) {
    return { action: "missing", legacyPath };
  }
  const record = readJson(legacyPath);
  if (!isObject(record)) throw new Error(`pending analysis: ${legacyPath} is not a JSON object`);

  const legacySlug =
    typeof record.slug === "string" && record.slug.trim() ? record.slug.trim() : null;
  if (legacySlug && slug && legacySlug !== slug) {
    throw new Error(
      `pending analysis: legacy record slug ${JSON.stringify(legacySlug)} disagrees with --slug ${JSON.stringify(slug)}`,
    );
  }
  const targetSlug = normalizeSlug(slug ?? legacySlug, root);
  if (!targetSlug) {
    return { action: "needs-slug", legacyPath, record };
  }

  const targetPath = contentFileFor(root, targetSlug);
  const migrated = { ...record, slug: targetSlug };
  if (existsSync(targetPath)) {
    const existing = readJson(targetPath);
    if (JSON.stringify(existing) !== JSON.stringify(migrated)) {
      throw new Error(
        `pending analysis: refusing to overwrite ${targetPath} — it already exists with different content`,
      );
    }
    return { action: "already-migrated", slug: targetSlug, targetPath, legacyPath };
  }

  const backupStem = targetSlug.replace(/[/\\]/g, "__");
  const backupPath = containedPath(root, "output", `pending-analysis.legacy-${backupStem}.json`);
  if (apply) {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeJsonAtomic(targetPath, migrated);
    if (!existsSync(backupPath)) writeJsonAtomic(backupPath, record);
  }

  return {
    action: apply ? "migrated" : "would-migrate",
    slug: targetSlug,
    targetPath,
    backupPath,
    legacyPath,
  };
}
