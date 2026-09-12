import { describe, it, expect, vi } from "vitest";

import { recordRateLimitSkip } from "../lib/asset-sourcer.mjs";
import { RateLimitedSkipError } from "../lib/cdp-client.mjs";

// ─── #249: rate-limited source skips are recorded, not swallowed ───

describe("recordRateLimitSkip", () => {
  it("returns true and records a skipped entry for RateLimitedSkipError", () => {
    const skipped = [];
    const logger = { warn: vi.fn() };
    const err = new RateLimitedSkipError("google.com", "Rate limited: google.com — skipped");

    const handled = recordRateLimitSkip(err, {
      sourceName: "baidu_search",
      keyword: "DeepSeek",
      skipped,
      logger,
    });

    expect(handled).toBe(true);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ source: "baidu_search", keyword: "DeepSeek" });
    expect(skipped[0].reason).toContain("google.com");
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("baidu_search"));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("DeepSeek"));
  });

  it("also matches duck-typed errors with name === 'RateLimitedSkipError'", () => {
    const skipped = [];
    const err = new Error("Rate limited: bing.com — navigation skipped");
    err.name = "RateLimitedSkipError";
    err.domain = "bing.com";

    const handled = recordRateLimitSkip(err, {
      sourceName: "bing_news",
      keyword: "AI",
      skipped,
      logger: console,
    });

    expect(handled).toBe(true);
    expect(skipped[0].reason).toContain("bing.com");
  });

  it("returns false for transport errors — callers rethrow or degrade normally", () => {
    const skipped = [];
    const handled = recordRateLimitSkip(new Error("proxy down"), {
      sourceName: "ithome",
      keyword: "AI",
      skipped,
      logger: console,
    });
    expect(handled).toBe(false);
    expect(skipped).toHaveLength(0);
  });

  it("returns false for non-error input", () => {
    expect(
      recordRateLimitSkip(null, { sourceName: "x", keyword: "y", skipped: [], logger: console }),
    ).toBe(false);
  });
});
