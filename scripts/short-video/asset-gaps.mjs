#!/usr/bin/env node
/**
 * asset-gaps.mjs — the asset gap ledger CLI (#293).
 *
 * Stage 3 records what sourcing could not satisfy; Stage 0 reads it before a
 * new package starts. Both sides go through this CLI so the file shape, the
 * merge rule and the matching rule have one owner (`lib/asset-gap-ledger.mjs`).
 *
 * Usage:
 *   node scripts/short-video/asset-gaps.mjs --list [--status open|satisfied|all] [--json]
 *   node scripts/short-video/asset-gaps.mjs --query "unitree,humanoid" [--json]
 *   node scripts/short-video/asset-gaps.mjs --record --content <slug> [--json]
 *   node scripts/short-video/asset-gaps.mjs --satisfy <gap-id|need-substring> [--by <path>]
 *
 * Ledger: `knowledge/asset-gaps.json` (tracked; `--ledger <path>` overrides).
 *
 * `--record` replays a package's own artifacts — scene-data, media-patch and
 * the Stage 3 8b relevance report. It never searches or downloads; the run
 * that produced the artifacts already did.
 *
 * Exit codes: 0 success, 1 unusable input (missing scene-data, unknown gap).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GAP_STATUS,
  deriveGaps,
  formatGapLine,
  mergeGaps,
  parseLedger,
  queryGaps,
  satisfyGaps,
  serializeLedger,
} from "./lib/asset-gap-ledger.mjs";
import { normalizeMediaPatch } from "./lib/media-patch-format.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_LEDGER = join(REPO_ROOT, "knowledge", "asset-gaps.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const parseArgs = (args) => {
  const flag = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  return {
    list: args.includes("--list"),
    record: args.includes("--record"),
    json: args.includes("--json"),
    query: flag("query"),
    content: flag("content"),
    status: flag("status"),
    satisfy: flag("satisfy"),
    by: flag("by"),
    ledger: flag("ledger"),
  };
};

/**
 * Read the ledger. A missing file is an empty ledger; an unparseable or
 * wrong-shaped one is also read as empty, but reported — a corrupt ledger
 * must not block a production run (the same fail-open stance as the
 * used-asset index), and it must not be silently overwritten either.
 *
 * @returns {{ledger: object, corrupt: boolean}}
 */
const loadLedgerAt = (path) => {
  if (!existsSync(path)) return { ledger: parseLedger(null), corrupt: false };
  const text = readFileSync(path, "utf8");
  const ledger = parseLedger(text);
  let valid = false;
  try {
    valid = Array.isArray(JSON.parse(text)?.gaps);
  } catch {
    valid = false;
  }
  return { ledger, corrupt: text.trim() !== "" && !valid };
};

const writeLedgerAt = (path, ledger) => {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, serializeLedger(ledger), "utf8");
  renameSync(temp, path);
};

const loadScenes = async (repoRoot, slug) => {
  const sceneDataPath = join(repoRoot, "scripts", "short-video", "content", slug, "scene-data.mjs");
  if (!existsSync(sceneDataPath)) {
    throw new Error(`scene-data.mjs not found for "${slug}" (${sceneDataPath})`);
  }
  // Cache-busting query: a test or a re-run in one process must see the file
  // as it is now, not the first import.
  const module = await import(`${pathToFileURL(sceneDataPath).href}?t=${Date.now()}`);
  return Array.isArray(module.scenes) ? module.scenes : [];
};

const loadPatches = (repoRoot, slug) => {
  const patchPath = join(repoRoot, "scripts", "short-video", "output", slug, "media-patch.json");
  if (!existsSync(patchPath)) return [];
  try {
    return normalizeMediaPatch(readJson(patchPath));
  } catch (error) {
    throw new Error(`media-patch.json is unreadable for "${slug}": ${error.message}`);
  }
};

const loadReport = (repoRoot, slug) => {
  const reportPath = join(
    repoRoot,
    "scripts",
    "short-video",
    "content",
    slug,
    "stock-relevance-report.json",
  );
  if (!existsSync(reportPath)) return null;
  try {
    return readJson(reportPath);
  } catch {
    return null;
  }
};

const loadBrollReport = (repoRoot, slug) => {
  const reportPath = join(repoRoot, "scripts", "short-video", "output", slug, "b-roll-report.json");
  if (!existsSync(reportPath)) return null;
  try {
    return readJson(reportPath);
  } catch {
    return null;
  }
};

const STATUS_VALUES = new Set([GAP_STATUS.OPEN, GAP_STATUS.SATISFIED, "all"]);

/**
 * CLI entry point. Exported so tests can drive it in-process with a fixture
 * repo root instead of spawning node.
 *
 * @param {string[]} args
 * @param {{repoRoot?: string, ledgerPath?: string, stdout?: (line: string) => void,
 *   stderr?: (line: string) => void}} [opts]
 * @returns {Promise<number>} exit code
 */
export async function runCli(args, opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const out = opts.stdout ?? ((line) => console.log(line));
  const err = opts.stderr ?? ((line) => console.error(line));
  const parsed = parseArgs(args);
  const ledgerPath = parsed.ledger
    ? resolve(parsed.ledger)
    : (opts.ledgerPath ?? join(repoRoot, "knowledge", "asset-gaps.json"));
  if (parsed.status && !STATUS_VALUES.has(parsed.status)) {
    err(`❌ --status must be one of ${[...STATUS_VALUES].join(" | ")} (got "${parsed.status}")`);
    return 1;
  }
  if (parsed.by && !existsSync(resolve(parsed.by))) {
    // Satisfying a gap is the only write that claims the library now holds
    // the asset. A path that does not exist makes that claim false.
    err(`❌ --by path does not exist: ${parsed.by}`);
    return 1;
  }

  const { ledger, corrupt } = loadLedgerAt(ledgerPath);
  if (corrupt) {
    err(`⚠️  ${ledgerPath} could not be parsed — treating it as an empty ledger`);
  }

  if (parsed.record) {
    const slug = parsed.content;
    if (!slug) {
      err("❌ --record needs --content <slug>");
      return 1;
    }
    let gaps;
    try {
      const scenes = await loadScenes(repoRoot, slug);
      const patches = loadPatches(repoRoot, slug);
      const report = loadReport(repoRoot, slug);
      const brollReport = loadBrollReport(repoRoot, slug);
      gaps = deriveGaps({ contentSlug: slug, scenes, patches, report, brollReport });
    } catch (error) {
      err(`❌ ${error.message}`);
      return 1;
    }
    const merged = gaps.length > 0 ? mergeGaps(ledger, gaps) : ledger;
    if (gaps.length > 0) writeLedgerAt(ledgerPath, merged);
    const open = merged.gaps.filter((gap) => gap.status === GAP_STATUS.OPEN).length;
    if (parsed.json) {
      out(
        JSON.stringify(
          { ledger: ledgerPath, content: slug, recorded: gaps.length, open, gaps },
          null,
          2,
        ),
      );
    } else if (gaps.length === 0) {
      out(`No asset gaps recorded from ${slug} (every stock scene was satisfied)`);
    } else {
      out(`Recorded ${gaps.length} gap(s) from ${slug} → ${ledgerPath}`);
      for (const gap of gaps) out(`  ${formatGapLine(gap)}`);
      out(`Open gaps in ledger: ${open}`);
    }
    return 0;
  }

  if (parsed.satisfy) {
    const { ledger: next, matched } = satisfyGaps(ledger, parsed.satisfy, {
      by: parsed.by ? resolve(parsed.by) : null,
    });
    if (matched.length === 0) {
      err(`❌ no gap matched "${parsed.satisfy}" in ${ledgerPath}`);
      return 1;
    }
    writeLedgerAt(ledgerPath, next);
    out(`Satisfied ${matched.length} gap(s):`);
    for (const gap of matched) out(`  ${formatGapLine(gap)}`);
    return 0;
  }

  // Default action: list / query open gaps.
  const status = parsed.status === "all" ? null : (parsed.status ?? GAP_STATUS.OPEN);
  const gaps = queryGaps(ledger, parsed.query ?? "", { status, limit: 50 });
  if (parsed.json) {
    out(JSON.stringify({ ledger: ledgerPath, status, count: gaps.length, gaps }, null, 2));
    return 0;
  }
  const label = parsed.query ? `matching "${parsed.query}"` : `(${status ?? "all"})`;
  out(`${gaps.length} asset gap(s) ${label} — ${ledgerPath}`);
  for (const gap of gaps) {
    out(`  ${formatGapLine(gap)}`);
  }
  return 0;
}

// realpathSync, not resolve: import.meta.url is realpath-resolved while
// argv[1] keeps the link it was typed as, so a checkout reached through a
// symlink (macOS /var, /tmp, any linked worktree) would compare unequal and
// the CLI would exit 0 having done nothing (scripts/__tests__/cli-entry-guard).
const isMainModule =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
