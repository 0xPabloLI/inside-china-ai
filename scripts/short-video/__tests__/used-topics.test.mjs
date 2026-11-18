import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectUsedPackages,
  extractTokens,
  formatUsedLine,
  writeUsedTopicsArtifact,
} from "../lib/used-topics.mjs";

const SCRIPT = fileURLToPath(new URL("../used-topics.mjs", import.meta.url));

let root;

const writePkg = (slug, files) => {
  const dir = join(root, "content", slug);
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
};

const metaSource = (meta) => `export const meta = ${JSON.stringify(meta, null, 2)};\n`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "used-topics-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const seed = () => {
  writePkg("minimax-h3-image", {
    "meta.mjs": metaSource({
      pipelineId: "minimax-h3-image",
      title: "MiniMax Open Sources a 4K Image Model",
      createdAt: "2026-11-13",
      topics: ["minimax", "h3-image", "open-source"],
      keyEntities: { companies: ["minimax"], people: [], models: ["h3-image"] },
    }),
    "scene-data.mjs": "export const sceneData = [];",
  });
  writePkg("legacy-only", { "scene-data.mjs": "export const sceneData = [];" });
  writePkg("_gate-smoke", {
    "meta.mjs": metaSource({ pipelineId: "_gate-smoke", title: "smoke" }),
  });
  mkdirSync(join(root, "content", "empty-dir"), { recursive: true });
  writeFileSync(
    join(root, "pending-analysis.json"),
    JSON.stringify({
      slug: "minimax-h3-image",
      publishedAt: "2026-11-09T09:16:45.922Z",
      status: "done",
    }),
  );
};

describe("collectUsedPackages", () => {
  it("lists built packages, skips underscore dirs and empty dirs", async () => {
    seed();
    const result = await collectUsedPackages({
      contentDir: join(root, "content"),
      publishedRecordPath: join(root, "pending-analysis.json"),
    });

    expect(result.count).toBe(2);
    expect(result.packages.map((p) => p.slug).sort()).toEqual(["legacy-only", "minimax-h3-image"]);
    expect(result.packages.some((p) => p.slug === "_gate-smoke")).toBe(false);
    expect(result.packages.some((p) => p.slug === "empty-dir")).toBe(false);
  });

  it("reads meta topics/entities and marks published packages", async () => {
    seed();
    const result = await collectUsedPackages({
      contentDir: join(root, "content"),
      publishedRecordPath: join(root, "pending-analysis.json"),
    });
    const pkg = result.packages.find((p) => p.slug === "minimax-h3-image");

    expect(pkg.title).toBe("MiniMax Open Sources a 4K Image Model");
    expect(pkg.createdAt).toBe("2026-11-13");
    expect(pkg.topics).toContain("h3-image");
    expect(pkg.entities.models).toContain("h3-image");
    expect(pkg.published).toBe(true);
    expect(pkg.hasSceneData).toBe(true);

    const legacy = result.packages.find((p) => p.slug === "legacy-only");
    expect(legacy.published).toBe(false);
    expect(legacy.title).toBe("");
  });

  it("matches a published record by rendered output path", async () => {
    seed();
    writeFileSync(
      join(root, "pending-analysis.json"),
      JSON.stringify({
        slug: null,
        videoPath: "/repo/scripts/short-video/output/legacy-only/video-short.mp4",
        publishedAt: "2026-11-10T00:00:00.000Z",
      }),
    );
    const result = await collectUsedPackages({
      contentDir: join(root, "content"),
      publishedRecordPath: join(root, "pending-analysis.json"),
    });
    const legacy = result.packages.find((p) => p.slug === "legacy-only");

    expect(legacy.published).toBe(true);
    expect(legacy.publishedAt).toBe("2026-11-10T00:00:00.000Z");
  });

  it("survives a missing publish record", async () => {
    seed();
    const result = await collectUsedPackages({
      contentDir: join(root, "content"),
      publishedRecordPath: join(root, "nope.json"),
    });
    expect(result.packages.every((p) => p.published === false)).toBe(true);
  });
});

describe("tokens and formatting", () => {
  it("derives lowercase exclusion tokens from slug, topics and entities", async () => {
    seed();
    const result = await collectUsedPackages({
      contentDir: join(root, "content"),
      publishedRecordPath: join(root, "pending-analysis.json"),
    });
    const tokens = extractTokens(result.packages.find((p) => p.slug === "minimax-h3-image"));

    expect(tokens).toContain("minimax-h3-image");
    expect(tokens).toContain("h3-image");
    expect(tokens).toContain("minimax");
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("formats a one-line entry with slug, title and date", async () => {
    seed();
    const result = await collectUsedPackages({
      contentDir: join(root, "content"),
      publishedRecordPath: join(root, "pending-analysis.json"),
    });
    const line = formatUsedLine(result.packages.find((p) => p.slug === "minimax-h3-image"));

    expect(line).toContain("minimax-h3-image");
    expect(line).toContain("MiniMax Open Sources a 4K Image Model");
    expect(line).toContain("2026-11-13");
    expect(line).toContain("published");
  });
});

describe("writeUsedTopicsArtifact", () => {
  it("writes the report next to the trend artifact and reports counts", async () => {
    seed();
    const outPath = join(root, "output", "used-topics.json");
    const result = await writeUsedTopicsArtifact({
      contentDir: join(root, "content"),
      publishedRecordPath: join(root, "pending-analysis.json"),
      outPath,
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(result.publishedCount).toBe(1);
    expect(result.exclusionSlugs.sort()).toEqual(["legacy-only", "minimax-h3-image"]);

    const written = JSON.parse(readFileSync(outPath, "utf8"));
    expect(written.exclusionSlugs.sort()).toEqual(["legacy-only", "minimax-h3-image"]);
    expect(written.exclusionTokens).toContain("minimax");
  });

  it("fails open when the content directory is missing", async () => {
    const result = await writeUsedTopicsArtifact({
      contentDir: join(root, "nope"),
      outPath: join(root, "output", "used-topics.json"),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/content 目录不存在/);
  });

  it("requires an outPath", async () => {
    await expect(writeUsedTopicsArtifact({ contentDir: join(root, "content") })).rejects.toThrow(
      /outPath is required/,
    );
  });
});

describe("CLI", () => {
  it("prints JSON with packages and tokens", () => {
    seed();
    const stdout = execFileSync(
      process.execPath,
      [
        SCRIPT,
        "--content-dir",
        join(root, "content"),
        "--published-record",
        join(root, "pending-analysis.json"),
        "--json",
      ],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(stdout);

    expect(parsed.count).toBe(2);
    expect(parsed.packages[0].tokens.length).toBeGreaterThan(0);
    expect(parsed.exclusionSlugs).toContain("minimax-h3-image");
  });

  it("prints a human list by default", () => {
    seed();
    const stdout = execFileSync(
      process.execPath,
      [
        SCRIPT,
        "--content-dir",
        join(root, "content"),
        "--published-record",
        join(root, "pending-analysis.json"),
      ],
      { encoding: "utf8" },
    );

    expect(stdout).toContain("已建包 2 个");
    expect(stdout).toContain("minimax-h3-image");
  });
});
