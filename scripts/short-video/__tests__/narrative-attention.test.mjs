import { describe, expect, it } from "vitest";
import {
  NARRATIVE_ARC_ROLES,
  auditNarrativeArc,
  peakPosition,
  sceneRole,
} from "../lib/narrative.mjs";
import { auditAttentionBudget, declaredCues, layoutRun } from "../lib/attention.mjs";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const scene = (id, arcRole, extra = {}) => ({
  id,
  visualType: "data",
  layout: "set-piece",
  voiceover: `scene ${id}`,
  ...(arcRole ? { arcRole } : {}),
  ...extra,
});

const chart = { relationship: "magnitude", chart: "bar", data: [], unit: "$B" };

/** Five equal scenes: the third scene's midpoint is exactly 50%. */
const passingArc = [
  scene(1, "establisher", { visualType: "hook" }),
  scene(2, "initial", { info: chart }),
  scene(3, "peak", { info: chart }),
  scene(4, "initial"),
  scene(5, "release", { visualType: "cta" }),
];

const warnings = (rows) => rows.filter((row) => row.level === "warn");

describe("narrative arc", () => {
  it("exposes the E/I/P/R vocabulary without mapping legacy S/T/A/R", () => {
    expect(NARRATIVE_ARC_ROLES).toEqual(["establisher", "initial", "peak", "release"]);
    expect(sceneRole({ arcRole: "peak" })).toBe("peak");
    expect(sceneRole({ narrativeRole: "T" })).toBeNull();
  });

  it("places a single peak at the scene midpoint", () => {
    expect(peakPosition(passingArc)?.midpointRatio).toBeCloseTo(0.5, 5);
    expect(peakPosition(passingArc)?.sceneId).toBe(3);
  });

  it("passes one peak in band with a chart before it", () => {
    const rows = auditNarrativeArc(passingArc);
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("pass");
    expect(rows[0].detail).toContain("50%");
  });

  it("warns when no peak is declared", () => {
    const rows = auditNarrativeArc([
      scene(1, "establisher", { visualType: "hook" }),
      scene(2, "initial", { info: chart }),
      scene(3, "initial"),
      scene(4, "initial"),
      scene(5, "release", { visualType: "cta" }),
    ]);
    expect(warnings(rows).some((row) => row.detail.includes('"peak"'))).toBe(true);
  });

  it("warns when two scenes claim the peak", () => {
    const rows = auditNarrativeArc([
      scene(1, "establisher", { visualType: "hook" }),
      scene(2, "peak", { info: chart }),
      scene(3, "peak"),
      scene(4, "release", { visualType: "cta" }),
    ]);
    expect(warnings(rows).some((row) => row.detail.includes("2 scenes"))).toBe(true);
  });

  it("warns at a peak 20% into the pack", () => {
    const rows = auditNarrativeArc(
      [
        scene(1, "establisher", { visualType: "hook", info: chart }),
        scene(2, "peak"),
        scene(3, "initial"),
        scene(4, "initial"),
        scene(5, "release", { visualType: "cta" }),
      ],
      {
        sceneDurations: [
          { sceneId: 1, duration: 10 },
          { sceneId: 2, duration: 20 },
          { sceneId: 3, duration: 20 },
          { sceneId: 4, duration: 25 },
          { sceneId: 5, duration: 25 },
        ],
      },
    );
    expect(warnings(rows).some((row) => row.detail.includes("20%"))).toBe(true);
  });

  it("warns at a peak 70% into the pack", () => {
    const rows = auditNarrativeArc(
      [
        scene(1, "establisher", { visualType: "hook", info: chart }),
        scene(2, "initial"),
        scene(3, "initial"),
        scene(4, "peak"),
        scene(5, "release", { visualType: "cta" }),
      ],
      {
        sceneDurations: [
          { sceneId: 1, duration: 10 },
          { sceneId: 2, duration: 20 },
          { sceneId: 3, duration: 30 },
          { sceneId: 4, duration: 20 },
          { sceneId: 5, duration: 20 },
        ],
      },
    );
    expect(warnings(rows).some((row) => row.detail.includes("70%"))).toBe(true);
  });

  it("warns when every chart sits after the peak", () => {
    const rows = auditNarrativeArc([
      scene(1, "establisher", { visualType: "hook" }),
      scene(2, "initial"),
      scene(3, "peak"),
      scene(4, "initial", { info: chart }),
      scene(5, "release", { visualType: "cta" }),
    ]);
    expect(warnings(rows).some((row) => row.detail.includes("no chart scene precedes"))).toBe(true);
  });

  it("warns when the hook is not the establisher and the close is not the release", () => {
    const rows = auditNarrativeArc([
      scene(1, "initial", { visualType: "hook" }),
      scene(2, "initial", { info: chart }),
      scene(3, "peak"),
      scene(4, "initial", { visualType: "cta" }),
    ]);
    const messages = warnings(rows).map((row) => row.detail);
    expect(messages.some((detail) => detail.includes("hook is the establisher"))).toBe(true);
    expect(messages.some((detail) => detail.includes("closing scene is the release"))).toBe(true);
  });

  it("names legacy S/T/A/R codes instead of pretending they are a v2 arc", () => {
    const rows = auditNarrativeArc([
      scene(1, null, { visualType: "hook", narrativeRole: "S" }),
      scene(2, null, { info: chart, narrativeRole: "T" }),
      scene(3, null, { narrativeRole: "A" }),
      scene(4, null, { visualType: "cta", narrativeRole: "R" }),
    ]);
    expect(warnings(rows)[0].detail).toContain("legacy `narrativeRole`");
    expect(warnings(rows)[0].detail).toContain("do not encode a peak");
  });

  it("warns on an unknown arcRole", () => {
    const rows = auditNarrativeArc([
      scene(1, "establisher", { visualType: "hook" }),
      scene(2, "initial", { info: chart }),
      scene(3, "climax"),
      scene(4, "release", { visualType: "cta" }),
    ]);
    expect(warnings(rows).some((row) => row.detail.includes('unknown arcRole "climax"'))).toBe(
      true,
    );
  });

  it("skips the arc for packs shorter than four scenes", () => {
    expect(auditNarrativeArc([scene(1), scene(2), scene(3)])[0].level).toBe("pass");
  });
});

describe("attention budget", () => {
  it("normalizes one string cue and ignores empty values", () => {
    expect(declaredCues({ attention: { cue: " highlight " } })).toEqual(["highlight"]);
    expect(declaredCues({ attention: { cue: "   " } })).toEqual([]);
    expect(declaredCues({ attention: { cue: ["motion", " highlight "] } })).toEqual([
      "motion",
      "highlight",
    ]);
    expect(declaredCues({})).toEqual([]);
  });

  it("groups consecutive information scenes and breaks on a narrative beat", () => {
    const runs = layoutRun([
      scene(1),
      scene(2),
      { id: 3, visualType: "narrative", layout: "media-bottom-bar", voiceover: "beat" },
      scene(4),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ key: "data:set-piece", length: 2 });
    expect(runs[1]).toMatchObject({ key: "data:set-piece", length: 1 });
  });

  it("warns on three consecutive information scenes with the same layout", () => {
    const rows = auditAttentionBudget([scene(1), scene(2), scene(3)]);
    expect(warnings(rows)).toHaveLength(1);
    expect(warnings(rows)[0].detail).toContain(
      "3 consecutive information scenes share data:set-piece",
    );
    expect(warnings(rows)[0].detail).toContain("scenes 1, 2, 3");
  });

  it("does not warn when a narrative beat interrupts the run", () => {
    const rows = auditAttentionBudget([
      scene(1),
      scene(2),
      { id: 3, visualType: "narrative", layout: "media-bottom-bar", voiceover: "beat" },
      scene(4),
    ]);
    expect(rows[0].level).toBe("pass");
  });

  it("warns when a scene declares two cues", () => {
    const rows = auditAttentionBudget([
      scene(1, null, { attention: { cue: ["motion", "highlight"] } }),
    ]);
    expect(warnings(rows)[0].detail).toContain("declares 2 attention cues");
  });

  it("warns when a terminal chart panel carries another declared cue", () => {
    const rows = auditAttentionBudget([
      scene(1, null, { info: { panelVariant: "terminal" }, attention: { cue: "highlight" } }),
    ]);
    expect(warnings(rows)[0].detail).toContain("terminal chart panel");
  });

  it("warns on a non-string cue instead of throwing", () => {
    const rows = auditAttentionBudget([scene(1, null, { attention: { cue: { kind: "motion" } } })]);
    expect(warnings(rows)[0].detail).toContain("non-string `attention.cue`");
  });

  it("passes one cue with no repeated layout", () => {
    const rows = auditAttentionBudget([
      scene(1, null, { attention: { cue: "highlight" } }),
      scene(2, null, { layout: "chart" }),
    ]);
    expect(rows[0].level).toBe("pass");
  });
});

describe("advisory wiring", () => {
  it("puts both audits in the editorial bucket and never in fail", () => {
    const scenes = [
      scene(1, "establisher", { visualType: "hook" }),
      scene(2, "initial", { info: chart }),
      scene(3, "peak", { info: chart }),
      scene(4, "initial"),
      scene(5, "release", { visualType: "cta" }),
    ];
    const results = runAllSceneDataChecks(scenes, null);
    const narrative = results.editorial.find((row) => row.check.includes("Narrative arc"));
    const attention = results.editorial.find((row) => row.check.includes("Attention budget"));
    expect(narrative).toBeDefined();
    expect(attention).toBeDefined();
    expect(narrative.level).toBe("advisory");
    expect(attention.level).toBe("advisory");
    expect(narrative.severity).not.toBe("fail");
    expect(attention.severity).not.toBe("fail");
    expect(results.fail.some((row) => row.check.includes("Narrative arc"))).toBe(false);
    expect(results.fail.some((row) => row.check.includes("Attention budget"))).toBe(false);
  });
});
