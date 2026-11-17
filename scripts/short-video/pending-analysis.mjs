#!/usr/bin/env node
/**
 * Pending-analysis CLI for #462 Stage 2.
 *
 * Usage:
 *   node scripts/short-video/pending-analysis.mjs list [--root <dir>]
 *   node scripts/short-video/pending-analysis.mjs migrate [--apply] [--slug <slug>] [--root <dir>]
 *
 * `list` merges `content/<slug>/pending-analysis.json` with the legacy
 * `output/pending-analysis.json`. `migrate` is dry-run by default; `--slug`
 * supplies a slug for a legacy record whose own `slug` is null.
 */

import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listPendingAnalysis, migratePendingAnalysis } from "./lib/pending-analysis.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = { command: "list", apply: false, slug: null, root: SCRIPT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "list" || arg === "migrate") options.command = arg;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--slug") {
      const value = argv[++i];
      if (!value) throw new Error("--slug requires a value");
      options.slug = value;
    } else if (arg === "--root") {
      const value = argv[++i];
      if (!value) throw new Error("--root requires a path");
      options.root = resolve(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function runList(root) {
  const entries = listPendingAnalysis(root);
  if (entries.length === 0) {
    console.log("No pending-analysis records found.");
    return;
  }
  console.log(`Pending-analysis records (${entries.length}):`);
  for (const entry of entries) {
    const slug = entry.slug ?? "(no slug)";
    const status = entry.record.status ?? "(no status)";
    const publishedAt = entry.record.publishedAt ?? "(no publishedAt)";
    console.log(`- slug=${slug} status=${status} publishedAt=${publishedAt}`);
    console.log(`  ${entry.kind}: ${entry.path}`);
  }
}

function runMigrate(root, apply, slug) {
  const result = migratePendingAnalysis(root, { apply, slug });
  if (result.action === "missing") {
    console.log(`No legacy ${result.legacyPath} — nothing to migrate.`);
    return;
  }
  if (result.action === "needs-slug") {
    console.log(`Legacy ${result.legacyPath} has no slug; pass --slug <slug> to migrate it.`);
    return;
  }
  if (result.action === "already-migrated") {
    console.log(`Already migrated: slug=${result.slug} at ${result.targetPath}`);
    return;
  }
  if (result.action === "would-migrate") {
    console.log(`Would migrate legacy record → ${result.targetPath}`);
    console.log(`Legacy backup would be ${result.backupPath}; pass --apply to write.`);
    return;
  }
  console.log(`Migrated legacy record → ${result.targetPath}`);
  console.log(`Legacy backup: ${result.backupPath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "list") runList(options.root);
  else runMigrate(options.root, options.apply, options.slug);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`pending-analysis: ${error.message}`);
    process.exitCode = 1;
  }
}
