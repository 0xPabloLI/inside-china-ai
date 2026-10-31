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
 * Two parsers of the same `scutil --proxy` output already exist
 * (`scripts/short-video/lib/ytdlp-guard.mjs` `parseMacSystemProxy`,
 * `scripts/colima-proxy-tunnel.sh` `resolve_proxy_port`). They are not reused
 * here on purpose, and the difference is the point: both gate on
 * `<Proto>Enable == "1"`, while the failure this module exists for is exactly a
 * toggle that disagrees with reality (a client left the flag off after a crash
 * yet still binds a working port). Candidates therefore come from the *ports*
 * regardless of the flag, and only the probe decides. Consolidating the three
 * is a separate change: #1064.
 *
 * Everything here is pure. The probe is injected, so the decision logic is
 * testable without a network, a proxy or a browser.
 */

/** The URL the probe requests; a forwarding port answers it with `204`. */
export const PROBE_URL = "https://www.google.com/generate_204";

/** The status a forwarding port returns for `PROBE_URL`. Module-local: only the
 * resolver compares against it, and an exported constant nobody imports is dead
 * weight knip reports as an unused export. */
const PROBE_OK = "204";

/** Per-port budget. A dead port fails instantly; a hung one must not stall. */
export const PROBE_TIMEOUT_S = 5;

/**
 * Whole-run budget, checked before each probe.
 *
 * Without it the worst case is `candidates × attempts × PROBE_TIMEOUT_S`: a
 * machine with a few hung listeners turns `git push` into minutes of silence
 * that look like a hang rather than a failed resolution.
 */
export const PROBE_BUDGET_S = 15;

const MIN_PORT = 1024;
const MAX_PORT = 65535;

function toPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return null;
  return port;
}

/**
 * The URL a resolved port is addressed at. One place, because the same string is
 * needed for the probe, for `git -c` and for the exported environment.
 *
 * @param {number} port
 * @returns {string}
 */
export function proxyUrl(port) {
  return `http://127.0.0.1:${port}`;
}

/**
 * Ports the OS system-proxy settings name, in the order they should be tried.
 * `scutil --proxy` reports 0 for a disabled protocol, which is not a port.
 *
 * These come first because they are what every other tool on the machine
 * follows (browsers, git's own config, semgrep) — if one of them works, it is
 * the port the rest of the environment already agrees on.
 *
 * @param {string} scutilOutput - Raw `scutil --proxy` output
 * @returns {number[]} Ports, deduplicated, disabled protocols dropped
 */
export function candidatePortsFromScutil(scutilOutput) {
  const ports = [];
  for (const key of ["HTTPPort", "HTTPSPort", "SOCKSPort"]) {
    const match = scutilOutput.match(new RegExp(`\\b${key}\\s*:\\s*(\\d+)`));
    if (!match) continue;
    const port = toPort(match[1]);
    if (port !== null) ports.push(port);
  }
  return [...new Set(ports)];
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
  for (const line of netstatOutput.split("\n")) {
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
 * @param {{ scutilOutput?: string, netstatOutput?: string }} sources
 * @returns {number[]} Ports, deduplicated, preferred order preserved
 */
export function candidatePorts({ scutilOutput = "", netstatOutput = "" }) {
  return [
    ...new Set([
      ...candidatePortsFromScutil(scutilOutput),
      ...candidatePortsFromNetstat(netstatOutput),
    ]),
  ];
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
 * @param {{
 *   candidates: number[],
 *   probe: (port: number) => Promise<string> | string,
 *   attempts?: number,
 *   budgetMs?: number,
 *   now?: () => number,
 * }} input
 * @returns {Promise<{
 *   port: number|null,
 *   tried: { port: number, code: string }[],
 *   budgetExhausted: boolean,
 * }>}
 *   `port` is `null` when no candidate forwarded traffic. `tried` is returned
 *   either way: a failure has to be reportable as the probes that produced it,
 *   and a caller that only gets `null` can say nothing but "no proxy found".
 */
export async function resolveProxyPort({
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
      const code = await probe(port);
      tried.push({ port, code });
      if (code === PROBE_OK) return { port, tried, budgetExhausted: false };
    }
  }
  return { port: null, tried, budgetExhausted: false };
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
