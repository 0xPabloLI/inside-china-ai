#!/usr/bin/env node
/**
 * Orthogonality pilot harness (#457, Stage 1 only).
 *
 * Runs the fixed 5-query pilot across every candidate channel, stores one raw
 * artifact per (query, channel), then derives the report from those artifacts
 * alone. `--replay <dir>` recomputes the report from a stored run, which is how
 * metric determinism is verified without re-spending quota (live search results
 * are not reproducible; the metric layer is).
 *
 * This is a research artifact: nothing here is imported by the production
 * pipeline, FAMILIES is not rewritten, and `search-pool.mjs` is untouched.
 *
 * Usage:
 *   node scripts/short-video/bench/search-orthogonality/run-pilot.mjs \
 *     [--queries id,id] [--channels pool:serper,...] [--max-results 10] \
 *     [--timeout 30000] [--max-metered-calls 20] [--run-id <id>] [--out <dir>] \
 *     [--replay <dir>]
 */

import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

import { PILOT_QUERIES } from "./queries.mjs";
import { DEFAULT_CHANNELS, loadChannels } from "./channels.mjs";
import { buildReport, renderMarkdown } from "./report.mjs";

const BENCH_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * Every artifact lives under an operator-supplied directory (`--out` /
 * `--replay`). The only dynamic leaf is the run id, which `parseArgs` restricts
 * to a plain name; Semgrep cannot see that validation, so the suppression is
 * scoped to this single call site instead of every path join.
 * nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
 */
function runPath(...parts) {
  return join(...parts);
}

function parseArgs(argv) {
  const opts = {
    queries: null,
    channels: null,
    maxResults: 10,
    timeoutMs: 30000,
    maxMeteredCalls: 20,
    runId: null,
    out: runPath(BENCH_DIR, "output"),
    replay: null,
    proxy: null,
  };
  const pick = (index) => {
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${argv[index]} requires a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--queries") opts.queries = pick(i++).split(",").filter(Boolean);
    else if (token === "--channels") opts.channels = pick(i++).split(",").filter(Boolean);
    else if (token === "--max-results") opts.maxResults = Number(pick(i++));
    else if (token === "--timeout") opts.timeoutMs = Number(pick(i++));
    else if (token === "--max-metered-calls") opts.maxMeteredCalls = Number(pick(i++));
    else if (token === "--run-id") opts.runId = pick(i++);
    else if (token === "--out") opts.out = pick(i++);
    else if (token === "--replay") opts.replay = pick(i++);
    else if (token === "--proxy") opts.proxy = pick(i++);
    else throw new Error(`unknown option: ${token}`);
  }
  for (const key of ["maxResults", "timeoutMs", "maxMeteredCalls"]) {
    if (!Number.isInteger(opts[key]) || opts[key] <= 0) {
      throw new Error(`--${key} must be a positive integer`);
    }
  }
  // The run id becomes a directory name: keep it a plain name, never a path.
  if (
    opts.runId !== null &&
    (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(opts.runId) || opts.runId.includes(".."))
  ) {
    throw new Error("--run-id must be a plain name (letters, digits, dot, underscore, dash)");
  }
  return opts;
}

/** `.env.local` supplies the engine keys; an already-exported value wins. */
function loadEnv() {
  const file = runPath(REPO_ROOT, ".env.local");
  if (!existsSync(file)) return;
  process.loadEnvFile(file);
}

/**
 * Node's global fetch ignores HTTP(S)_PROXY unless the process starts with
 * `--use-env-proxy` (the repo convention, Node ≥ 22.15 — see
 * docs/selector-auto-healing.md). Some engines (Brave, Jina) and Wikipedia are
 * only reachable through the host proxy on this machine, so a run without it
 * silently measures "connect timeout" as "no marginal gain" — the exact false
 * negative the ticket warns about. `NO_PROXY` keeps the local SearXNG direct.
 *
 * A startup flag cannot be applied at runtime, so `--proxy` re-executes this
 * script once with the flag and the proxy env in place.
 */
function reexecWithProxy(opts) {
  if (!opts.proxy || process.env.NODE_USE_ENV_PROXY === "1") return;
  const result = spawnSync(
    process.execPath,
    ["--use-env-proxy", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        HTTP_PROXY: process.env.HTTP_PROXY ?? opts.proxy,
        HTTPS_PROXY: process.env.HTTPS_PROXY ?? opts.proxy,
        NO_PROXY: process.env.NO_PROXY ?? "localhost,127.0.0.1",
        NODE_USE_ENV_PROXY: "1",
      },
    },
  );
  process.exit(result.status ?? 1);
}

function timestampId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function describeChannel(channel) {
  return {
    kind: channel.kind,
    metered: channel.allowanceShare > 0,
    allowanceShare: channel.allowanceShare,
  };
}

async function runPilot(opts) {
  loadEnv();
  const queries = opts.queries
    ? PILOT_QUERIES.filter((query) => opts.queries.includes(query.id))
    : PILOT_QUERIES;
  if (queries.length === 0) throw new Error("no queries matched --queries");

  const channelIds = opts.channels ?? DEFAULT_CHANNELS;
  const channels = await loadChannels(channelIds);

  const runId = opts.runId ?? timestampId();
  const runDir = runPath(opts.out, runId);
  mkdirSync(runPath(runDir, "raw"), { recursive: true });

  const results = [];
  let meteredCalls = 0;

  for (const query of queries) {
    for (const channel of channels) {
      const base = { queryId: query.id, channel: channel.id };
      if (channel.allowanceShare > 0) {
        // Paid / token-metered calls only: free channels never hit this guard.
        if (meteredCalls >= opts.maxMeteredCalls) {
          results.push({ ...base, skipped: "budget" });
          continue;
        }
        meteredCalls++;
      }
      const startedAt = Date.now();
      try {
        const output = await channel.run(query.text, {
          maxResults: opts.maxResults,
          timeoutMs: opts.timeoutMs,
        });
        results.push({
          ...base,
          ms: Date.now() - startedAt,
          articles: output.articles,
          note: output.note ?? null,
        });
      } catch (error) {
        results.push({
          ...base,
          ms: Date.now() - startedAt,
          articles: [],
          error: String(error?.message ?? error).slice(0, 300),
        });
      }
      const lastName = `${query.id}__${channel.id.replace(":", "-")}.json`;
      writeFileSync(
        runPath(runDir, "raw", lastName),
        JSON.stringify({ query, channel: channel.id, ...results.at(-1) }, null, 2) + "\n",
        "utf8",
      );
      const last = results.at(-1);
      const status = last.error ? `FAIL ${last.error}` : `${last.articles.length} articles`;
      process.stderr.write(`[pilot] ${query.id} · ${channel.id} · ${last.ms}ms · ${status}\n`);
    }
  }

  // Re-running a subset (e.g. after repairing transport) must not drop the
  // channels already measured: keep the prior results and let the later entry
  // for the same (query, channel) win in the report.
  const prior = existsSync(runPath(runDir, "run.json"))
    ? JSON.parse(readFileSync(runPath(runDir, "run.json"), "utf8"))
    : null;
  const run = {
    runId,
    startedAt: prior?.startedAt ?? new Date().toISOString(),
    baseline: git(["rev-parse", "HEAD"]),
    versions: {
      repo: git(["rev-parse", "HEAD"]),
      skillsShared: git(["rev-parse", "HEAD"], runPath(REPO_ROOT, "skills/shared")),
      node: process.version,
    },
    queries: [
      ...new Map(
        [...(prior?.queries ?? []), ...queries].map((query) => [query.id, query]),
      ).values(),
    ],
    channels: [...new Set([...(prior?.channels ?? []), ...channelIds])],
    channelMeta: {
      ...(prior?.channelMeta ?? {}),
      ...Object.fromEntries(channels.map((c) => [c.id, describeChannel(c)])),
    },
    meta: { maxResults: opts.maxResults, timeoutMs: opts.timeoutMs },
    proxy: opts.proxy ?? prior?.proxy ?? null,
    costNote:
      "Jina is token-metered; its per-call share uses the recorded 58.9k-tokens " +
      "anchor because the pool seam truncates snippets. Payload tokens are " +
      "measured on what the harness received, not provider billing usage.",
    results: [...(prior?.results ?? []), ...results],
  };

  writeArtifacts(runDir, run);
  return runDir;
}

function git(args, cwd = undefined) {
  try {
    return execFileSync("git", args, {
      cwd: cwd ?? REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function writeArtifacts(runDir, run) {
  writeFileSync(runPath(runDir, "run.json"), JSON.stringify(run, null, 2) + "\n", "utf8");
  const report = buildReport(run);
  writeFileSync(runPath(runDir, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  writeFileSync(runPath(runDir, "summary.md"), renderMarkdown(report) + "\n", "utf8");
}

function replay(runDir) {
  const run = JSON.parse(readFileSync(runPath(runDir, "run.json"), "utf8"));
  writeArtifacts(runDir, run);
  return runDir;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  reexecWithProxy(opts);
  const runDir = opts.replay ? replay(opts.replay) : await runPilot(opts);
  process.stdout.write(`${runDir}\n`);
}

const invokedAsScript = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`search-orthogonality: ${error?.message ?? error}\n`);
    process.exit(1);
  });
}
