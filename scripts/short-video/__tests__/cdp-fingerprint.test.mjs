import { describe, it, expect } from "vitest";

import { classifyFingerprint, uaPlatformMatches } from "../lib/cdp-fingerprint.mjs";

const MAC_FINGERPRINT = {
  webdriver: false,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  platform: "MacIntel",
  language: "en-US",
  languages: ["en-US", "zh-CN"],
  timezone: "Asia/Shanghai",
  plugins: 5,
  hasFocus: true,
  visibility: "visible",
  viewport: { w: 1440, h: 900, dpr: 2 },
  screen: { w: 1728, h: 1117 },
  hardwareConcurrency: 10,
  deviceMemory: 8,
};

describe("uaPlatformMatches", () => {
  it("matches a real Mac Chrome", () => {
    expect(uaPlatformMatches(MAC_FINGERPRINT.userAgent, "MacIntel")).toBe(true);
  });

  it("matches Windows and Linux", () => {
    expect(uaPlatformMatches("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32")).toBe(true);
    expect(uaPlatformMatches("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64")).toBe(true);
  });

  it("rejects an OS override that only changed one half", () => {
    expect(uaPlatformMatches(MAC_FINGERPRINT.userAgent, "Win32")).toBe(false);
    expect(uaPlatformMatches("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "MacIntel")).toBe(false);
  });

  it("treats an unreadable half as a mismatch", () => {
    expect(uaPlatformMatches("", "MacIntel")).toBe(false);
    expect(uaPlatformMatches(MAC_FINGERPRINT.userAgent, "")).toBe(false);
  });
});

describe("classifyFingerprint", () => {
  it("passes a clean real-Chrome fingerprint", () => {
    const result = classifyFingerprint(MAC_FINGERPRINT);
    expect(result.ok).toBe(true);
    expect(result.note).toBeNull();
    expect(result.checks.map((c) => c.id)).toEqual([
      "webdriver",
      "ua-platform",
      "timezone",
      "languages",
    ]);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it("fails when navigator.webdriver is true", () => {
    const result = classifyFingerprint({ ...MAC_FINGERPRINT, webdriver: true });
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/webdriver/);
    expect(result.checks.find((c) => c.id === "webdriver").ok).toBe(false);
  });

  it("fails on a UA/platform mismatch", () => {
    const result = classifyFingerprint({ ...MAC_FINGERPRINT, platform: "Win32" });
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/ua-platform/);
  });

  it("fails when timezone or languages are missing", () => {
    expect(classifyFingerprint({ ...MAC_FINGERPRINT, timezone: null }).ok).toBe(false);
    expect(classifyFingerprint({ ...MAC_FINGERPRINT, languages: [] }).ok).toBe(false);
  });

  it("treats an unreadable probe as failed, not clean", () => {
    for (const bad of [null, undefined, "string", 42, []]) {
      const result = classifyFingerprint(bad);
      expect(result.ok).toBe(false);
      expect(result.checks).toEqual([{ id: "probe", ok: false, value: "unreadable" }]);
    }
  });
});
