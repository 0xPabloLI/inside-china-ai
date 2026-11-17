/**
 * Currency dual-annotation gate (fail-closed, 2026-11-18).
 *
 * The verify-time net used to be advisory (#763): it reported the first
 * offending amount and never changed the exit code. That let the DeepSeek pack
 * ship "0.39 YUAN" untouched. It now lives in the gate bucket and fails the
 * pre-flight; the same spelling list Step 0.5 annotates is what this net reads.
 */
import { describe, it, expect } from "vitest";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const currencyFindings = (scenes) => {
  const results = runAllSceneDataChecks(scenes, {}, {});
  return [...results.pass, ...results.warn, ...results.fail].filter(
    (f) => f.check.startsWith("Currency dual-annotation") && f.level !== "pass",
  );
};

describe("checkCurrencyDualAnnotation", () => {
  it("flags a Chinese 亿元 amount with no USD equivalent", () => {
    const findings = currencyFindings([{ id: 1, voiceover: "估值为 3,500 亿元" }]);

    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("fail");
    expect(findings[0].detail).toContain("3,500 亿元");
    expect(findings[0].detail).toContain("scene 1");
  });

  it("passes when the Chinese amount is already dual-annotated", () => {
    const findings = currencyFindings([{ id: 1, voiceover: "估值为 $49 billion (3,500 亿元)" }]);
    expect(findings).toHaveLength(0);
  });

  it("flags 万元 / 元 / ￥ forms", () => {
    const findings = currencyFindings([
      { id: 1, voiceover: "成本 120 万元" },
      { id: 2, voiceover: "客单价 1,200 元" },
      { id: 3, voiceover: "预售价 ￥1,200" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("120 万元");
    expect(findings[0].detail).toContain("另有 2 处");
  });

  it("counts '￥1,200 元' once, not twice", () => {
    const findings = currencyFindings([{ id: 1, voiceover: "预售价 ￥1,200 元" }]);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("￥1,200");
    expect(findings[0].detail).not.toContain("另有");
  });

  it("flags HKD prefix, suffix and 港币 forms", () => {
    expect(currencyFindings([{ id: 1, texts: { source: "HKEX, HK$454 CLOSE" } }])).toHaveLength(1);
    expect(currencyFindings([{ id: 1, voiceover: "80B HKD placement" }])).toHaveLength(1);
    expect(currencyFindings([{ id: 1, voiceover: "募资 80 亿港币" }])).toHaveLength(1);
  });

  it("passes the existing HK$ dual-annotation unchanged", () => {
    const findings = currencyFindings([
      { id: 1, texts: { source: "SOURCE: HKEX, $59 (HK$454) CLOSE" } },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag Chinese-number spellings or 元 words", () => {
    expect(currencyFindings([{ id: 1, voiceover: "营收三亿五千万" }])).toHaveLength(0);
    expect(currencyFindings([{ id: 1, voiceover: "AI 元数据服务" }])).toHaveLength(0);
  });
});

describe("Step 0.5 and the gate share one spelling list", () => {
  it("clears every flagged spelling after normalizeSceneData runs", async () => {
    const { normalizeSceneData } = await import("../lib/normalize-currency.mjs");
    const { DEFAULT_RATES } = await import("../lib/exchange-rates.mjs");
    const scenes = [
      {
        id: 7,
        voiceover: "营收 ¥3.5亿，成本 120 万元，票价 ￥ 1,200，佣金 500 人民币，市值 2,980 港币。",
      },
    ];

    const before = currencyFindings(scenes);
    expect(before).toHaveLength(1);
    expect(before[0].detail).toContain("另有 4 处");

    normalizeSceneData(scenes, {}, { rates: { ...DEFAULT_RATES } });
    expect(currencyFindings(scenes)).toHaveLength(0);
  });
});
