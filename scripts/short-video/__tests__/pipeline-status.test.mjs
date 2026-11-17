import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPipelineIndex,
  isLegacyStatus,
  migratePipelineStatus,
  readPipelineStatus,
  statusFileFor,
} from "../lib/pipeline-status.mjs";

const LEGACY = {
  articleSlug: "qwen4-gamefeel",
  articleTitle: "Qwen 4",
  startedAt: "2026-11-09T03:20:00Z",
  currentStage: "delivered",
  stages: { "stage1-article": { status: "completed" } },
  videoParts: {},
  nextAction: "none",
};

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "pipeline-status-"));
  roots.push(root);
  mkdirSync(join(root, "output"), { recursive: true });
  return root;
}

function writeLegacy(root, value = LEGACY) {
  writeFileSync(
    join(root, "output", "pipeline-status.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("buildPipelineIndex", () => {
  it("points at the per-slug file with a relative path", () => {
    const index = buildPipelineIndex("qwen4-gamefeel", "2026-11-17T00:00:00.000Z");
    expect(index).toEqual({
      activeSlug: "qwen4-gamefeel",
      statusPath: "content/qwen4-gamefeel/pipeline-status.json",
      updatedAt: "2026-11-17T00:00:00.000Z",
    });
  });

  it("rejects a slug that could escape the content directory", () => {
    expect(() => buildPipelineIndex("../escape")).toThrow(/unsafe articleSlug/);
    expect(() => buildPipelineIndex("a/b")).toThrow(/unsafe articleSlug/);
    expect(() => buildPipelineIndex("")).toThrow(/empty/);
  });
});

describe("readPipelineStatus", () => {
  it("returns null when there is no status file", () => {
    expect(readPipelineStatus(makeRoot())).toBeNull();
  });

  it("accepts the legacy single-file layout", () => {
    const root = makeRoot();
    writeLegacy(root);
    const status = readPipelineStatus(root);
    expect(status?.kind).toBe("legacy");
    expect(status?.slug).toBe("qwen4-gamefeel");
    expect(status?.status.currentStage).toBe("delivered");
    expect(isLegacyStatus(LEGACY)).toBe(true);
  });

  it("reads the index and the per-slug file", () => {
    const root = makeRoot();
    const statusPath = statusFileFor(root, "qwen4-gamefeel");
    mkdirSync(join(root, "content", "qwen4-gamefeel"), { recursive: true });
    writeFileSync(statusPath, `${JSON.stringify(LEGACY, null, 2)}\n`, "utf8");
    writeFileSync(
      join(root, "output", "pipeline-status.json"),
      `${JSON.stringify(buildPipelineIndex("qwen4-gamefeel"), null, 2)}\n`,
      "utf8",
    );
    const status = readPipelineStatus(root);
    expect(status?.kind).toBe("indexed");
    expect(status?.statusPath).toBe(statusPath);
  });

  it("rejects an index that points outside the short-video root", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, "output", "pipeline-status.json"),
      `${JSON.stringify({ activeSlug: "qwen4-gamefeel", statusPath: "../escape.json" }, null, 2)}\n`,
      "utf8",
    );
    expect(() => readPipelineStatus(root)).toThrow(/escapes the short-video root/);
  });
});

describe("migratePipelineStatus", () => {
  it("dry-runs without writing anything", () => {
    const root = makeRoot();
    writeLegacy(root);
    const result = migratePipelineStatus(root, { apply: false });
    expect(result.action).toBe("would-migrate");
    expect(existsSync(result.statusPath)).toBe(false);
    expect(existsSync(result.backupPath)).toBe(false);
    expect(
      JSON.parse(readFileSync(join(root, "output", "pipeline-status.json"), "utf8")).articleSlug,
    ).toBe("qwen4-gamefeel");
  });

  it("moves the status, keeps a legacy backup and writes the index", () => {
    const root = makeRoot();
    writeLegacy(root);
    const result = migratePipelineStatus(root, {
      apply: true,
      now: new Date("2026-11-17T00:00:00Z"),
    });
    expect(result.action).toBe("migrated");
    expect(JSON.parse(readFileSync(result.statusPath, "utf8"))).toEqual(LEGACY);
    expect(JSON.parse(readFileSync(result.backupPath, "utf8"))).toEqual(LEGACY);
    expect(JSON.parse(readFileSync(result.indexPath, "utf8"))).toEqual(
      buildPipelineIndex("qwen4-gamefeel", "2026-11-17T00:00:00.000Z"),
    );
    expect(readPipelineStatus(root)?.kind).toBe("indexed");
  });

  it("is idempotent once the index exists", () => {
    const root = makeRoot();
    writeLegacy(root);
    migratePipelineStatus(root, { apply: true });
    const second = migratePipelineStatus(root, { apply: true });
    expect(second.action).toBe("already-indexed");
  });

  it("refuses to overwrite a different per-slug status", () => {
    const root = makeRoot();
    writeLegacy(root);
    const statusPath = statusFileFor(root, "qwen4-gamefeel");
    mkdirSync(join(root, "content", "qwen4-gamefeel"), { recursive: true });
    writeFileSync(
      statusPath,
      `${JSON.stringify({ articleSlug: "qwen4-gamefeel", currentStage: "newer" }, null, 2)}\n`,
      "utf8",
    );
    expect(() => migratePipelineStatus(root, { apply: true })).toThrow(/refusing to overwrite/);
  });

  it("does nothing when the index is absent", () => {
    const result = migratePipelineStatus(makeRoot());
    expect(result.action).toBe("missing");
  });
});
