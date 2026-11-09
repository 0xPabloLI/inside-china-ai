/**
 * The resolver's whole value is picking the port that actually forwards, so the
 * cases below are about discrimination, not about plumbing: a listener that
 * never proxies must lose to a port that does, and the recorded `tried` list
 * must explain a failure instead of leaving the caller to guess.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";

import {
  buildGitProxyArgs,
  buildProxyEnv,
  candidatePorts,
  candidatePortsFromNetstat,
  candidatePortsFromScutil,
  parseScutilProxy,
  proxyUrl,
  resolveLocalProxy,
  resolveProxyPort,
} from "../lib/proxy-port.mjs";

const SCUTIL = `<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : localhost
  }
  FTPPassive : 1
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  ProxyAutoConfigEnable : 0
  SOCKSPort : 0
}`;

const NETSTAT = `Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)
tcp4       0      0  127.0.0.1.7890         *.*                    LISTEN
tcp46      0      0  *.7895                 *.*                    LISTEN
tcp4       0      0  192.168.1.5.8080       *.*                    LISTEN
tcp4       0      0  127.0.0.1.62509        127.0.0.1.7890         ESTABLISHED
tcp6       0      0  ::1.11434              *.*                    LISTEN
tcp6       0      0  fe80::1%lo0.9229       *.*                    LISTEN`;

describe("candidate ports", () => {
  it("names the system-proxy port once, even when HTTP and HTTPS agree", () => {
    expect(candidatePortsFromScutil(SCUTIL)).toEqual([7890]);
  });

  it("treats a disabled protocol (port 0) as no port", () => {
    const onlySocks = SCUTIL.replace("HTTPPort : 7890", "HTTPPort : 0").replace(
      "HTTPSPort : 7890",
      "HTTPSPort : 0",
    );
    expect(candidatePortsFromScutil(onlySocks)).toEqual([]);
  });

  it("keeps loopback and wildcard listeners, drops LAN-bound ones and non-listeners", () => {
    // 8080 is bound to a LAN address (unreachable at 127.0.0.1), 62509 is an
    // established client socket rather than a listener, and fe80:: is link-local.
    expect(candidatePortsFromNetstat(NETSTAT)).toEqual([7890, 7895, 11434]);
  });

  it("tries the system-proxy port before the rest", () => {
    expect(candidatePorts({ scutilOutput: SCUTIL, netstatOutput: NETSTAT })).toEqual([
      7890, 7895, 11434,
    ]);
  });

  it("survives both sources being unavailable", () => {
    expect(candidatePorts({})).toEqual([]);
  });
});

describe("resolving the port that actually forwards", () => {
  it("takes the first port that answers 204, and records what it skipped", async () => {
    const probed = [];
    const resolved = await resolveProxyPort({
      candidates: [7890, 7895],
      probe: (port) => {
        probed.push(port);
        return port === 7895 ? "204" : "000";
      },
    });

    expect(resolved.port).toBe(7895);
    expect(probed).toEqual([7890, 7895]);
    expect(resolved.tried).toEqual([
      { port: 7890, code: "000" },
      { port: 7895, code: "204" },
    ]);
  });

  it("stops probing once a port forwards", async () => {
    const probed = [];
    await resolveProxyPort({
      candidates: [7890, 7895, 7899],
      probe: (port) => {
        probed.push(port);
        return "204";
      },
    });
    expect(probed).toEqual([7890]);
  });

  it("reports no port with per-port evidence when nothing forwards", async () => {
    const resolved = await resolveProxyPort({
      candidates: [7890, 7895],
      probe: () => "000",
    });
    expect(resolved.port).toBeNull();
    expect(resolved.tried).toEqual([
      { port: 7890, code: "000" },
      { port: 7895, code: "000" },
    ]);
    expect(resolved.budgetExhausted).toBe(false);
  });

  it("retries a port before writing it off, so one bad probe is not a verdict", async () => {
    // Observed in the wild: the preferred port answered 204 on five consecutive
    // runs and 000 on a sixth, which demoted the resolver to another port.
    let calls = 0;
    const resolved = await resolveProxyPort({
      candidates: [7890],
      probe: () => {
        calls += 1;
        return calls === 1 ? "000" : "204";
      },
      attempts: 2,
    });

    expect(resolved.port).toBe(7890);
    expect(resolved.tried).toEqual([
      { port: 7890, code: "000" },
      { port: 7890, code: "204" },
    ]);
  });

  it("stops on the whole-run budget instead of walking every candidate", async () => {
    // A few hung listeners would otherwise cost candidates × attempts × timeout
    // and read as a hang rather than a failed resolution.
    const times = [0, 0, 500];
    const resolved = await resolveProxyPort({
      candidates: [7890, 7895],
      probe: () => "000",
      attempts: 2,
      budgetMs: 100,
      now: () => times.shift() ?? 500,
    });

    expect(resolved.port).toBeNull();
    expect(resolved.budgetExhausted).toBe(true);
    expect(resolved.tried).toHaveLength(1);
  });
});

describe("what the caller does with the answer", () => {
  it("addresses every consumer at the same loopback URL", () => {
    expect(proxyUrl(7890)).toBe("http://127.0.0.1:7890");
  });

  it("pins both schemes at the resolved URL", () => {
    expect(buildGitProxyArgs("http://127.0.0.1:7890")).toEqual([
      "-c",
      "http.proxy=http://127.0.0.1:7890",
      "-c",
      "https.proxy=http://127.0.0.1:7890",
    ]);
  });

  it("empties the proxy keys when running direct, so a pinned config cannot win", () => {
    // An empty value is git's "connect directly"; leaving `.git/config`'s value
    // in place would reproduce the failure the wrapper exists to avoid.
    expect(buildGitProxyArgs(null)).toEqual(["-c", "http.proxy=", "-c", "https.proxy="]);
  });

  it("exports the URL so hooks inherit a live value instead of a stale one", () => {
    expect(buildProxyEnv("http://127.0.0.1:7890")).toEqual({
      HTTP_PROXY: "http://127.0.0.1:7890",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      http_proxy: "http://127.0.0.1:7890",
      https_proxy: "http://127.0.0.1:7890",
    });
  });

  it("clears inherited proxy variables in the direct case", () => {
    expect(buildProxyEnv(null)).toEqual({
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      http_proxy: "",
      https_proxy: "",
    });
  });
});

describe("one parser for scutil --proxy (#1064)", () => {
  it("reports each protocol's host and port plus what macOS itself acts on", () => {
    // The fixture enables HTTPS without naming an `HTTPSProxy` host — a shape
    // observed on this host — so "enabled" is false there even though the port
    // is still a candidate.
    expect(parseScutilProxy(SCUTIL)).toEqual({
      HTTP: { enabled: true, host: "127.0.0.1", port: 7890 },
      HTTPS: { enabled: false, host: null, port: 7890 },
      SOCKS: { enabled: false, host: null, port: null },
    });
  });

  it("keeps the port of a protocol whose Enable flag is off", () => {
    // The whole reason the parser is shared: the flag is what was observed
    // lying, so candidate selection needs the port even when the flag says the
    // protocol is disabled. Only `enabled` (what macOS acts on) goes false.
    const flagOff = SCUTIL.replace("HTTPEnable : 1", "HTTPEnable : 0");
    expect(parseScutilProxy(flagOff).HTTP).toEqual({
      enabled: false,
      host: "127.0.0.1",
      port: 7890,
    });
    expect(candidatePortsFromScutil(flagOff)).toEqual([7890]);
  });

  it("treats a missing block as disabled rather than throwing", () => {
    expect(parseScutilProxy("")).toEqual({
      HTTP: { enabled: false, host: null, port: null },
      HTTPS: { enabled: false, host: null, port: null },
      SOCKS: { enabled: false, host: null, port: null },
    });
    expect(parseScutilProxy(null).HTTP.enabled).toBe(false);
  });

  it("merges a parsed dict with listeners without re-rendering it to text", () => {
    // The yt-dlp guard holds the parsed dict; the CLI holds the raw text. Same
    // candidate list either way, preferred order preserved.
    const fromText = candidatePorts({ scutilOutput: SCUTIL, listeningPorts: [7899] });
    const fromDict = candidatePorts({
      scutilProxy: parseScutilProxy(SCUTIL),
      listeningPorts: [7899],
    });
    expect(fromDict).toEqual(fromText);
    expect(fromDict).toEqual([7890, 7899]);
  });
});

describe("the whole decision in one call", () => {
  it("reads both sources, then probes in preferred order", () => {
    const probed = [];
    const resolved = resolveLocalProxy({
      readScutil: () => SCUTIL,
      readLoopback: () => [7899],
      probe: (port) => {
        probed.push(port);
        return port === 7899 ? "204" : "000";
      },
    });
    expect(resolved.port).toBe(7899);
    expect(resolved.candidates).toEqual([7890, 7899]);
    // Two attempts on the dead port before moving on: one `000` is not proof.
    expect(probed).toEqual([7890, 7890, 7899]);
  });

  it("survives a scutil read that returns null", () => {
    const resolved = resolveLocalProxy({
      readScutil: () => null,
      readLoopback: () => [7899],
      probe: () => "204",
    });
    expect(resolved.port).toBe(7899);
    expect(resolved.candidates).toEqual([7899]);
  });

  it("reports a miss with its evidence and an empty candidate list", () => {
    // Deterministic version of the CLI's exit-3 branch: no sources at all is
    // the one state a machine with a running proxy cannot mask.
    const resolved = resolveLocalProxy({
      readScutil: () => null,
      readLoopback: () => [],
      probe: () => "000",
    });
    expect(resolved).toEqual({
      port: null,
      tried: [],
      candidates: [],
      budgetExhausted: false,
    });
  });

  it("takes an already-parsed dict instead of re-reading scutil", () => {
    // The yt-dlp guard caches the `scutil` read; asking it to hand back the raw
    // text would make it parse twice.
    const resolved = resolveLocalProxy({
      scutilProxy: parseScutilProxy(SCUTIL),
      readScutil: () => {
        throw new Error("must not be consulted");
      },
      readLoopback: () => [],
      probe: () => "204",
    });
    expect(resolved.port).toBe(7890);
    expect(resolved.candidates).toEqual([7890]);
  });

  it("rejects an async probe instead of reporting a working proxy as absent", () => {
    // A Promise compares false against "204", so an async probe would turn
    // every live proxy into "nothing forwards" — the silent failure this module
    // exists to remove, reproduced by its own API. Fail loudly instead.
    expect(() => resolveProxyPort({ candidates: [7890], probe: async () => "204" })).toThrow(
      /synchronous/,
    );
  });
});

describe("the CLI the colima tunnel runs from ~/bin", () => {
  const cli = join(realpathSync(join(import.meta.dirname, "..")), "lib", "proxy-port.mjs");

  const run = (args) =>
    spawnSync("node", [cli, ...args], {
      encoding: "utf8",
      // No inherited proxy variables: the CLI's own resolution must not depend
      // on what this machine happens to run, and these cases never resolve.
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !/^(https?_proxy|HTTPS?_PROXY)$/i.test(k)),
      ),
    });

  it("prints only the answer, so a shell can capture it", () => {
    // Environment-dependent by nature: the CLI reads the real machine. Both
    // outcomes are shapes a caller can rely on — one line and nothing else, or
    // an empty stdout with the exit code carrying the verdict. The miss branch
    // itself is asserted deterministically in "the whole decision in one call".
    const result = run(["--print-port"]);
    if (result.status === 0) expect(result.stdout.trim()).toMatch(/^\d+$/);
    else expect(result.stdout).toBe("");
  });

  it("keeps the URL on one line and every diagnostic on stderr", () => {
    const result = run(["--print-url"]);
    if (result.status === 0) {
      expect(result.stdout.trim()).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    } else {
      expect(result.status).toBe(3);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("no port forwarded");
    }
  });

  it("refuses to run with no mode flag, rather than printing a guess", () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--print-port");
  });

  it("answers --help without touching the network", () => {
    const result = run(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--print-port");
  });
});
