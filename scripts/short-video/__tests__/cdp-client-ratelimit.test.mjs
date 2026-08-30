import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #89 P0 integration: cdpNewTab consults the rate limiter before navigating.
// The rate-limiter module is mocked so this file tests only the wiring
// (contract preservation + skip propagation); limiter behavior lives in
// rate-limiter.test.mjs.
const { waitMock } = vi.hoisted(() => ({
  waitMock: vi.fn(),
}));

vi.mock("../lib/rate-limiter.mjs", () => ({
  createRateLimiter: () => ({ wait: waitMock }),
  SITE_RATE_CONFIG: {},
  WINDOW_MS: 3_600_000,
  MAX_WAIT_MS: 600_000,
  matchDomain: () => "_default",
}));

import { cdpNewTab, CDP_BASE } from "../lib/cdp-client.mjs";

describe("cdpNewTab + rate limiter", () => {
  beforeEach(() => {
    waitMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scenario 16: consults the limiter with the URL, then opens the tab on pass — contract unchanged", async () => {
    waitMock.mockResolvedValue({ action: "pass", waitedMs: 0, domain: "google.com" });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ targetId: "tab_abc123" }),
    });

    const tabId = await cdpNewTab("https://google.com/search?q=DeepSeek");
    expect(tabId).toBe("tab_abc123");
    expect(waitMock).toHaveBeenCalledWith("https://google.com/search?q=DeepSeek");
    expect(global.fetch).toHaveBeenCalledWith(
      `${CDP_BASE}/new`,
      expect.objectContaining({ method: "POST", body: "https://google.com/search?q=DeepSeek" }),
    );
  });

  it("scenario 9: limiter skip propagates as an error (callers' catch degrades to fallback chain)", async () => {
    waitMock.mockResolvedValue({ action: "skip", waitedMs: 0, domain: "google.com" });

    await expect(cdpNewTab("https://google.com/search?q=DeepSeek")).rejects.toThrow(/google\.com/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
