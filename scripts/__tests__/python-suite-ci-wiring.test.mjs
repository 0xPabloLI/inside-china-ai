/**
 * CI wiring for the Python suite (#555).
 *
 * The point of #555 is that scripts/short-video/__tests__/*.py never ran in
 * CI while every gate stayed green (test_claim_prompt.py sat red on main for
 * a week). Wiring the step once does not stay true by itself: a rename or a
 * job reshuffle puts the suite straight back into that state, and nothing
 * else in the repo would notice. These assertions are the tripwire.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const SUITE = "scripts/short-video/__tests__";

describe("python suite CI wiring (#555)", () => {
  it("CI runs the suite through the npm script", () => {
    expect(CI).toContain("npm run test:python");
  });

  it("CI installs the suite's declared dependencies", () => {
    expect(CI).toContain(`${SUITE}/requirements.txt`);
  });

  it("the npm scripts target the suite with an overridable interpreter", () => {
    for (const name of ["test:python", "test:python:coverage"]) {
      expect(PKG.scripts[name]).toContain(SUITE);
      expect(PKG.scripts[name]).toMatch(/\$\{PYTHON:-python3\}/);
    }
  });

  it("the zero-test guard ships with the suite", () => {
    expect(existsSync(join(ROOT, SUITE, "conftest.py"))).toBe(true);
  });

  // The coverage floor is the other half of "green means something ran": the
  // suite could run in full while the modules it is responsible for silently
  // lose coverage. Deleting the floor or the scope list would put that back.
  it("the coverage gate keeps a floor and a scope", () => {
    const rc = readFileSync(join(ROOT, SUITE, ".coveragerc"), "utf8");
    expect(rc).toMatch(/^fail_under\s*=\s*(\d+)/m);
    expect(rc).toContain("scripts/short-video/lib");
    expect(CI).toContain("npm run test:python:coverage");
  });
});
