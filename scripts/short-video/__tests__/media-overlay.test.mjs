/**
 * Media overlay table (#1305).
 *
 * The scrim used to be hardcoded in three writers at 0.7–0.8, which measured
 * as "the picture is on screen but you cannot see it". These tests pin the
 * shared table and the fail-closed lookup.
 */
import { describe, it, expect } from "vitest";

import {
  MEDIA_OVERLAY,
  DEFAULT_MEDIA_OVERLAY,
  overlayForVisualType,
} from "../lib/media-overlay.mjs";

describe("MEDIA_OVERLAY", () => {
  it("keeps every entry a legal opacity", () => {
    for (const [type, value] of Object.entries(MEDIA_OVERLAY)) {
      expect(typeof value, type).toBe("number");
      expect(value, type).toBeGreaterThanOrEqual(0);
      expect(value, type).toBeLessThanOrEqual(1);
    }
  });

  it("#1305: the image-carrying types are lighter than the old flat 0.7", () => {
    for (const type of ["context", "contrast", "narrative"]) {
      expect(MEDIA_OVERLAY[type], type).toBeLessThan(0.7);
    }
  });

  it("quote stays heavy — a long pull quote has to read over any source", () => {
    expect(MEDIA_OVERLAY.quote).toBeGreaterThanOrEqual(0.75);
  });

  it("stat-reveal stays ambient but perceivable — the rail is the vignette's job, not the scrim's", () => {
    expect(MEDIA_OVERLAY["stat-reveal"]).toBe(0.5);
  });
});

describe("overlayForVisualType", () => {
  it("resolves a known type from the table", () => {
    expect(overlayForVisualType("context")).toBe(MEDIA_OVERLAY.context);
    expect(overlayForVisualType("hook")).toBe(MEDIA_OVERLAY.hook);
    expect(overlayForVisualType("info-card")).toBe(MEDIA_OVERLAY["info-card"]);
  });

  it("falls back for an unknown type", () => {
    expect(overlayForVisualType("brand-new-layout")).toBe(DEFAULT_MEDIA_OVERLAY);
  });

  it("falls back for non-strings instead of throwing", () => {
    expect(overlayForVisualType(undefined)).toBe(DEFAULT_MEDIA_OVERLAY);
    expect(overlayForVisualType(null)).toBe(DEFAULT_MEDIA_OVERLAY);
    expect(overlayForVisualType(7)).toBe(DEFAULT_MEDIA_OVERLAY);
    expect(overlayForVisualType("")).toBe(DEFAULT_MEDIA_OVERLAY);
  });

  it("does not resolve a prototype key into a function", () => {
    // `MEDIA_OVERLAY[visualType] ?? default` would hand back Object's
    // constructor here and write `overlay: undefined` into scene data.
    expect(overlayForVisualType("constructor")).toBe(DEFAULT_MEDIA_OVERLAY);
    expect(overlayForVisualType("toString")).toBe(DEFAULT_MEDIA_OVERLAY);
    expect(overlayForVisualType("__proto__")).toBe(DEFAULT_MEDIA_OVERLAY);
  });
});
