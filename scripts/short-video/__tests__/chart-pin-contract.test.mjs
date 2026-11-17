import { describe, expect, it } from "vitest";
import { checkChartPinContract } from "../lib/chart-pin-contract.mjs";

describe("checkChartPinContract", () => {
  it("passes a pack with no chart pins", () => {
    const results = checkChartPinContract([{ id: 1, visualType: "hook" }]);
    expect(results).toEqual([expect.objectContaining({ level: "pass" })]);
  });

  it("passes a curated entity with valid parameters", () => {
    const results = checkChartPinContract([
      {
        id: 4,
        visualType: "data",
        layout: "chart-card",
        chart: { entity: "zhipu", range: "6M", interval: "1D", theme: "dark" },
      },
    ]);
    expect(results[0].level).toBe("pass");
  });

  it("fails an entity that is not in the curated map", () => {
    const results = checkChartPinContract([
      { id: 4, visualType: "data", chart: { entity: "not-a-real-ticker" } },
    ]);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("not in symbol map");
  });

  it("fails the fourth annotation before sourcing", () => {
    const results = checkChartPinContract([
      {
        id: 4,
        visualType: "data",
        chart: {
          entity: "zhipu",
          annotations: [
            { name: "Horizontal Line", input: { price: 1 } },
            { name: "Horizontal Line", input: { price: 2 } },
            { name: "Horizontal Line", input: { price: 3 } },
            { name: "Horizontal Line", input: { price: 4 } },
          ],
        },
      },
    ]);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("at most 3");
  });

  it("fails a malformed range", () => {
    const results = checkChartPinContract([
      { id: 4, visualType: "data", chart: { entity: "zhipu", range: { from: "2026-01-01" } } },
    ]);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("{ from, to }");
  });

  it("fails a missing entity", () => {
    const results = checkChartPinContract([{ id: 4, visualType: "data", chart: {} }]);
    expect(results[0].detail).toContain("chart.entity");
  });

  it("fails loudly when the symbol map is missing", () => {
    const results = checkChartPinContract(
      [{ id: 4, visualType: "data", chart: { entity: "zhipu" } }],
      { mapPath: "/tmp/definitely-not-a-chart-map.json" },
    );
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("chart symbol map not found");
  });
});
