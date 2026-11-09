/**
 * Resolve which local port is *currently* proxying — by probing, not by reading
 * configuration.
 *
 * Why probing: this machine runs FlClash and Clash Verge side by side, and the
 * port a client binds is not the port its config file names. Observed
 * 2026-10-31: `clash-verge.yaml` declared `mixed-port: 7897` while the running
 * `verge-mihomo` held 7890/7895/7898/7899 and left 7897 empty. Reading a file,
 * `lsof` or `nc` answers "is something listening", never "will traffic through
 * it leave the machine":
 *
 *   - `lsof -p <pid> -iTCP` is unusable here — the sandbox drops `-p` and
 *     returns the global listener list, so a filtered read looks empty;
 *   - `nc -z` proves a socket accepted a connection, which a client in Direct
 *     mode does while proxying nothing.
 *
 * The criterion is the per-port probe documented in
 * `docs/conventions/test-env-baseline.md` ("宿主代理端口"): a request sent
 * *through* the port with `-x` returns `204` when the port forwards traffic and
 * `000` when it does not. That table owns the recipe and the observed values;
 * this module only automates the loop. Always probe per port: with TUN active a
 * request sent *without* `-x` also returns `204`, so a bare request cannot tell
 * "this port proxies" from "this machine proxies somewhere".
 *
 * This module is the single answer to "which port is proxying" (#1064). Three
 * callers used to answer separately and disagree: this one probed, while
 * `scripts/short-video/lib/ytdlp-guard.mjs` and `scripts/colima-proxy-tunnel.sh`
 * parsed `scutil --proxy` and gated on `<Proto>Enable == "1"`. That flag is
 * exactly what the failure above breaks (a client left it off after a crash yet
 * still binds a working port), so both now call in here: `parseScutilProxy` is
 * the one parser of that output, and the probe is the one verdict.
 *
 * The colima tunnel cannot import this file at runtime: launchd has no macOS
 * privacy (TCC) grant for `~/Documents`, so `npm run env:sync-tunnel` copies
 * this file next to the launcher in `~/bin` and the script runs it as
 * `--print-port`. That copy is why the CLI lives here rather than in a separate
 * entry point — a second file is a second thing the sync script can forget.
 *
 * Decision logic stays pure: the probe and both readers are injected, so the
 * resolver is testable without a network, a proxy or a browser.
 */

import { execSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The URL the probe requests; a forwarding port answers it with `204`. */
export const PROBE_URL = "https://www.google.com/generate_204";

/** The status a forwarding port returns for `PROBE_URL`. Module-local: only the
 * resolver compares against it, and an exported constant nobody imports is dead
 * weight knip reports as an unused export. */
const PROBE_OK = "204";

/** Per-port budget. A dead port fails instantly; a hung one must not stall. */
const PROBE_TIMEOUT_S = 5;

/**
 * Whole-run budget, checked before each probe.
 *
 * Without it the worst case is `candidates × attempts × PROBE_TIMEOUT_S`: a
 * machine with a few hung listeners turns `git push` into minutes of silence
 * that look like a hang rather than a failed resolution.
 */
export const PROBE_BUDGET_S = 15;

/**
 * Both live in `/usr/sbin`, which a launchd job's PATH may not carry.
 *
 * Read with `execSync` and a constant command string rather than
 * `execFileSync`: `scripts/short-video/__tests__/ytdlp-guard.test.mjs` mocks the
 * two functions separately so that `execFileSyncMock.mock.calls[0]` is always
 * the yt-dlp invocation under test. Moving these reads to `execFileSync` would
 * put `scutil` in front of every argv assertion there. Nothing here is
 * externally derived, so the shell string buys nothing an argv call would.
 */
const SCUTIL_BIN = "/usr/sbin/scutil";
const NETSTAT_BIN = "/usr/sbin/netstat";

const MIN_PORT = 1024;
const MAX_PORT = 65535;

/** Protocols `scutil --proxy` describes, in the order their ports are tried. */
const PROXY_PROTOCOLS = ["HTTP", "HTTPS", "SOCKS"];

function toPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return null;
  return port;
}

/**
 * Parse `scutil --proxy` into one entry per protocol.
 *
 * Only top-level `Key : value` lines are read (2-space indent, single-token
 * value), so nested blocks — `ExceptionsList : <array> { ... }` and the
 * numeric-keyed entries inside it — are skipped without a real parser.
 *
 * `enabled` mirrors what macOS itself acts on (`<Proto>Enable == "1"` plus a
 * host and a port). `port` is reported regardless of the flag on purpose: the
 * flag is the thing observed disagreeing with reality, so candidate selection
 * keeps the port and lets the probe decide (see the header).
 *
 * @param {string} text - raw `scutil --proxy` stdout
 * @returns {Record<"HTTP"|"HTTPS"|"SOCKS", { enabled: boolean, host: string|null, port: number|null }>}
 */
export function parseScutilProxy(text) {
  /** @type {Record<string, string>} */
  const dict = {};
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(/^\s{2}([A-Za-z]+) : (\S+)\s*$/);
    if (m) dict[m[1]] = m[2];
  }
  /** @type {Record<string, {enabled: boolean, host: string|null, port: number|null}>} */
  const proxy = {};
  for (const proto of PROXY_PROTOCOLS) {
    const host = dict[`${proto}Proxy`] ?? null;
    const port = toPort(dict[`${proto}Port`]);
    proxy[proto] = {
      enabled: dict[`${proto}Enable`] === "1" && host !== null && port !== null,
      host,
      port,
    };
  }
  return proxy;
}

/**
 * Ports a parsed `scutil --proxy` names, in try order, ignoring `Enable` — see
 * `parseScutilProxy` for why the flag is not consulted here.
 *
 * @param {ReturnType<typeof parseScutilProxy>|null} proxy
 * @returns {number[]} Ports, deduplicated, disabled protocols' ports included
 */
function portsFromParsedProxy(proxy) {
  const ports = [];
  for (const proto of PROXY_PROTOCOLS) {
    const port = proxy?.[proto]?.port;
    if (typeof port === "number") ports.push(port);
  }
  return [...new Set(ports)];
}

/**
 * Ports the OS system-proxy settings name, in the order they should be tried.
 *
 * A protocol that names no port (disabled protocols report 0, which is not a
 * port) contributes nothing. A protocol whose `Enable` flag is off but which
 * still names a port **does** contribute: that flag is the thing observed
 * lying, and only the probe decides (see `parseScutilProxy`).
 *
 * These come first because they are what every other tool on the machine
 * follows (browsers, git's own config, semgrep) — if one of them works, it is
 * the port the rest of the environment already agrees on.
 *
 * There is deliberately no hard-coded fallback list. #1062's draft carried one
 * (`7897 7890 7899 7898 …`); the loopback listeners from `netstat` are a
 * superset of it, and "a client binds a port its config does not name" is the
 * whole reason this resolver probes rather than reads a list.
 *
 * @param {string} scutilOutput - Raw `scutil --proxy` output
 * @returns {number[]} Ports, deduplicated, protocols without a port dropped
 */
export function candidatePortsFromScutil(scutilOutput) {
  return portsFromParsedProxy(parseScutilProxy(scutilOutput));
}

/**
 * Loopback-bound listening ports from `netstat -an`.
 *
 * Only loopback and wildcard binds are kept: a service bound to a LAN address
 * is not reachable at `127.0.0.1`, and this resolver has no business probing
 * it. That also keeps the candidate list short enough to probe directly.
 *
 * @param {string} netstatOutput - Raw `netstat -an` output
 * @returns {number[]} Ports in table order, deduplicated
 */
export function candidatePortsFromNetstat(netstatOutput) {
  const ports = [];
  for (const line of String(netstatOutput ?? "").split("\n")) {
    const row = line.match(/^(?:tcp4|tcp6|tcp46)\s+\d+\s+\d+\s+(\S+)\s+\S+\s+LISTEN/);
    if (!row) continue;
    const local = row[1];
    const dot = local.lastIndexOf(".");
    if (dot === -1) continue;
    const host = local.slice(0, dot);
    const loopbackOrWildcard =
      host === "*" || host === "0.0.0.0" || host === "::" || host === "::1" || /^127\./.test(host);
    if (!loopbackOrWildcard) continue;
    const port = toPort(local.slice(dot + 1));
    if (port !== null) ports.push(port);
  }
  return [...new Set(ports)];
}

/**
 * Full candidate list: system-proxy ports first, then everything else that is
 * listening on loopback.
 *
 * Two shapes for the system-proxy half because the callers differ: the CLI
 * reads raw `scutil` text, while the yt-dlp guard already holds the parsed
 * dict (and its tests inject one). `listeningPorts` exists for the same reason
 * — a caller that reads `netstat` itself should not have to render it back to
 * text to be understood.
 *
 * @param {{
 *   scutilOutput?: string,
 *   scutilProxy?: ReturnType<typeof parseScutilProxy>|null,
 *   netstatOutput?: string,
 *   listeningPorts?: number[]|null,
 * }} sources
 * @returns {number[]} Ports, deduplicated, preferred order preserved
 */
export function candidatePorts({
  scutilOutput = "",
  scutilProxy = null,
  netstatOutput = "",
  listeningPorts = null,
} = {}) {
  const fromSystem = scutilProxy
    ? portsFromParsedProxy(scutilProxy)
    : candidatePortsFromScutil(scutilOutput);
  const listening = listeningPorts ?? candidatePortsFromNetstat(netstatOutput);
  return [...new Set([...fromSystem, ...listening])];
}

/**
 * The URL a resolved port is addressed at. One place, because the same string is
 * needed for the probe, for `git -c` and for the exported environment.
 *
 * `host` exists for the one caller that does not mean loopback: a system proxy
 * can name another machine (a corporate gateway), and the yt-dlp guard passes
 * such an endpoint through unchanged rather than rewriting it to `127.0.0.1`.
 *
 * @param {number} port
 * @param {string} [host]
 * @returns {string}
 */
export function proxyUrl(port, host = "127.0.0.1") {
  return `http://${host}:${port}`;
}

/**
 * Probe one port through curl — node's fetch has no proxy support built in.
 *
 * Synchronous on purpose: the resolver's other caller (`ytdlp-guard.mjs`) sits
 * on a synchronous seam it cannot make async without rippling through every
 * download call site, and the subprocess is the same either way.
 *
 * @param {number} port
 * @returns {string} HTTP status, or `000` when nothing answered
 */
export function probePort(port) {
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

/** Raw `scutil --proxy` output, or `null` off macOS / when scutil fails. */
export function readScutilProxy() {
  try {
    return execSync(`${SCUTIL_BIN} --proxy`, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** Loopback listening ports right now; an empty list is a usable answer. */
export function readLoopbackPorts() {
  try {
    const out = execSync(`${NETSTAT_BIN} -an`, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return candidatePortsFromNetstat(out);
  } catch {
    return [];
  }
}

/**
 * First candidate whose probe comes back `204`.
 *
 * Stops at the first hit on purpose: probing every candidate would make a
 * working setup pay for the failures of the ones after it.
 *
 * `attempts` exists because one `000` is not proof a port is dead. Observed
 * 2026-10-31: the preferred port answered `204` on five consecutive runs and
 * `000` on a sixth, which demoted the resolver to a different port. That is
 * harmless when several ports work, and expensive when only one does — the run
 * then has no port at all and git refuses (see the caller's fallback).
 *
 * The probe must be synchronous. An async one would resolve to a Promise, every
 * comparison against `204` would be false, and the resolver would report "no
 * port forwards" while a proxy was running — the exact silent-failure shape
 * this module exists to remove. So the contract is checked, not just documented.
 *
 * @param {{
 *   candidates: number[],
 *   probe: (port: number) => string,
 *   attempts?: number,
 *   budgetMs?: number,
 *   now?: () => number,
 * }} input
 * @returns {{
 *   port: number|null,
 *   tried: { port: number, code: string }[],
 *   budgetExhausted: boolean,
 * }}
 *   `port` is `null` when no candidate forwarded traffic. `tried` is returned
 *   either way: a failure has to be reportable as the probes that produced it,
 *   and a caller that only gets `null` can say nothing but "no proxy found".
 */
export function resolveProxyPort({
  candidates,
  probe,
  attempts = 1,
  budgetMs = PROBE_BUDGET_S * 1000,
  now = Date.now,
}) {
  const startedAt = now();
  const tried = [];
  for (const port of candidates) {
    for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
      if (now() - startedAt > budgetMs) return { port: null, tried, budgetExhausted: true };
      const code = probe(port);
      if (typeof code !== "string") {
        throw new TypeError(
          "[proxy-port] probe returned a non-string — it must be synchronous " +
            "(a Promise here would make every port look dead)",
        );
      }
      tried.push({ port, code });
      if (code === PROBE_OK) return { port, tried, budgetExhausted: false };
    }
  }
  return { port: null, tried, budgetExhausted: false };
}

/**
 * Read the machine's ports and resolve the one that forwards — the whole
 * decision in one call, with every source replaceable.
 *
 * `attempts` defaults to 2 here (not 1 like `resolveProxyPort`) because this is
 * the entry point the real callers use, and one `000` from a healthy port is
 * the observed failure that retry exists for.
 *
 * `scutilProxy` is the parsed dict, for a caller that already holds one (the
 * yt-dlp guard caches the `scutil` read and its tests inject the parse). Without
 * it the resolver reads `scutil` itself, which is what the CLI and the git
 * wrapper do.
 *
 * @param {{
 *   readScutil?: () => string|null,
 *   scutilProxy?: ReturnType<typeof parseScutilProxy>|null,
 *   readLoopback?: () => number[],
 *   probe?: (port: number) => string,
 *   attempts?: number,
 * }} [sources]
 * @returns {{
 *   port: number|null,
 *   tried: { port: number, code: string }[],
 *   candidates: number[],
 *   budgetExhausted: boolean,
 * }}
 */
export function resolveLocalProxy({
  readScutil = readScutilProxy,
  scutilProxy = null,
  readLoopback = readLoopbackPorts,
  probe = probePort,
  attempts = 2,
} = {}) {
  const candidates = candidatePorts({
    scutilProxy,
    scutilOutput: scutilProxy ? "" : (readScutil() ?? ""),
    listeningPorts: readLoopback(),
  });
  const resolved = resolveProxyPort({ candidates, probe, attempts });
  return { ...resolved, candidates };
}

/**
 * `git -c` arguments that pin both schemes at one proxy URL.
 *
 * `http.proxy` and `https.proxy` are separate keys, and an empty value means
 * "connect directly" — which is what the caller passes when it decided to run
 * without a proxy.
 *
 * @param {string|null} url
 * @returns {string[]}
 */
export function buildGitProxyArgs(url) {
  const value = url ?? "";
  return ["-c", `http.proxy=${value}`, "-c", `https.proxy=${value}`];
}

/**
 * Environment for the git child process.
 *
 * Git reads its own config; hooks and scanners read the environment or the macOS
 * system proxy. Exporting the resolved URL is what keeps `pre-push` (semgrep,
 * osv-scanner) pointed at a port that answers instead of at whatever stale value
 * the system settings still carry.
 *
 * @param {string|null} url
 * @returns {Record<string, string>}
 */
export function buildProxyEnv(url) {
  const value = url ?? "";
  return {
    HTTP_PROXY: value,
    HTTPS_PROXY: value,
    http_proxy: value,
    https_proxy: value,
  };
}

const USAGE = `usage:
  node scripts/lib/proxy-port.mjs --print-port   port that forwards, alone on stdout
  node scripts/lib/proxy-port.mjs --print-url    the same as an http://127.0.0.1 URL

exit codes:
  0  a port resolved
  2  bad usage
  3  nothing forwarded — the reason goes to stderr
`;

/** One line describing why nothing resolved — the evidence, not a shrug. */
function describeMiss({ tried, candidates, budgetExhausted }) {
  const spend = `${tried.length} probe(s) over ${candidates.length} port(s)`;
  const budget = budgetExhausted ? `, budget ${PROBE_BUDGET_S}s exhausted` : "";
  return `[proxy-port] no port forwarded ${PROBE_URL} (${spend}${budget})\n`;
}

/**
 * CLI for callers that cannot import this module — the colima tunnel runs a
 * copy of it from `~/bin` (TCC: see the header). Prints nothing but the answer,
 * so `$(...)` can capture it; a miss keeps its evidence on stderr and exits 3,
 * which is what lets the tunnel say "no port" instead of forwarding to nothing.
 *
 * @param {string[]} argv
 * @returns {number} exit code
 */
function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const wantsPort = argv.includes("--print-port");
  const wantsUrl = argv.includes("--print-url");
  if (!wantsPort && !wantsUrl) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { port, ...evidence } = resolveLocalProxy();
  if (port === null) {
    process.stderr.write(describeMiss(evidence));
    return 3;
  }
  process.stdout.write(wantsPort ? `${port}\n` : `${proxyUrl(port)}\n`);
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === thisFile) {
  process.exit(main(process.argv.slice(2)));
}
