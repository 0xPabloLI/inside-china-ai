import { describe, expect, it } from "vitest";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";
import {
  NEWS_BEAT_ROLE_IDS,
  deriveHighlight,
  validatePackBeats,
  validateSceneBeats,
} from "../lib/semantic-beats.mjs";

const scene = (overrides = {}) => ({
  id: 1,
  voiceover: "Qwen 4 Max cut task cost 62%, from $4.43 to $1.67.",
  ...overrides,
});

const beat = (overrides = {}) => ({
  id: "cost-drop",
  at: "cut task cost 62%",
  role: "delta",
  weight: "main",
  ...overrides,
});

describe("semantic beats contract (#733 S2)", () => {
  it("keeps packs without beats valid (opt-in)", () => {
    expect(validateSceneBeats(scene()).ok).toBe(true);
    expect(validatePackBeats([scene()])).toMatchObject({ ok: true, beatCount: 0 });
  });

  it("accepts one main and one sub beat anchored to exact text", () => {
    const result = validateSceneBeats(
      scene({
        beats: [beat(), beat({ id: "baseline", at: "$4.43", role: "baseline", weight: "sub" })],
      }),
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("requires beats to be an array", () => {
    const result = validateSceneBeats(scene({ beats: {} }));
    expect(result.errors[0].code).toBe("beats-not-array");
  });

  it("rejects unknown fields so the schema cannot silently grow", () => {
    const result = validateSceneBeats(scene({ beats: [beat({ extra: true })] }));
    expect(result.errors[0].code).toBe("beat-unknown-field");
  });

  it("rejects duplicate ids within a scene", () => {
    const result = validateSceneBeats(
      scene({ beats: [beat(), beat({ at: "$1.67", weight: "sub" })] }),
    );
    expect(result.errors.map((e) => e.code)).toContain("beat-id-duplicate");
  });

  it("fails closed when the anchor is not in the voiceover", () => {
    const result = validateSceneBeats(scene({ beats: [beat({ at: "cut cost by two thirds" })] }));
    expect(result.errors.map((e) => e.code)).toContain("beat-at-missing");
  });

  it("fails closed when the anchor occurs more than once", () => {
    const result = validateSceneBeats(
      scene({ voiceover: "cost fell. cost fell again.", beats: [beat({ at: "cost fell" })] }),
    );
    expect(result.errors.map((e) => e.code)).toContain("beat-at-ambiguous");
  });

  it("rejects roles outside the closed 26-role vocabulary", () => {
    const result = validateSceneBeats(scene({ beats: [beat({ role: "marketing-hype" })] }));
    expect(result.errors.map((e) => e.code)).toContain("beat-role-invalid");
    expect(NEWS_BEAT_ROLE_IDS).toHaveLength(26);
  });

  it("rejects a second main beat", () => {
    const result = validateSceneBeats(
      scene({
        beats: [beat(), beat({ id: "price", at: "$1.67", role: "stat", weight: "main" })],
      }),
    );
    expect(result.errors.map((e) => e.code)).toContain("beat-main-duplicate");
  });

  it("rejects bad weights and ids", () => {
    const result = validateSceneBeats(
      scene({ beats: [beat({ id: "Cost Drop", weight: "primary" })] }),
    );
    expect(result.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["beat-id-invalid", "beat-weight-invalid"]),
    );
  });

  it("is wired into the pre-render gate (fail-closed, opt-in)", () => {
    const bad = runAllSceneDataChecks([scene({ beats: [beat({ at: "missing anchor" })] })], {});
    expect(bad.fail.some((result) => result.check.includes("semantic beats"))).toBe(true);
    const absent = runAllSceneDataChecks([scene()], {});
    expect(absent.fail.some((result) => result.check.includes("semantic beats"))).toBe(false);
  });

  it("reports the scene id on pack-level errors", () => {
    const result = validatePackBeats([
      scene({ id: 7, beats: [beat({ at: "not in this script" })] }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].sceneId).toBe(7);
  });
});

describe("deriveHighlight (#733 S2 emphasis bridge)", () => {
  const narrative = (texts, mainAt = "GENERATED") => ({
    id: 2,
    visualType: "narrative",
    layout: "media-overlay",
    voiceover: "The result was GENERATED, not sourced.",
    texts: {
      company: "T2I FIXTURE",
      action: "AI IMAGE PATH",
      result: "GENERATED, NOT SOURCED",
      source: "PACK",
      ...texts,
    },
    beats: [
      { id: "main", at: mainAt, role: "claim", weight: "main" },
      { id: "sub", at: "not sourced", role: "caveat", weight: "sub" },
    ],
  });

  it("derives the unique rendered field for the main beat", () => {
    expect(deriveHighlight(narrative())).toEqual({
      status: "derived",
      field: "result",
      text: "GENERATED",
    });
  });

  it("derives a hookText underline target", () => {
    const hook = {
      visualType: "hook",
      layout: "hero-center",
      voiceover: "AI that OPERATES your computer.",
      texts: { subject: "DOUBAO WORK", hookText: "AI THAT OPERATES YOUR COMPUTER", source: "PACK" },
      beats: [{ id: "main", at: "OPERATES", role: "claim", weight: "main" }],
    };
    expect(deriveHighlight(hook)).toEqual({
      status: "derived",
      field: "hookText",
      text: "OPERATES",
    });
  });

  it("reports missing when no rendered field contains the anchor", () => {
    expect(deriveHighlight(narrative({}, "sourced")).status).toBe("missing");
  });

  it("refuses to guess when the anchor is in two annotatable fields", () => {
    const scene = narrative(
      { result: "GENERATED, NOT SOURCED", action: "GENERATED PREVIEW" },
      "GENERATED",
    );
    expect(deriveHighlight(scene)).toMatchObject({
      status: "ambiguous-field",
      fields: ["action", "result"],
    });
  });

  it("ignores fields the renderer never annotates", () => {
    const scene = narrative({ company: "GENERATED", result: "SOURCED ONLY" }, "GENERATED");
    expect(deriveHighlight(scene).status).toBe("missing");
  });

  it("refuses a repeated anchor inside one field", () => {
    const scene = narrative({ result: "GENERATED THEN GENERATED" }, "GENERATED");
    expect(deriveHighlight(scene)).toMatchObject({
      status: "ambiguous-occurrence",
      occurrences: 2,
    });
  });

  it("never annotates source attribution", () => {
    const scene = narrative({ source: "GENERATED", result: "SOURCED ONLY" }, "GENERATED");
    expect(deriveHighlight(scene).status).toBe("missing");
  });

  it("reports already-set and whether it matches the main beat", () => {
    expect(
      deriveHighlight(narrative({ highlight: { field: "result", text: "GENERATED" } })),
    ).toMatchObject({
      status: "already-set",
      same: true,
    });
    expect(
      deriveHighlight(narrative({ highlight: { field: "company", text: "T2I" } })),
    ).toMatchObject({
      status: "already-set",
      same: false,
    });
  });

  it("has no target when there is no main beat", () => {
    const scene = narrative();
    scene.beats = [{ id: "sub", at: "GENERATED", role: "claim", weight: "sub" }];
    expect(deriveHighlight(scene)).toEqual({ status: "no-main" });
  });
});
