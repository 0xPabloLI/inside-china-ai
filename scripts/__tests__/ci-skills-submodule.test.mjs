/**
 * CI wiring for the skills/shared submodule (#466).
 *
 * The point of #466 is that CI reported green while the skills test glob
 * matched nothing, because `skills/shared` was never checked out. A plain
 * `actions/checkout` leaves submodules empty, and nothing else in the repo
 * notices that the tests the include promises are absent. These assertions are
 * the tripwire: the job that runs the suite must check out submodules, and the
 * path it checks out must be the one vitest scans.
 *
 * No credential is asserted here on purpose: shared-skills is public, so the
 * default token reads it. If it ever becomes private again, checkout fails
 * loudly instead of silently skipping the suite.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const ROOT = join(import.meta.dirname, "..", "..");
const CI = parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8"));
const VITEST = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
const GITMODULES = readFileSync(join(ROOT, ".gitmodules"), "utf8");

function checkoutOf(jobName) {
  const job = CI.jobs?.[jobName];
  expect(job, `ci.yml has no job named ${jobName}`).toBeTruthy();
  return job.steps.find((step) => String(step.uses ?? "").startsWith("actions/checkout@"));
}

describe("skills submodule CI wiring (#466)", () => {
  it("checks out submodules in the job that runs the test suite", () => {
    const checkout = checkoutOf("quality");
    expect(checkout, "quality job has no actions/checkout step").toBeTruthy();
    expect(checkout.with?.submodules).toBe("recursive");
  });

  it("keeps the skills tests in the vitest include (otherwise the submodule buys nothing)", () => {
    expect(VITEST).toContain('"skills/**/*.test.{ts,tsx,mjs}"');
  });

  it("declares skills/shared at the path vitest scans", () => {
    expect(GITMODULES).toMatch(/^\s*path\s*=\s*skills\/shared\s*$/m);
    expect(GITMODULES).toMatch(
      /^\s*url\s*=\s*https:\/\/github\.com\/0xPabloLI\/shared-skills\.git\s*$/m,
    );
  });
});
