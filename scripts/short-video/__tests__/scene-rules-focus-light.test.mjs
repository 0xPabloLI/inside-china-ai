/**
 * Protagonist-light gate wiring (#738).
 *
 * The gate answers one question per scene: does the shot light a subject the
 * template actually draws? The plans live in lib/focus-light.mjs; this suite
 * exercises the content binding (a pack that leaves the subject field out) and
 * the priority rule for mutually exclusive heroes (the hook's number OR claim).
 */
import { describe, it, expect } from "vitest";
import { checkFocusLight } from "../lib/scene-rules.mjs";
import { LIGHT_PLANS } from "../lib/focus-light.mjs";

const base = { voiceover: "A short sentence for the scene.", layout: "hero-center" };

const dataScene = {
  ...base,
  id: 1,
  visualType: "data",
  texts: { stat: "$47B", statLabel: "CHINA AI SPEND" },
};

const warns = (rows) => rows.filter((row) => row.level === "warn");
const fails = (rows) => rows.filter((row) => row.level === "fail");

describe("checkFocusLight — content binding", () => {
  it("passes a scene whose protagonist field is declared", () => {
    const rows = checkFocusLight([dataScene]);
    expect(warns(rows)).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("pass");
    expect(rows[0].detail).toContain("1 scene(s)");
  });

  it("warns when the protagonist field is missing — the shot has no lit subject", () => {
    const rows = checkFocusLight([{ ...dataScene, texts: { statLabel: "CHINA AI SPEND" } }]);
    const warn = warns(rows)[0];
    expect(warn.check).toContain("data 1");
    expect(warn.detail).toContain("stat");
  });

  it("treats an empty array or blank string as missing", () => {
    const rows = checkFocusLight([
      { ...base, id: 2, visualType: "info-card", texts: { points: [] } },
      { ...base, id: 3, visualType: "data", texts: { stat: "   " } },
    ]);
    expect(warns(rows)).toHaveLength(2);
  });

  it("uses the template's own priority order for mutually exclusive heroes", () => {
    const numberLed = {
      ...base,
      id: 4,
      visualType: "hook",
      texts: { bigNumber: "97%", hookText: "CHINA SHIPS" },
    };
    // The hook draws bigNumber when both exist, so that is the one protagonist —
    // no warning about the unused claim.
    expect(warns(checkFocusLight([numberLed]))).toEqual([]);
    const claimLed = { ...base, id: 5, visualType: "hook", texts: { hookText: "CHINA SHIPS" } };
    expect(warns(checkFocusLight([claimLed]))).toEqual([]);
    const neither = { ...base, id: 6, visualType: "hook", texts: { badge: "EXCLUSIVE" } };
    expect(warns(checkFocusLight([neither]))).toHaveLength(1);
  });

  it("skips fullscreen media scenes — the footage is the subject", () => {
    const rows = checkFocusLight([
      {
        ...base,
        id: 7,
        visualType: "narrative",
        media: { type: "image", path: "a.jpg", mode: "fullscreen" },
      },
    ]);
    expect(warns(rows)).toEqual([]);
    expect(rows[0].detail).toContain("1 fullscreen media scene(s) skipped");
  });

  it("ignores visualTypes outside the renderer's dispatch table", () => {
    const rows = checkFocusLight([{ ...base, id: 8, visualType: "benchmark", texts: {} }]);
    expect(warns(rows)).toEqual([]);
    expect(rows[0].detail).toContain("0 scene(s)");
  });

  it("warns once per scene, not once per template", () => {
    const rows = checkFocusLight([
      { ...dataScene, id: 9, texts: {} },
      { ...dataScene, id: 10, texts: {} },
    ]);
    expect(warns(rows)).toHaveLength(2);
    expect(warns(rows).map((row) => row.check)).toEqual([
      "Protagonist light — data 9",
      "Protagonist light — data 10",
    ]);
  });
});

describe("checkFocusLight — plan budget", () => {
  it("reports a broken plan as a fail and stops judging scenes", () => {
    const original = LIGHT_PLANS.data;
    try {
      LIGHT_PLANS.data = {
        ...original,
        beats: [
          { target: "stat", at: 0.2 },
          { target: "statLabel", at: 0.25 }, // 2 frames apart — needs 8
        ],
      };
      const rows = checkFocusLight([dataScene]);
      expect(fails(rows)[0].detail).toContain("8 frames");
    } finally {
      LIGHT_PLANS.data = original;
    }
  });
});
