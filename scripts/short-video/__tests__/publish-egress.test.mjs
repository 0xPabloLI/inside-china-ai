/**
 * Browser egress-region gate (#964).
 *
 * The 2026-10-25 CDP post was the first one published through the web Studio
 * and sat at 0 plays; its browser exited from Tokyo (216.23.83.116) while the
 * account's target route was Singapore. These tests pin the decision, not the
 * network: a mismatch blocks `--publish`, a prepare-only run warns, and a
 * probe that cannot determine the country fails closed for `--publish`.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_EXPECTED_REGION,
  EGRESS_TRACE_URL,
  evaluateEgress,
  isExpectedRegion,
  isRegionCode,
  parseCloudflareTrace,
  probeEgressRegion,
} from "../lib/publish-egress.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TRACE_JP = [
  "fl=123abc",
  "h=www.cloudflare.com",
  "ip=216.23.83.116",
  "ts=1761350400.000",
  "visit_scheme=https",
  "uag=Mozilla/5.0",
  "colo=NRT",
  "sliver=none",
  "http=http/2",
  "loc=JP",
  "tls=TLSv1.3",
  "sni=plaintext",
  "warp=off",
  "gateway=off",
  "rbi=off",
  "kex=X25519",
].join("\n");

describe("parseCloudflareTrace", () => {
  it("parses ip/loc/colo from the plain-text trace", () => {
    expect(parseCloudflareTrace(TRACE_JP)).toMatchObject({
      ip: "216.23.83.116",
      loc: "JP",
      colo: "NRT",
    });
  });

  it("normalises a lowercase loc", () => {
    expect(parseCloudflareTrace("ip=1.2.3.4\nloc=sg\ncolo=SIN\n")).toMatchObject({
      ip: "1.2.3.4",
      loc: "SG",
      colo: "SIN",
    });
  });

  it("returns null when the payload has neither ip nor loc", () => {
    expect(parseCloudflareTrace("<!doctype html><html>nope</html>")).toBeNull();
    expect(parseCloudflareTrace("")).toBeNull();
    expect(parseCloudflareTrace(null)).toBeNull();
  });
});

describe("evaluateEgress", () => {
  it("passes when the exit country matches the expected region", () => {
    const verdict = evaluateEgress({
      expectedRegion: "SG",
      trace: parseCloudflareTrace("ip=1.2.3.4\nloc=SG\ncolo=SIN\n"),
      publish: true,
    });
    expect(verdict).toMatchObject({
      status: "ok",
      level: "ok",
      expectedRegion: "SG",
      actualRegion: "SG",
      ip: "1.2.3.4",
    });
  });

  it("blocks --publish on a mismatched country", () => {
    const verdict = evaluateEgress({
      expectedRegion: "SG",
      trace: parseCloudflareTrace(TRACE_JP),
      publish: true,
    });
    expect(verdict.status).toBe("mismatch");
    expect(verdict.level).toBe("block");
    expect(verdict.actualRegion).toBe("JP");
    expect(verdict.reason).toMatch(/JP/);
    expect(verdict.reason).toMatch(/SG/);
  });

  it("warns but does not block a prepare-only run on a mismatch", () => {
    const verdict = evaluateEgress({
      expectedRegion: "SG",
      trace: parseCloudflareTrace(TRACE_JP),
      publish: false,
    });
    expect(verdict.status).toBe("mismatch");
    expect(verdict.level).toBe("warn");
  });

  it("fails closed for --publish when the probe could not be resolved", () => {
    const verdict = evaluateEgress({
      expectedRegion: "SG",
      trace: null,
      reachable: false,
      reason: "timed out after 12000ms",
      publish: true,
    });
    expect(verdict.status).toBe("unknown");
    expect(verdict.level).toBe("block");
    expect(verdict.reason).toMatch(/timed out/);
  });

  it("only warns a prepare-only run when the probe failed", () => {
    const verdict = evaluateEgress({
      expectedRegion: "SG",
      reachable: false,
      publish: false,
    });
    expect(verdict.status).toBe("unknown");
    expect(verdict.level).toBe("warn");
  });

  it("treats Cloudflare's XX as unknown, not as a match", () => {
    const verdict = evaluateEgress({
      expectedRegion: "SG",
      trace: parseCloudflareTrace("ip=1.2.3.4\nloc=XX\ncolo=SIN\n"),
      publish: true,
    });
    expect(verdict.status).toBe("unknown");
    expect(verdict.level).toBe("block");
  });

  it("uses SG as the documented default region", () => {
    const verdict = evaluateEgress({
      expectedRegion: undefined,
      trace: parseCloudflareTrace("ip=1.2.3.4\nloc=SG\ncolo=SIN\n"),
      publish: true,
    });
    expect(DEFAULT_EXPECTED_REGION).toBe("SG");
    expect(verdict.expectedRegion).toBe("SG");
    expect(verdict.level).toBe("ok");
  });

  it("throws on a malformed expected region instead of falling back to SG", () => {
    expect(() =>
      evaluateEgress({
        expectedRegion: "SGP",
        trace: parseCloudflareTrace(TRACE_JP),
        publish: true,
      }),
    ).toThrow(/invalid expected region/);
  });

  it("rejects Cloudflare's XX sentinel as a target region", () => {
    expect(() =>
      evaluateEgress({
        expectedRegion: "XX",
        trace: parseCloudflareTrace(TRACE_JP),
        publish: true,
      }),
    ).toThrow(/invalid expected region/);
  });
});

describe("isRegionCode", () => {
  it("accepts two-letter codes in either case and rejects everything else", () => {
    expect(isRegionCode("SG")).toBe(true);
    expect(isRegionCode("sg")).toBe(true);
    expect(isRegionCode("JP")).toBe(true);
    expect(isRegionCode("SGP")).toBe(false);
    expect(isRegionCode("")).toBe(false);
    expect(isRegionCode(null)).toBe(false);
    expect(isRegionCode("S1")).toBe(false);
  });
});

describe("isExpectedRegion", () => {
  it("accepts real regions and rejects Cloudflare's XX sentinel", () => {
    expect(isExpectedRegion("SG")).toBe(true);
    expect(isExpectedRegion("sg")).toBe(true);
    expect(isExpectedRegion("JP")).toBe(true);
    expect(isExpectedRegion("XX")).toBe(false);
    expect(isExpectedRegion("SGP")).toBe(false);
    expect(isExpectedRegion(null)).toBe(false);
  });
});

describe("probeEgressRegion", () => {
  it("opens the trace URL in the browser, reads it, and closes the tab", async () => {
    const closeTab = vi.fn();
    const result = await probeEgressRegion({
      newTab: async (url) => {
        expect(url).toBe(EGRESS_TRACE_URL);
        return "tab-1";
      },
      readText: async (tab) => {
        expect(tab).toBe("tab-1");
        return TRACE_JP;
      },
      closeTab,
    });

    expect(result.reachable).toBe(true);
    expect(result.trace).toMatchObject({ ip: "216.23.83.116", loc: "JP", colo: "NRT" });
    expect(closeTab).toHaveBeenCalledWith("tab-1");
  });

  it("reports unreachable and still closes the tab when the read fails", async () => {
    const closeTab = vi.fn();
    const result = await probeEgressRegion({
      newTab: async () => "tab-2",
      readText: async () => {
        throw new Error("page script failed");
      },
      closeTab,
    });

    expect(result.reachable).toBe(false);
    expect(result.trace).toBeNull();
    expect(result.reason).toMatch(/page script failed/);
    expect(closeTab).toHaveBeenCalledWith("tab-2");
  });

  it("times out instead of hanging, and closes a tab that arrives late", async () => {
    vi.useFakeTimers();
    try {
      const closeTab = vi.fn();
      let resolveTab;
      const probe = probeEgressRegion({
        newTab: () =>
          new Promise((resolve) => {
            resolveTab = resolve;
          }),
        readText: async () => "ip=1.2.3.4\nloc=SG\n",
        closeTab,
        timeoutMs: 5,
      });

      await vi.advanceTimersByTimeAsync(6);
      const result = await probe;
      expect(result.reachable).toBe(false);
      expect(result.reason).toMatch(/timed out/);

      // The tab arrives after the timeout; the abandoned branch must close it.
      resolveTab("tab-late");
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(closeTab).toHaveBeenCalledWith("tab-late");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the upload driver wires the gate before the upload page", () => {
  const source = readFileSync(join(__dirname, "..", "tiktok-upload-prep.mjs"), "utf8");

  it("calls the probe and the decision function", () => {
    expect(source).toContain("probeEgressRegion(");
    expect(source).toContain("evaluateEgress(");
  });

  it("runs the gate before the first upload-page navigation", () => {
    const probeAt = source.indexOf("probeEgressRegion(");
    const uploadAt = source.indexOf("cdpNewTab(UPLOAD_URL)");
    expect(probeAt).toBeGreaterThan(0);
    expect(uploadAt).toBeGreaterThan(0);
    expect(probeAt).toBeLessThan(uploadAt);
  });

  it("documents the region flag in the CLI help", () => {
    expect(source).toContain("--expect-region");
    expect(source).toContain("isExpectedRegion(");
  });
});
