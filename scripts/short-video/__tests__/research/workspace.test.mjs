import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";

import {
  createResearchWorkspace,
  getResearchWorkspace,
  getRunPath,
  writeResearchArtifact,
  readResearchArtifact,
  updateManifest,
  readManifest,
  getLatestRun,
  getAllRuns,
  hasResearchWorkspace,
  generateRunId,
  RESEARCH_ARTIFACTS,
} from "../../lib/research/workspace.mjs";

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
});

// ─── getRunPath ───

describe("getRunPath", () => {
  it("includes the researchRunId in the path", () => {
    const path = getRunPath(TEST_SLUG, TEST_RUN_ID);
    expect(path).toContain(TEST_RUN_ID);
    expect(path).toContain(TEST_SLUG);
    expect(path).toContain("research");
  });

  it("produces different paths for different runs of the same slug", () => {
    const path1 = getRunPath(TEST_SLUG, "run-a");
    const path2 = getRunPath(TEST_SLUG, "run-b");
    expect(path1).not.toBe(path2);
  });
});

// ─── createResearchWorkspace ───

describe("createResearchWorkspace", () => {
  it("creates the run-specific directory", () => {
    const path = createResearchWorkspace(TEST_SLUG, TEST_RUN_ID);
    expect(existsSync(path)).toBe(true);
  });

  it("is idempotent — calling twice does not error", () => {
    createResearchWorkspace(TEST_SLUG, TEST_RUN_ID);
    expect(() => createResearchWorkspace(TEST_SLUG, TEST_RUN_ID)).not.toThrow();
  });

  it("creates separate run directories for the same slug", () => {
    const path1 = createResearchWorkspace(TEST_SLUG, "run-a");
    const path2 = createResearchWorkspace(TEST_SLUG, "run-b");
    expect(path1).not.toBe(path2);
    expect(existsSync(path1)).toBe(true);
    expect(existsSync(path2)).toBe(true);
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

  it("creates the run directory if it doesn't exist", () => {
    const data = { test: true };
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.BRIEF, data);
    const read = readResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.BRIEF);
    expect(read).toEqual(data);
  });

  it("overwrites existing artifact on re-write (same run)", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { v: 1 });
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { v: 2 });
    const read = readResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY);
    expect(read.v).toBe(2);
  });

  it("throws when artifact contentId does not match requested slug", () => {
    expect(() =>
      writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, {
        contentId: "different-slug",
        researchRunId: TEST_RUN_ID,
      }),
    ).toThrow("contentId");
  });

  it("throws when artifact researchRunId does not match requested run", () => {
    expect(() =>
      writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, {
        contentId: TEST_SLUG,
        researchRunId: "different-run",
      }),
    ).toThrow("researchRunId");
  });

  it("returns null when reading from a non-existent run path", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, {
      contentId: TEST_SLUG,
      researchRunId: TEST_RUN_ID,
      test: true,
    });
    // wrong-run directory doesn't exist, so file not found → null
    const result = readResearchArtifact(TEST_SLUG, "wrong-run", RESEARCH_ARTIFACTS.DISCOVERY);
    expect(result).toBeNull();
  });
});

// ─── Same-slug multi-run isolation (R0-1) ───

describe("Same-slug multi-run isolation", () => {
  it("two runs of the same slug do not overwrite each other", () => {
    const runA = "run-isolation-a";
    const runB = "run-isolation-b";

    writeResearchArtifact(TEST_SLUG, runA, RESEARCH_ARTIFACTS.DISCOVERY, { from: "a" });
    writeResearchArtifact(TEST_SLUG, runB, RESEARCH_ARTIFACTS.DISCOVERY, { from: "b" });

    const readA = readResearchArtifact(TEST_SLUG, runA, RESEARCH_ARTIFACTS.DISCOVERY);
    const readB = readResearchArtifact(TEST_SLUG, runB, RESEARCH_ARTIFACTS.DISCOVERY);

    expect(readA.from).toBe("a");
    expect(readB.from).toBe("b");
  });

  it("cross-run read returns null (not the other run's artifact)", () => {
    const runA = "run-cross-a";
    const runB = "run-cross-b";

    writeResearchArtifact(TEST_SLUG, runA, RESEARCH_ARTIFACTS.BRIEF, { from: "a" });

    // runB hasn't written a brief yet
    const result = readResearchArtifact(TEST_SLUG, runB, RESEARCH_ARTIFACTS.BRIEF);
    expect(result).toBeNull();
  });

  it("different content slugs still get separate workspaces", () => {
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

    const manifest = readManifest(TEST_SLUG);
    const run = manifest.runs.find((r) => r.researchRunId === TEST_RUN_ID);
    expect(run.status).toBe("completed");
    expect(run.evidenceCount).toBe(5);
  });

  // R2-1: manifest records artifact metadata
  it("manifest records artifact filename, schemaVersion, hash, and timestamp", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, {
      schemaVersion: "1.0.0",
      contentId: TEST_SLUG,
      researchRunId: TEST_RUN_ID,
      test: "data",
    });

    const manifest = readManifest(TEST_SLUG);
    const run = manifest.runs.find((r) => r.researchRunId === TEST_RUN_ID);
    expect(run.artifacts).toHaveLength(1);
    expect(run.artifacts[0].filename).toBe(RESEARCH_ARTIFACTS.DISCOVERY);
    expect(run.artifacts[0].schemaVersion).toBe("1.0.0");
    expect(run.artifacts[0].contentHash).toBeTruthy();
    expect(run.artifacts[0].contentHash).toHaveLength(12);
    expect(run.artifacts[0].writtenAt).toBeTruthy();
  });

  it("manifest deduplicates artifacts by filename on re-write", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { v: 1 });
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { v: 2 });

    const manifest = readManifest(TEST_SLUG);
    const run = manifest.runs.find((r) => r.researchRunId === TEST_RUN_ID);
    expect(run.artifacts).toHaveLength(1); // dedup'd, not 2
    expect(run.artifacts[0].contentHash).toBeTruthy();
  });

  it("manifest tracks multiple different artifacts per run", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.DISCOVERY, { a: 1 });
    writeResearchArtifact(TEST_SLUG, TEST_RUN_ID, RESEARCH_ARTIFACTS.BRIEF, { b: 2 });

    const manifest = readManifest(TEST_SLUG);
    const run = manifest.runs.find((r) => r.researchRunId === TEST_RUN_ID);
    expect(run.artifacts).toHaveLength(2);
    const filenames = run.artifacts.map((a) => a.filename).sort();
    expect(filenames).toEqual([RESEARCH_ARTIFACTS.DISCOVERY, RESEARCH_ARTIFACTS.BRIEF]);
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
