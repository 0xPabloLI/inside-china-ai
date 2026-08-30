/**
 * Tests for the text slot contract (T2).
 *
 * The contract is the single source of truth consumed by four places: Remotion
 * components, HTML templates, the content-hint budget, and the verifier. Sizes
 * and wrap rules below come from the spec's decision table — not from whatever
 * the two render paths happen to hardcode today.
 */
import { describe, it, expect } from "vitest";
import {
  slotId,
  getSlot,
  shrinkOrder,
  htmlSlotsFor,
  fitCandidates,
  SLOT_FIELDS,
} from "../lib/text-slots.mjs";

describe("slot id", () => {
  it("names a slot by layout variant and field", () => {
    expect(slotId({ visualType: "narrative", layout: "media-overlay", field: "result" })).toBe(
      "narrative.media-overlay.result",
    );
  });

  it("indexes repeated text (cards, rows, stats)", () => {
    expect(slotId({ visualType: "narrative", layout: "stacked-cards", field: "value", index: 0 })).toBe(
      "narrative.stacked-cards.value[0]",
    );
  });

  it("falls back to a default layout when a scene omits it", () => {
    // Remotion's NarrativeScene has always defaulted to media-bottom-bar.
    expect(slotId({ visualType: "narrative", field: "result" })).toBe(
      "narrative.media-bottom-bar.result",
    );
  });
});

describe("field size defaults", () => {
  it("gives result its preferred and minimum size", () => {
    const slot = getSlot("narrative.media-overlay.result");
    expect(slot.preferredSize).toBe(56);
    expect(slot.minSize).toBe(40);
  });

  it("covers every field the scene templates render", () => {
    for (const field of ["result", "company", "action", "context", "source"]) {
      expect(SLOT_FIELDS[field], `missing defaults for ${field}`).toBeDefined();
      expect(SLOT_FIELDS[field].minSize).toBeGreaterThan(0);
    }
  });
});

describe("wrap policy", () => {
  it("keeps annotated text on one line and scales it instead", () => {
    // rough-notation wraps text in an inline-block with white-space:pre, so a
    // highlighted string can never wrap — it has to shrink.
    const slot = getSlot("narrative.media-overlay.result", { annotationPolicy: "highlight-box" });
    expect(slot.maxLines).toBe(1);
    expect(slot.wrapPolicy).toBe("none");
  });

  it("lets unannotated body text wrap to two lines", () => {
    const slot = getSlot("narrative.media-overlay.action");
    expect(slot.wrapPolicy).toBe("wrap");
    expect(slot.maxLines).toBe(2);
  });
});

describe("focus number (bigNumber) contract", () => {
  it("has its own sizes: 240 preferred, 180 floor, single line", () => {
    const slot = getSlot("hook.hero-center.bigNumber");
    expect(slot.preferredSize).toBe(240);
    expect(slot.minSize).toBe(180);
    expect(slot.maxLines).toBe(1);
    expect(slot.wrapPolicy).toBe("none");
    expect(slot.annotationPolicy).toBe("circle");
  });
});

describe("measured content widths", () => {
  it("uses the measured content width for media-overlay result", () => {
    // 756px is the content box measured on qwen4 Scene 9 (border box 820).
    expect(getSlot("narrative.media-overlay.result").maxWidth).toBe(756);
  });

  it("uses the narrower media-split column", () => {
    // NarrativeScene allocates width 420 with maxWidth 420 - 2*SPACING.xl.
    expect(getSlot("narrative.media-split.result").maxWidth).toBe(372);
  });

  it("refuses to invent a width it has not measured", () => {
    expect(() => getSlot("narrative.media-bottom-bar.result")).toThrow(/maxWidth/);
  });
});

describe("fit ladder", () => {
  it("never offers a size below the slot's floor", () => {
    // v3.1 briefly allowed shrinking to minSize * 0.9 when fields overflowed
    // together. That produced unreadable text instead of a failure, so the
    // ladder stops dead at minSize — callers must cancelRender instead.
    const ladder = fitCandidates(getSlot("narrative.media-overlay.result"));
    expect(ladder[0]).toBe(56);
    expect(ladder[ladder.length - 1]).toBe(40);
    expect(Math.min(...ladder)).toBe(40);
  });

  it("walks the focus number down from 240 to 180", () => {
    const ladder = fitCandidates(getSlot("hook.hero-center.bigNumber"));
    expect(ladder[0]).toBe(240);
    expect(Math.min(...ladder)).toBe(180);
  });
});

describe("shrink order", () => {
  it("shrinks context first and result last", () => {
    const ids = ["result", "company", "action", "context"].map((field) =>
      slotId({ visualType: "narrative", layout: "media-overlay", field }),
    );
    expect(shrinkOrder(ids).map((id) => id.split(".").pop())).toEqual([
      "context",
      "action",
      "company",
      "result",
    ]);
  });
});

describe("HTML template mapping", () => {
  it("maps by visualType, because the HTML renderer ignores scene.layout", () => {
    const slots = htmlSlotsFor("hook");
    expect(slots).toContain("hook.hero-center.bigNumber");
    expect(slots).toContain("hook.hero-center.subject");
  });

  it("includes the fullscreen media source label (the 10th dynamic text)", () => {
    // FullscreenMedia renders media.source; it is easy to forget because it is
    // the only text that comes from the media block rather than scene.texts.
    expect(htmlSlotsFor("fullscreen")).toContain("fullscreen.source");
  });
});
