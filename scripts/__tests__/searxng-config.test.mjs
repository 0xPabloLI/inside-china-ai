import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  readEngineStates,
  renderTemplate,
  redactSecret,
  diffEngines,
  TEMPLATE_PATH,
} from "../searxng/config.mjs";

const SAMPLE = `use_default_settings: true
server:
  secret_key: "REAL-SECRET"
engines:
  - name: "google"
    disabled: false
  - name: "baidu"
    disabled: true
`;

describe("readEngineStates", () => {
  it("parses every explicit enable/disable pair", () => {
    const s = readEngineStates(SAMPLE);
    expect(s.get("google")).toBe(false);
    expect(s.get("baidu")).toBe(true);
  });
});

describe("renderTemplate", () => {
  it("injects the two untracked values and leaves no placeholder", () => {
    const out = renderTemplate(SAMPLE.replace(/REAL-SECRET/, "${SEARXNG_SECRET_KEY}"), {
      secretKey: "REAL-SECRET",
      proxyEndpoint: "192.168.5.2:7890",
    });
    expect(out).toContain('secret_key: "REAL-SECRET"');
    expect(out).not.toContain("${SEARXNG_");
  });

  it("refuses to render with a missing value rather than guessing", () => {
    expect(() => renderTemplate(SAMPLE, { secretKey: "", proxyEndpoint: "1.2.3.4:1" })).toThrow(
      /secretKey/,
    );
    expect(() => renderTemplate(SAMPLE, { secretKey: "s", proxyEndpoint: "" })).toThrow(
      /proxyEndpoint/,
    );
  });
});

describe("diffEngines", () => {
  it("PASS: identical engine lists never report drift", () => {
    expect(diffEngines(SAMPLE, SAMPLE)).toEqual({ drifted: [], missingFromLive: [] });
  });

  it("FAIL: an engine toggled by hand is named", () => {
    const live = SAMPLE.replace(
      `  - name: "baidu"\n    disabled: true`,
      `  - name: "baidu"\n    disabled: false`,
    );
    const { drifted } = diffEngines(SAMPLE, live);
    expect(drifted).toHaveLength(1);
    expect(drifted[0]).toMatchObject({ name: "baidu", template: true, live: false });
  });

  it("reports an engine entry absent from the live file", () => {
    const live = SAMPLE.replace(`  - name: "google"\n    disabled: false\n`, "");
    expect(diffEngines(SAMPLE, live).missingFromLive).toEqual(["google"]);
  });

  it("never treats a different secret or proxy endpoint as ledger drift", () => {
    const live = SAMPLE.replace("REAL-SECRET", "OTHER-SECRET");
    expect(diffEngines(SAMPLE, live)).toEqual({ drifted: [], missingFromLive: [] });
  });
});

describe("redactSecret", () => {
  it("hides the secret value", () => {
    expect(redactSecret(SAMPLE)).not.toContain("REAL-SECRET");
  });
});

describe("tracked template", () => {
  it("carries placeholders, not this machine's secret or endpoint", () => {
    const t = readFileSync(TEMPLATE_PATH, "utf8");
    expect(t).toContain("${SEARXNG_SECRET_KEY}");
    expect(t).toContain("${SEARXNG_PROXY_ENDPOINT}");
    expect(t).not.toMatch(/192\.168\.\d+\.\d+:\d+/);
  });

  it("keeps the ledger's measured shape: 188 entries with the audited disables", () => {
    const s = readEngineStates(readFileSync(TEMPLATE_PATH, "utf8"));
    expect(s.size).toBe(188);
    expect(s.get("google")).toBe(false);
    expect(s.get("sogou")).toBe(true);
    expect(s.get("baidu")).toBe(true);
    expect([...s.values()].filter(Boolean)).toHaveLength(20);
  });
});
