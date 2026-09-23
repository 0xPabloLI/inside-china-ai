import { describe, it, expect } from "vitest";

import { verdictReason } from "../selector-health.mjs";

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
