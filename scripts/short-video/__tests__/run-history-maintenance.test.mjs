import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRun,
  latestFile,
  listRuns,
  manifestFile,
  markRun,
  migrateLegacyRun,
  pruneRun,
  readLatest,
  readManifest,
  RUN_STATUS,
  runDir,
} from "../lib/run-history.mjs";
import { writePublishReceipt, PUBLISH_RECEIPT_STATE } from "../lib/publish-receipt.mjs";
import { writePendingAnalysis } from "../lib/pending-analysis.mjs";

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "run-maintenance-"));
  roots.push(root);
  mkdirSync(join(root, "output"), { recursive: true });
  return root;
}

function seedLegacy(root, slug, bytes = "legacy") {
  const dir = join(root, "output", slug);
  mkdirSync(join(dir, "audio"), { recursive: true });
  mkdirSync(join(dir, "publish", "tiktok"), { recursive: true });
  writeFileSync(join(dir, "audio", "scene-1.wav"), `${bytes}-audio`, "utf8");
  writeFileSync(join(dir, `${slug}-video.mp4`), `${bytes}-video`, "utf8");
  writeFileSync(join(dir, "scenes.resolved.json"), JSON.stringify({ scenes: [] }), "utf8");
  // The shared TTS cache manifest must not be copied into the run.
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 1 }), "utf8");
  return dir;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("migrateLegacyRun (#1432 S5)", () => {
  it("plans the migration without writing anything by default", () => {
    const root = makeRoot();
    const legacy = seedLegacy(root, "qwen4");

    const plan = migrateLegacyRun({ root, slug: "qwen4" });
    expect(plan.action).toBe("would-migrate");
    expect(plan.runId).toMatch(/^r-\d{8}T\d{6}-[0-9a-f]{6}$/);
    expect(plan.entries.map((entry) => entry.name).sort()).toEqual([
      "audio",
      "publish",
      "qwen4-video.mp4",
      "scenes.resolved.json",
    ]);
    expect(plan.files).toBeGreaterThan(0);

    expect(existsSync(runDir(root, "qwen4", plan.runId))).toBe(false);
    expect(existsSync(join(root, "output", "qwen4", "runs"))).toBe(false);
    expect(existsSync(latestFile(root, "qwen4"))).toBe(false);
    expect(readManifest(root, "qwen4").runs).toEqual([]);
    expect(existsSync(join(legacy, "qwen4-video.mp4"))).toBe(true);
  });

  it("applies the migration by hardlinking a self-contained run", () => {
    const root = makeRoot();
    const legacy = seedLegacy(root, "qwen4");
    const plan = migrateLegacyRun({ root, slug: "qwen4" });

    const result = migrateLegacyRun({ root, slug: "qwen4", apply: true });
    expect(result.action).toBe("migrated");
    expect(result.runId).toBe(plan.runId);

    const run = runDir(root, "qwen4", result.runId);
    expect(existsSync(join(run, "audio", "scene-1.wav"))).toBe(true);
    expect(existsSync(join(run, "publish", "tiktok"))).toBe(true);
    expect(existsSync(join(run, "qwen4-video.mp4"))).toBe(true);
    // The shared cache manifest is deliberately not adopted as a run artifact.
    expect(existsSync(join(run, "manifest.json"))).toBe(false);
    // The legacy tree stays readable.
    expect(existsSync(join(legacy, "qwen4-video.mp4"))).toBe(true);

    const entry = readManifest(root, "qwen4").runs.find((item) => item.runId === result.runId);
    expect(entry).toMatchObject({ status: RUN_STATUS.RENDERED, legacy: true });
    expect(readLatest(root, "qwen4")?.runId).toBe(result.runId);
  });

  it("is idempotent and refuses to migrate an already adopted legacy tree twice", () => {
    const root = makeRoot();
    seedLegacy(root, "qwen4");
    migrateLegacyRun({ root, slug: "qwen4", apply: true });

    const again = migrateLegacyRun({ root, slug: "qwen4", apply: true });
    expect(again.action).toBe("already-migrated");
    expect(readManifest(root, "qwen4").runs).toHaveLength(1);
  });

  it("reports an empty legacy tree instead of minting an empty run", () => {
    const root = makeRoot();
    const legacy = join(root, "output", "empty-pack");
    mkdirSync(legacy, { recursive: true });

    expect(migrateLegacyRun({ root, slug: "empty-pack" })).toMatchObject({ action: "empty" });
  });
});

describe("pruneRun (#1432 S5)", () => {
  function twoRuns(root) {
    const older = createRun({ root, slug: "qwen4", runId: "r-20261119T043012-aaaaaa" });
    markRun({ root, slug: "qwen4", runId: older.runId, status: RUN_STATUS.RENDERED });
    mkdirSync(join(older.dir, "audio"), { recursive: true });
    writeFileSync(join(older.dir, "audio", "a.wav"), "xa", "utf8");

    const newer = createRun({ root, slug: "qwen4", runId: "r-20261119T050000-bbbbbb" });
    markRun({ root, slug: "qwen4", runId: newer.runId, status: RUN_STATUS.RENDERED });
    return { older, newer };
  }

  it("defaults to a dry run and deletes nothing", () => {
    const root = makeRoot();
    const { older } = twoRuns(root);

    const plan = pruneRun({ root, slug: "qwen4", runId: older.runId });
    expect(plan.action).toBe("would-delete");
    expect(plan.guards).toEqual([]);
    expect(existsSync(older.dir)).toBe(true);
  });

  it("refuses to prune the run latest points at", () => {
    const root = makeRoot();
    const { newer } = twoRuns(root);

    const plan = pruneRun({ root, slug: "qwen4", runId: newer.runId, apply: true });
    expect(plan.action).toBe("blocked");
    expect(plan.guards.map((guard) => guard.kind)).toEqual(["latest"]);
    expect(existsSync(newer.dir)).toBe(true);
    expect(readManifest(root, "qwen4").runs).toHaveLength(2);
  });

  it("refuses to prune an in-flight run", () => {
    const root = makeRoot();
    const older = createRun({ root, slug: "qwen4", runId: "r-20261119T043012-cccccc" });
    createRun({ root, slug: "qwen4", runId: "r-20261119T050000-dddddd" });
    const newer = createRun({ root, slug: "qwen4", runId: "r-20261119T060000-eeeeee" });
    markRun({ root, slug: "qwen4", runId: older.runId, status: RUN_STATUS.RENDERED });
    markRun({ root, slug: "qwen4", runId: newer.runId, status: RUN_STATUS.RENDERED });

    const plan = pruneRun({ root, slug: "qwen4", runId: "r-20261119T050000-dddddd" });
    expect(plan.action).toBe("blocked");
    expect(plan.guards.map((guard) => guard.kind)).toContain("running");
  });

  it("refuses to prune a run with a publish receipt", () => {
    const root = makeRoot();
    const { older } = twoRuns(root);
    writePublishReceipt({
      root,
      slug: "qwen4",
      runId: older.runId,
      receipt: {
        publishMethod: "api",
        state: PUBLISH_RECEIPT_STATE.PUBLISHED,
        postGroupId: "grp-1",
        publishedAt: "2026-11-19T04:35:00.000Z",
      },
    });

    const plan = pruneRun({ root, slug: "qwen4", runId: older.runId });
    expect(plan.action).toBe("blocked");
    expect(plan.guards.map((guard) => guard.kind)).toContain("receipt");
  });

  it("refuses to prune a run referenced by pending analysis", () => {
    const root = makeRoot();
    const { older } = twoRuns(root);
    writePendingAnalysis(root, {
      slug: "qwen4",
      record: {
        slug: "qwen4",
        runId: older.runId,
        postGroupId: null,
        publishedAt: "2026-11-19T04:35:00.000Z",
        status: "pending",
      },
    });

    const plan = pruneRun({ root, slug: "qwen4", runId: older.runId });
    expect(plan.action).toBe("blocked");
    expect(plan.guards.map((guard) => guard.kind)).toContain("pending-analysis");
  });

  it("deletes an unreferenced older run on --apply and drops its manifest row", () => {
    const root = makeRoot();
    const { older, newer } = twoRuns(root);

    const result = pruneRun({ root, slug: "qwen4", runId: older.runId, apply: true });
    expect(result.action).toBe("deleted");
    expect(existsSync(older.dir)).toBe(false);
    expect(readManifest(root, "qwen4").runs.map((run) => run.runId)).toEqual([newer.runId]);
    expect(readLatest(root, "qwen4")?.runId).toBe(newer.runId);
  });

  it("keeps two slugs isolated", () => {
    const root = makeRoot();
    const alpha = createRun({ root, slug: "alpha", runId: "r-20261119T043012-aaaaaa" });
    const beta = createRun({ root, slug: "beta", runId: "r-20261119T050000-bbbbbb" });
    markRun({ root, slug: "alpha", runId: alpha.runId, status: RUN_STATUS.RENDERED });
    markRun({ root, slug: "beta", runId: beta.runId, status: RUN_STATUS.RENDERED });

    expect(pruneRun({ root, slug: "alpha", runId: beta.runId }).action).toBe("blocked");
    expect(existsSync(beta.dir)).toBe(true);
  });
});

describe("listRuns (#1432 S5)", () => {
  it("lists every run with status, receipt and footprint", () => {
    const root = makeRoot();
    const run = createRun({ root, slug: "qwen4", runId: "r-20261119T043012-a1b2c3" });
    markRun({ root, slug: "qwen4", runId: run.runId, status: RUN_STATUS.RENDERED });
    writeFileSync(join(run.dir, "video.mp4"), "xx", "utf8");
    writePublishReceipt({
      root,
      slug: "qwen4",
      runId: run.runId,
      receipt: {
        publishMethod: "manual-guide",
        state: PUBLISH_RECEIPT_STATE.GUIDE,
        postGroupId: null,
        publishedAt: "2026-11-19T04:35:00.000Z",
      },
    });

    const listing = listRuns({ root, slug: "qwen4" });
    expect(listing).toHaveLength(1);
    expect(listing[0]).toMatchObject({
      runId: run.runId,
      status: RUN_STATUS.RENDERED,
      receiptState: "guide",
      latest: true,
    });
    expect(listing[0].bytes).toBeGreaterThan(0);
    expect(listing[0].files).toBeGreaterThan(0);
  });

  it("discoveres slugs from the output tree", () => {
    const root = makeRoot();
    createRun({ root, slug: "alpha", runId: "r-20261119T043012-aaaaaa" });
    createRun({ root, slug: "beta", runId: "r-20261119T050000-bbbbbb" });

    const slugs = listRuns({ root }).map((run) => run.slug);
    expect(slugs).toEqual(["alpha", "beta"]);
  });
});

describe("manifest file is still the only index", () => {
  it("does not grow a second index file", () => {
    const root = makeRoot();
    const { older } = (() => {
      const older = createRun({ root, slug: "qwen4", runId: "r-20261119T043012-aaaaaa" });
      markRun({ root, slug: "qwen4", runId: older.runId, status: RUN_STATUS.RENDERED });
      return { older };
    })();
    expect(manifestFile(root, "qwen4")).toContain("manifest.json");
    expect(existsSync(manifestFile(root, "qwen4"))).toBe(true);
    expect(existsSync(older.dir)).toBe(true);
  });
});
