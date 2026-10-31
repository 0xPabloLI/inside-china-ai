#!/usr/bin/env node
/**
 * Run a git command through whichever local port is currently proxying.
 *
 * The problem this solves is not "no proxy configured" but "a proxy configured
 * at a port nothing listens on". `.git/config` carries `http.proxy` as a fixed
 * string, and the client behind that port changes when the user switches
 * between FlClash and Clash Verge (or when a client restart re-binds). A pinned
 * port therefore breaks on a day nobody touched the repo, with the failure
 * surfacing as `Failed to connect to 127.0.0.1 port 7890`.
 *
 * Git has no hook that runs before config resolution, so "dynamic" can only
 * mean: resolve first, then hand git the answer for this one invocation. That is
 * what this wrapper does — it never writes `.git/config`, so it cannot silently
 * re-point another session's worktree (that file is shared by all of them).
 *
 *   npm run git:proxy -- push -u origin session/foo
 *   npm run git:proxy -- fetch origin main
 *   npm run git:proxy -- --print-port          # just resolve and print
 *
 * Two fallbacks worth knowing:
 *   - No candidate answers → git runs *direct*, with a warning, matching the
 *     documented workaround (`git -c http.proxy=`). Failing closed here would
 *     block work on a network that needs no proxy at all.
 *   - The resolved port is exported as HTTP(S)_PROXY too, so `pre-push` hooks
 *     (semgrep, osv-scanner) inherit a live value instead of reading whatever
 *     stale port the macOS system settings still hold.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PROBE_TIMEOUT_S,
  PROBE_URL,
  buildGitProxyArgs,
  buildProxyEnv,
  candidatePorts,
  resolveProxyPort,
} from "./lib/proxy-port.mjs";

const USAGE = `usage:
  node scripts/git-with-proxy.mjs --print-port        resolve and print the port
  node scripts/git-with-proxy.mjs --json              resolved port + every probe
  node scripts/git-with-proxy.mjs -- <git args...>    run git through that port

examples:
  npm run git:proxy -- push -u origin session/foo
  npm run git:proxy -- fetch origin main
`;

function read(cmd, args) {
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

/**
 * Ask one port to fetch a URL it can only fetch through a working proxy.
 * curl is used rather than node's fetch because node has no proxy support
 * without pulling a dependency in, and this file must stay dependency-free to
 * be usable before `npm ci` has ever run.
 */
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
      `http://127.0.0.1:${port}`,
      PROBE_URL,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const code = (result.stdout || "").trim();
  return code === "" ? "000" : code;
}

async function resolve() {
  const candidates = candidatePorts({
    scutilOutput: read("scutil", ["--proxy"]),
    netstatOutput: read("netstat", ["-an"]),
  });
  return {
    candidates,
    // Two attempts: a single `000` from the preferred port was observed on a
    // run where the port was fine (see `resolveProxyPort`). Falling back to
    // direct over one bad probe is the failure worth paying a re-probe for.
    resolved: await resolveProxyPort({ candidates, probe: probeThroughPort, attempts: 2 }),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsPort = argv.includes("--print-port");
  const wantsJson = argv.includes("--json");
  const isHelp = argv.length === 0 || argv.includes("--help") || argv.includes("-h");

  if (isHelp && !wantsPort && !wantsJson) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const { candidates, resolved } = await resolve();
  const port = resolved.port;

  if (wantsJson) {
    process.stdout.write(
      `${JSON.stringify({ port, candidates, tried: resolved.tried }, null, 2)}\n`,
    );
    process.exit(port === null ? 1 : 0);
  }

  if (wantsPort) {
    if (port === null) {
      process.stderr.write(
        `[git-proxy] no candidate proxied ${PROBE_URL} — ${resolved.tried.length} probe(s) over ${candidates.length} port(s)\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`${port}\n`);
    process.exit(0);
  }

  const gitArgs = argv[0] === "--" ? argv.slice(1) : argv;
  if (gitArgs.length === 0) {
    process.stderr.write(`[git-proxy] no git command given\n\n${USAGE}`);
    process.exit(2);
  }

  if (port === null) {
    process.stderr.write(
      `[git-proxy] no candidate proxied ${PROBE_URL} (probed ${candidates.length}) — running git direct\n`,
    );
  } else {
    process.stderr.write(`[git-proxy] git via 127.0.0.1:${port}\n`);
  }

  const result = spawnSync("git", [...buildGitProxyArgs(port), ...gitArgs], {
    stdio: "inherit",
    env: { ...process.env, ...buildProxyEnv(port) },
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
