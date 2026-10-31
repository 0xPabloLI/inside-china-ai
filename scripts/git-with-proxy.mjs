#!/usr/bin/env node
/**
 * Run a git command through whichever local port is currently proxying.
 *
 * The problem this solves is not "no proxy configured" but "a proxy configured
 * at a port nothing listens on". `.git/config` carries `http.proxy` as a fixed
 * string, and the client behind that port changes when the user switches
 * between FlClash and Clash Verge, or when a client restart re-binds. A pinned
 * port therefore breaks on a day nobody touched the repo, surfacing as
 * `Failed to connect to 127.0.0.1 port 7890`.
 *
 * Git has no hook that runs before config resolution, so "dynamic" can only
 * mean: resolve first, then hand git the answer for this one invocation. This
 * wrapper never writes `.git/config` — that file is shared by every worktree, so
 * writing it would re-point another session's checkout.
 *
 *   npm run git:proxy -- push -u origin session/foo
 *   npm run git:proxy -- fetch origin main
 *   npm run git:proxy -- --print-port        # resolve and print, nothing else
 *   npm run git:proxy -- --direct -- fetch   # run without a proxy, knowingly
 *
 * Two behaviours worth knowing:
 *   - Nothing forwards → git does **not** run. It exits 3 with the probe
 *     evidence and points at `--direct`. Falling back silently would make the
 *     resolution decorative: the run would succeed or fail on git's own
 *     connectivity while the caller believes it went through a proxy.
 *   - `GIT_WITH_PROXY_PORT` skips probing and uses that port. It exists so the
 *     wiring can be tested without a network, and so
 *     `scripts/lib/proxy-env.sh` can reuse one answer for a batch of git calls.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PROBE_BUDGET_S,
  PROBE_TIMEOUT_S,
  PROBE_URL,
  buildGitProxyArgs,
  buildProxyEnv,
  candidatePorts,
  proxyUrl,
  resolveProxyPort,
} from "./lib/proxy-port.mjs";

const USAGE = `usage:
  node scripts/git-with-proxy.mjs --print-port        resolve and print the port
  node scripts/git-with-proxy.mjs -- <git args...>    run git through that port

options:
  --direct    run git without a proxy when no port forwards (default: refuse)
  --help      this text

examples:
  npm run git:proxy -- push -u origin session/foo
  npm run git:proxy -- --direct -- fetch origin main
`;

/** Probe one port through curl — node's fetch has no proxy support built in. */
function probeThroughPort(port) {
  const result = spawnSync(
    "curl",
    [
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "--max-time",
      String(PROBE_TIMEOUT_S),
      "-x",
      proxyUrl(port),
      PROBE_URL,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const code = (result.stdout || "").trim();
  return code === "" ? "000" : code;
}

/**
 * Read a command's output, treating any failure as empty. Named for the
 * behaviour rather than the call: both callers are "I would like this list, and
 * an empty list is a usable answer".
 */
function readOrEmpty(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: 20000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

/** Resolved URL, or `null` when no candidate forwards traffic. */
async function resolveProxyUrl() {
  const forced = process.env.GIT_WITH_PROXY_PORT;
  if (forced) {
    const port = Number(forced);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`[git-proxy] GIT_WITH_PROXY_PORT is not a port: ${forced}\n`);
      process.exit(2);
    }
    return { url: proxyUrl(port), tried: [], candidates: [] };
  }

  const candidates = candidatePorts({
    scutilOutput: readOrEmpty("scutil", ["--proxy"]),
    netstatOutput: readOrEmpty("netstat", ["-an"]),
  });
  // Two attempts: a single `000` from the preferred port was observed on a run
  // where the port was fine (see `resolveProxyPort`).
  const resolved = await resolveProxyPort({ candidates, probe: probeThroughPort, attempts: 2 });
  return {
    url: resolved.port === null ? null : proxyUrl(resolved.port),
    tried: resolved.tried,
    candidates,
    budgetExhausted: resolved.budgetExhausted,
  };
}

/** One line describing why nothing resolved — the evidence, not a shrug. */
function describeMiss({ tried, candidates, budgetExhausted }) {
  const spend = `${tried.length} probe(s) over ${candidates.length} port(s)`;
  const budget = budgetExhausted ? `, budget ${PROBE_BUDGET_S}s exhausted` : "";
  return `[git-proxy] no port forwarded ${PROBE_URL} (${spend}${budget})\n`;
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsPort = argv.includes("--print-port");
  const allowDirect = argv.includes("--direct");

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const resolution = await resolveProxyUrl();
  const { url } = resolution;

  if (wantsPort) {
    if (url === null) {
      process.stderr.write(describeMiss(resolution));
      process.exit(1);
    }
    process.stdout.write(`${url}\n`);
    process.exit(0);
  }

  // Our own flags are removed wherever they appear, then a single leading `--`
  // is dropped (npm's separator). A `--` further along is git's — `checkout --
  // <path>` — and must survive, so only the first position is treated as ours.
  const rest = argv.filter((arg) => arg !== "--direct" && arg !== "--print-port");
  const gitArgs = rest[0] === "--" ? rest.slice(1) : rest;
  if (gitArgs.length === 0) {
    process.stderr.write(`[git-proxy] no git command given\n\n${USAGE}`);
    process.exit(2);
  }

  if (url === null) {
    if (!allowDirect) {
      process.stderr.write(describeMiss(resolution));
      process.stderr.write(
        "[git-proxy] refusing to guess — start a proxy client, or pass --direct to run git without one\n",
      );
      process.exit(3);
    }
    process.stderr.write("[git-proxy] no proxy resolved — running git direct (--direct)\n");
  } else {
    process.stderr.write(`[git-proxy] git via ${url}\n`);
  }

  const result = spawnSync("git", [...buildGitProxyArgs(url), ...gitArgs], {
    stdio: "inherit",
    env: { ...process.env, ...buildProxyEnv(url) },
  });

  if (result.error) {
    process.stderr.write(`[git-proxy] failed to start git: ${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === thisFile) {
  await main();
}
