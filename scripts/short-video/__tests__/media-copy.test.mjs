import { describe, it, expect } from "vitest";
import {
  MEDIA_COPY_LIMIT,
  compactMediaTexts,
  isCompactMediaScene,
  mediaCopyRowCount,
} from "../lib/media-copy.mjs";
import { checkMediaCopyDensity } from "../lib/scene-rules.mjs";
import { mediaBottomBarHeightFor, mediaFirstBarHeightFor } from "../lib/safe-zones.mjs";

const scene = (patch = {}) => ({
  visualType: "narrative",
  layout: "media-bottom-bar",
  mediaRole: "evidence",
  media: { type: "image", path: "assets/a.jpg" },
  texts: { company: "A", action: "B", result: "C", source: "D" },
  ...patch,
});

describe("media copy density", () => {
  it("keeps the subject and payoff, drops action and attribution", () => {
    const compact = compactMediaTexts(scene().texts);
    expect(compact).toEqual({ company: "A", result: "C" });
    expect(mediaCopyRowCount(compact)).toBe(2);
  });

  it("falls through the priority order when a row is absent", () => {
    expect(compactMediaTexts({ action: "B", source: "D" })).toEqual({
      action: "B",
      source: "D",
    });
    expect(mediaCopyRowCount({ result: "C", action: "B", source: "D" })).toBe(3);
  });

  it("preserves non-row controls such as highlight", () => {
    const compact = compactMediaTexts({
      company: "A",
      action: "B",
      result: "C",
      source: "D",
      highlight: { field: "result", text: "C" },
    });
    expect(compact.highlight).toEqual({ field: "result", text: "C" });
  });

  it("is idempotent and respects the limit", () => {
    const compact = compactMediaTexts(scene().texts);
    expect(compactMediaTexts(compact)).toEqual(compact);
    expect(MEDIA_COPY_LIMIT).toBe(2);
  });

  it("gives the freed rows back to the picture", () => {
    const compact = compactMediaTexts(scene().texts);
    expect(mediaBottomBarHeightFor(compact)).toBe(69 + 74 + 8 + 34 + 16);
    expect(mediaFirstBarHeightFor(compact)).toBe(69 + 74 + 8 + 34 + 16);
  });

  it("targets only full-bleed evidence pages", () => {
    expect(isCompactMediaScene(scene())).toBe(true);
    expect(isCompactMediaScene(scene({ layout: "media-first" }))).toBe(true);
    expect(isCompactMediaScene(scene({ layout: "stacked-cards" }))).toBe(false);
    expect(isCompactMediaScene(scene({ mediaRole: "background" }))).toBe(false);
    expect(isCompactMediaScene(scene({ media: { mode: "card" } }))).toBe(false);
    expect(isCompactMediaScene(scene({ visualType: "hook" }))).toBe(false);
    expect(isCompactMediaScene(scene({ media: null }))).toBe(false);
  });

  it("does not compact a page-capture card", () => {
    const card = scene({ media: { mode: "card", type: "image", path: "assets/page.png" } });
    expect(isCompactMediaScene(card)).toBe(false);
  });
});

describe("media copy preflight", () => {
  it("fails a new pack whose full-bleed page declares four rows", () => {
    const rows = checkMediaCopyDensity([scene()], { meta: { createdAt: "2026-11-25" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("fail");
    expect(rows[0].check).toBe("Media page copy density");
    expect(rows[0].detail).toContain("4 copy rows");
  });

  it("passes a new pack with two rows", () => {
    const two = scene({ texts: { company: "A", result: "C" } });
    expect(checkMediaCopyDensity([two], { meta: { createdAt: "2026-11-25" } })).toEqual([]);
  });

  it("grandfathers packs created before the ruling", () => {
    expect(checkMediaCopyDensity([scene()], { meta: { createdAt: "2026-11-23" } })).toEqual([]);
  });

  it("leaves cards and text-led layouts alone", () => {
    const card = scene({ media: { mode: "card", type: "image", path: "assets/page.png" } });
    const split = scene({ layout: "media-split" });
    expect(checkMediaCopyDensity([card, split], { meta: { createdAt: "2026-11-25" } })).toEqual([]);
  });
});
