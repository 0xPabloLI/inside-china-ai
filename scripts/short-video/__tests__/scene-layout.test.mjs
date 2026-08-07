import { describe, it, expect } from "vitest";
import { CANVAS, SAFE_ZONES } from "../lib/safe-zones.mjs";
import { SLOTS, SLOT_X, slotCss, sceneFrame } from "../lib/scene-layout.mjs";

/**
 * Slot layout system (spec D3).
 *
 * The 1080×1920 canvas is divided into fixed vertical slots; scenes compose
 * content into slots instead of hand-rolling full-screen flex + padding.
 * Slots must be ordered, non-overlapping, and contained in SAFE_ZONES —
 * the same invariants the DOM verifier enforces at render time.
 */

describe("SLOTS (vertical bands)", () => {
  it("orders slots strictly top to bottom, touching each other", () => {
    expect(SLOTS.brandHeader.bottom).toBeLessThanOrEqual(SLOTS.kickerTitle.top);
    expect(SLOTS.kickerTitle.bottom).toBeLessThanOrEqual(SLOTS.hero.top);
    expect(SLOTS.hero.bottom).toBeLessThanOrEqual(SLOTS.support.top);
    expect(SLOTS.kickerTitle.top).toBeLessThan(SLOTS.kickerTitle.bottom);
    expect(SLOTS.hero.top).toBeLessThan(SLOTS.hero.bottom);
    expect(SLOTS.support.top).toBeLessThan(SLOTS.support.bottom);
  });

  it("starts content slots below the top UI band (SAFE_ZONES.top)", () => {
    expect(SLOTS.kickerTitle.top).toBeGreaterThanOrEqual(SAFE_ZONES.top);
  });

  it("keeps the support slot fully above the subtitle lane", () => {
    // Content bottom edge = 1920 - SAFE_ZONES.bottom = 1340
    expect(SLOTS.support.bottom).toBe(1920 - SAFE_ZONES.bottom);
    expect(SLOTS.support.bottom).toBe(1340);
  });

  it("keeps the brand header in the top chrome corner", () => {
    expect(SLOTS.brandHeader.top).toBeLessThan(SAFE_ZONES.top);
    expect(SLOTS.brandHeader.top).toBe(60);
  });
});

describe("SLOT_X (horizontal band)", () => {
  it("derives from SAFE_ZONES left/right", () => {
    expect(SLOT_X.left).toBe(SAFE_ZONES.left);
    expect(SLOT_X.right).toBe(CANVAS.width - SAFE_ZONES.right);
    expect(SLOT_X.right).toBe(920);
  });
});

describe("slotCss", () => {
  it("positions every slot class from the constants", () => {
    const css = slotCss();
    for (const cls of ["slot-kicker", "slot-hero", "slot-support"]) {
      expect(css).toContain(cls);
    }
    // Coordinates must come from SLOTS/SLOT_X, never stale literals
    expect(css).toContain(`top: ${SLOTS.kickerTitle.top}px`);
    expect(css).toContain(`top: ${SLOTS.hero.top}px`);
    expect(css).toContain(`top: ${SLOTS.support.top}px`);
    expect(css).toContain(`left: ${SLOT_X.left}px`);
    expect(css).toContain(`right: ${SLOT_X.right}px`);
  });
});

describe("sceneFrame", () => {
  it("renders kicker → hero → support in order", () => {
    const html = sceneFrame({ kicker: "K", hero: "H", support: "S" });
    expect(html.indexOf("slot-kicker")).toBeLessThan(html.indexOf("slot-hero"));
    expect(html.indexOf("slot-hero")).toBeLessThan(html.indexOf("slot-support"));
    expect(html).toContain(">K<");
    expect(html).toContain(">H<");
    expect(html).toContain(">S<");
  });

  it("omits empty slots", () => {
    const html = sceneFrame({ kicker: "", hero: "H", support: "" });
    expect(html).not.toContain("slot-kicker");
    expect(html).not.toContain("slot-support");
    expect(html).toContain("slot-hero");
  });

  it("renders nothing for an empty frame", () => {
    expect(sceneFrame({})).toBe("");
    expect(sceneFrame()).toBe("");
  });

  it("honors alignment variants per slot", () => {
    const html = sceneFrame({ hero: "H", support: "S", align: { hero: "start", support: "end" } });
    expect(html).toContain("slot-hero slot-align-start");
    expect(html).toContain("slot-support slot-align-end");
  });
});
