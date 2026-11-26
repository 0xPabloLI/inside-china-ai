/**
 * Declared header plan for a scene (#1561).
 *
 * `BrandBar` draws the channel lockup and the BRIEFING chip; a hook that
 * declares a badge draws the pill in the SAME left slot instead of the lockup
 * (brand yields for that scene). This module turns that occupancy rule into a
 * list of boxes so preflight can judge the constants before a frame exists.
 *
 * Runtime reality is judged separately by `FixedCollisionAssert`, which reads
 * the real DOM. The two layers share `collision-geometry.mjs`, so a rule change
 * cannot drift between them.
 */
import { HEADER_SLOTS } from "./safe-zones.mjs";
import { findBoxCollisions } from "./collision-geometry.mjs";

/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/** Convert a left/top slot box to the geometry module's x/y shape. */
export function slotBoxOf(slot) {
  return { x: slot.left, y: slot.top, width: slot.width, height: slot.height };
}

/**
 * Boxes a header renders for a scene.
 *
 * @param {{ hasBadge?: boolean, showBrand?: boolean }} [opts]
 * @returns {Array<{ id: string, box: Box }>}
 */
export function headerBoxes({ hasBadge = false, showBrand = true } = {}) {
  const boxes = [{ id: "header.briefing", box: slotBoxOf(HEADER_SLOTS.briefing) }];
  if (hasBadge) {
    // The badge owns the left slot: the lockup is not drawn (mutual exclusion).
    boxes.push({ id: "header.badge", box: slotBoxOf(HEADER_SLOTS.badge) });
  } else if (showBrand) {
    boxes.push({ id: "header.brand", box: slotBoxOf(HEADER_SLOTS.brand) });
  }
  return boxes;
}

/**
 * Illegal intersections among the declared header boxes.
 *
 * @param {{ hasBadge?: boolean, showBrand?: boolean }} [opts]
 * @returns {ReturnType<typeof findBoxCollisions>}
 */
export function headerCollisionIssues(opts = {}) {
  return findBoxCollisions(headerBoxes(opts));
}
