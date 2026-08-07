import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * CLI contract tests for the TikTok guard (spec T1, rows T1-10/T1-11/T1-12):
 *
 *   T1-10  verify --pre with over-limit content exits 1 (blocks render)
 *   T1-11  verify --pre --long-form exits 0 (explicit opt-in downgrades to WARN)
 *   T1-12  compliant content exits 0 with no flag
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFY = join(__dirname, "..", "verify-video.mjs");

function runPre(args) {
  return spawnSync(process.execPath, [VERIFY, "--pre", ...args], {
    encoding: "utf8",
  });
}

describe("verify-video.mjs --pre guard (CLI contract)", () => {
  it("T1-10: over-limit content fails by default (exit 1)", () => {
    const res = runPre(["--content", "_test-fixtures/overlimit"]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("Scene count (6-10)");
  });

  it("T1-11: over-limit content passes with --long-form (exit 0)", () => {
    const res = runPre(["--long-form", "--content", "_test-fixtures/overlimit"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Scene count (6-10)");
    expect(res.stdout).toMatch(/WARN:\s+[1-9]/);
  });

  it("T1-12: compliant content passes with no flag (exit 0)", () => {
    const res = runPre(["--content", "distillation/pt1"]);
    expect(res.status).toBe(0);
  });
});
