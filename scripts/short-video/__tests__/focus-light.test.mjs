/**
 * Protagonist light contract (#738).
 *
 * The tier ordering, the 8-frame extinguish and the 3–6 frame flash are the
 * source rules (anything2explainer `reference/composition-and-light.md` §2),
 * pinned here as literal expectations. Two kinds of test live below: the
 * frame-walk ones exercise the public resolver over every frame of a
 * representative scene, and the plan-shaped ones are contract guards — they
 * pass a plan through `validateLightPlan` and assert the violation is named,
 * which is a smoke test of the validator, not an independent reading of the
 * rule.
 */
import { describe, it, expect } from "vitest";
import {
  FOCUS_LIGHT,
  LIGHT_PLANS,
  LIGHT_TIERS,
  LIGHT_TONES,
  focusLightStyle,
  lightKindFor,
  lightPlanFor,
  lightStateAt,
  lightToneFor,
  resolveLightTimeline,
  validateLightPlan,
} from "../lib/focus-light.mjs";
import { REMOTION_SLOT_MAP, resolveRenderLayout } from "../lib/text-slots.mjs";
import { COLOR } from "../remotion/src/tokens.ts";

/** "#f59e0b" → [245, 158, 11] */
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("three tiers", () => {
  it("is exactly bloom < soft < flash, and nothing else", () => {
    expect(Object.keys(LIGHT_TIERS)).toEqual(["bloom", "soft", "flash"]);
    // Ordered by brightness: structure line < focus < white flash.
    expect(LIGHT_TIERS.bloom.borderAlpha).toBeLessThan(LIGHT_TIERS.soft.focus.farAlpha);
    expect(LIGHT_TIERS.soft.focus.farAlpha).toBeLessThan(LIGHT_TIERS.soft.focus.alpha);
    expect(LIGHT_TIERS.soft.focus.alpha).toBeLessThan(LIGHT_TIERS.flash.alpha);
    // The bloom has no level: it is constant, so nothing can brighten it.
    expect(LIGHT_TIERS.bloom).not.toHaveProperty("level");
  });

  it("keeps the protagonist lit but below the current focus", () => {
    expect(LIGHT_TIERS.soft.protagonist.level).toBeGreaterThan(0);
    expect(LIGHT_TIERS.soft.protagonist.level).toBeLessThan(1);
  });

  it("pins the budget the source states", () => {
    expect(FOCUS_LIGHT.maxConcurrent).toBe(1);
    expect(FOCUS_LIGHT.transferOffFrames).toBe(8);
    expect(FOCUS_LIGHT.flashFrames).toEqual({ min: 3, max: 6 });
  });

  it("uses the brand palette, not the source's purple", () => {
    expect(LIGHT_TONES.amber).toEqual(rgbOf(COLOR.amber));
    expect(LIGHT_TONES.blue).toEqual(rgbOf(COLOR.brand));
    expect(LIGHT_TONES.red).toEqual(rgbOf(COLOR.red));
    expect(Object.keys(LIGHT_TONES)).not.toContain("purple");
  });
});

describe("template plans", () => {
  it("declares one plan per text template, and none for fullscreen media", () => {
    // `fullscreen` is the media-only layout: no text frame, so no light plan.
    const templates = Object.keys(REMOTION_SLOT_MAP)
      .filter((visualType) => visualType !== "fullscreen")
      .sort();
    expect(Object.keys(LIGHT_PLANS).sort()).toEqual(templates);
    expect(lightPlanFor("fullscreen")).toBeNull();
  });

  it("passes the budget for every plan at a realistic scene length", () => {
    for (const [visualType, plan] of Object.entries(LIGHT_PLANS)) {
      expect(validateLightPlan(plan, { durationFrames: 150 }), visualType).toEqual([]);
    }
  });

  it("names only fields the template's own contract knows", () => {
    for (const [visualType, plan] of Object.entries(LIGHT_PLANS)) {
      const layout = resolveRenderLayout({ visualType, layout: undefined });
      const groups = REMOTION_SLOT_MAP[visualType]?.[layout];
      expect(groups, `${visualType}/${layout}`).toBeTruthy();
      const known = new Set([...groups.rendered, ...groups.control, ...groups.optional]);
      const targets = [...plan.protagonist, ...plan.beats.map((beat) => beat.target)];
      for (const target of targets) {
        // `statLabel` is the data template's declared alias for `label`; the
        // gate resolves it through textFieldValue, so accept either spelling.
        const viaAlias = target === "statLabel" && known.has("label");
        expect(known.has(target) || viaAlias, `${visualType}: ${target}`).toBe(true);
      }
    }
  });

  it("gives every plan a subject and a flash inside the 3–6 frame window", () => {
    for (const plan of Object.values(LIGHT_PLANS)) {
      expect(plan.protagonist.length).toBeGreaterThan(0);
      for (const beat of plan.beats) {
        if (beat.flash === undefined) continue;
        expect(beat.flash).toBeGreaterThanOrEqual(FOCUS_LIGHT.flashFrames.min);
        expect(beat.flash).toBeLessThanOrEqual(FOCUS_LIGHT.flashFrames.max);
      }
    }
  });
});

describe("per-frame budget", () => {
  const timeline = resolveLightTimeline(LIGHT_PLANS.data, { durationFrames: 120 });
  const targets = ["stat", "statLabel", "subtext"];

  it("never has two targets at full at the same frame", () => {
    for (let frame = 0; frame < 120; frame += 1) {
      const full = targets.filter((target) => lightStateAt(timeline, target, frame).level >= 0.999);
      expect(full.length, `frame ${frame}: ${full.join(" + ")}`).toBeLessThanOrEqual(
        FOCUS_LIGHT.maxConcurrent,
      );
    }
  });

  it("keeps the protagonist lit on the first and last frame", () => {
    expect(lightStateAt(timeline, "stat", 0).level).toBeGreaterThan(0);
    expect(lightStateAt(timeline, "stat", 119).level).toBeGreaterThan(0);
  });

  it("never lights a supporting element on its own", () => {
    for (let frame = 0; frame < 120; frame += 1) {
      expect(lightStateAt(timeline, "subtext", frame).level).toBe(0);
    }
  });

  it("takes exactly 8 frames to reach the resting level after a transfer", () => {
    const transfer = timeline.beats[1].litFrom; // statLabel takes over at 1.0s
    const resting = LIGHT_TIERS.soft.protagonist.level;
    const ramp = [];
    for (let offset = 0; offset < FOCUS_LIGHT.transferOffFrames; offset += 1) {
      ramp.push(lightStateAt(timeline, "stat", transfer + offset).level);
    }
    // The transfer frame is already below full: only ONE light is ever at 1.0.
    expect(ramp[0]).toBeLessThan(1);
    // Strictly decreasing, and the window's last frame IS the resting level —
    // the light is fully out 8 frames after the next one lit.
    for (let i = 1; i < ramp.length; i += 1) expect(ramp[i]).toBeLessThan(ramp[i - 1]);
    expect(ramp[ramp.length - 1]).toBeCloseTo(resting, 6);
    // Six frames in it is still visibly above the resting level: this is what
    // pins the window to 8 rather than any shorter N.
    expect(lightStateAt(timeline, "stat", transfer + 6).level).toBeGreaterThan(resting);
    // …and it stays there.
    expect(
      lightStateAt(timeline, "stat", transfer + FOCUS_LIGHT.transferOffFrames).level,
    ).toBeCloseTo(resting, 6);
  });

  it("runs the white flash for the declared frames and no longer", () => {
    const beat = timeline.beats[0];
    // Peak on the beat frame, then a linear decay that is gone one frame after
    // the declared window.
    expect(lightStateAt(timeline, "stat", beat.litFrom).flash).toBe(LIGHT_TIERS.flash.alpha);
    expect(lightStateAt(timeline, "stat", beat.litFrom + beat.flash).flash).toBe(0);
  });

  it("throws when a plan breaks the budget", () => {
    const tooClose = {
      protagonist: ["a"],
      tone: "amber",
      kind: "text",
      beats: [
        { target: "a", at: 0.2 },
        { target: "b", at: 0.3 }, // 3 frames apart — the outgoing light needs 8
      ],
    };
    expect(() => resolveLightTimeline(tooClose, { durationFrames: 120 })).toThrow(/8 frames/);
  });
});

describe("validation", () => {
  const base = { protagonist: ["a"], tone: "amber", kind: "text", beats: [] };

  it("rejects an empty or duplicated protagonist list", () => {
    expect(validateLightPlan({ ...base, protagonist: [] })).not.toEqual([]);
    expect(validateLightPlan({ ...base, protagonist: ["a", "a"] })).not.toEqual([]);
  });

  it("rejects an unknown tone or kind", () => {
    expect(validateLightPlan({ ...base, tone: "purple" })).not.toEqual([]);
    expect(validateLightPlan({ ...base, kind: "layer" })).not.toEqual([]);
  });

  it("rejects a flash outside 3–6 frames", () => {
    for (const flash of [2, 7, 4.5]) {
      const plan = { ...base, beats: [{ target: "a", at: 0.2, flash }] };
      expect(validateLightPlan(plan), `flash ${flash}`).not.toEqual([]);
    }
  });

  it("rejects two beats on the same target and reports a beat past the scene end", () => {
    const twice = {
      ...base,
      beats: [
        { target: "a", at: 0.2 },
        { target: "a", at: 0.6 },
      ],
    };
    expect(validateLightPlan(twice)).not.toEqual([]);
    const late = { ...base, beats: [{ target: "a", at: 5 }] };
    expect(validateLightPlan(late, { durationFrames: 90 })).not.toEqual([]);
  });

  it("drops beats the scene ends before instead of blocking the render", () => {
    // A 1.33s scene reaches the quote's own beat (1.1s) but not the source's
    // (1.8s): the light simply never lands there, and the quote holds to the end.
    const timeline = resolveLightTimeline(LIGHT_PLANS.quote, { durationFrames: 40 });
    expect(timeline.beats.map((beat) => beat.target)).toEqual(["quote"]);
    expect(timeline.beats[0].hold).toBe(40 - timeline.beats[0].litFrom);
  });
});

describe("CSS surface", () => {
  it("is empty for a dark target so unlit elements keep their old style", () => {
    expect(focusLightStyle({ tone: "amber", kind: "text" }, { level: 0, flash: 0 })).toEqual({});
  });

  it("puts the flash on top, then the two soft layers, then the hard shadow", () => {
    const style = focusLightStyle({ tone: "amber", kind: "text" }, { level: 1, flash: 0.5 });
    const layers = style.textShadow.split(", ");
    expect(layers[0]).toContain("rgba(255,255,255");
    expect(layers[1]).toContain("rgba(245,158,11");
    expect(layers[2]).toContain("rgba(245,158,11");
    expect(layers[3]).toMatch(/^0 4px 12px rgba\(0,0,0/);
  });

  it("glows a card through boxShadow and never through textShadow", () => {
    const style = focusLightStyle({ tone: "blue", kind: "box" }, { level: 1, flash: 0 });
    expect(style.textShadow).toBeUndefined();
    expect(style.boxShadow).toContain("rgba(77,139,255");
  });

  it("is a pure function of its input (same state, same string)", () => {
    const a = focusLightStyle({ tone: "amber", kind: "text" }, { level: 0.55, flash: 0 });
    const b = focusLightStyle({ tone: "amber", kind: "text" }, { level: 0.55, flash: 0 });
    expect(a).toEqual(b);
  });

  it("reads a beat's own kind over the plan default", () => {
    expect(lightKindFor(LIGHT_PLANS.contrast, "title")).toBe("text");
    expect(lightKindFor(LIGHT_PLANS.contrast, "right")).toBe("box");
  });

  it("reads a beat's own tone over the plan default", () => {
    // The contrast's answer card is blue inside an amber frame; the CTA's ask
    // is amber inside a blue end card. A halo of the wrong hue reads as a bug.
    expect(lightToneFor(LIGHT_PLANS.contrast, "right")).toBe("blue");
    expect(lightToneFor(LIGHT_PLANS.contrast, "title")).toBe("amber");
    expect(lightToneFor(LIGHT_PLANS.cta, "action")).toBe("amber");
    expect(lightToneFor(LIGHT_PLANS.cta, "brand")).toBe("blue");
  });
});
