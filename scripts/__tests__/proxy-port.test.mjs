/**
 * The resolver's whole value is picking the port that actually forwards, so the
 * cases below are about discrimination, not about plumbing: a listener that
 * never proxies must lose to a port that does, and the recorded `tried` list
 * must explain a failure instead of leaving the caller to guess.
 */
import { describe, expect, it } from "vitest";

import {
  buildGitProxyArgs,
  buildProxyEnv,
  candidatePorts,
  candidatePortsFromNetstat,
  candidatePortsFromScutil,
  proxyUrl,
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
