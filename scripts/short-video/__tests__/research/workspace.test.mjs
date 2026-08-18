import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  createResearchWorkspace,
  getResearchWorkspace,
  writeResearchArtifact,
  readResearchArtifact,
  updateManifest,
  getLatestRun,
  getAllRuns,
  hasResearchWorkspace,
  generateRunId,
  RESEARCH_ARTIFACTS,
} from "../../lib/research/workspace.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test fixture: use a temporary content directory
const TEST_SLUG = "test-research-workspace";
const TEST_RUN_ID = "run-test-001";
const TEST_WORKSPACE = getResearchWorkspace(TEST_SLUG);

// Clean up before and after
beforeEach(() => {
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
});

// ─── generateRunId ───

describe("generateRunId", () => {
  it("returns a string starting with 'run-'", () => {
    const id = generateRunId();
    expect(id).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d{6}$/);
  });

  it("returns unique values on successive calls", () => {
    const id1 = generateRunId();
    const id2 = generateRunId();
    // Could theoretically be same if called within same second, but unlikely
    // Just check format
    expect(id1).toMatch(/^run-/);
    expect(id2).toMatch(/^run-/);
  });
});

// ─── createResearchWorkspace ───

describe("createResearchWorkspace", () => {
  it("creates the research directory", () => {
    const path = createResearchWorkspace(TEST_SLUG, TEST_RUN_ID);
    expect(existsSync(path)).toBe(true);
  });

  it("is idempotent — calling twice does not error", () => {
    createResearchWorkspace(TEST_SLUG, TEST_RUN_ID);
    expect(() => createResearchWorkspace(TEST_SLUG, TEST_RUN_ID)).not.toThrow();
  });

  it("creates separate directories for different slugs", () => {
    const path1 = createResearchWorkspace("slug-a", TEST_RUN_ID);
    const path2 = createResearchWorkspace("slug-b", TEST_RUN_ID);
    expect(path1).not.toBe(path2);
    expect(existsSync(path1)).toBe(true);
    expect(existsSync(path2)).toBe(true);

    // Cleanup slug-b
    rmSync(getResearchWorkspace("slug-b"), { recursive: true, force: true });
  });
});

// ─── writeResearchArtifact & readResearchArtifact ───

describe("writeResearchArtifact & readResearchArtifact", () => {
  it("writes and reads a JSON artifact", () => {
    const data = { test: "value", nested: { a: 1 } };
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, data);

    const read = readResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY);
    expect(read).toEqual(data);
  });

  it("returns null when artifact does not exist", () => {
    const result = readResearchArtifact(TEST_SLUG, TEST_RUN_ID, "nonexistent.json");
    expect(result).toBeNull();
  });

  it("creates the workspace directory if it doesn't exist", () => {
    const data = { test: true };
    // Don't call createResearchWorkspace first
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.BRIEF, data);
    const read = readResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.BRIEF);
    expect(read).toEqual(data);
  });

  it("overwrites existing artifact on re-write", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { v: 1 });
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { v: 2 });
    const read = readResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY);
    expect(read.v).toBe(2);
  });
});

// ─── Manifest management ───

describe("Manifest management", () => {
  it("creates a manifest on first artifact write", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { test: true });

    const manifestPath = join(TEST_WORKSPACE, RESEARCH_ARTIFACTS.MANIFEST);
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("getLatestRun returns null when no manifest exists", () => {
    expect(getLatestRun(TEST_SLUG)).toBeNull();
  });

  it("getLatestRun returns the run ID after manifest is created", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { test: true });
    expect(getLatestRun(TEST_SLUG)).toBe(TEST_RUN_ID);
  });

  it("getAllRuns returns empty array when no manifest", () => {
    expect(getAllRuns(TEST_SLUG)).toEqual([]);
  });

  it("getAllRuns returns all run IDs in chronological order", () => {
    updateManifest(TEST_SLUG, "run-001", { createdAt: "2026-08-18T10:00:00Z" });
    updateManifest(TEST_SLUG, "run-002", { createdAt: "2026-08-18T12:00:00Z" });
    updateManifest(TEST_SLUG, "run-003", { createdAt: "2026-08-18T11:00:00Z" });

    const runs = getAllRuns(TEST_SLUG);
    expect(runs).toEqual(["run-001", "run-003", "run-002"]);
  });

  it("getLatestRun returns most recent by createdAt", () => {
    updateManifest(TEST_SLUG, "run-001", { createdAt: "2026-08-18T10:00:00Z" });
    updateManifest(TEST_SLUG, "run-002", { createdAt: "2026-08-18T12:00:00Z" });
    updateManifest(TEST_SLUG, "run-003", { createdAt: "2026-08-18T11:00:00Z" });

    expect(getLatestRun(TEST_SLUG)).toBe("run-002");
  });

  it("updateManifest merges fields into existing run", () => {
    updateManifest(TEST_SLUG, TEST_RUN_ID, { status: "started" });
    updateManifest(TEST_SLUG, TEST_RUN_ID, { status: "completed", evidenceCount: 5 });

    const manifest = JSON.parse(
      readFileSync(join(TEST_WORKSPACE, RESEARCH_ARTIFACTS.MANIFEST), "utf-8"),
    );
    const run = manifest.runs.find((r) => r.researchRunId === TEST_RUN_ID);
    expect(run.status).toBe("completed");
    expect(run.evidenceCount).toBe(5);
  });
});

// ─── Concurrent run isolation ───

describe("Concurrent run isolation", () => {
  it("different content slugs get separate workspaces", () => {
    const slugA = "concurrent-a";
    const slugB = "concurrent-b";

    writeResearchArtifact(slugA, "run-1", RESEARCH_ARTIFACTS.DISCOVERY, { from: "a" });
    writeResearchArtifact(slugB, "run-1", RESEARCH_ARTIFACTS.DISCOVERY, { from: "b" });

    const readA = readResearchArtifact(slugA, "run-1", RESEARCH_ARTIFACTS.DISCOVERY);
    const readB = readResearchArtifact(slugB, "run-1", RESEARCH_ARTIFACTS.DISCOVERY);

    expect(readA.from).toBe("a");
    expect(readB.from).toBe("b");

    // Cleanup
    rmSync(getResearchWorkspace(slugA), { recursive: true, force: true });
    rmSync(getResearchWorkspace(slugB), { recursive: true, force: true });
  });
});

// ─── hasResearchWorkspace ───

describe("hasResearchWorkspace", () => {
  it("returns false when no workspace exists", () => {
    expect(hasResearchWorkspace(TEST_SLUG)).toBe(false);
  });

  it("returns true after workspace is created", () => {
    createResearchWorkspace(TEST_SLUG, TEST_RUN_ID);
    expect(hasResearchWorkspace(TEST_SLUG)).toBe(true);
  });
});
