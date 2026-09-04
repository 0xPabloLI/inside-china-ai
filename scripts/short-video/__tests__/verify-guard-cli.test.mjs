import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
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
    // zhipu-glm6-self-training is the canonical baseline: written against the
    // current slot contract (layout field + Remotion visualType whitelist) and
    // fully compliant with no flag.
    const res = runPre(["--content", "zhipu-glm6-self-training"]);
    expect(res.status).toBe(0);
  });

  it("contract-era content dirs pass data-level preflight (spec decision 47)", () => {
    // Decision 47 (2026-09-01, user-confirmed): legacy packs are NOT migrated,
    // batch-run or guaranteed — preflight red for them is expected and tracked
    // as inventory-only in #153. Only packs written against the current
    // contract (layout + visualType whitelist) must exit 0 here.
    for (const dir of ["qwen4-preview", "zhipu-glm6-self-training"]) {
      const res = runPre(["--content", dir]);
      expect(res.status, `${dir} preflight should exit 0`).toBe(0);
    }
  });

  it("all content dirs pass data-level preflight (hook focal contract migrated)", () => {
    // Historical long-form opt-in path still works: --long-form downgrades
    // scene-count + word-count to WARN for the synthetic fixture (T1-11).
    // Real legacy packs are NOT asserted here — decision 47 (see above).
    const res = runPre(["--long-form", "--content", "_test-fixtures/overlimit"]);
    expect(res.status).toBe(0);
  });
});

describe("verify-video.mjs B-roll summary (spec #27)", () => {
  const reportFile = join(
    __dirname,
    "..",
    "output",
    "_test-fixtures/hook-standard/b-roll-report.json",
  );

  function withReport(report, run) {
    mkdirSync(dirname(reportFile), { recursive: true });
    writeFileSync(reportFile, JSON.stringify(report));
    try {
      return run();
    } finally {
      rmSync(reportFile, { force: true });
    }
  }

  it("prints one line per reported scene, warning on non-won statuses", () => {
    const stdout = withReport(
      {
        content: "_test-fixtures/hook-standard",
        threshold: 60,
        scenes: {
          6: {
            strategy: "b-roll",
            round: 1,
            status: "failed",
            candidates: [{ seed: 1024, file: "scene-6-seed1024.mp4", relevance: 41 }],
            winner: null,
          },
        },
      },
      () => runPre(["--content", "_test-fixtures/hook-standard"]).stdout,
    );
    expect(stdout).toContain("B-roll Checks");
    expect(stdout).toContain("Scene 6 B-roll");
    expect(stdout).toContain("1024:41");
  });

  it("prints nothing about B-roll for content that never ran the stage", () => {
    const res = runPre(["--content", "bytedance-distillation"]);
    // spec #27: the report-derived summary section only prints when a
    // b-roll-report.json exists. The scene-data strategy WARN (issue #193)
    // is preflight-level and fires even when the stage never ran, so only
    // the summary header is asserted absent here.
    expect(res.stdout).not.toContain("B-roll Checks");
  });
});
