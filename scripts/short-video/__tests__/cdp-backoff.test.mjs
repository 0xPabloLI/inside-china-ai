/**
 * #89 P1 (issue #140): escalating random backoff for CDP retries.
 *
 * Retry schedule: 3-5s → 6-10s → 12-20s, then give up. HTTP 429/503 backs
 * off an order of magnitude longer. The seams (extractFn/sleepFn) keep the
 * retry loop testable without a live CDP proxy.
 */
import { describe, it, expect } from "vitest";
import {
  ANTI_BOT_CHECK_SCRIPT,
  BACKOFF_RANGES_MS,
  RATE_LIMIT_BACKOFF_MS,
  backoffDelayMs,
  rateLimitBackoffDelayMs,
  extractWithRetry,
  matchAntiBotIndicators,
  detectAntiBot,
  parseAntiBotSample,
  ScriptError,
} from "../lib/cdp-client.mjs";

describe("backoffDelayMs", () => {
  it("delays fall inside the per-attempt ranges", () => {
    for (let i = 0; i < 50; i++) {
      expect(backoffDelayMs(1)).toBeGreaterThanOrEqual(3000);
      expect(backoffDelayMs(1)).toBeLessThanOrEqual(5000);
      expect(backoffDelayMs(2)).toBeGreaterThanOrEqual(6000);
      expect(backoffDelayMs(2)).toBeLessThanOrEqual(10000);
      expect(backoffDelayMs(3)).toBeGreaterThanOrEqual(12000);
      expect(backoffDelayMs(3)).toBeLessThanOrEqual(20000);
    }
  });

  it("returns null (give up) beyond the third retry", () => {
    expect(backoffDelayMs(4)).toBeNull();
    expect(backoffDelayMs(0)).toBeNull();
  });

  it("respects the RNG seam", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(3000);
    expect(backoffDelayMs(1, () => 1)).toBe(5000);
    expect(backoffDelayMs(3, () => 0.5)).toBe(16000);
  });
});

describe("rateLimitBackoffDelayMs", () => {
  it("backs off an order of magnitude longer than normal retries", () => {
    for (let i = 0; i < 50; i++) {
      const delay = rateLimitBackoffDelayMs();
      expect(delay).toBeGreaterThanOrEqual(RATE_LIMIT_BACKOFF_MS[0]);
      expect(delay).toBeLessThanOrEqual(RATE_LIMIT_BACKOFF_MS[1]);
      expect(delay).toBeGreaterThan(BACKOFF_RANGES_MS[2][1]);
    }
  });
});

describe("extractWithRetry", () => {
  it("returns first successful extraction without sleeping", async () => {
    const sleeps = [];
    let calls = 0;
    const articles = await extractWithRetry("t1", "script", {
      extractFn: async () => (++calls === 1 ? [{ title: "a" }] : []),
      sleepFn: async (ms) => sleeps.push(ms),
    });
    expect(articles).toEqual([{ title: "a" }]);
    expect(sleeps).toEqual([]);
    expect(calls).toBe(1);
  });

  it("retries with escalating delays and stops at first success", async () => {
    const sleeps = [];
    let calls = 0;
    const articles = await extractWithRetry("t1", "script", {
      extractFn: async () => (++calls < 3 ? [] : [{ title: "late" }]),
      sleepFn: async (ms) => sleeps.push(ms),
    });
    expect(articles).toEqual([{ title: "late" }]);
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(6000);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  it("gives up after 3 retries (4 extractions total) and returns empty", async () => {
    const sleeps = [];
    let calls = 0;
    const articles = await extractWithRetry("t1", "script", {
      extractFn: async () => {
        calls++;
        return [];
      },
      sleepFn: async (ms) => sleeps.push(ms),
    });
    expect(articles).toEqual([]);
    expect(calls).toBe(4); // initial + 3 retries
    expect(sleeps).toHaveLength(3);
  });

  it("#308: a ScriptError stops retrying immediately (broken script ≠ empty page)", async () => {
    const sleeps = [];
    let calls = 0;
    await expect(
      extractWithRetry("t1", "script", {
        extractFn: async () => {
          calls++;
          throw new ScriptError("ReferenceError: boom is not defined");
        },
        sleepFn: async (ms) => sleeps.push(ms),
      }),
    ).rejects.toThrow("boom is not defined");
    expect(calls).toBe(1); // no backoff retries for a broken script
    expect(sleeps).toEqual([]); // no exponential backoff waits either
  });
});

describe("matchAntiBotIndicators (#89 P2)", () => {
  it("detects the issue's indicator set", () => {
    expect(matchAntiBotIndicators("Unusual traffic from your computer network")).toBe(
      "unusual traffic",
    );
    expect(matchAntiBotIndicators("请输入验证码继续")).toBe("验证码");
    expect(matchAntiBotIndicators("完成人机验证以继续访问")).toBe("人机验证");
    expect(matchAntiBotIndicators("Access Denied — you are blocked")).toBe("access denied");
    expect(matchAntiBotIndicators("HTTP 429 Too Many Requests")).toBe("429");
    expect(matchAntiBotIndicators("Error: precondition failed")).toBe("precondition failed");
    expect(matchAntiBotIndicators("Solve this captcha to continue")).toBe("captcha");
  });

  it("matches 'robot' only on explicit interstitial phrases, not article prose", () => {
    // False-positive guard: AI news legitimately discusses robots
    expect(
      matchAntiBotIndicators("Robots learned to dance — OpenAI released a new model"),
    ).toBeNull();
    expect(matchAntiBotIndicators("Are you a robot? Complete the check below")).toBe("robot");
    expect(matchAntiBotIndicators("Robot check required")).toBe("robot");
  });

  it("returns null on clean pages and empty input", () => {
    expect(matchAntiBotIndicators("DeepSeek 发布新模型，跑分超越前代")).toBeNull();
    expect(matchAntiBotIndicators("")).toBeNull();
    expect(matchAntiBotIndicators(undefined)).toBeNull();
  });

  it("requires 429 to be a token, not a digit run inside a number", () => {
    // A bare `.includes("429")` fires on view counts, prices and ids.
    expect(matchAntiBotIndicators("4290 views on this video")).toBeNull();
    expect(matchAntiBotIndicators("order id 1429 shipped")).toBeNull();
    expect(matchAntiBotIndicators("HTTP 429 Too Many Requests")).toBe("429");
  });
});

describe("detectAntiBot (#89 P2)", () => {
  it("returns the matched indicator from the CDP eval result", async () => {
    const hit = await detectAntiBot("t1", {
      evalFn: async () => ({ result: { value: "Unusual traffic from your network" } }),
    });
    expect(hit).toBe("unusual traffic");
  });

  it("fail-opens: eval errors and non-string values are treated as clean", async () => {
    expect(
      await detectAntiBot("t1", {
        evalFn: async () => {
          throw new Error("eval failed");
        },
      }),
    ).toBeNull();
    expect(
      await detectAntiBot("t1", { evalFn: async () => ({ result: { value: 42 } }) }),
    ).toBeNull();
  });

  it("reads the structured sample: clean text + hidden captcha widget is clean", async () => {
    // Regression, measured 2026-09-23: techcrunch / guancha / thepaper / xhs /
    // douyin all embed an invisible captcha container (or merely use "captcha"
    // in a class name). The old script appended a literal " captcha-dom" marker
    // to the text sample, which then matched the `captcha` substring — so these
    // five healthy sources were labelled anti-bot and the CDP layer returned
    // before extraction ever ran.
    const value = JSON.stringify({ text: "TechCrunch search results", captchaVisible: false });
    expect(await detectAntiBot("t1", { evalFn: async () => ({ result: { value } }) })).toBeNull();
  });

  it("still reports a visible captcha widget, under its own label", async () => {
    const value = JSON.stringify({ text: "搜索", captchaVisible: true });
    expect(
      await detectAntiBot("t1", {
        evalFn: async () => ({ result: { value } }),
        allowDomHint: true,
      }),
    ).toBe("captcha-dom");
    // Text evidence still wins when both are present.
    const both = JSON.stringify({ text: "请输入验证码", captchaVisible: true });
    expect(await detectAntiBot("t1", { evalFn: async () => ({ result: { value: both } }) })).toBe(
      "验证码",
    );
  });

  it("keeps the weak DOM hint opt-in, so a widget alone cannot fail the layer", async () => {
    // Evidence asymmetry: text describes an interstitial; a widget may just be
    // the site's own form furniture (techcrunch / guancha both embed one on a
    // page that renders results fine).
    const value = JSON.stringify({
      text: "You searched for AI | TechCrunch",
      captchaVisible: true,
    });
    expect(await detectAntiBot("t1", { evalFn: async () => ({ result: { value } }) })).toBeNull();
    expect(
      await detectAntiBot("t1", {
        evalFn: async () => ({ result: { value } }),
        allowDomHint: false,
      }),
    ).toBeNull();
  });

  it("gates the DOM hint on element size, never on a class name alone", () => {
    // The page script must ask for real layout before treating a captcha
    // container as an interstitial.
    expect(ANTI_BOT_CHECK_SCRIPT).toContain("getBoundingClientRect");
    expect(ANTI_BOT_CHECK_SCRIPT).toContain("captchaVisible");
  });

  it("parseAntiBotSample keeps both the JSON and the legacy string shapes", () => {
    expect(parseAntiBotSample(JSON.stringify({ text: "abc", captchaVisible: true }))).toEqual({
      text: "abc",
      captchaVisible: true,
    });
    // Pre-JSON shape (and old stubs) must keep working.
    expect(parseAntiBotSample("plain sample")).toEqual({
      text: "plain sample",
      captchaVisible: false,
    });
    // Malformed JSON falls back to treating the raw value as text.
    expect(parseAntiBotSample("{not json")).toEqual({ text: "{not json", captchaVisible: false });
    expect(parseAntiBotSample(42)).toEqual({ text: "", captchaVisible: false });
  });
});
