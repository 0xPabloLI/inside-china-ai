import { describe, expect, it } from "vitest";
import {
  allowedChartsFor,
  checkInfoSpec,
  defaultChartFor,
  formatChartValue,
  normalizeInfoSpec,
  sortData,
  validateInfoSpec,
} from "../lib/info-grammar.mjs";

const texts = { label: "VALUATION, $B", subtext: "$35B → $50B", source: "SOURCE: PENGPAI" };

function spec(overrides = {}) {
  return {
    relationship: "change-over-time",
    chart: "line",
    data: [
      { label: "JAN", value: 35 },
      { label: "JUL", value: 50 },
    ],
    unit: "B",
    prefix: "$",
    ...overrides,
  };
}

describe("relationship → chart grammar", () => {
  it("pins the default chart for each native relationship", () => {
    expect(defaultChartFor("magnitude")).toBe("bar");
    expect(defaultChartFor("ranking")).toBe("bar");
    expect(defaultChartFor("change-over-time")).toBe("line");
    expect(defaultChartFor("part-to-whole")).toBe("proportion-bar");
    expect(defaultChartFor("distribution")).toBe("dot-plot");
    expect(defaultChartFor("correlation")).toBeNull();
  });

  it("has no native chart for correlation, flow or spatial", () => {
    expect(allowedChartsFor("correlation")).toEqual([]);
    expect(allowedChartsFor("flow")).toEqual([]);
    expect(allowedChartsFor("spatial")).toEqual([]);
  });
});

describe("validateInfoSpec", () => {
  it("accepts a legal line chart", () => {
    const result = validateInfoSpec(spec(), { texts, visualType: "data", layout: "chart" });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects info on a non-data visualType", () => {
    const result = validateInfoSpec(spec(), { texts, visualType: "contrast", layout: "chart" });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("info.visualType");
  });

  it("rejects info outside the chart layout", () => {
    const result = validateInfoSpec(spec(), { texts, visualType: "data", layout: "hero-center" });
    expect(result.errors.map((e) => e.code)).toContain("info.layout");
  });

  it("rejects a chart type that does not match the relationship", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "part-to-whole",
        chart: "bar",
        unit: "%",
        data: [
          { label: "A", value: 60 },
          { label: "B", value: 40 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.chart.mismatch");
  });

  it("rejects a non-native chart with a chart-card pointer", () => {
    const result = validateInfoSpec(spec({ relationship: "correlation", chart: "scatter" }), {
      texts,
      visualType: "data",
      layout: "chart",
    });
    expect(result.errors.map((e) => e.code)).toContain("info.chart.notNative");
  });

  it("enforces the bar zero baseline", () => {
    const result = validateInfoSpec(
      spec({ relationship: "magnitude", chart: "bar", baseline: 20 }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.baseline.zero");
  });

  it("requires an explicit baseline for deviation", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "deviation",
        chart: "bar",
        data: [
          { label: "A", value: -3 },
          { label: "B", value: 4 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.baseline");
  });

  it("accepts a non-zero baseline for deviation", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "deviation",
        chart: "bar",
        baseline: 100,
        unit: "%",
        data: [
          { label: "A", value: 96 },
          { label: "B", value: 104 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.ok).toBe(true);
  });

  it("enforces the part-to-whole percent sum", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "part-to-whole",
        chart: "proportion-bar",
        unit: "%",
        data: [
          { label: "A", value: 60 },
          { label: "B", value: 30 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.data.percentSum");
  });

  it("accepts a part-to-whole that sums to 100", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "part-to-whole",
        chart: "proportion-bar",
        unit: "%",
        data: [
          { label: "A", value: 60 },
          { label: "B", value: 40 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects duplicate labels and more than one highlight", () => {
    const result = validateInfoSpec(
      spec({
        data: [
          { label: "JAN", value: 35, highlight: true },
          { label: "JAN", value: 50, highlight: true },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["info.data.duplicateLabel", "info.highlight.multiple"]),
    );
  });

  it("requires a unit and a source", () => {
    const result = validateInfoSpec(spec({ unit: "" }), {
      texts: { ...texts, source: "" },
      visualType: "data",
      layout: "chart",
    });
    expect(result.errors.map((e) => e.code)).toContain("info.unit");
    expect(result.errors.map((e) => e.code)).toContain("info.source");
  });

  it("warns when a ranking has no highlighted point", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "ranking",
        chart: "bar",
        data: [
          { label: "A", value: 2 },
          { label: "B", value: 1 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("info.highlight.ranking");
  });

  it("rejects a sort on a line chart", () => {
    const result = validateInfoSpec(spec({ sort: "desc" }), {
      texts,
      visualType: "data",
      layout: "chart",
    });
    expect(result.errors.map((e) => e.code)).toContain("info.sort.fixed");
  });

  it("rejects a sort on a change-over-time column", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "change-over-time",
        chart: "column",
        sort: "desc",
        data: [
          { label: "JAN", value: 2 },
          { label: "JUL", value: 5 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.sort.fixed");
  });

  it("rejects a slope whose endpoint labels would collide", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "change-over-time",
        chart: "slope",
        data: [
          { label: "A", value: 100, value2: 101 },
          { label: "B", value: 100.1, value2: 101.1 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.data.labelOverlap");
  });

  it("validates the slope contract", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "ranking",
        chart: "slope",
        data: [
          { label: "A", value: 2 },
          { label: "B", value: 1 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.data.value2");
  });

  it("accepts a legal slope chart", () => {
    const result = validateInfoSpec(
      spec({
        relationship: "ranking",
        chart: "slope",
        axisLabels: ["JAN", "JUL"],
        data: [
          { label: "A", value: 2, value2: 3 },
          { label: "B", value: 1, value2: 4 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.ok).toBe(true);
  });

  it("caps labels at the chart-specific character budget", () => {
    const result = validateInfoSpec(
      spec({
        data: [
          { label: "A VERY LONG CATEGORY LABEL", value: 1 },
          { label: "B", value: 2 },
        ],
      }),
      { texts, visualType: "data", layout: "chart" },
    );
    expect(result.errors.map((e) => e.code)).toContain("info.data.labelLength");
  });
});

describe("normalizeInfoSpec", () => {
  it("fills the zero baseline, default sort and clean panel", () => {
    const normalized = normalizeInfoSpec(
      spec({ chart: undefined, relationship: "magnitude", baseline: undefined, sort: undefined }),
    );
    expect(normalized.chart).toBe("bar");
    expect(normalized.baseline).toBe(0);
    expect(normalized.sort).toBe("none");
    expect(normalized.panelVariant).toBe("clean");
  });

  it("defaults ranking to descending", () => {
    expect(normalizeInfoSpec(spec({ relationship: "ranking", chart: "bar" })).sort).toBe("desc");
  });
});

describe("sortData", () => {
  it("sorts a ranking descending and keeps line order", () => {
    const ranking = spec({
      relationship: "ranking",
      chart: "bar",
      data: [
        { label: "A", value: 2 },
        { label: "B", value: 5 },
      ],
    });
    expect(sortData(ranking).map((d) => d.label)).toEqual(["B", "A"]);
    const line = spec();
    expect(sortData(line).map((d) => d.label)).toEqual(["JAN", "JUL"]);
  });

  it("keeps a change-over-time column in authored time order", () => {
    const column = spec({
      relationship: "change-over-time",
      chart: "column",
      sort: "desc",
      data: [
        { label: "JAN", value: 2 },
        { label: "JUL", value: 5 },
      ],
    });
    expect(sortData(column).map((d) => d.label)).toEqual(["JAN", "JUL"]);
  });
});

describe("formatChartValue", () => {
  it("formats with prefix, unit and no false precision", () => {
    expect(formatChartValue(35, spec())).toBe("$35B");
    expect(formatChartValue(2.5, spec({ decimals: 1 }))).toBe("$2.5B");
    expect(formatChartValue(60, spec({ unit: "%", prefix: "" }))).toBe("60%");
  });

  it("handles negative values", () => {
    expect(formatChartValue(-3, spec({ unit: "%", prefix: "" }))).toBe("-3%");
  });

  it("drops decimals at three digits but keeps them below 100", () => {
    expect(formatChartValue(150.5, spec({ unit: "", prefix: "" }))).toBe("151");
    expect(formatChartValue(15.5, spec({ unit: "", prefix: "" }))).toBe("15.5");
  });
});

describe("checkInfoSpec", () => {
  it("fails a chart layout without info", () => {
    const results = checkInfoSpec([{ id: 2, visualType: "data", layout: "chart", texts }]);
    expect(
      results.some((r) => r.level === "fail" && r.detail.includes("requires scene.info")),
    ).toBe(true);
  });

  it("passes a legal chart scene", () => {
    const results = checkInfoSpec([
      { id: 2, visualType: "data", layout: "chart", texts, info: spec() },
    ]);
    expect(results).toEqual([expect.objectContaining({ level: "pass" })]);
  });

  it("reports each validation error on the scene", () => {
    const results = checkInfoSpec([
      {
        id: 3,
        visualType: "data",
        layout: "chart",
        texts,
        info: spec({ relationship: "magnitude", chart: "bar", baseline: 10 }),
      },
    ]);
    expect(results.some((r) => r.level === "fail" && r.detail.includes("start at zero"))).toBe(
      true,
    );
  });
});
