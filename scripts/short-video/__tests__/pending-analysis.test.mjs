import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  contentFileFor,
  legacyFileFor,
  listPendingAnalysis,
  migratePendingAnalysis,
  writePendingAnalysis,
} from "../lib/pending-analysis.mjs";

const RECORD = {
  postGroupId: null,
  slug: "qwen4-gamefeel",
  videoPath: "output/qwen4-gamefeel/short.mp4",
  publishedAt: "2026-11-09T09:16:45.922Z",
  suggestedAnalysisTime: "2026-11-11T09:16:45.922Z",
  status: "pending",
  publishMethod: "manual-guide",
};

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "pending-analysis-"));
  roots.push(root);
  mkdirSync(join(root, "output"), { recursive: true });
  mkdirSync(join(root, "content"), { recursive: true });
  return root;
}

function writeLegacy(root, value = RECORD) {
  writeFileSync(
    join(root, "output", "pending-analysis.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("contentFileFor", () => {
  it("builds a per-slug path inside content", () => {
    expect(contentFileFor("/repo/scripts/short-video", "qwen4-gamefeel")).toBe(
      "/repo/scripts/short-video/content/qwen4-gamefeel/pending-analysis.json",
    );
  });

  it("allows nested content slugs", () => {
    expect(contentFileFor("/repo/scripts/short-video", "distillation/pt1")).toBe(
      "/repo/scripts/short-video/content/distillation/pt1/pending-analysis.json",
    );
  });

  it("rejects traversal and absolute slugs", () => {
    expect(() => contentFileFor("/repo", "../escape")).toThrow();
    expect(() => contentFileFor("/repo", "/abs")).toThrow();
    expect(() => contentFileFor("/repo", "a/../b")).toThrow();
  });
});

describe("writePendingAnalysis", () => {
  it("writes per slug when a slug is present", () => {
    const root = makeRoot();
    const result = writePendingAnalysis(root, { slug: "qwen4-gamefeel", record: RECORD });
    expect(result.kind).toBe("slug");
    expect(result.path).toBe(join(root, "content", "qwen4-gamefeel", "pending-analysis.json"));
    expect(existsSync(result.path)).toBe(true);
    expect(JSON.parse(readFileSync(result.path, "utf8")).slug).toBe("qwen4-gamefeel");
  });

  it("supports nested slugs", () => {
    const root = makeRoot();
    const result = writePendingAnalysis(root, { slug: "distillation/pt1", record: RECORD });
    expect(result.path).toBe(join(root, "content", "distillation", "pt1", "pending-analysis.json"));
    expect(existsSync(result.path)).toBe(true);
  });

  it("keeps the legacy single file when no slug is supplied", () => {
    const root = makeRoot();
    const result = writePendingAnalysis(root, { record: { ...RECORD, slug: null } });
    expect(result.kind).toBe("legacy");
    expect(result.path).toBe(legacyFileFor(root));
    expect(existsSync(result.path)).toBe(true);
  });

  it("overwrites the same slug's record atomically", () => {
    const root = makeRoot();
    writePendingAnalysis(root, { slug: "qwen4-gamefeel", record: RECORD });
    const next = { ...RECORD, status: "done", analyzedAt: "2026-11-13T05:50:30.073Z" };
    writePendingAnalysis(root, { slug: "qwen4-gamefeel", record: next });
    const saved = JSON.parse(readFileSync(contentFileFor(root, "qwen4-gamefeel"), "utf8"));
    expect(saved.status).toBe("done");
    expect(saved.analyzedAt).toBe("2026-11-13T05:50:30.073Z");
  });
});

describe("listPendingAnalysis", () => {
  it("reads the legacy record", () => {
    const root = makeRoot();
    writeLegacy(root);
    const entries = listPendingAnalysis(root);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("legacy");
    expect(entries[0].slug).toBe("qwen4-gamefeel");
  });

  it("reads per-slug records and nested slugs", () => {
    const root = makeRoot();
    writePendingAnalysis(root, { slug: "qwen4-gamefeel", record: RECORD });
    writePendingAnalysis(root, {
      slug: "distillation/pt1",
      record: { ...RECORD, slug: "distillation/pt1", publishedAt: "2026-11-12T00:00:00.000Z" },
    });
    const entries = listPendingAnalysis(root);
    expect(entries.map((entry) => entry.slug)).toEqual(["distillation/pt1", "qwen4-gamefeel"]);
  });

  it("prefers the per-slug record over a legacy record with the same slug", () => {
    const root = makeRoot();
    writeLegacy(root, { ...RECORD, status: "pending" });
    writePendingAnalysis(root, { slug: "qwen4-gamefeel", record: { ...RECORD, status: "done" } });
    const entries = listPendingAnalysis(root);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("slug");
    expect(entries[0].record.status).toBe("done");
  });

  it("keeps a genuinely different slug-less legacy record separate", () => {
    const root = makeRoot();
    writeLegacy(root, { ...RECORD, slug: null, publishedAt: "2026-11-01T00:00:00.000Z" });
    writePendingAnalysis(root, { slug: "qwen4-gamefeel", record: RECORD });
    const entries = listPendingAnalysis(root);
    expect(entries).toHaveLength(2);
    expect(entries.some((entry) => entry.kind === "legacy" && entry.slug === null)).toBe(true);
  });

  it("shadows a slug-less legacy twin after migration", () => {
    const root = makeRoot();
    writeLegacy(root, { ...RECORD, slug: null });
    writePendingAnalysis(root, { slug: "qwen4-gamefeel", record: RECORD });
    const entries = listPendingAnalysis(root);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("slug");
    expect(entries[0].slug).toBe("qwen4-gamefeel");
  });

  it("rejects a per-slug file that is valid JSON but not an object", () => {
    const root = makeRoot();
    mkdirSync(join(root, "content", "qwen4-gamefeel"), { recursive: true });
    writeFileSync(
      join(root, "content", "qwen4-gamefeel", "pending-analysis.json"),
      "null\n",
      "utf8",
    );
    expect(() => listPendingAnalysis(root)).toThrow(/is not a JSON object/);
  });
});

describe("publish-tiktok integration seam", () => {
  it("writes through the pending-analysis helper instead of a fixed output path", () => {
    const driver = readFileSync(new URL("../publish-tiktok.mjs", import.meta.url), "utf8");
    expect(driver).toContain("writePendingAnalysis(__dirname");
    expect(driver).not.toContain('join(OUTPUT_DIR, "pending-analysis.json")');
    expect(driver).toContain('assertPathId(contentDir, "--content")');
    expect(driver).toContain('assertPathId(postSlug, "--slug")');
  });
});

describe("migratePendingAnalysis", () => {
  it("is a dry run unless apply is passed", () => {
    const root = makeRoot();
    writeLegacy(root);
    const result = migratePendingAnalysis(root);
    expect(result.action).toBe("would-migrate");
    expect(result.slug).toBe("qwen4-gamefeel");
    expect(existsSync(result.targetPath)).toBe(false);
    expect(existsSync(result.backupPath)).toBe(false);
  });

  it("writes the per-slug file and legacy backup on apply", () => {
    const root = makeRoot();
    writeLegacy(root);
    const result = migratePendingAnalysis(root, { apply: true });
    expect(result.action).toBe("migrated");
    expect(existsSync(result.targetPath)).toBe(true);
    expect(existsSync(result.backupPath)).toBe(true);
    expect(existsSync(legacyFileFor(root))).toBe(true);
    expect(JSON.parse(readFileSync(result.targetPath, "utf8")).slug).toBe("qwen4-gamefeel");
  });

  it("needs a slug when the legacy record has none", () => {
    const root = makeRoot();
    writeLegacy(root, { ...RECORD, slug: null });
    expect(migratePendingAnalysis(root).action).toBe("needs-slug");
  });

  it("accepts an explicit slug for a legacy record with no slug", () => {
    const root = makeRoot();
    writeLegacy(root, { ...RECORD, slug: null });
    const result = migratePendingAnalysis(root, { apply: true, slug: "qwen4-gamefeel" });
    expect(result.action).toBe("migrated");
    expect(JSON.parse(readFileSync(result.targetPath, "utf8")).slug).toBe("qwen4-gamefeel");
  });

  it("refuses an explicit slug that disagrees with the legacy record", () => {
    const root = makeRoot();
    writeLegacy(root);
    expect(() => migratePendingAnalysis(root, { slug: "other-slug" })).toThrow(/disagrees/);
  });

  it("does not overwrite a different per-slug record", () => {
    const root = makeRoot();
    writeLegacy(root, { ...RECORD, status: "pending" });
    writePendingAnalysis(root, {
      slug: "qwen4-gamefeel",
      record: { ...RECORD, status: "done", analyzedAt: "2026-11-13T05:50:30.073Z" },
    });
    expect(() => migratePendingAnalysis(root, { apply: true })).toThrow(/refusing to overwrite/);
  });

  it("reports already-migrated when the per-slug copy matches regardless of key order", () => {
    const root = makeRoot();
    writeLegacy(root);
    writePendingAnalysis(root, {
      slug: "qwen4-gamefeel",
      record: {
        status: RECORD.status,
        slug: RECORD.slug,
        publishedAt: RECORD.publishedAt,
        postGroupId: RECORD.postGroupId,
        videoPath: RECORD.videoPath,
        suggestedAnalysisTime: RECORD.suggestedAnalysisTime,
        publishMethod: RECORD.publishMethod,
      },
    });
    expect(migratePendingAnalysis(root).action).toBe("already-migrated");
  });

  it("lists one record after migrating a slug-less legacy record", () => {
    const root = makeRoot();
    writeLegacy(root, { ...RECORD, slug: null });
    migratePendingAnalysis(root, { apply: true, slug: "qwen4-gamefeel" });
    const entries = listPendingAnalysis(root);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("slug");
  });

  it("returns missing when there is no legacy record", () => {
    expect(migratePendingAnalysis(makeRoot()).action).toBe("missing");
  });
});
