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
  getGroup,
  shrinkOrder,
  remotionSlotsFor,
  fitCandidates,
  assertKnownTextFields,
  SLOT_FIELDS,
  REMOTION_SLOT_MAP,
} from "../lib/text-slots.mjs";

describe("slot id", () => {
  it("names a slot by layout variant and field", () => {
    expect(slotId({ visualType: "narrative", layout: "media-overlay", field: "result" })).toBe(
      "narrative.media-overlay.result",
    );
  });

  it("indexes repeated text (cards, rows, stats)", () => {
    expect(
      slotId({ visualType: "narrative", layout: "stacked-cards", field: "value", index: 0 }),
    ).toBe("narrative.stacked-cards.value[0]");
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
  it("has its own sizes: 240 preferred, 150 floor, single line", () => {
    const slot = getSlot("hook.hero-center.bigNumber");
    expect(slot.preferredSize).toBe(240);
    expect(slot.minSize).toBe(150);
    expect(slot.maxLines).toBe(1);
    expect(slot.wrapPolicy).toBe("none");
    expect(slot.annotationPolicy).toBe("circle");
  });
});

describe("measured content widths", () => {
  it("uses the measured content width for media-overlay result", () => {
    // 692px = container content box: band 756 minus 2×SPACING['2xl'] (64)
    // horizontal padding. The gate asserts against the content box, so the
    // contract width must exclude padding.
    expect(getSlot("narrative.media-overlay.result").maxWidth).toBe(692);
  });

  it("uses the narrower media-split column", () => {
    // 372px = media-split right column content box, measured in a real
    // Chromium render by measure-slot-widths.mjs (Ticket D).
    expect(getSlot("narrative.media-split.result").maxWidth).toBe(372);
  });

  it("refuses to invent a width it has not measured", () => {
    // attribution is registered but no Remotion template renders it in a
    // quote slot today, so no width has been measured for it.
    expect(() => getSlot("quote.hero-center.attribution")).toThrow(/maxWidth/);
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

  it("walks the focus number down from 240 to 150", () => {
    const ladder = fitCandidates(getSlot("hook.hero-center.bigNumber"));
    expect(ladder[0]).toBe(240);
    expect(Math.min(...ladder)).toBe(150);
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

describe("group budgets (T9, decision 68)", () => {
  it("calibrates both media-overlay bands", () => {
    // Top band: safe-zone top (220) down to the bottom band's highest possible
    // top edge (1150 − 336 = 814) — the two bands may never overlap.
    expect(getGroup("narrative.media-overlay.top-band").maxHeight).toBe(594);
    // Bottom band: the pipeline's established bottom-band budget, the same
    // 336px text bar media-bottom-bar anchors at y=1150.
    expect(getGroup("narrative.media-overlay.bottom-band").maxHeight).toBe(336);
  });

  it("refuses a group nobody calibrated", () => {
    expect(() => getGroup("narrative.media-split.left-column")).toThrow(/maxHeight/);
  });
});

// T5: the Remotion templates converge on the contract (spec decisions 39–53).
// No backwards compatibility: the contract is the single source of truth and
// every field a template actually renders must be declared here.

describe("remotion slot map (T5 contract)", () => {
  const KNOWN = [
    "narrative",
    "hook",
    "stat-reveal",
    "cta",
    "quote",
    "context",
    "contrast",
    "data",
    "info-card",
    "fullscreen",
  ];

  it("registers every template the Remotion renderer can dispatch", () => {
    for (const vt of KNOWN) {
      expect(REMOTION_SLOT_MAP[vt], `missing REMOTION_SLOT_MAP entry for ${vt}`).toBeDefined();
    }
  });

  it("declares all four field categories for every layout", () => {
    for (const [vt, layouts] of Object.entries(REMOTION_SLOT_MAP)) {
      for (const [layout, groups] of Object.entries(layouts)) {
        for (const key of ["rendered", "control", "optional", "intentionallyOmitted"]) {
          expect(Array.isArray(groups[key]), `${vt}.${layout}.${key} must be an array`).toBe(true);
        }
      }
    }
  });

  it("gives every rendered/optional field a size entry and a measured width", () => {
    for (const [vt, layouts] of Object.entries(REMOTION_SLOT_MAP)) {
      for (const [layout, groups] of Object.entries(layouts)) {
        for (const field of [...groups.rendered, ...groups.optional]) {
          const id = slotId({ visualType: vt, layout, field });
          const slot = getSlot(id);
          expect(slot.minSize).toBeGreaterThan(0);
          expect(Number.isFinite(slot.maxWidth), `missing measured width for ${id}`).toBe(true);
        }
      }
    }
  });

  it("resolves indexed fields through their base width entry", () => {
    expect(getSlot("contrast.hero-center.left[0]").maxWidth).toBe(
      getSlot("contrast.hero-center.left").maxWidth,
    );
  });

  it("throws for an unknown visualType", () => {
    expect(() => remotionSlotsFor("nope")).toThrow(/visualType/);
  });

  it("throws for an unknown layout of a known visualType", () => {
    expect(() => remotionSlotsFor("hook", "somewhere-else")).toThrow(/layout/);
  });
});

describe("T5 field registry", () => {
  it("registers the fields the templates render today", () => {
    for (const field of [
      "badge",
      "brand",
      "label",
      "subtext",
      "detail",
      "subtitle",
      "note",
      "vs",
      "verified",
      "points",
      "statCard",
    ]) {
      expect(SLOT_FIELDS[field], `missing registry entry for ${field}`).toBeDefined();
    }
  });

  it("floors new fields at round(0.72 × preferred)", () => {
    for (const field of [
      "badge",
      "brand",
      "detail",
      "vs",
      "verified",
      "points",
      "subtext",
      "statCard",
    ]) {
      const { preferredSize, minSize } = SLOT_FIELDS[field];
      expect(minSize, `${field} minSize`).toBe(Math.round(0.72 * preferredSize));
    }
  });

  it("keeps the focus number family single-line at 240 preferred", () => {
    // spec decision 72: bigNumber floor relaxed 180 -> 150 (GLM-6.0, 7 chars);
    // stat keeps the original 0.72-ratio floor.
    const floors = { bigNumber: 150, stat: 180 };
    for (const field of ["bigNumber", "stat"]) {
      const { preferredSize, minSize, maxLines, wrapPolicy } = SLOT_FIELDS[field];
      expect(preferredSize).toBe(240);
      expect(minSize, `${field} minSize`).toBe(floors[field]);
      expect(maxLines).toBe(1);
      expect(wrapPolicy).toBe("none");
    }
  });

  it("keeps the focus stat's annotation circle", () => {
    // DataScene draws an animated circle around its stat number.
    const slot = getSlot("data.hero-center.stat");
    expect(slot.annotationPolicy).toBe("circle");
  });
});

describe("assertKnownTextFields (T5 render-layer validation)", () => {
  it("accepts every field a template renders, including control fields", () => {
    expect(() =>
      assertKnownTextFields("narrative", "media-overlay", {
        badge: "B",
        company: "C",
        action: "A",
        result: "R",
        highlight: "H",
        context: "X",
        source: "S",
      }),
    ).not.toThrow();
    expect(() =>
      assertKnownTextFields("contrast", "hero-center", {
        title: "T",
        vs: "VS",
        left: ["L"],
        right: ["R"],
        note: "N",
        noteHighlight: "H",
      }),
    ).not.toThrow();
  });

  it("rejects a typo'd field with its name and a registration pointer (#32)", () => {
    // Rendered fields must be present first, or the rendered-missing check
    // (T9) fires before the typo check.
    expect(() =>
      assertKnownTextFields("narrative", "media-overlay", {
        company: "C",
        action: "A",
        result: "R",
        compny: "TYPO",
      }),
    ).toThrow(/Unknown text field "compny"/);
  });

  it("rejects a real field used on a template that never declared it", () => {
    // `quote` is registered in SLOT_FIELDS but quote.hero-center is not the
    // narrative template's business.
    expect(() =>
      assertKnownTextFields("narrative", "media-overlay", {
        company: "C",
        action: "A",
        result: "R",
        quote: "Q",
      }),
    ).toThrow(/quote/);
  });

  it("maps the data scene's statLabel key onto the label contract field", () => {
    expect(() =>
      assertKnownTextFields("data", "hero-center", {
        stat: "8×",
        statLabel: "OVERSUBSCRIBED",
        subtext: "S",
        source: "X",
      }),
    ).not.toThrow();
  });

  it("accepts hook stats as a structural container (subfields gate separately)", () => {
    expect(() =>
      assertKnownTextFields("hook", "hero-center", {
        stats: [{ num: "1", unit: "U", label: "L" }],
        color: "blue",
        subjectLogo: "qwen",
      }),
    ).not.toThrow();
  });

  it("treats empty (but present) values as a deliberate render-nothing (#34)", () => {
    expect(() =>
      assertKnownTextFields("contrast", "hero-center", {
        title: "T",
        vs: "",
        left: [],
        right: [],
      }),
    ).not.toThrow();
  });

  it("fails absent rendered fields (T9): a hollow template is a scene-data bug", () => {
    // No texts at all → every rendered promise is broken.
    expect(() => assertKnownTextFields("narrative", "media-overlay", undefined)).toThrow(
      /Rendered text field\(s\) "company", "action", "result" missing/,
    );
    expect(() => assertKnownTextFields("contrast", "hero-center", {})).toThrow(
      /Rendered text field\(s\) "title", "left", "right" missing/,
    );
    // A single missing rendered field is named on its own.
    expect(() =>
      assertKnownTextFields("narrative", "media-overlay", { company: "C", action: "A" }),
    ).toThrow(/Rendered text field\(s\) "result" missing/);
    // Templates without rendered promises still accept empty texts.
    expect(() => assertKnownTextFields("fullscreen", "media", undefined)).not.toThrow();
    expect(() => assertKnownTextFields("hook", "hero-center", {})).not.toThrow();
  });

  it("keeps mediaOptOut out of the texts contract (decision 66)", () => {
    // mediaOptOut is a scene-level field (scene-rules / final-media-gate /
    // the b-roll orchestrator all read scene.mediaOptOut). Inside texts it is
    // a misplaced key the render layer rejects.
    expect(() =>
      assertKnownTextFields("narrative", "media-bottom-bar", {
        company: "C",
        action: "A",
        result: "R",
        mediaOptOut: true,
      }),
    ).toThrow(/Unknown text field "mediaOptOut"/);
    for (const layout of Object.values(REMOTION_SLOT_MAP.narrative)) {
      for (const group of Object.values(layout)) {
        expect(group).not.toContain("mediaOptOut");
      }
    }
  });

  it("declares stacked-cards badge so qwen4 s9 renders through (decision 65)", () => {
    expect(() =>
      assertKnownTextFields("narrative", "stacked-cards", {
        badge: "LOOP CLOSURE",
        company: "C",
        context: "X",
        action: "A",
        result: "R",
        highlight: "R",
        source: "S",
      }),
    ).not.toThrow();
    expect(getSlot("narrative.stacked-cards.badge").maxWidth).toBeGreaterThan(0);
  });
});
