#!/usr/bin/env node
/**
 * Reclaim orphaned .vlm-cache entries (#992).
 *
 * A prompt-version bump (VLM_CACHE_PROMPT_VERSION) makes every older cache
 * entry unreachable: computeCacheKey mixes the version into the key and
 * getCachedResult only looks up the current key. Nothing deleted those files,
 * so the cache grew by one generation per bump. This CLI is the explicit
 * reclaim path:
 *
 *   node scripts/short-video/prune-vlm-cache.mjs                      # dry run, all packs
 *   node scripts/short-video/prune-vlm-cache.mjs --apply              # delete orphans
 *   node scripts/short-video/prune-vlm-cache.mjs --content <slug>     # one content pack
 *   node scripts/short-video/prune-vlm-cache.mjs --dir <cache-dir>    # an explicit dir
 *
 * Deletion policy lives in lib/vlm-cache.mjs#scanVlmCache: only
 * `{64-hex}.json` entries whose meta.promptVersion differs from the current
 * version (or is missing) are deleted. Current entries, in-flight `.tmp`
 * files, unparsable files and files this module did not write are kept.
 * Dry run is the default — run --apply only when no pipeline run is writing
 * the same pack.
 */
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VLM_CACHE_PROMPT_VERSION, pruneVlmCache } from "./lib/vlm-cache.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

const HELP = [
  "Usage: node scripts/short-video/prune-vlm-cache.mjs [options]",
  "",
  "  --apply              delete orphaned entries (default: report only)",
  "  --content <slug>     limit to content/<slug>/.vlm-cache",
  "  --dir <cache-dir>    prune an explicit cache directory (repeatable)",
  "  --root <path>        short-video root to scan (default: this script's dir)",
  "  -h, --help           show this help",
  "",
  "Only {64-hex}.json entries whose meta.promptVersion differs from the current",
  "VLM_CACHE_PROMPT_VERSION are deleted. Current entries, in-flight .tmp files,",
  "unparsable files and unknown files are kept.",
];

function parseArgs(args) {
  const parsed = { apply: false, help: false, content: null, dirs: [], root: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") {
      parsed.apply = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--content" || arg === "--dir" || arg === "--root") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} needs a value`);
      }
      i += 1;
      if (arg === "--content") parsed.content = value;
      else if (arg === "--dir") parsed.dirs.push(value);
      else parsed.root = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

/**
 * Every `.vlm-cache` directory under `<root>/content` and `<root>/output`.
 * Both groups are scanned: today's producer writes under `content/<slug>/`,
 * while the runbook also shows `output/<slug>/.vlm-cache` layouts. The walk
 * is recursive because a series can nest its packs (`content/<series>/<part>/`).
 * `assets` and `node_modules` are skipped: caches live at pack roots, and
 * descending into media directories would make the scan needlessly expensive.
 */
const MAX_CACHE_DEPTH = 4;
const SKIP_CACHE_WALK = new Set(["assets", "node_modules", ".git"]);

function findCacheDirs(base, depth = 0) {
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    if (entry.name === ".vlm-cache") {
      dirs.push(dir);
      continue;
    }
    if (depth >= MAX_CACHE_DEPTH || SKIP_CACHE_WALK.has(entry.name)) continue;
    dirs.push(...findCacheDirs(dir, depth + 1));
  }
  return dirs;
}

export function discoverCacheDirs(root) {
  const dirs = [];
  for (const group of ["content", "output"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    dirs.push(...findCacheDirs(base));
  }
  return dirs.sort();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(2)} MiB`;
}

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function formatCounts(label, counts) {
  const body = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
  return `   ${label}: ${body}`;
}

/**
 * CLI entry point. Exported so tests can drive it in-process with a fixture
 * root instead of spawning node.
 *
 * @param {string[]} args
 * @param {{root?: string, stdout?: (line: string) => void,
 *   stderr?: (line: string) => void,
 *   unlink?: (path: string) => void}} [opts] - `unlink` is a test seam for the
 *   deletion-failure path; production uses fs.unlinkSync.
 * @returns {Promise<number>} exit code
 */
export async function runCli(args, opts = {}) {
  const out = opts.stdout ?? ((line) => console.log(line));
  const err = opts.stderr ?? ((line) => console.error(line));

  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    err(`❌ ${error.message}`);
    return 2;
  }
  if (parsed.help) {
    for (const line of HELP) out(line);
    return 0;
  }

  const root = resolve(opts.root ?? parsed.root ?? MODULE_DIR);

  let dirs;
  if (parsed.dirs.length > 0) {
    dirs = parsed.dirs.map((dir) => resolve(dir));
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        err(`❌ cache directory not found: ${dir}`);
        return 2;
      }
    }
  } else if (parsed.content) {
    const dir = join(root, "content", parsed.content, ".vlm-cache");
    if (!existsSync(dir)) {
      err(`❌ no .vlm-cache for content pack "${parsed.content}" (${dir})`);
      return 1;
    }
    dirs = [dir];
  } else {
    dirs = discoverCacheDirs(root);
  }

  out(
    `🧹 VLM cache prune — prompt version ${VLM_CACHE_PROMPT_VERSION} ` +
      `(${parsed.apply ? "apply" : "dry run"})`,
  );
  if (dirs.length === 0) {
    out(`No .vlm-cache directories found under ${root}.`);
    return 0;
  }

  const promptVersions = {};
  const pipelineVersions = {};
  const models = {};
  let beforeTotal = 0;
  let beforeBytes = 0;
  let afterTotal = 0;
  let afterBytes = 0;
  let orphanTotal = 0;
  let deleted = 0;
  let deletedBytes = 0;
  let unparsableKept = 0;
  let tmpKept = 0;
  let otherKept = 0;
  const failures = [];

  for (const dir of dirs) {
    const result = pruneVlmCache(dir, { apply: parsed.apply, unlink: opts.unlink });
    const rel = relative(root, dir);
    const label = rel.startsWith("..") ? dir : rel || dir;
    const { entries, bytes } = result.before;
    out(
      `   ${label}: ${entries.total} ${entries.total === 1 ? "entry" : "entries"} — ` +
        `current ${entries.current}, orphan ${entries.orphan}, unparsable ${entries.unparsable}`,
    );
    beforeTotal += entries.total;
    beforeBytes += bytes.total;
    afterTotal += result.after.entries.total;
    afterBytes += result.after.bytes.total;
    orphanTotal += entries.orphan;
    deleted += result.deleted;
    deletedBytes += result.deletedBytes;
    unparsableKept += result.after.entries.unparsable;
    tmpKept += result.after.files.tmp;
    otherKept += result.after.files.other;
    addCounts(promptVersions, result.before.promptVersions);
    addCounts(pipelineVersions, result.before.pipelineVersions);
    addCounts(models, result.before.models);
    for (const failure of result.failures) {
      failures.push({ ...failure, dir: label });
    }
  }

  if (beforeTotal > 0) {
    out("");
    out(formatCounts("prompt versions", promptVersions));
    if (Object.keys(pipelineVersions).length > 0) {
      out(formatCounts("pipeline versions", pipelineVersions));
    }
    if (Object.keys(models).length > 0) {
      out(formatCounts("models", models));
    }
  }

  out("");
  out(`Before: ${beforeTotal} entries / ${formatBytes(beforeBytes)}`);
  out(
    `After:  ${afterTotal} entries / ${formatBytes(afterBytes)} ` +
      `(unparsable ${unparsableKept} kept, tmp ${tmpKept}, other ${otherKept})`,
  );
  if (parsed.apply) {
    out(`Reclaimed: ${deleted} entries / ${formatBytes(deletedBytes)}`);
  } else if (orphanTotal > 0) {
    out(
      `Dry run — rerun with --apply to delete ${orphanTotal} orphan ` +
        `${orphanTotal === 1 ? "entry" : "entries"}.`,
    );
  } else {
    out("Nothing to reclaim.");
  }

  if (failures.length > 0) {
    err(`❌ ${failures.length} entr${failures.length === 1 ? "y" : "ies"} could not be deleted:`);
    for (const failure of failures) {
      err(`   ${failure.dir}/${failure.file}: ${failure.error}`);
    }
    return 1;
  }
  return 0;
}

// realpathSync, not resolve: see docs/agents/implementation-workflow.md §12.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
