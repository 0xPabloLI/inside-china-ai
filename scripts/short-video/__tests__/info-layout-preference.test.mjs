import { describe, expect, it } from "vitest";
import {
  INFO_LAYOUT_REVIEW,
  auditInfoLayoutPreference,
  preferredDataLayout,
} from "../lib/info-layout-preference.mjs";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const scene = (id, extra = {}) => ({
  id,
  visualType: "data",
  layout: "chart",
  ...extra,
});

describe("info layout preference", () => {
  it("encodes the 2026-11-17 blind-review result as descriptive evidence", () => {
    expect(INFO_LAYOUT_REVIEW.preference).toEqual({ native: 5, legacy: 0, tie: 1 });
    expect(INFO_LAYOUT_REVIEW.pairs).toBe(6);
    expect(INFO_LAYOUT_REVIEW.raters).toBe(1);
    expect(INFO_LAYOUT_REVIEW.confidence).toBe("descriptive");
    expect(INFO_LAYOUT_REVIEW.dimensions.clarity.deltaNativeMinusLegacy).toBeCloseTo(1.17, 2);
  });

  it("prefers native charts for relationships native charts support", () => {
    expect(preferredDataLayout("magnitude")).toBe("chart");
    expect(preferredDataLayout("change-over-time")).toBe("chart");
    expect(preferredDataLayout("part-to-whole")).toBe("chart");
  });

  it("keeps chart-card for relationships without a native chart", () => {
    expect(preferredDataLayout("correlation")).toBe("chart-card");
    expect(preferredDataLayout("flow")).toBe("chart-card");
    expect(preferredDataLayout("spatial")).toBe("chart-card");
  });

  it("keeps chart-card when no structured data exists", () => {
    expect(preferredDataLayout("magnitude", { hasStructuredData: false })).toBe("chart-card");
  });

  it("passes when all data scenes use native charts", () => {
    const rows = auditInfoLayoutPreference([scene(1), scene(2)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("pass");
    expect(rows[0].detail).toContain("2/2");
  });

  it("warns and names chart-card data scenes", () => {
    const rows = auditInfoLayoutPreference([
      scene(1),
      scene(2, { layout: "chart-card" }),
      scene(3, { layout: "chart-card" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("warn");
    expect(rows[0].detail).toContain("2/3");
    expect(rows[0].detail).toContain("2, 3");
    expect(rows[0].fix).toContain("scene.info");
  });

  it("does not audit non-data scenes", () => {
    expect(
      auditInfoLayoutPreference([
        scene(1, { visualType: "hook" }),
        scene(2, { visualType: "cta" }),
      ]),
    ).toEqual([]);
  });

  it("does not treat an explicit chart pin as a replaceable chart-card", () => {
    expect(
      auditInfoLayoutPreference([
        scene(1, { layout: "chart-card", chart: { entity: "zhipu", range: "6M" } }),
      ]),
    ).toEqual([]);
  });

  it("is wired into the preflight editorial bucket", () => {
    const result = runAllSceneDataChecks(
      [
        {
          id: 1,
          visualType: "hook",
          layout: "hero-center",
          voiceover: "Qwen4-Max cuts task cost by 62 percent.",
          texts: {
            subject: "QWEN4-MAX",
            bigNumber: "-62%",
            numberLabel: "TASK COST VS QWEN3.8-MAX",
          },
        },
        {
          id: 2,
          visualType: "data",
          layout: "chart-card",
          voiceover: "The model runs on two point four trillion parameters.",
          texts: { label: "PARAMS", value: "2.4T" },
        },
        {
          id: 3,
          visualType: "cta",
          layout: "hero-center",
          voiceover: "Follow for more China AI news.",
          texts: { brand: "CHINA AI NEWS", action: "FOLLOW FOR MORE" },
        },
      ],
      {},
      { meta: {} },
    );
    const row = result.editorial.find((entry) => entry.check === "Info layout preference");
    expect(row).toBeDefined();
    expect(row.severity).toBe("warn");
    expect(row.detail).toContain("2");
  });
});
