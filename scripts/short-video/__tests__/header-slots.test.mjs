import { describe, it, expect } from "vitest";
import { CANVAS, HEADER_SLOTS, MEDIA_LED, SAFE_ZONES } from "../lib/safe-zones.mjs";
import { getSlot } from "../lib/text-slots.mjs";

/**
 * Header mutual-exclusion contract (#1561).
 *
 * The top of every 9:16 frame carries three kinds of fixed element:
 *
 *   brand lockup (CHINA AI NEWS mark + wordmark)  ×
 *   per-scene kicker badge pill                    —
 *   BRIEFING chip                                  ×
 *
 * `BrandBar` used to render the lockup and the chip unconditionally while the
 * hook kicker occupied the same y band and started at x = SAFE_ZONES.left —
 * the ABot-World 0.5 hook showed the red pill covering both the wordmark and
 * the right chip. These tests lock the replacement: brand and badge are the
 * SAME slot (mutually exclusive), the chip keeps a reserved right box, and the
 * badge's own box never reaches the chip.
 *
 * The geometry is duplicated in remotion/src/components/visuals.tsx; the
 * render-time `FixedCollisionAssert` reads the real DOM boxes, this test locks
 * the declared ones so a constant edit cannot silently reintroduce the
 * overlap.
 */

const rightEdge = CANVAS.width - SAFE_ZONES.right;

describe("header mutual-exclusion slots", () => {
  it("keeps the badge inside the content band and clear of the BRIEFING chip", () => {
    expect(HEADER_SLOTS.badge.left).toBe(SAFE_ZONES.left);
    expect(HEADER_SLOTS.badge.right + HEADER_SLOTS.briefing.width + HEADER_SLOTS.gap).toBe(
      rightEdge,
    );
    expect(HEADER_SLOTS.badge.width + HEADER_SLOTS.briefing.width + HEADER_SLOTS.gap).toBe(
      rightEdge - SAFE_ZONES.left,
    );
    // The badge's right edge must leave the declared gap before the chip.
    const badgeRight = HEADER_SLOTS.badge.left + HEADER_SLOTS.badge.width;
    expect(badgeRight + HEADER_SLOTS.gap).toBe(HEADER_SLOTS.briefing.left);
    expect(badgeRight).toBeLessThanOrEqual(rightEdge);
  });

  it("keeps the brand lockup clear of the chip when no badge is drawn", () => {
    const brandRight = HEADER_SLOTS.brand.left + HEADER_SLOTS.brand.width;
    expect(HEADER_SLOTS.brand.left).toBe(SAFE_ZONES.left);
    expect(brandRight + HEADER_SLOTS.gap).toBeLessThanOrEqual(HEADER_SLOTS.briefing.left);
    expect(HEADER_SLOTS.brand.height).toBeGreaterThan(0);
  });

  it("keeps every drawn left element clear of the chip", () => {
    // brand and badge deliberately share the left slot (mutual exclusion) —
    // only the pairs that can be drawn together are judged.
    const boxes = [
      ["brand", HEADER_SLOTS.brand],
      ["briefing", HEADER_SLOTS.briefing],
      ["badge", HEADER_SLOTS.badge],
    ];
    const pairs = [
      ["brand", "briefing"],
      ["badge", "briefing"],
    ];
    const area = (b) => b.width * b.height;
    for (const [aName, bName] of pairs) {
      const a = boxes.find(([name]) => name === aName)[1];
      const b = boxes.find(([name]) => name === bName)[1];
      const w = Math.max(
        0,
        Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
      );
      const h = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
      expect(w * h, `${aName}∩${bName} must be empty`).toBe(0);
      expect(area(a)).toBeGreaterThan(0);
      expect(area(b)).toBeGreaterThan(0);
    }
  });

  it("keeps the badge in the hook kicker band, above the subject row", () => {
    expect(HEADER_SLOTS.badge.top).toBe(MEDIA_LED.kicker.top);
    expect(HEADER_SLOTS.badge.height).toBe(MEDIA_LED.kicker.height);
    const badgeBottom = HEADER_SLOTS.badge.top + HEADER_SLOTS.badge.height;
    expect(badgeBottom).toBeLessThanOrEqual(MEDIA_LED.subject.top);
  });

  it("gives both hook layouts the same text width inside the 663px slot", () => {
    expect(HEADER_SLOTS.badge.width - HEADER_SLOTS.badge.chromeWidth).toBe(
      HEADER_SLOTS.badge.textWidth,
    );
    for (const layout of ["media-led", "hero-center"]) {
      const slot = getSlot(`hook.${layout}.badge`);
      expect(slot.maxWidth, `hook.${layout}.badge`).toBe(HEADER_SLOTS.badge.textWidth);
    }
  });
});
