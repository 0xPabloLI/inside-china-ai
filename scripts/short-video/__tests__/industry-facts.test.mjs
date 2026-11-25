import { describe, expect, it } from "vitest";
import { runIndustryFactChecks } from "../lib/industry-facts.mjs";

function rowsFor(voiceover, today, sceneId = 3) {
  return runIndustryFactChecks([{ id: sceneId, voiceover, texts: {} }], { today });
}

function fails(rows) {
  return rows.filter((row) => row.level === "fail");
}

describe("industry fact gate — total/active (#1479 S2)", () => {
  it("reds a model quoted with its active figure as total parameters", () => {
    const rows = rowsFor("DeepSeek V4-Pro ships 49B total parameters.", "2026-05-01");
    expect(fails(rows).map((row) => row.check)).toContain("Total/active scale mismatch");
  });

  it("reds a model quoted with its total figure as the per-token number", () => {
    const rows = rowsFor("DeepSeek V4-Pro activates 1.6T per token.", "2026-05-01");
    expect(fails(rows).map((row) => row.check)).toContain("Total/active scale mismatch");
  });

  it("passes the correct sentence: total as total, active as per-token", () => {
    const rows = rowsFor(
      "DeepSeek V4-Pro activates 49B of its 1.6T parameters per token, as of April 2026.",
      "2026-05-01",
    );
    expect(fails(rows)).toHaveLength(0);
    expect(rows.some((row) => row.level === "warn")).toBe(false);
  });

  it("warns when the active figure is stated without saying so", () => {
    const rows = rowsFor("DeepSeek V4-Pro runs 49B.", "2026-05-01");
    expect(rows.some((row) => row.check === "Active figure stated as plain size")).toBe(true);
  });

  it("reds a scale no current fact supports", () => {
    const rows = rowsFor("DeepSeek V4-Pro has 3.0T total parameters.", "2026-05-01");
    expect(fails(rows).map((row) => row.check)).toContain("Scale not traceable");
  });
});

describe("industry fact gate — band mismatch (#1479 S2)", () => {
  it("reds an edge model compared as a peer of the frontier band", () => {
    const rows = rowsFor(
      "LingBot-World v2, at 1.3B, outperforms the 11B frontier world models.",
      "2026-09-20",
    );
    expect(fails(rows).map((row) => row.check)).toContain("Band mismatch (edge vs frontier)");
  });

  it("passes the canonical framing: smaller than the typical 14B model", () => {
    const rows = rowsFor(
      "LingBot-World v2, at 1.3B, is 10x smaller than the typical 14B world model.",
      "2026-09-20",
    );
    expect(fails(rows)).toHaveLength(0);
  });
});

describe("industry fact gate — stale as current (#1479 S2)", () => {
  it("reds a stale scale quoted in the present tense", () => {
    const rows = rowsFor("DeepSeek V4-Pro has 1.6T total parameters.", "2026-11-21");
    expect(fails(rows).map((row) => row.check)).toContain("Stale fact quoted as current");
  });

  it("allows the same fact time-qualified with as of <month>", () => {
    const rows = rowsFor(
      "DeepSeek V4-Pro has 1.6T total parameters, as of April 2026.",
      "2026-11-21",
    );
    expect(fails(rows).map((row) => row.check)).not.toContain("Stale fact quoted as current");
  });
});

describe("industry fact gate — scope", () => {
  it("passes without judging packs that name no ledger entity", () => {
    const rows = rowsFor("A tiny startup ships a brand new assistant.", "2026-11-21");
    expect(rows).toEqual([
      expect.objectContaining({ level: "pass", check: "No ledger entities in pack" }),
    ]);
  });
});
