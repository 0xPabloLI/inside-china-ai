/**
 * Pending-analysis layout for #462 Stage 2.
 *
 * Source of truth: `<root>/content/<slug>/pending-analysis.json`.
 * Legacy layout:    `<root>/output/pending-analysis.json` (still read).
 *
 * The publish step writes one record per slug so two posts published close
 * together cannot overwrite each other's analytics reminder. Reads accept both
 * layouts: `content/<slug>/...` wins over a legacy record with the same slug,
 * and a slug-less legacy record is treated as the migrated twin when its
 * remaining fields match a per-slug record. There is deliberately no index
 * file — a mutable multi-entry index would be a second copy of the truth, and
 * the discovery surface is the `list` CLI.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { containedPath } from "./path-safety.mjs";
import { canonicalJson, isJsonObject, readJsonFile, writeJsonAtomic } from "./json-file.mjs";

const FILENAME = "pending-analysis.json";

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

function withoutSlug(record) {
  const copy = { ...record };
  delete copy.slug;
  return copy;
}

/**
 * Read every pending-analysis record, merging per-slug files with the legacy
 * single file. Per-slug records win when both carry the same slug; a
 * slug-less legacy twin is skipped when its remaining fields match a
 * per-slug record (the post-migration shape).
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
          const recordPath = containedPath(contentRoot, nextRel);
          const record = readJsonFile(recordPath, "pending analysis");
          if (!isJsonObject(record)) {
            throw new Error(`pending analysis: ${recordPath} is not a JSON object`);
          }
          entries.push({
            kind: "slug",
            slug: rel || null,
            path: recordPath,
            record,
          });
        }
      }
    };
    walk(contentRoot, "");
  }

  const legacyPath = legacyFileFor(root);
  if (existsSync(legacyPath)) {
    const record = readJsonFile(legacyPath, "pending analysis");
    if (!isJsonObject(record)) {
      throw new Error(`pending analysis: ${legacyPath} is not a JSON object`);
    }
    const slug = typeof record.slug === "string" && record.slug.trim() ? record.slug.trim() : null;
    const shadowed = slug && entries.some((entry) => entry.slug === slug);
    const sluglessTwin =
      slug === null &&
      entries.some(
        (entry) => canonicalJson(withoutSlug(entry.record)) === canonicalJson(withoutSlug(record)),
      );
    if (!shadowed && !sluglessTwin) {
      entries.push({ kind: "legacy", slug, path: legacyPath, record });
    }
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
  if (!isJsonObject(record)) throw new Error("pending analysis: record must be a JSON object");
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
 *
 * The legacy file is left in place as a read-compatible fallback; `list`
 * suppresses a slug-less twin whose remaining fields match the per-slug copy.
 */
export function migratePendingAnalysis(root, { apply = false, slug = null } = {}) {
  const legacyPath = legacyFileFor(root);
  if (!existsSync(legacyPath)) {
    return { action: "missing", legacyPath };
  }
  const record = readJsonFile(legacyPath, "pending analysis");
  if (!isJsonObject(record)) {
    throw new Error(`pending analysis: ${legacyPath} is not a JSON object`);
  }

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
    const existing = readJsonFile(targetPath, "pending analysis");
    if (!isJsonObject(existing)) {
      throw new Error(`pending analysis: ${targetPath} is not a JSON object`);
    }
    if (canonicalJson(existing) !== canonicalJson(migrated)) {
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
