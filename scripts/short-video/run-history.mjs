#!/usr/bin/env node
/**
 * Run-history operator CLI (#1432 S4/S5).
 *
 *   node scripts/short-video/run-history.mjs list [--slug <slug>] [--json]
 *   node scripts/short-video/run-history.mjs receipts [--slug <slug>] [--json]
 *   node scripts/short-video/run-history.mjs migrate --slug <slug> [--apply]
 *   node scripts/short-video/run-history.mjs migrate --all [--apply]
 *   node scripts/short-video/run-history.mjs prune --slug <slug> --run <runId> [--apply]
 *
 * `list` shows every run with its footprint, latest flag and receipt state.
 * `receipts` is the audit view: run → publish method / state / postGroupId.
 * `migrate` adopts the legacy `output/<slug>/` tree as a run; it is a DRY RUN
 * unless `--apply` is passed, and it never deletes the legacy tree.
 * `prune` deletes exactly one run; it refuses when latest, an in-flight run,
 * a publish receipt or a pending-analysis record still references it, and it
 * is a dry run unless `--apply` is passed.
 *
 * `--root <dir>` points at an alternate short-video root (tests, staging).
 */

import { readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listRuns, migrateLegacyRun, pruneRun } from "./lib/run-history.mjs";
import { listRunReceipts } from "./lib/publish-receipt.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

function getArg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}
function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
function rootOption() {
  const root = getArg("root");
  return root ? resolve(root) : __dirname;
}
function slugsWithRuns(root) {
  const outputRoot = join(root, "output");
  try {
    return readdirSync(outputRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .filter((slug) => {
        try {
          return statSync(join(outputRoot, slug, "runs", "manifest.json")).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function usage() {
  console.error(
    [
      "usage:",
      "  run-history.mjs list [--slug <slug>] [--json]",
      "  run-history.mjs receipts [--slug <slug>] [--json]",
      "  run-history.mjs migrate --slug <slug> [--apply] [--root <dir>]",
      "  run-history.mjs migrate --all [--apply] [--root <dir>]",
      "  run-history.mjs prune --slug <slug> --run <runId> [--apply] [--root <dir>]",
    ].join("\n"),
  );
  process.exitCode = 2;
}

function cmdList(root) {
  const slug = getArg("slug");
  const rows = listRuns({ root, slug });
  if (hasFlag("json")) return printJson(rows);
  if (rows.length === 0) {
    console.log("No runs.");
    return;
  }
  console.log("slug\trunId\tstatus\tlatest\treceipt\tfiles\tbytes");
  for (const row of rows) {
    console.log(
      [
        row.slug,
        row.runId,
        row.status,
        row.latest ? "yes" : "no",
        row.receiptState ?? "-",
        row.files,
        humanSize(row.bytes),
      ].join("\t"),
    );
  }
}

function cmdReceipts(root) {
  const slug = getArg("slug");
  const slugs = slug ? [slug] : slugsWithRuns(root);
  const rows = [];
  for (const clean of slugs) {
    for (const entry of listRunReceipts({ root, slug: clean })) {
      rows.push({
        slug: clean,
        runId: entry.runId,
        status: entry.status,
        publishMethod: entry.receipt?.publishMethod ?? null,
        state: entry.receipt?.state ?? null,
        postGroupId: entry.receipt?.postGroupId ?? null,
        publishedAt: entry.receipt?.publishedAt ?? null,
      });
    }
  }
  if (hasFlag("json")) return printJson(rows);
  if (rows.length === 0) {
    console.log("No runs. Nothing to audit.");
    return;
  }
  console.log("slug\trunId\tstatus\tmethod\tstate\tpostGroupId\tpublishedAt");
  for (const row of rows) {
    console.log(
      [
        row.slug,
        row.runId,
        row.status,
        row.publishMethod ?? "-",
        row.state ?? "no-receipt",
        row.postGroupId ?? "-",
        row.publishedAt ?? "-",
      ].join("\t"),
    );
  }
}

function migrateOne(root, slug, apply) {
  const plan = migrateLegacyRun({ root, slug, apply });
  if (plan.action === "missing" || plan.action === "empty") {
    console.log(`${slug}: ${plan.action} — nothing to migrate`);
    return 0;
  }
  if (plan.action === "already-migrated") {
    console.log(`${slug}: already migrated as ${plan.runId}`);
    return 0;
  }
  if (plan.action === "partial") {
    console.error(`${slug}: ${plan.message}`);
    return 1;
  }
  const prefix = apply ? "migrated" : "DRY RUN — would migrate";
  console.log(`${slug}: ${prefix} ${plan.runId} (${plan.files} files, ${humanSize(plan.bytes)})`);
  for (const entry of plan.entries) {
    console.log(`  ${entry.kind === "dir" ? "dir " : "file"} ${entry.name} — ${entry.files} files`);
  }
  if (!apply) console.log("  pass --apply to write; the legacy tree stays in place");
  return 0;
}

function cmdMigrate(root) {
  const apply = hasFlag("apply");
  if (hasFlag("all")) {
    let failures = 0;
    let found = 0;
    try {
      for (const dirent of readdirSync(join(root, "output"), { withFileTypes: true })) {
        if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
        found += 1;
        failures += migrateOne(root, dirent.name, apply);
      }
    } catch (error) {
      console.error(`migrate: cannot read output root: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (found === 0) console.log("No output directories found.");
    if (failures > 0) process.exitCode = 1;
    return;
  }
  const slug = getArg("slug");
  if (!slug) {
    console.error("migrate: --slug <slug> or --all is required");
    process.exitCode = 2;
    return;
  }
  if (migrateOne(root, slug, apply) !== 0) process.exitCode = 1;
}

function cmdPrune(root) {
  const slug = getArg("slug");
  const runId = getArg("run");
  if (!slug || !runId) {
    console.error("prune: --slug <slug> and --run <runId> are required");
    process.exitCode = 2;
    return;
  }
  const result = pruneRun({ root, slug, runId, apply: hasFlag("apply") });
  if (result.action === "blocked") {
    console.error(`prune: ${slug} ${runId} is blocked — nothing was deleted`);
    for (const guard of result.guards) console.error(`  ${guard.kind}: ${guard.detail}`);
    process.exitCode = 1;
    return;
  }
  if (result.action === "would-delete") {
    console.log(
      `DRY RUN — would delete ${slug} ${runId} (${result.files} files, ${humanSize(result.bytes)})`,
    );
    console.log("  pass --apply to delete; keep-all is the default policy");
    return;
  }
  console.log(`deleted ${slug} ${runId} (${result.files} files, ${humanSize(result.bytes)})`);
}

function main() {
  const root = rootOption();
  switch (command) {
    case "list":
      return cmdList(root);
    case "receipts":
      return cmdReceipts(root);
    case "migrate":
      return cmdMigrate(root);
    case "prune":
      return cmdPrune(root);
    default:
      return usage();
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
