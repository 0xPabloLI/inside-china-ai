import { describe, expect, it } from "vitest";
import { auditChartClaimAgreement } from "../lib/chart-claim-agreement.mjs";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const native = (info, extra = {}) => ({
  id: 2,
  visualType: "data",
  layout: "chart",
  voiceover: "Valuation jumped from 35 to 50 billion.",
  texts: { label: "VALUATION, $B", subtext: "$35B TO $50B", source: "SOURCE: PENGPAI" },
  info: {
    relationship: "change-over-time",
    chart: "line",
    data: [
      { label: "JAN", value: 35 },
      { label: "JUL", value: 50 },
    ],
    unit: "B",
    ...info,
  },
  ...extra,
});

const warnings = (rows) => rows.filter((row) => row.level === "warn");

describe("chart claim agreement", () => {
  it("passes a pack with no chart scenes", () => {
    const rows = auditChartClaimAgreement([{ id: 1, visualType: "hook", voiceover: "hello" }]);
    expect(rows[0].level).toBe("pass");
  });

  it("passes when a data value appears in the voiceover", () => {
    const rows = auditChartClaimAgreement([native()]);
    expect(rows).toEqual([expect.objectContaining({ level: "pass" })]);
  });

  it("passes when a data label appears in the scene text", () => {
    const rows = auditChartClaimAgreement([
      native({}, { voiceover: "The chart below tells the story." }),
    ]);
    expect(rows[0].level).toBe("pass");
  });

  it("warns when neither a label nor a value is named", () => {
    const rows = auditChartClaimAgreement([
      native(
        {},
        {
          voiceover: "The company is growing fast.",
          texts: { label: "VALUATION", subtext: "THE TREND", source: "SOURCE: PENGPAI" },
        },
      ),
    ]);
    expect(warnings(rows)[0].detail).toContain("neither a label nor a value");
  });

  it("does not let a year satisfy a small value", () => {
    const rows = auditChartClaimAgreement([
      native(
        {
          data: [
            { label: "A", value: 2 },
            { label: "B", value: 3 },
          ],
        },
        { voiceover: "In 2024 the company shipped a model.", texts: {} },
      ),
    ]);
    expect(warnings(rows)[0].detail).toContain("neither a label nor a value");
  });

  it("passes when the voiceover names the declared time window", () => {
    const rows = auditChartClaimAgreement([
      native(
        { time: { from: "2026-01", to: "2026-07" } },
        { voiceover: "Between January and July, valuation moved from 35 to 50." },
      ),
    ]);
    expect(rows[0].level).toBe("pass");
  });

  it("warns when the declared time window is absent from the voiceover", () => {
    const rows = auditChartClaimAgreement([native({ time: { from: "2026-01", to: "2026-07" } })]);
    expect(warnings(rows)[0].detail).toContain("never names its year or month");
  });

  it("anchors a three-digit label after the renderer drops decimals", () => {
    const rows = auditChartClaimAgreement([
      native(
        {
          data: [
            { label: "A", value: 150.5 },
            { label: "B", value: 200 },
          ],
        },
        {
          voiceover: "It reached 151.",
          texts: { label: "REVENUE", subtext: "THE TREND", source: "SOURCE: FILINGS" },
        },
      ),
    ]);
    expect(rows[0].level).toBe("pass");
  });

  it("passes a chart pin whose source names the window", () => {
    const rows = auditChartClaimAgreement([
      {
        id: 1,
        visualType: "hook",
        chart: { entity: "zhipu", range: { from: "2026-06-01", to: "2026-11-14" } },
        texts: { subtext: "SINCE JUNE PEAK", source: "HKEX CLOSE, NOV 12" },
      },
    ]);
    expect(rows[0].level).toBe("pass");
  });

  it("reads the hook number fields for a chart pin's unit", () => {
    const rows = auditChartClaimAgreement([
      {
        id: 1,
        visualType: "hook",
        chart: { entity: "zhipu", range: "6M" },
        texts: { bigNumber: "HK$ 2,980", source: "SOURCE: HKEX" },
      },
    ]);
    expect(rows[0].level).toBe("pass");
  });

  it("warns on a chart pin with no unit or window in any text field", () => {
    const rows = auditChartClaimAgreement([
      {
        id: 1,
        visualType: "hook",
        chart: { entity: "zhipu", range: "6M" },
        texts: { subtext: "THE STOCK", source: "SOURCE: HKEX" },
      },
    ]);
    expect(warnings(rows)[0].detail).toContain("none of its on-screen text");
  });

  it("is wired into the editorial bucket, not the blocking gates", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "hello", texts: { bigNumber: "1" } },
      native(),
      { id: 3, visualType: "cta", voiceover: "follow" },
    ];
    const results = runAllSceneDataChecks(scenes, null);
    const row = results.editorial.find((item) => item.check.includes("Chart claim agreement"));
    expect(row).toBeDefined();
    expect(row.level).toBe("advisory");
    expect(row.severity).not.toBe("fail");
    expect(results.fail.some((item) => item.check.includes("Chart claim agreement"))).toBe(false);
  });
});
