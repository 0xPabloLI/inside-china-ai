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
  it("CI runs the suite through the coverage npm script", () => {
    expect(CI).toContain("npm run test:python:coverage");
  });

  it("CI installs the suite's declared dependencies", () => {
    expect(CI).toContain(`${SUITE}/requirements.txt`);
  });

  it("the runner script targets the suite with an overridable interpreter", () => {
    expect(PKG.scripts["test:python"]).toContain(SUITE);
    expect(PKG.scripts["test:python"]).toMatch(/\$\{PYTHON:-python3\}/);
  });

  it("the coverage script extends the single runner instead of restating it", () => {
    // Anchored: a script that ran itself (or any other colon-suffixed name)
    // would pass an unanchored substring check.
    expect(PKG.scripts["test:python:coverage"]).toMatch(/^npm run test:python(?![\w:-])/);
    expect(PKG.scripts["test:python:coverage"]).toContain(".coveragerc");
  });

  it("the zero-test guard ships with the suite", () => {
    expect(existsSync(join(ROOT, SUITE, "conftest.py"))).toBe(true);
  });

  // The coverage floor is the other half of "green means something ran": the
  // suite could run in full while the modules it is responsible for silently
  // lose coverage. These assertions read the directives where coverage.py
  // reads them — the floor in [report], the scope in [run] — so neither can be
  // satisfied by a look-alike elsewhere: fail_under = 0 is not a gate, and a
  // "scripts/short-video/lib" path in the omit list is not a scope.
  describe("the coverage gate", () => {
    const rc = readFileSync(join(ROOT, SUITE, ".coveragerc"), "utf8");
    const section = (name) => rc.split(/^\[/m).find((s) => s.startsWith(`${name}]`)) ?? "";

    it("keeps a live floor in [report]", () => {
      const floor = section("report").match(/^\s*fail_under\s*=\s*(\d+)/m);
      expect(floor).not.toBeNull();
      expect(Number(floor[1])).toBeGreaterThanOrEqual(50);
    });

    it("keeps the measured scope in [run]", () => {
      expect(section("run")).toMatch(/^\s*source\s*=\s*scripts\/short-video\/lib\s*$/m);
    });

    it("is the gate CI runs", () => {
      expect(CI).toContain("npm run test:python:coverage");
    });
  });
});
