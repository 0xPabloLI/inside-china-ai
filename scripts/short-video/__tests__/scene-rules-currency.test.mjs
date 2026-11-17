/**
 * Currency dual-annotation advisory (#1415).
 *
 * The verify-time net is advisory by design (#763): it reports the first
 * offending amount and how many more exist, never reaching pass/warn/fail and
 * never changing the exit code.
 */
import { describe, it, expect } from "vitest";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const currencyFindings = (scenes) =>
  runAllSceneDataChecks(scenes, {}, {}).editorial.filter(
    (f) => f.check.startsWith("Currency dual-annotation") && f.severity !== "pass",
  );

describe("checkCurrencyDualAnnotation", () => {
  it("flags a Chinese 亿元 amount with no USD equivalent", () => {
    const findings = currencyFindings([{ id: 1, voiceover: "估值为 3,500 亿元" }]);

    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("advisory");
    expect(findings[0].severity).toBe("warn");
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
