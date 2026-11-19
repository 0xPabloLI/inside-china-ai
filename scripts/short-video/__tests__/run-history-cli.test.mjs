import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createRun, markRun, readManifest, RUN_STATUS } from "../lib/run-history.mjs";
import { writePublishReceipt, PUBLISH_RECEIPT_STATE } from "../lib/publish-receipt.mjs";

const CLI = fileURLToPath(new URL("../run-history.mjs", import.meta.url));
const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "run-history-cli-"));
  roots.push(root);
  mkdirSync(join(root, "output"), { recursive: true });
  return root;
}

function seedTwoRuns(root) {
  const first = createRun({ root, slug: "qwen4", runId: "r-20261119T043012-aaaaaa" });
  markRun({ root, slug: "qwen4", runId: first.runId, status: RUN_STATUS.RENDERED });
  writeFileSync(join(first.dir, "video.mp4"), "xxxx", "utf8");

  const second = createRun({ root, slug: "qwen4", runId: "r-20261119T050000-bbbbbb" });
  markRun({ root, slug: "qwen4", runId: second.runId, status: RUN_STATUS.PUBLISHED });
  writePublishReceipt({
    root,
    slug: "qwen4",
    runId: second.runId,
    receipt: {
      publishMethod: "api",
      state: PUBLISH_RECEIPT_STATE.PUBLISHED,
      postGroupId: "grp-second",
      publishedAt: "2026-11-19T05:05:00.000Z",
    },
  });
  return { first, second };
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("run-history CLI (#1432 S4/S5)", () => {
  it("audits run → receipt in JSON", () => {
    const root = makeRoot();
    seedTwoRuns(root);
    const out = execFileSync(
      process.execPath,
      [CLI, "receipts", "--root", root, "--slug", "qwen4", "--json"],
      { encoding: "utf8" },
    );
    const rows = JSON.parse(out);
    expect(rows.map((row) => row.runId)).toEqual([
      "r-20261119T043012-aaaaaa",
      "r-20261119T050000-bbbbbb",
    ]);
    expect(rows[0].state).toBeNull();
    expect(rows[1]).toMatchObject({
      publishMethod: "api",
      state: "published",
      postGroupId: "grp-second",
    });
  });

  it("lists footprints and the latest flag", () => {
    const root = makeRoot();
    seedTwoRuns(root);
    const rows = JSON.parse(
      execFileSync(process.execPath, [CLI, "list", "--root", root, "--slug", "qwen4", "--json"], {
        encoding: "utf8",
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.latest)).toMatchObject({ runId: "r-20261119T050000-bbbbbb" });
    expect(rows[0].bytes).toBeGreaterThan(0);
  });

  it("migrate is a dry run until --apply and leaves no runs behind", () => {
    const root = makeRoot();
    const legacy = join(root, "output", "legacy-pack");
    mkdirSync(join(legacy, "audio"), { recursive: true });
    writeFileSync(join(legacy, "video.mp4"), "video", "utf8");

    const dry = execFileSync(
      process.execPath,
      [CLI, "migrate", "--root", root, "--slug", "legacy-pack"],
      { encoding: "utf8" },
    );
    expect(dry).toMatch(/DRY RUN/);
    expect(readManifest(root, "legacy-pack").runs).toEqual([]);

    const applied = execFileSync(
      process.execPath,
      [CLI, "migrate", "--root", root, "--slug", "legacy-pack", "--apply"],
      { encoding: "utf8" },
    );
    expect(applied).toMatch(/migrated r-/);
    expect(readManifest(root, "legacy-pack").runs).toHaveLength(1);
  });

  it("prune refuses a receipt-bound run and exits non-zero", () => {
    const root = makeRoot();
    const { second } = seedTwoRuns(root);
    const result = spawnSync(
      process.execPath,
      [CLI, "prune", "--root", root, "--slug", "qwen4", "--run", second.runId, "--apply"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/blocked/);
    expect(result.stderr).toMatch(/latest|receipt/);
  });

  it("prune dry run reports the reclaimable tree", () => {
    const root = makeRoot();
    const { first } = seedTwoRuns(root);
    const result = spawnSync(
      process.execPath,
      [CLI, "prune", "--root", root, "--slug", "qwen4", "--run", first.runId],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/DRY RUN/);
    expect(result.stdout).toMatch(/would delete/);
  });
});
