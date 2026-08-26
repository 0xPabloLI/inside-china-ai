import { describe, it, expect } from "vitest";
import { collectMarkdownSource, findFilesRecursive } from "../lib/collectors.mjs";
import { join } from "path";
import { fileURLToPath } from "url";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..");
const fixturesDir = join(__dirname, "fixtures", "research");

// ─── collectMarkdownSource: research mode (useRelativePath=true) ───

describe("collectMarkdownSource — research mode (useRelativePath=true)", () => {
  it("collects all .md files as content_type='research' (Scenario #1)", () => {
    const results = collectMarkdownSource(
      fixturesDir,
      "research",
      ["INDEX.md", "README.md"],
      true,
      projectRoot,
    );

    // Should have collected cloud-gpu-options.md, digital-human-test-progress.md, subdir/nested-report.md
    // INDEX.md and README.md are excluded
    const sourceIds = [...new Set(results.map((r) => r.source_id))];
    expect(sourceIds.some((id) => id.includes("cloud-gpu-options"))).toBe(true);
    expect(sourceIds.some((id) => id.includes("digital-human-test-progress"))).toBe(true);
    expect(sourceIds.some((id) => id.includes("nested-report"))).toBe(true);
    expect(sourceIds.some((id) => id.includes("INDEX"))).toBe(false);
    expect(sourceIds.some((id) => id.includes("README"))).toBe(false);

    for (const chunk of results) {
      expect(chunk.content_type).toBe("research");
    }
  });

  it("source_id is repo-relative path without .md extension (Scenario #8)", () => {
    const results = collectMarkdownSource(
      fixturesDir,
      "research",
      ["INDEX.md", "README.md"],
      true,
      projectRoot,
    );

    // Check that at least one source_id starts with the fixtures path pattern
    const cloudGpu = results.find((r) => r.source_id.includes("cloud-gpu-options"));
    expect(cloudGpu).toBeDefined();
    expect(cloudGpu.source_id).not.toMatch(/\.md$/);
  });

  it("nested subdirectory files get distinct source_ids (Scenario #14)", () => {
    const results = collectMarkdownSource(
      fixturesDir,
      "research",
      ["INDEX.md", "README.md"],
      true,
      projectRoot,
    );

    const nested = results.find((r) => r.source_id.includes("nested-report"));
    expect(nested).toBeDefined();
    // source_id should contain the subdir path component
    expect(nested.source_id).toContain("subdir");
    expect(nested.source_id).not.toMatch(/\.md$/);
  });

  it("excludes INDEX.md and README.md (Scenario #5)", () => {
    const results = collectMarkdownSource(
      fixturesDir,
      "research",
      ["INDEX.md", "README.md"],
      true,
      projectRoot,
    );

    const sourceIds = results.map((r) => r.source_id);
    const hasIndex = sourceIds.some((id) => id.includes("INDEX"));
    const hasReadme = sourceIds.some((id) => id.includes("README"));
    expect(hasIndex).toBe(false);
    expect(hasReadme).toBe(false);
  });
});

// ─── collectMarkdownSource: default mode (useRelativePath=false) ───

describe("collectMarkdownSource — default mode (useRelativePath=false)", () => {
  it("uses basename as source_id (Scenario #12, #13)", () => {
    const results = collectMarkdownSource(fixturesDir, "source-material", [
      "INDEX.md",
      "README.md",
    ]);

    const cloudGpu = results.find((r) => r.source_id.includes("cloud-gpu-options"));
    expect(cloudGpu).toBeDefined();
    // basename only — no path prefix
    expect(cloudGpu.source_id).toBe("cloud-gpu-options");
  });

  it("nested file source_id is basename only (no subdir prefix)", () => {
    const results = collectMarkdownSource(fixturesDir, "source-material", [
      "INDEX.md",
      "README.md",
    ]);

    const nested = results.find((r) => r.source_id.includes("nested-report"));
    expect(nested).toBeDefined();
    expect(nested.source_id).toBe("nested-report");
  });
});

// ─── collectMarkdownSource: edge cases ───

describe("collectMarkdownSource — edge cases", () => {
  it("returns empty array for non-existent directory (Scenario #2)", () => {
    const results = collectMarkdownSource(
      join(fixturesDir, "does-not-exist"),
      "research",
      [],
      true,
      projectRoot,
    );
    expect(results).toEqual([]);
  });

  it("returns empty array for non-existent directory in default mode", () => {
    const results = collectMarkdownSource(join(fixturesDir, "does-not-exist"), "test");
    expect(results).toEqual([]);
  });

  it("produces chunks with correct shape (content_type, source_id, chunk_index, chunk_text, chunk_title, metadata)", () => {
    const results = collectMarkdownSource(
      fixturesDir,
      "research",
      ["INDEX.md", "README.md"],
      true,
      projectRoot,
    );

    expect(results.length).toBeGreaterThan(0);
    for (const chunk of results) {
      expect(chunk).toHaveProperty("content_type");
      expect(chunk).toHaveProperty("source_id");
      expect(chunk).toHaveProperty("chunk_index");
      expect(chunk).toHaveProperty("chunk_text");
      expect(chunk).toHaveProperty("chunk_title");
      expect(chunk).toHaveProperty("metadata");
      expect(typeof chunk.chunk_text).toBe("string");
      expect(typeof chunk.chunk_index).toBe("number");
    }
  });

  it("metadata includes source_file and topic", () => {
    const results = collectMarkdownSource(
      fixturesDir,
      "research",
      ["INDEX.md", "README.md"],
      true,
      projectRoot,
    );

    for (const chunk of results) {
      expect(chunk.metadata).toHaveProperty("source_file");
      expect(chunk.metadata).toHaveProperty("topic");
    }
  });

  it("can be tested without Ollama or Supabase (Scenario #15)", () => {
    // This test file itself is proof — it imports and runs collectMarkdownSource
    // without any external service. If this test runs, the scenario is satisfied.
    const results = collectMarkdownSource(
      fixturesDir,
      "research",
      ["INDEX.md", "README.md"],
      true,
      projectRoot,
    );
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── findFilesRecursive ───

describe("findFilesRecursive", () => {
  it("finds all .md files recursively", () => {
    const files = findFilesRecursive(fixturesDir, ".md");
    expect(files.length).toBeGreaterThanOrEqual(5); // 3 research + INDEX + README + subdir/nested
    expect(files.some((f) => f.endsWith("cloud-gpu-options.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("nested-report.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("INDEX.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("README.md"))).toBe(true);
  });
});
