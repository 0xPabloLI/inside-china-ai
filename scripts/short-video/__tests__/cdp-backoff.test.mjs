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
  runPageGates,
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

/**
 * #346（2026-10-07）：登录门必须跑在反爬词表之前。
 *
 * 假判决形态（#269 Round I xhs 实测）：未登录的搜索页是「登录后查看搜索结果」
 * 面板，面板里「获取验证码」按钮的文案命中反爬词表（验证码）——旧顺序
 * detectAntiBot 先行，于是「该引导登录」被报成「站点弹验证码」，把修复路径
 * 引向风控手册而不是提示人工登录。
 *
 * 修法：这条顺序收进共享 seam（runPageGates），两个调用点（selector-health
 * checkSource / search-sources collectFromCdp）都只能从这里走——旧代码是两份
 * 各自手写的顺序，这正是它能漂移的原因。反爬检查没有被删掉：登录门未命中
 * （登录态正常，或源没有登录门）时它照跑，真插页仍然被捕获。
 */
describe("runPageGates — 登录门先于反爬判定的共享顺序 (#346)", () => {
  /** 记录调用参数与顺序的测试替身。 */
  function recorder(result) {
    const calls = [];
    return {
      calls,
      fn: async (...args) => {
        calls.push(...args);
        return result;
      },
    };
  }

  it("needsAuth 源未登录：登录门命中即返回登录类判决，反爬检查根本不该跑", async () => {
    const antiBot = recorder("验证码");
    const gate = await runPageGates({
      tabId: "t1",
      needsAuth: true,
      loginCheckScript: "return 'ok'",
      deps: { loginFn: async () => "need_login", antiBotFn: antiBot.fn },
    });
    expect(gate).toEqual({ gate: "login", status: "need_login" });
    // 核心回归锚：旧顺序下这里先命中「验证码」，源被错判成 anti_bot。
    expect(antiBot.calls).toEqual([]);
  });

  it("登录态正常 + 真插页：反爬仍被捕获，且登录门先被问过（顺序锚）", async () => {
    const order = [];
    const gate = await runPageGates({
      tabId: "t1",
      needsAuth: true,
      loginCheckScript: "return 'ok'",
      deps: {
        loginFn: async () => {
          order.push("login");
          return "ok";
        },
        antiBotFn: async () => {
          order.push("antiBot");
          return "captcha";
        },
      },
    });
    expect(gate).toEqual({ gate: "anti_bot", status: "captcha" });
    expect(order).toEqual(["login", "antiBot"]);
  });

  it("登录脚本自己报 captcha（脚本级验证码）时也走登录门，优先于反爬词表", async () => {
    const antiBot = recorder("验证码");
    const gate = await runPageGates({
      tabId: "t1",
      needsAuth: true,
      loginCheckScript: "return 'ok'",
      deps: { loginFn: async () => "captcha", antiBotFn: antiBot.fn },
    });
    expect(gate).toEqual({ gate: "login", status: "captcha" });
    expect(antiBot.calls).toEqual([]);
  });

  it("needsAuth 但没有 loginCheckScript：没有登录门可等，反爬照常（fail-open）", async () => {
    const antiBot = recorder("验证码");
    const login = recorder("need_login");
    const gate = await runPageGates({
      tabId: "t1",
      needsAuth: true,
      loginCheckScript: null,
      deps: { loginFn: login.fn, antiBotFn: antiBot.fn },
    });
    expect(gate).toEqual({ gate: "anti_bot", status: "验证码" });
    expect(login.calls).toEqual([]);
  });

  it("非 needsAuth 源即使注册了 loginCheckScript 也不跑登录门（sogou 形态）", async () => {
    const login = recorder("captcha");
    const antiBot = recorder(null);
    const gate = await runPageGates({
      tabId: "t1",
      needsAuth: false,
      loginCheckScript: "return 'ok'",
      deps: { loginFn: login.fn, antiBotFn: antiBot.fn },
    });
    expect(gate).toBeNull();
    expect(login.calls).toEqual([]);
    expect(antiBot.calls).toEqual(["t1"]);
  });

  it("干净页面（登录 ok、无插页）⇒ null，两个门都问过且顺序不变", async () => {
    const order = [];
    const gate = await runPageGates({
      tabId: "t1",
      needsAuth: true,
      loginCheckScript: "return 'ok'",
      deps: {
        loginFn: async () => {
          order.push("login");
          return "ok";
        },
        antiBotFn: async () => {
          order.push("antiBot");
          return null;
        },
      },
    });
    expect(gate).toBeNull();
    expect(order).toEqual(["login", "antiBot"]);
  });

  it("实测样本：xhs 登录面板文案本身就命中反爬词表（这就是顺序必须固定的原因）", () => {
    // 2026-10-07 实测：真实页面脚本在「登录后查看搜索结果 / 获取验证码」页面上
    // 取出的样本，经 matchAntiBotIndicators 命中「验证码」。
    expect(matchAntiBotIndicators("登录后查看搜索结果\n获取验证码")).toBe("验证码");
  });
});
