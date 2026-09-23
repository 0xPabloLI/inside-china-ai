import { describe, it, expect } from "vitest";

import { verdictReason, apiFailureVerdict, failureClass } from "../selector-health.mjs";

/**
 * #269 (2026-09-23): 两个「时序竞态 ⇒ 假判决」的回归锚点。
 * 判据本身是纯函数，样本就是实测值（zhihu 水合、douyin 反爬插页）。
 */
describe("verdictReason — selector-health 的判决理由", () => {
  it("有结果 ⇒ 健康（null）", () => {
    expect(verdictReason([{ title: "a" }, { title: "b" }], null)).toBe(null);
  });

  it("实测样本：zhihu 水合后 31 条卡 ⇒ 不算失败", () => {
    const zhihu = Array.from({ length: 31 }, (_, i) => ({ title: `q${i}` }));
    expect(verdictReason(zhihu, null)).toBe(null);
  });

  it("空结果 + 无晚到反爬标记 ⇒ zero_results", () => {
    expect(verdictReason([], null)).toBe("zero_results");
  });

  it("实测样本：douyin 空结果 + 晚到 `captcha` ⇒ anti_bot 优先", () => {
    expect(verdictReason([], "captcha")).toBe("anti_bot:captcha");
  });

  it("有结果时反爬标记不改变判决（标记可能是文章正文里的词）", () => {
    expect(verdictReason([{ title: "captcha 识别如何工作" }], "captcha")).toBe(null);
  });

  it("晚到标记是空字符串时退回 zero_results（不产出 `anti_bot:` 空标签）", () => {
    expect(verdictReason([], "")).toBe("zero_results");
  });
});

/**
 * #269 (2026-09-23)：第三轴曾经比第一轴更不懂凭据 —— 从不加载 .env.local、
 * 从不发 `api.headers`，于是「服务端说没给 API key」被记成「端点已死」。
 * 下面锁定的是「这个回答是关于探针还是关于源」这条界线。
 */
describe("apiFailureVerdict — api 探针失败的归因", () => {
  const cap = (over = {}) => ({ requiresApiKey: false, apiKeyEnv: null, ...over });

  it("声明需要 key 但没有 key ⇒ probe-not-authoritative（且点名是哪个变量）", () => {
    const r = apiFailureVerdict({
      status: 400,
      body: '{"message":"no api key"}',
      cap: cap({ requiresApiKey: true, apiKeyEnv: "GNEWS_API_KEY_ABSENT_FOR_TEST" }),
    });
    expect(r.reason).toBe("probe-not-authoritative");
    expect(r.missingKey).toBe("GNEWS_API_KEY_ABSENT_FOR_TEST");
  });

  it("key 已存在时不再拿它做借口（400 仍是关于端点的回答）", () => {
    process.env.KEY_PRESENT_FOR_TEST = "x";
    try {
      const r = apiFailureVerdict({
        status: 400,
        body: "bad request",
        cap: cap({ requiresApiKey: true, apiKeyEnv: "KEY_PRESENT_FOR_TEST" }),
      });
      expect(r.reason).toBe("http-dead");
      expect(r.missingKey).toBe(null);
    } finally {
      delete process.env.KEY_PRESENT_FOR_TEST;
    }
  });

  it("429（限流）与 401/403（边缘/凭据）⇒ probe-not-authoritative，不进死源台账", () => {
    for (const status of [401, 403, 429]) {
      expect(apiFailureVerdict({ status, body: "{}", cap: cap() }).reason).toBe(
        "probe-not-authoritative",
      );
    }
  });

  it("404 ⇒ http-dead：这一条是关于端点的", () => {
    expect(apiFailureVerdict({ status: 404, body: "Not Found", cap: cap() }).reason).toBe(
      "http-dead",
    );
  });
});

describe("failureClass — 只有关于源的失败才算失败", () => {
  it("有结果 ⇒ none", () => {
    expect(failureClass({ ok: true, reason: null })).toBe("none");
  });

  it("zero_results ⇒ source（选择器腐烂，走修复手册）", () => {
    expect(failureClass({ ok: false, reason: "zero_results" })).toBe("source");
  });

  it("anti_bot:captcha ⇒ probe（留给源自己，别去改选择器）", () => {
    expect(failureClass({ ok: false, reason: "anti_bot:captcha" })).toBe("probe");
  });

  it("need_login / login-wall ⇒ probe（答案取决于会话，不取决于源）", () => {
    expect(failureClass({ ok: false, reason: "need_login" })).toBe("probe");
    expect(failureClass({ ok: false, reason: "login-wall" })).toBe("probe");
  });

  it("probe-not-authoritative ⇒ probe", () => {
    expect(failureClass({ ok: false, reason: "probe-not-authoritative" })).toBe("probe");
  });

  it("network-error ⇒ source（与第一轴口径一致）", () => {
    expect(failureClass({ ok: false, reason: "network-error" })).toBe("source");
  });
});
