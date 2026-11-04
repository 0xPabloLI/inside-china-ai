/**
 * Token contract tests for the video surface (#731).
 *
 * The values here are the authored contract from the issue/design discussion:
 * spring tiers follow locomotion (title / item / accent), stagger bands follow
 * iart's kinetic-typography table, and the hold budget is 30–45 frames at 30fps.
 * Every assertion below pins an independent expectation — nothing is derived
 * from the module under test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  COLOR,
  TYPE,
  MOTION,
  HOLD,
  CAMERA,
  holdFramesFor,
  settleByFrame,
  cameraSpecFor,
  cameraStateAt,
  fitEntranceWindow,
} from "../remotion/src/tokens.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "remotion", "src");
const readSrc = (rel) => readFileSync(join(SRC, rel), "utf8");

describe("colour and type tokens", () => {
  it("uses the Dispatch Blue brand accent from DESIGN.md", () => {
    expect(COLOR.brand).toBe("#4d8bff");
    expect(COLOR.canvas).toBe("#0a0a14");
    expect(COLOR.text).toBe("#f5f5f5");
  });

  it("pins the video surface to the pipeline's single brand font stack", () => {
    // BRAND_FONT_STACK (lib/safe-zones.mjs) is the established video face;
    // the token layer must not introduce a second family.
    expect(TYPE.family).toBe("'Times New Roman', Times, serif");
  });
});

describe("motion tokens — spring tiers", () => {
  it("declares exactly three spring tiers", () => {
    expect(Object.keys(MOTION.spring).sort()).toEqual(["accent", "heading", "item"]);
  });

  it("orders the tiers by weight: heading heaviest, item snappiest, accent stiffest", () => {
    // Locomotion's three tiers, as numbers: titles 200/20, items 180/15,
    // emphasis 250/12 (damping/stiffness).
    expect(MOTION.spring.heading).toMatchObject({ damping: 200, stiffness: 20 });
    expect(MOTION.spring.item).toMatchObject({ damping: 180, stiffness: 15 });
    expect(MOTION.spring.accent).toMatchObject({ damping: 250, stiffness: 12 });
  });

  it("keeps every preset critically damped (no oscillation on text)", () => {
    for (const preset of Object.values(MOTION.spring)) {
      expect(preset.damping).toBeGreaterThanOrEqual(180);
      expect(preset.damping / preset.stiffness).toBeGreaterThanOrEqual(9);
    }
  });
});

describe("motion tokens — stagger bands", () => {
  it("keeps line / word stagger inside the iart bands", () => {
    expect(MOTION.stagger.line).toBeGreaterThanOrEqual(0.06);
    expect(MOTION.stagger.line).toBeLessThanOrEqual(0.1);

    expect(MOTION.stagger.word).toBeGreaterThanOrEqual(0.04);
    expect(MOTION.stagger.word).toBeLessThanOrEqual(0.07);
  });

  it("keeps lines slower than words", () => {
    expect(MOTION.stagger.line).toBeGreaterThan(MOTION.stagger.word);
  });
});

describe("hold budget", () => {
  it("reserves a 30–45 frame still window at 30fps", () => {
    expect(HOLD.window.min).toBe(30);
    expect(HOLD.window.max).toBe(45);
  });

  it("keeps the default and every override inside the window", () => {
    expect(HOLD.default).toBeGreaterThanOrEqual(HOLD.window.min);
    expect(HOLD.default).toBeLessThanOrEqual(HOLD.window.max);
    for (const frames of Object.values(HOLD.byVisualType)) {
      expect(frames).toBeGreaterThanOrEqual(HOLD.window.min);
      expect(frames).toBeLessThanOrEqual(HOLD.window.max);
    }
  });

  it("resolves per-type overrides, falling back to the default", () => {
    expect(holdFramesFor("hook")).toBe(30);
    expect(holdFramesFor("data")).toBe(45);
    expect(holdFramesFor("narrative")).toBe(HOLD.default);
    expect(holdFramesFor("unknown")).toBe(HOLD.default);
  });

  it("leaves at least the hold window between settle and scene end", () => {
    const durationFrames = 180; // a real 6s scene
    expect(durationFrames - settleByFrame(durationFrames, "narrative")).toBe(
      holdFramesFor("narrative"),
    );
    // Degenerate short scenes still leave one movable frame rather than NaN.
    expect(settleByFrame(10, "narrative")).toBe(1);
  });
});

describe("camera tokens", () => {
  it("locks hook and CTA (cover frame / brand close)", () => {
    expect(cameraSpecFor("hook")).toBeNull();
    expect(cameraSpecFor("cta")).toBeNull();
    expect(cameraStateAt(0, 180, "hook")).toBeNull();
    expect(cameraStateAt(0, 180, "cta")).toBeNull();
  });

  it.each(["narrative", "data", "info-card", "quote", "context", "contrast", "stat-reveal"])(
    "moves the composition layer for %s",
    (visualType) => {
      expect(cameraSpecFor(visualType)).not.toBeNull();
    },
  );

  it("starts at the authored offset and settles exactly on settleByFrame", () => {
    const durationFrames = 180;
    const spec = cameraSpecFor("narrative");
    const atZero = cameraStateAt(0, durationFrames, "narrative");
    expect(atZero.scale).toBeCloseTo(spec.scaleFrom, 10);
    expect(atZero.translateY).toBeCloseTo(spec.driftY, 10);

    const atSettle = cameraStateAt(
      settleByFrame(durationFrames, "narrative"),
      durationFrames,
      "narrative",
    );
    expect(atSettle.scale).toBeCloseTo(spec.scaleTo, 10);
    // The rest pose is identity: authored, safe-zone-checked coordinates.
    expect(atSettle.translateY).toBeCloseTo(0, 10);
  });

  it("holds perfectly still for the whole closing window", () => {
    const durationFrames = 180;
    const settleAt = settleByFrame(durationFrames, "narrative");
    const baseline = cameraStateAt(settleAt, durationFrames, "narrative");
    for (let frame = settleAt; frame <= durationFrames; frame += 1) {
      expect(cameraStateAt(frame, durationFrames, "narrative")).toEqual(baseline);
    }
  });

  it("pulls out monotonically and sub-perceptually per frame", () => {
    const durationFrames = 180;
    const settleAt = settleByFrame(durationFrames, "narrative");
    let previous = cameraStateAt(0, durationFrames, "narrative").scale;
    for (let frame = 1; frame <= settleAt; frame += 1) {
      const scale = cameraStateAt(frame, durationFrames, "narrative").scale;
      expect(scale).toBeLessThanOrEqual(previous + 1e-12);
      // < 0.02% of frame width per frame — reads as drift, never as a pan.
      expect(previous - scale).toBeLessThanOrEqual(0.0002 + 1e-12);
      previous = scale;
    }
  });

  it("pulls every enabled type out to the authored resting pose", () => {
    for (const visualType of [
      "narrative",
      "data",
      "info-card",
      "quote",
      "context",
      "contrast",
      "stat-reveal",
    ]) {
      const spec = cameraSpecFor(visualType);
      expect(spec).toEqual(CAMERA.default);
      expect(spec.scaleFrom).toBeGreaterThan(spec.scaleTo);
      expect(spec.scaleTo).toBe(1);
      expect(spec.driftY).toBeGreaterThan(0);
    }
  });
});

describe("camera wiring at the scene layer", () => {
  it.each([
    ["scenes/NarrativeScene.tsx", "narrative"],
    ["scenes/DataScene.tsx", "data"],
    ["scenes/InfoCardScene.tsx", "info-card"],
    ["scenes/QuoteScene.tsx", "quote"],
    ["scenes/ContextScene.tsx", "context"],
    ["scenes/ContrastScene.tsx", "contrast"],
    ["scenes/StatRevealScene.tsx", "stat-reveal"],
  ])("wraps the composition layer in %s", (file, visualType) => {
    const source = readSrc(file);
    expect(source).toContain('import { Camera } from "../components/Camera"');
    expect(source).toContain(`<Camera visualType="${visualType}" duration={duration}>`);
    const opens = source.match(/<Camera\b/g) ?? [];
    const closes = source.match(/<\/Camera>/g) ?? [];
    expect(opens.length).toBe(closes.length);
    expect(opens.length).toBeGreaterThan(0);
  });

  it("mounts Camera on hook and CTA for the hold budget, without a transform", () => {
    for (const [file, visualType] of [
      ["scenes/HookScene.tsx", "hook"],
      ["scenes/CtaScene.tsx", "cta"],
    ]) {
      const source = readSrc(file);
      expect(source).toContain('import { Camera } from "../components/Camera"');
      expect(source).toContain(`<Camera visualType="${visualType}" duration={duration}>`);
      expect(cameraSpecFor(visualType)).toBeNull();
    }
  });

  it("never wraps media: fullscreen and background stay camera-free", () => {
    for (const file of ["scenes/FullscreenMedia.tsx", "components/MediaBackground.tsx"]) {
      expect(readSrc(file)).not.toContain("Camera");
    }
  });
});

describe("entrance budget — hold-aware windows", () => {
  it("leaves a legal window untouched", () => {
    expect(fitEntranceWindow(0, 12, 135)).toEqual({ start: 0, end: 12 });
  });

  it("shifts an overrunning window earlier", () => {
    const fitted = fitEntranceWindow(130, 12, 135);
    expect(fitted.end).toBe(135);
    expect(fitted.start).toBe(123);
    expect(fitted.end - fitted.start).toBe(12);
  });

  it("compresses a window that cannot fit before the boundary", () => {
    const fitted = fitEntranceWindow(4, 30, 10);
    expect(fitted).toEqual({ start: 0, end: 10 });
  });

  it("does nothing when no scene budget is published", () => {
    expect(fitEntranceWindow(200, 12, null)).toEqual({ start: 200, end: 212 });
  });

  it("routes every entrance primitive through useEntranceWindow", () => {
    const source = readSrc("components/animations/entrance.tsx");
    const uses = source.match(/useEntranceWindow\(/g) ?? [];
    // Eight single-element primitives plus the two stagger groups.
    expect(uses.length).toBeGreaterThanOrEqual(10);
    expect(source).toContain('from "../motion-budget"');
  });
});

describe("entrance spring wiring", () => {
  it("uses remotion's spring, not bezier easing, for entrances", () => {
    const source = readSrc("components/animations/entrance.tsx");
    expect(source).toContain('from "remotion"');
    expect(source).toMatch(/\bspring\(/);
    expect(source).toContain("MOTION.spring.heading");
    expect(source).toContain("MOTION.spring.item");
    expect(source).toContain("MOTION.spring.accent");
    expect(source).not.toContain("Easing.bezier");
  });

  it("exposes line and word stagger primitives on the token units", () => {
    const source = readSrc("components/animations/entrance.tsx");
    expect(source).toContain("export const StaggerLines");
    expect(source).toContain("export const StaggerWords");
    expect(source).toContain("MOTION.stagger.line");
    expect(source).toContain("MOTION.stagger.word");
  });

  it("keeps loops bezier/idle-free (no spring wobble on idle elements)", () => {
    const source = readSrc("components/animations/loops.tsx");
    expect(source).not.toMatch(/\bspring\(/);
  });
});
