import { describe, it, expect } from "vitest";
import { boxesIntersect, findBoxCollisions, containsBox } from "../lib/collision-geometry.mjs";

/**
 * Pure geometry for the fixed-element collision gate (#1561).
 *
 * The render-time gate measures real DOM boxes; these tests lock the verdict
 * rules so "touching is not overlapping" and ancestor/descendant pairs (a
 * container and its own child) cannot false-fail a legal layout.
 */

const box = (x, y, width, height) => ({ x, y, width, height });

describe("boxesIntersect", () => {
  it("returns true for a real overlap and reports the overlap area", () => {
    const a = box(0, 0, 100, 50);
    const b = box(60, 20, 100, 50);
    expect(boxesIntersect(a, b)).toBe(true);
    const hit = findBoxCollisions([
      { id: "a", box: a },
      { id: "b", box: b },
    ]);
    expect(hit).toHaveLength(1);
    expect(hit[0].width).toBe(40);
    expect(hit[0].height).toBe(30);
  });

  it("treats edge-touching as clear", () => {
    const a = box(0, 0, 100, 50);
    const b = box(100, 0, 50, 50);
    expect(boxesIntersect(a, b)).toBe(false);
  });

  it("treats a zero-area box as absent", () => {
    const a = box(0, 0, 100, 50);
    expect(boxesIntersect(a, box(10, 10, 0, 0))).toBe(false);
    expect(boxesIntersect(a, box(10, 10, 10, 0))).toBe(false);
  });

  it("ignores ancestor/descendant containment pairs", () => {
    const outer = box(0, 0, 200, 100);
    const inner = box(20, 20, 50, 30);
    expect(containsBox(outer, inner)).toBe(true);
    expect(
      findBoxCollisions([
        { id: "outer", box: outer },
        { id: "inner", box: inner },
      ]),
    ).toHaveLength(0);
  });

  it("reports every overlapping pair once with stable ids", () => {
    const collisions = findBoxCollisions([
      // not contained in the badge box — a partial intersection, unlike the
      // deliberate brand/badge slot sharing.
      { id: "brand", box: box(10, 236, 314, 60) },
      { id: "badge", box: box(60, 220, 663, 78) },
      { id: "briefing", box: box(739, 248, 141, 35) },
    ]);
    expect(collisions.map((c) => `${c.a}|${c.b}`)).toEqual(["brand|badge"]);
  });
});
