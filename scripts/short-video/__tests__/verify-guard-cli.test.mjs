import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * CLI contract tests for the TikTok guard (spec T1, rows T1-10/T1-11/T1-12):
 *
 *   T1-10  verify --pre with over-limit content exits 1 (blocks render)
 *   T1-11  verify --pre --long-form exits 0 (explicit opt-in downgrades to WARN)
 *   T1-12  compliant content (bytedance-distillation) exits 0 with no flag
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
    // Every content directory passes data-level preflight: all seven dirs
    // use the shared hookScene contract (checkHookContract) and are within
    // word/scene limits — bytedance-distillation is the canonical baseline.
    const res = runPre(["--content", "bytedance-distillation"]);
    expect(res.status).toBe(0);
  });

  it("all content dirs pass data-level preflight (hook focal contract migrated)", () => {
    // deepseek (12 scenes) and restraint/pt1 (11 scenes) are historical
    // long-form productions that intentionally exceed the 6-10 TikTok
    // scene-count rule; they opt in via --long-form (downgrades count +
    // word-count to WARN). Every other dir must pass with no flag.
    for (const dir of [
      "bytedance-distillation",
      "restraint/pt3",
      "distillation/pt1",
      "distillation/pt2",
      "distillation/pt3",
    ]) {
      const res = runPre(["--content", dir]);
      expect(res.status, `${dir} preflight should exit 0`).toBe(0);
    }
    for (const dir of ["deepseek", "restraint/pt1"]) {
      const res = runPre(["--long-form", "--content", dir]);
      expect(res.status, `${dir} preflight with --long-form should exit 0`).toBe(0);
    }
  });
});
