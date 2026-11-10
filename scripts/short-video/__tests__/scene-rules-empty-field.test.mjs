/**
 * Empty-field gate wiring (#739).
 *
 * The gate judges the DECLARED type scale of the five information templates:
 * a scene whose largest object sits below the 110px hero line has no hero and
 * warns. Data and stat-reveal carry a 240px focal number and must pass; the
 * contrast / context / info-card families are the known "small copy + small
 * chip" shapes until the deferred topologies land.
 */
import { describe, it, expect } from "vitest";
import { checkEmptyField, runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const base = { voiceover: "A short sentence for the scene.", layout: "hero-center" };

const dataScene = {
  ...base,
  id: 1,
  visualType: "data",
  texts: { stat: "$47B", statLabel: "CHINA AI SPEND", subtext: "IN 2024", source: "Bloomberg" },
};

const statRevealScene = {
  ...base,
  id: 2,
  visualType: "stat-reveal",
  texts: { bigNumber: "97%", label: "MARKET SHARE", subtext: "OF CHINA", source: "SCMP" },
};

const contrastScene = {
  ...base,
  id: 3,
  visualType: "contrast",
  texts: { title: "OPEN VS CLOSED", left: ["OPEN"], right: ["CLOSED"], vs: "VS", note: "NOTE" },
};

const contextScene = {
  ...base,
  id: 4,
  visualType: "context",
  texts: { badge: "EXCLUSIVE", title: "BLOOMBERG FIRST", context: "LIANG CONFIRMED IT" },
};

const infoCardScene = {
  ...base,
  id: 5,
  visualType: "info-card",
  texts: { title: "THREE MOVES", subtitle: "THIS WEEK", points: ["ONE", "TWO", "THREE"] },
};

const quoteScene = {
  ...base,
  id: 6,
  visualType: "quote",
  texts: { quote: "A QUOTE", source: "SOURCE" },
};

const warns = (results) => results.filter((r) => r.level === "warn");

describe("checkEmptyField — largest declared object", () => {
  it("passes a data scene: the stat anchor is hero tier", () => {
    const results = checkEmptyField([dataScene]);
    expect(warns(results)).toEqual([]);
    expect(results[0].detail).toContain("240px (stat");
  });

  it("passes a stat-reveal scene: the big number is hero tier", () => {
    const results = checkEmptyField([statRevealScene]);
    expect(warns(results)).toEqual([]);
    expect(results[0].detail).toContain("240px (bigNumber");
  });

  it("warns on contrast: the title is supporting tier, so there is no hero", () => {
    const found = warns(checkEmptyField([contrastScene]));
    expect(found).toHaveLength(1);
    expect(found[0].check).toBe("Empty field — contrast 3");
    expect(found[0].detail).toContain("60px (title");
    expect(found[0].detail).toContain("tier supporting");
    expect(found[0].fix).toContain("#739");
  });

  it("warns on context and info-card (the small-copy shapes)", () => {
    expect(warns(checkEmptyField([contextScene]))).toHaveLength(1);
    expect(warns(checkEmptyField([infoCardScene]))).toHaveLength(1);
  });

  it("reads the data.label alias (statLabel) when the stat itself is empty", () => {
    const results = checkEmptyField([
      { ...dataScene, texts: { stat: "", statLabel: "ONLY A LABEL" } },
    ]);
    const found = warns(results);
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain("60px (label");
  });

  it("ignores visualTypes outside the information grammar", () => {
    const results = checkEmptyField([quoteScene]);
    expect(warns(results)).toEqual([]);
    expect(results[0].check).toContain("no governed information scenes");
  });
});

describe("checkEmptyField — persistence window", () => {
  it("skips a scene at or under 45 frames", () => {
    const results = checkEmptyField([contrastScene], {
      sceneDurations: [{ sceneId: 3, duration: 1.5 }], // exactly 45 frames @30fps
    });
    expect(warns(results)).toEqual([]);
    expect(results[0].detail).toContain("45 frames");
  });

  it("fires for a scene longer than 45 frames", () => {
    const results = checkEmptyField([contrastScene], {
      sceneDurations: [{ sceneId: 3, duration: 2.0 }], // 60 frames
    });
    expect(warns(results)).toHaveLength(1);
    expect(results[0].detail).toContain("60 frames");
  });

  it("judges the whole shot when durations are absent", () => {
    const results = checkEmptyField([contrastScene]);
    expect(results[0].detail).toContain("whole-scene persistence");
  });
});

describe("checkEmptyField — preflight wiring", () => {
  it("is included in runAllSceneDataChecks results", () => {
    const results = runAllSceneDataChecks([contrastScene], null);
    const empty = results.warn.find((r) => r.check.startsWith("Empty field"));
    expect(empty).toBeDefined();
    expect(empty.detail).toContain("60px (title");
  });

  it("does not turn the empty-field finding into a fail", () => {
    const results = runAllSceneDataChecks([contrastScene], null);
    expect(results.fail.find((r) => r.check.startsWith("Empty field"))).toBeUndefined();
  });

  it("accepts scene durations through opts", () => {
    const results = runAllSceneDataChecks([contrastScene], null, {
      sceneDurations: [{ sceneId: 3, duration: 1.2 }],
    });
    expect(results.warn.find((r) => r.check.startsWith("Empty field"))).toBeUndefined();
    const passing = results.pass.find((r) => r.check.startsWith("Empty field"));
    expect(passing).toBeDefined();
    expect(passing.detail).toContain("36 frames");
  });
});
