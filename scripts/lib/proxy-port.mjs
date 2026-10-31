/**
 * Resolve which local port is *currently* proxying — by probing, not by reading
 * configuration.
 *
 * Why probing: this machine runs FlClash and Clash Verge side by side, and the
 * port a client actually binds is not the port its config file names. Observed
 * 2026-10-31: `clash-verge.yaml` declared `mixed-port: 7897` while the running
 * `verge-mihomo` held 7890/7895/7898/7899 and left 7897 empty. Whatever a
 * script reads from a config file, `lsof` or `nc` answers "is something
 * listening", never "will traffic through it actually leave the machine":
 *
 *   - `lsof -p <pid> -iTCP` is unusable here — the sandbox drops `-p` and
 *     returns the global listener list, so a filtered read looks empty;
 *   - `nc -z` proves a socket accepted a connection, which a client in Direct
 *     mode does while proxying nothing.
 *
 * The only signal that survives both is a request that can only succeed through
 * a working proxy. `generate_204` is that request: direct fails in this network
 * (`000`) and a dead port fails, so `204` means the port really forwarded.
 *
 * Everything here is pure. The probe is injected, so the decision logic is
 * testable without a network, a proxy or a browser.
 */

/** A URL whose success cannot be explained by a direct connection. */
export const PROBE_URL = "https://www.google.com/generate_204";

/** The status a working proxy returns for `PROBE_URL`. */
export const PROBE_OK = "204";

/** Per-port budget. A dead port fails instantly; a hung one must not stall. */
export const PROBE_TIMEOUT_S = 5;

const MIN_PORT = 1024;
const MAX_PORT = 65535;

function toPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return null;
  return port;
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
 * then falls through to the direct fallback and git fails with a connection
 * error that says nothing about the transient. Retrying is cheap: a refused
 * port fails in about a millisecond, so a list of dead candidates costs almost
 * nothing to walk twice.
 *
 * @param {{ candidates: number[], probe: (port: number) => Promise<string> | string, attempts?: number }} input
 * @returns {Promise<{ port: number|null, tried: { port: number, code: string }[] }>}
 *   `port` is `null` when no candidate forwarded traffic. `tried` is returned
 *   either way: a failure has to be reportable as the probes that produced it,
 *   and a caller that only gets `null` can say nothing but "no proxy found".
 */
export async function resolveProxyPort({ candidates, probe, attempts = 1 }) {
  const tried = [];
  for (const port of candidates) {
    for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
      const code = await probe(port);
      tried.push({ port, code });
      if (code === PROBE_OK) return { port, tried };
    }
  }
  return { port: null, tried };
}

/**
 * `git -c` arguments that pin both schemes at one port.
 *
 * `http.proxy` and `https.proxy` are separate keys, and an empty value means
 * "connect directly" — which is what the caller passes when nothing resolved.
 *
 * @param {number|null} port
 * @returns {string[]}
 */
export function buildGitProxyArgs(port) {
  const value = port === null ? "" : `http://127.0.0.1:${port}`;
  return ["-c", `http.proxy=${value}`, "-c", `https.proxy=${value}`];
}

/**
 * Environment for the git child process.
 *
 * Git reads its config; hooks and scanners read the environment or the macOS
 * system proxy. Exporting the resolved port is what keeps `pre-push` (semgrep,
 * osv-scanner) pointed at a port that answers, instead of at whatever stale
 * value the system settings still carry.
 *
 * @param {number|null} port
 * @returns {Record<string, string>}
 */
export function buildProxyEnv(port) {
  if (port === null) {
    // Direct: drop any inherited value rather than leave a dead one in place.
    return { HTTP_PROXY: "", HTTPS_PROXY: "", http_proxy: "", https_proxy: "" };
  }
  const value = `http://127.0.0.1:${port}`;
  return {
    HTTP_PROXY: value,
    HTTPS_PROXY: value,
    http_proxy: value,
    https_proxy: value,
  };
}
