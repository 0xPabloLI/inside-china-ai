/**
 * The roadmap ledger's unit of accounting (`scripts/roadmap-ledger.mjs`).
 *
 * A ticket number is not a delivery: `#541` stays in the tracker while more
 * half-deliveries land under it. These cases pin that distinction, the six
 * reasons a merged PR leaves the ledger, and the fact that the CLI actually
 * runs — a broken entry guard exits 0 with no output, which reads as "clean".
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectCandidates,
  DEFAULT_WINDOW_DAYS,
  extractRecorded,
  trackerFiles,
} from "../roadmap-ledger.mjs";

const NOW = Date.parse("2026-11-14T20:00:00Z");
const RECENT = "2026-11-13T10:00:00Z";
const OLD = "2026-09-01T10:00:00Z";

/** @param {object} [overrides] */
function pr(overrides = {}) {
  return {
    number: 1336,
    title: "feat(short-video): pairwise relevance arm (#541)",
    body: "## Summary\n\nAdds the bench-only arm for #541.",
    mergedAt: RECENT,
    mergeCommit: { oid: "dbfdd0581234567890abcdef1234567890abcdef12" },
    author: { login: "0xPabloLI" },
    ...overrides,
  };
}

function recorded(partial = {}) {
  return { prNumbers: new Set(), shas: new Set(), ...partial };
}

describe("extractRecorded", () => {
  it("reads PR numbers to the end of the line, including slash-separated pairs", () => {
    const text =
      "第三笔半程（PR #1336/#1338，squash `dbfdd058`）与 PR #1343 已落地；媒体链 PR：#1306 `8e91d0e7`、#1309 `6c80625f`、#1312 `bf59cf3d`";
    const found = extractRecorded(text);
    expect([...found.prNumbers].sort((a, b) => a - b)).toEqual([
      1306, 1309, 1312, 1336, 1338, 1343,
    ]);
    expect([...found.shas]).toContain("dbfdd058");
  });

  it("keeps digits sliced out of video ids and test counts out of the PR set", () => {
    const found = extractRecorded("PR #1306 见 /7599711388 与 5209 passed");
    expect([...found.prNumbers]).toEqual([1306]);
  });

  it("keeps bare ticket numbers out of the PR set", () => {
    const found = extractRecorded("#541 仍在 Tier 1；#404 → #1215 三张 HITL");
    expect([...found.prNumbers]).toEqual([]);
  });

  it("keeps dates and two-digit metrics out of the PR set", () => {
    const found = extractRecorded("PR #1336 2026-11-14 25 对 / 48 选正 / 40/40 门槛");
    expect([...found.prNumbers]).toEqual([1336]);
  });

  it("reads a bare sha after the word squash", () => {
    const found = extractRecorded("PR #1338 squash 23e37102");
    expect([...found.shas]).toContain("23e37102");
  });
});

describe("collectCandidates", () => {
  const collect = (pullRequests, rec, extra = {}) =>
    collectCandidates(pullRequests, rec, { now: NOW, ...extra });

  it("reports an unrecorded merged PR with the tickets it names", () => {
    const result = collect([pr()], recorded());
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      number: 1336,
      sha: "dbfdd058",
      tickets: ["#541"],
    });
  });

  it("skips a PR already named in the tracker", () => {
    const result = collect([pr()], recorded({ prNumbers: new Set([1336]) }));
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped.recorded).toBe(1);
  });

  it("skips a PR whose squash sha is recorded even when its number is not", () => {
    const result = collect([pr({ number: 9999 })], recorded({ shas: new Set(["dbfdd058"]) }));
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped.recorded).toBe(1);
  });

  it("skips PRs outside the window, from bots, and mechanical titles", () => {
    const result = collect(
      [
        pr({ number: 1301, mergedAt: OLD }),
        pr({ number: 1302, author: { login: "release-please[bot]" } }),
        pr({ number: 1303, title: "docs(roadmap): round CXCIV — rotation" }),
        pr({ number: 1304, title: "chore(main): release tanstack_start_ts 1.73.1" }),
        pr({ number: 1305, mergedAt: null }),
      ],
      recorded(),
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toMatchObject({
      "outside-window": 2,
      bot: 1,
      mechanical: 2,
    });
  });

  it("a `PR #N` line in the archive clears the candidate even with no sha", () => {
    const found = extractRecorded("PR #1342 — no tracker row: parallel session, no issue closed");
    const result = collect([pr({ number: 1342 })], found);
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped.recorded).toBe(1);
  });

  it("narrows the window by --days", () => {
    const older = "2026-11-05T10:00:00Z";
    const wide = collect([pr({ mergedAt: older })], recorded(), { windowDays: 14 });
    const narrow = collect([pr({ mergedAt: older })], recorded(), { windowDays: 3 });
    expect(wide.candidates).toHaveLength(1);
    expect(narrow.candidates).toHaveLength(0);
  });

  it("counts every PR it examined, including skipped ones", () => {
    const result = collect([pr(), pr({ number: 1337, mergedAt: OLD })], recorded());
    expect(result.examined).toBe(2);
    expect(DEFAULT_WINDOW_DAYS).toBeGreaterThan(0);
  });

  it("discovers every dated inventory archive, not a hardcoded pair", () => {
    const names = trackerFiles().map((file) => file.split("/").pop());
    expect(names).toContain("roadmap-inventory-history-2026-09-23.md");
    expect(names).toContain("roadmap-inventory-history-2026-10-22.md");
    expect(names).toContain("issue-roadmap.md");
  });
});

describe("CLI", () => {
  const script = join(import.meta.dirname, "..", "roadmap-ledger.mjs");

  it("prints help and actually runs when invoked directly", () => {
    const run = spawnSync("node", [script, "--help"], {
      encoding: "utf8",
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !key.startsWith("GITHUB_") && !key.startsWith("PR_") && key !== "GH_BIN",
        ),
      ),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Roadmap ledger");
    expect(run.stdout).toContain("--gate");
  });
});
