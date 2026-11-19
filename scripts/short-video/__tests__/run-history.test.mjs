import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RUN_STATUS,
  createRun,
  generateRunId,
  hasRuns,
  latestFile,
  manifestFile,
  markRun,
  readLatest,
  readManifest,
  resolveRun,
  runDir,
} from "../lib/run-history.mjs";

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "run-history-"));
  roots.push(root);
  mkdirSync(join(root, "output"), { recursive: true });
  return root;
}

function seedLegacy(root, slug) {
  const dir = join(root, "output", slug);
  const audio = join(dir, "audio");
  mkdirSync(audio, { recursive: true });
  writeFileSync(join(audio, "scene-1.wav"), "legacy", "utf8");
  return dir;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("generateRunId", () => {
  it("packs the UTC timestamp and suffix into the documented shape", () => {
    const id = generateRunId(new Date("2026-11-19T04:30:12.000Z"), "a1b2c3");
    expect(id).toBe("r-20261119T043012-a1b2c3");
  });

  it("rejects a non-hex suffix instead of minting an unreadable id", () => {
    expect(() => generateRunId(new Date(), "XYZ")).toThrow(/suffix/);
  });
});

describe("createRun", () => {
  it("creates the run directory, lists it as running, and does not move latest", () => {
    const root = makeRoot();
    const now = new Date("2026-11-19T04:30:12.000Z");
    const run = createRun({
      root,
      slug: "qwen4-gamefeel",
      runId: "r-20261119T043012-a1b2c3",
      now,
      contentDir: "qwen4",
    });

    expect(run.dir).toBe(runDir(root, "qwen4-gamefeel", run.runId));
    expect(existsSync(run.dir)).toBe(true);
    expect(readManifest(root, "qwen4-gamefeel").runs).toEqual([
      {
        runId: "r-20261119T043012-a1b2c3",
        createdAt: "2026-11-19T04:30:12.000Z",
        status: RUN_STATUS.RUNNING,
        contentDir: "qwen4",
      },
    ]);
    expect(readLatest(root, "qwen4-gamefeel")).toBeNull();
    expect(hasRuns(root, "qwen4-gamefeel")).toBe(true);
  });

  it("refuses an explicit run id that already exists", () => {
    const root = makeRoot();
    createRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" });
    expect(() => createRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" })).toThrow(
      /already exists/,
    );
  });

  it("keeps two slugs in separate trees with separate manifests", () => {
    const root = makeRoot();
    const a = createRun({ root, slug: "alpha", runId: "r-20261119T043012-aaaaaa" });
    const b = createRun({ root, slug: "beta", runId: "r-20261119T043012-bbbbbb" });
    markRun({ root, slug: "alpha", runId: a.runId, status: RUN_STATUS.RENDERED });

    expect(readManifest(root, "alpha").runs.map((run) => run.runId)).toEqual([a.runId]);
    expect(readManifest(root, "beta").runs.map((run) => run.runId)).toEqual([b.runId]);
    expect(readLatest(root, "alpha")?.runId).toBe(a.runId);
    expect(readLatest(root, "beta")).toBeNull();
  });

  it("rejects a slug that would escape the output root", () => {
    const root = makeRoot();
    expect(() => createRun({ root, slug: "../escape" })).toThrow(/path segment/);
  });
});

describe("markRun", () => {
  it("moves latest on rendered and again on published", () => {
    const root = makeRoot();
    const run = createRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" });
    markRun({
      root,
      slug: "s1",
      runId: run.runId,
      status: RUN_STATUS.RENDERED,
      artifacts: { video: "v1.mp4" },
    });
    expect(readLatest(root, "s1")).toMatchObject({ runId: run.runId, status: RUN_STATUS.RENDERED });

    const next = createRun({ root, slug: "s1", runId: "r-20261119T050000-bbbbbb" });
    markRun({ root, slug: "s1", runId: next.runId, status: RUN_STATUS.PUBLISHED });
    expect(readLatest(root, "s1")?.runId).toBe(next.runId);
    expect(readManifest(root, "s1").runs[0].artifacts).toEqual({ video: "v1.mp4" });
  });

  it("leaves latest untouched when the newer run fails", () => {
    const root = makeRoot();
    const good = createRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" });
    markRun({ root, slug: "s1", runId: good.runId, status: RUN_STATUS.RENDERED });
    const bad = createRun({ root, slug: "s1", runId: "r-20261119T050000-bbbbbb" });
    markRun({ root, slug: "s1", runId: bad.runId, status: RUN_STATUS.FAILED });

    expect(readLatest(root, "s1")?.runId).toBe(good.runId);
    expect(readManifest(root, "s1").runs.find((run) => run.runId === bad.runId)).toMatchObject({
      status: RUN_STATUS.FAILED,
    });
  });

  it("refuses a run that is not in the manifest", () => {
    const root = makeRoot();
    expect(() =>
      markRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3", status: RUN_STATUS.RENDERED }),
    ).toThrow(/not in the manifest/);
  });
});

describe("resolveRun", () => {
  it("prefers an explicit run, then latest, then legacy", () => {
    const root = makeRoot();
    seedLegacy(root, "s1");
    const run = createRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" });

    expect(resolveRun({ root, slug: "s1" })).toMatchObject({ runId: null, source: "legacy" });

    markRun({ root, slug: "s1", runId: run.runId, status: RUN_STATUS.RENDERED });
    expect(resolveRun({ root, slug: "s1" })).toMatchObject({ runId: run.runId, source: "latest" });

    const older = createRun({ root, slug: "s1", runId: "r-20261119T043012-999999" });
    expect(resolveRun({ root, slug: "s1", runId: older.runId })).toMatchObject({
      runId: older.runId,
      source: "explicit",
    });
  });

  it("throws for an explicit run that does not exist", () => {
    const root = makeRoot();
    seedLegacy(root, "s1");
    expect(() => resolveRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" })).toThrow(
      /does not exist/,
    );
  });

  it("falls back to legacy when the latest pointer outlives its directory", () => {
    const root = makeRoot();
    const run = createRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" });
    markRun({ root, slug: "s1", runId: run.runId, status: RUN_STATUS.RENDERED });
    rmSync(run.dir, { recursive: true, force: true });
    seedLegacy(root, "s1");

    expect(resolveRun({ root, slug: "s1" })).toMatchObject({ runId: null, source: "legacy" });
  });

  it("throws when neither runs nor legacy output exist", () => {
    const root = makeRoot();
    expect(() => resolveRun({ root, slug: "missing" })).toThrow(/no runs and no legacy output/);
  });
});

describe("manifest integrity", () => {
  it("surfaces a corrupt manifest instead of replacing it", () => {
    const root = makeRoot();
    const dir = join(root, "output", "s1", "runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(manifestFile(root, "s1"), "{ not json", "utf8");
    expect(() => readManifest(root, "s1")).toThrow(/invalid JSON/);
  });

  it("does not create a latest pointer before a successful run", () => {
    const root = makeRoot();
    createRun({ root, slug: "s1", runId: "r-20261119T043012-a1b2c3" });
    expect(existsSync(latestFile(root, "s1"))).toBe(false);
  });
});
