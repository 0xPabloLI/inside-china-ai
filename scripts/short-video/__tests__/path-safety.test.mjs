import { describe, it, expect } from "vitest";
import { sep } from "path";
import { containedPath } from "../lib/path-safety.mjs";

describe("containedPath (#758)", () => {
  it("joins nested relative segments under an absolute root", () => {
    expect(containedPath("/content/pack", "assets/table.png")).toBe(
      `/content/pack${sep}assets${sep}table.png`,
    );
    expect(containedPath("/content/pack/", "evidence-captures.json")).toBe(
      `/content/pack${sep}evidence-captures.json`,
    );
  });

  it.each(["../outside.png", "assets/../../outside.png", "/absolute.png", "", "assets\\x.png"])(
    "rejects %s",
    (segment) => {
      expect(() => containedPath("/content/pack", segment)).toThrow(/path segment/);
    },
  );

  it("rejects a relative root and a call with no segments", () => {
    expect(() => containedPath("content/pack", "x.png")).toThrow(/absolute/);
    expect(() => containedPath("/content/pack")).toThrow(/at least one/);
  });
});
