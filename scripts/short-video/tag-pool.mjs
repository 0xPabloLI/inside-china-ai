#!/usr/bin/env node
/**
 * tag-pool.mjs — hashtag pool SSOT CLI.
 *
 * The pool (scripts/short-video/config/hashtag-pool.json) is the single source
 * for tag traffic knowledge. This CLI owns validation, inspection and research
 * ingestion; caption derivation stays in lib/caption-utils.mjs, trending
 * scraping in snapshot-trending.mjs, paid research in research-hashtags.mjs.
 *
 * Usage:
 *   node scripts/short-video/tag-pool.mjs validate [--pool <path>] [--json]
 *   node scripts/short-video/tag-pool.mjs show --tag "#ainews" [--pool <path>] [--json]
 *   node scripts/short-video/tag-pool.mjs ingest --from <research.json> [--dry-run] [--pool <path>]
 *
 * Exit codes:
 *   validate: 0 valid (warnings allowed) | 1 invalid | 2 file missing/unparsable
 *   show:     0 found | 1 tag not in pool | 2 file missing/unparsable
 *   ingest:   0 merged | 1 unusable research input | 2 pool/research file missing/unparsable
 *
 * Ingestion rules: never overwrite a non-null value with null; never invent
 * numbers; avgViewsPerPost is derived only from views/posts.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_POOL_PATH,
  PoolLoadError,
  ageDays,
  ingestPool,
  loadPool,
  lookupTag,
  normalizeTag,
  validatePool,
} from "./lib/hashtag-pool.mjs";
import { writeJsonAtomic } from "./lib/json-file.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(args) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function resolvePoolPath(flags) {
  return flags.pool ? resolve(flags.pool) : DEFAULT_POOL_PATH;
}

function formatMetric(value, text) {
  if (text) return text;
  return value === null || value === undefined ? "—" : String(value);
}

// ─── validate ───

function runValidate(poolPath, asJson) {
  let pool;
  try {
    pool = loadPool(poolPath);
  } catch (error) {
    if (asJson) {
      console.log(
        JSON.stringify({
          exitCode: 2,
          valid: false,
          errors: [{ field: "file", message: error.message }],
          warnings: [],
        }),
      );
    } else {
      console.error(`✖ ${error.message}`);
      console.error(
        "  Fix: restore scripts/short-video/config/hashtag-pool.json, or re-run tag-pool ingest after a research refresh.",
      );
    }
    return 2;
  }

  const { valid, errors, warnings } = validatePool(pool);

  if (asJson) {
    console.log(
      JSON.stringify({
        exitCode: valid ? 0 : 1,
        valid,
        errors,
        warnings,
        pool: { path: poolPath, updatedAt: pool.updatedAt, tagCount: pool.tags?.length ?? 0 },
      }),
    );
    return valid ? 0 : 1;
  }

  console.log(`Pool: ${poolPath}`);
  console.log(`Updated: ${pool.updatedAt ?? "—"} | tags: ${pool.tags?.length ?? 0}`);
  for (const warning of warnings) {
    console.log(`⚠️  [${warning.field}] ${warning.message}`);
  }
  for (const error of errors) {
    console.log(`✖ [${error.field}] ${error.message}`);
  }
  if (valid) {
    console.log(warnings.length > 0 ? "VALID (with warnings)" : "VALID");
    return 0;
  }
  console.log("INVALID");
  return 1;
}

// ─── show ───

function runShow(poolPath, tagRaw, asJson) {
  const tag = normalizeTag(tagRaw);
  if (!tag) {
    console.error('usage: node scripts/short-video/tag-pool.mjs show --tag "#ainews"');
    return 2;
  }

  let pool;
  try {
    pool = loadPool(poolPath);
  } catch (error) {
    if (asJson) {
      console.log(JSON.stringify({ exitCode: 2, tag, found: false, errors: [error.message] }));
    } else {
      console.error(`✖ ${error.message}`);
    }
    return 2;
  }

  const entry = lookupTag(pool, tag);
  if (!entry) {
    if (asJson) {
      console.log(
        JSON.stringify({ exitCode: 1, tag, found: false, errors: [`${tag} is not in the pool`] }),
      );
    } else {
      console.log(`${tag} is not in the pool.`);
      console.log(
        `  Research it: node scripts/short-video/research-hashtags.mjs --tags ${tag.slice(1)}`,
      );
      console.log(
        `  Then ingest: node scripts/short-video/tag-pool.mjs ingest --from <research.json>`,
      );
    }
    return 1;
  }

  const age = ageDays(entry.sampledAt);
  if (asJson) {
    console.log(JSON.stringify({ exitCode: 0, found: true, entry, ageDays: age }));
    return 0;
  }

  console.log(`${entry.tag}`);
  console.log(`  kind:            ${entry.kind}`);
  console.log(`  views:           ${formatMetric(entry.views, entry.viewsText)}`);
  console.log(`  posts:           ${formatMetric(entry.posts, entry.postsText)}`);
  console.log(`  avgViewsPerPost: ${entry.avgViewsPerPost ?? "—"}`);
  console.log(`  status:          ${entry.status}`);
  console.log(`  grade:           ${entry.grade}`);
  console.log(
    `  sampledAt:       ${entry.sampledAt ?? "—"} (${age === null ? "age unknown" : `${age}d old`})`,
  );
  if (entry.url) console.log(`  url:             ${entry.url}`);
  if (entry.notes) console.log(`  notes:           ${entry.notes}`);
  return 0;
}

// ─── ingest ───

function readResearchFile(fromPath) {
  if (!existsSync(fromPath)) {
    throw new PoolLoadError("POOL_MISSING", `Research file not found: ${fromPath}`);
  }
  let text;
  try {
    text = readFileSync(fromPath, "utf8");
  } catch (error) {
    throw new PoolLoadError(
      "POOL_MISSING",
      `Cannot read research file ${fromPath}: ${error.message}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PoolLoadError(
      "POOL_UNPARSABLE",
      `Invalid JSON in research file ${fromPath}: ${error.message}`,
    );
  }
}

function formatValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function runIngest(poolPath, incoming, dryRun, asJson) {
  let pool;
  try {
    pool = loadPool(poolPath);
  } catch (error) {
    if (asJson) {
      console.log(JSON.stringify({ exitCode: 2, written: false, errors: [error.message] }));
    } else {
      console.error(`✖ ${error.message}`);
    }
    return 2;
  }

  let result;
  try {
    result = ingestPool(pool, incoming);
  } catch (error) {
    if (asJson) {
      console.log(JSON.stringify({ exitCode: 1, written: false, errors: [error.message] }));
    } else {
      console.error(`✖ ${error.message}`);
    }
    return 1;
  }

  if (!dryRun) {
    writeJsonAtomic(poolPath, result.pool);
  }

  if (asJson) {
    console.log(
      JSON.stringify({
        exitCode: 0,
        dryRun: Boolean(dryRun),
        written: !dryRun,
        changes: result.changes,
        addedTags: result.addedTags,
        skipped: result.skipped,
      }),
    );
    return 0;
  }

  console.log(`Ingest ${dryRun ? "(dry-run, no file written)" : `→ ${poolPath}`}`);
  if (result.changes.length === 0) {
    console.log("  No changes.");
  }
  for (const change of result.changes) {
    if (change.action === "added") {
      console.log(`  ➕ ${change.tag}: added to pool`);
    } else {
      console.log(
        `  ✏️  ${change.tag}: ${change.field} ${formatValue(change.oldValue)} → ${formatValue(change.newValue)}`,
      );
    }
  }
  for (const skipped of result.skipped) {
    console.log(
      `  ⏭️  skipped (${skipped.reason}): ${JSON.stringify(skipped.record).slice(0, 120)}`,
    );
  }
  console.log(
    `  ${result.addedTags.length} added, ${result.changes.filter((c) => c.action === "updated").length} field updates.`,
  );
  return 0;
}

// ─── CLI entry ───

export async function runCli(args, opts = {}) {
  const { flags, positionals } = parseArgs(args);
  const command = positionals[0];
  const poolPath = opts.poolPath || resolvePoolPath(flags);
  const asJson = Boolean(flags.json);

  switch (command) {
    case "validate":
      return runValidate(poolPath, asJson);
    case "show":
      return runShow(poolPath, flags.tag, asJson);
    case "ingest": {
      if (!flags.from) {
        console.error(
          "usage: node scripts/short-video/tag-pool.mjs ingest --from <research.json> [--dry-run] [--pool <path>]",
        );
        return 2;
      }
      let incoming;
      try {
        incoming = readResearchFile(resolve(flags.from));
      } catch (error) {
        if (asJson) {
          console.log(JSON.stringify({ exitCode: 2, written: false, errors: [error.message] }));
        } else {
          console.error(`✖ ${error.message}`);
        }
        return 2;
      }
      return runIngest(poolPath, incoming, Boolean(flags["dry-run"]), asJson);
    }
    default:
      console.error(
        [
          "usage:",
          "  node scripts/short-video/tag-pool.mjs validate [--pool <path>] [--json]",
          '  node scripts/short-video/tag-pool.mjs show --tag "#ainews" [--pool <path>] [--json]',
          "  node scripts/short-video/tag-pool.mjs ingest --from <research.json> [--dry-run] [--pool <path>]",
        ].join("\n"),
      );
      return 2;
  }
}

const isMainModule =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`✖ ${error.message}`);
      process.exitCode = 2;
    });
}
