/**
 * Pure AABB collision geometry for fixed on-screen elements (#1561).
 *
 * Two layers consume this:
 *   - the render-time `FixedCollisionAssert` (remotion/src/components/
 *     fixed-collision-gate.tsx) measures the real DOM boxes of every
 *     `[data-collision-box]` element inside one scene and fails the render
 *     when any pair intersects;
 *   - `scene-rules.checkHeaderSlots` runs the same verdict on the DECLARED
 *     header boxes before a frame exists, so a constants edit cannot silently
 *     reintroduce an overlap.
 *
 * Rules:
 *   - edge-touching is NOT collision (adjacent bands share a boundary);
 *   - zero-area boxes are absent (hidden `display:none` / unrendered slots);
 *   - ancestor/descendant pairs are legal by construction (a chip inside a
 *     bar): containment is skipped, partial intersection is not.
 *
 * The verdict is geometry only — visibility timing (entrance/exit) is the
 * caller's problem: layout boxes are fixed at rest, so a collision at rest is
 * what the gate judges.
 */

/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/**
 * True when `b` lies entirely inside `a` (either direction is containment).
 *
 * @param {Box} a
 * @param {Box} b
 * @returns {boolean}
 */
export function containsBox(a, b) {
  return (
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height
  );
}

/**
 * True when the two axis-aligned boxes share a positive area.
 *
 * @param {Box} a
 * @param {Box} b
 * @returns {boolean}
 */
export function boxesIntersect(a, b) {
  if (!a || !b) return false;
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0;
}

/**
 * Overlap area of two boxes (0 when disjoint).
 *
 * @param {Box} a
 * @param {Box} b
 * @returns {{ width: number, height: number }}
 */
function overlapOf(a, b) {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  };
}

/**
 * Find every illegal pair in a list of identified boxes.
 *
 * @param {Array<{ id: string, box: Box }>} entries
 * @returns {Array<{ a: string, b: string, width: number, height: number, aBox: Box, bBox: Box }>}
 */
export function findBoxCollisions(entries) {
  const collisions = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const left = entries[i];
      const right = entries[j];
      const a = left.box;
      const b = right.box;
      if (!boxesIntersect(a, b)) continue;
      // A container and its own child always "overlap"; that is the element
      // tree, not a layout defect. Only partial intersections are reported.
      if (containsBox(a, b) || containsBox(b, a)) continue;
      const { width, height } = overlapOf(a, b);
      collisions.push({ a: left.id, b: right.id, width, height, aBox: a, bBox: b });
    }
  }
  return collisions;
}
