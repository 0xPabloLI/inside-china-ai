#!/usr/bin/env node
/**
 * Pipeline status CLI for #462 Stage 1.
 *
 * Usage:
 *   node scripts/short-video/pipeline-status.mjs show [--root <dir>]
 *   node scripts/short-video/pipeline-status.mjs migrate [--apply] [--root <dir>]
 *
 * `show` reads the thin index and then `content/<slug>/pipeline-status.json`;
 * the legacy single-file layout is still accepted. `migrate` is dry-run by
 * default and writes only when `--apply` is passed.
 */

import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migratePipelineStatus, readPipelineStatus } from "./lib/pipeline-status.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = { command: "show", apply: false, root: SCRIPT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "show" || arg === "migrate") options.command = arg;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--root") options.root = resolve(argv[++i] ?? "");
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function describe(status) {
  if (!status) return "No pipeline status found.";
  const stage = status.status?.currentStage ?? "(unknown)";
  const next = status.status?.nextAction ?? "(none)";
  const kind = status.kind === "legacy" ? "legacy" : "indexed";
  const file = status.kind === "legacy" ? status.indexPath : status.statusPath;
  return `Active status (${kind}): slug=${status.slug} stage=${stage}\nnext: ${next}\nfile: ${file}`;
}

function runShow(root) {
  console.log(describe(readPipelineStatus(root)));
}

function runMigrate(root, apply) {
  const result = migratePipelineStatus(root, { apply });
  if (result.action === "missing") {
    console.log(`No ${result.indexPath} — nothing to migrate.`);
    return;
  }
  if (result.action === "already-indexed") {
    console.log(`Already indexed: activeSlug=${result.index.activeSlug}`);
    return;
  }
  if (result.action === "would-migrate") {
    console.log(`Would migrate ${result.slug} → ${result.statusPath}`);
    console.log(`Legacy backup would be ${result.backupPath}; pass --apply to write.`);
    return;
  }
  console.log(`Migrated ${result.slug} → ${result.statusPath}`);
  console.log(`Legacy backup: ${result.backupPath}`);
  console.log(`Thin index: ${result.indexPath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "show") runShow(options.root);
  else runMigrate(options.root, options.apply);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`pipeline-status: ${error.message}`);
    process.exitCode = 1;
  }
}
