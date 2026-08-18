/**
 * Research Evidence Pipeline — Workspace Manager
 *
 * Creates and manages content-scoped research directories.
 * Each content pipeline run gets its own research/ subdirectory under
 * content/<slug>/ containing discovery.json, research-brief.json,
 * evidence-pack.json, evidence-pack.md, and article-claim-map.json.
 *
 * A research-manifest.json tracks all runs for a given content slug.
 *
 * See: docs/specs/spec-research-evidence-pipeline.md
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base path: scripts/short-video/content/
const CONTENT_BASE = join(__dirname, "..", "..", "content");

// Artifact filenames in the research workspace
export const RESEARCH_ARTIFACTS = {
  DISCOVERY: "discovery.json",
  BRIEF: "research-brief.json",
  EVIDENCE_PACK_JSON: "evidence-pack.json",
  EVIDENCE_PACK_MD: "evidence-pack.md",
  CLAIM_MAP: "article-claim-map.json",
  MANIFEST: "research-manifest.json",
};

/**
 * Generates a timestamped research run ID.
 * @returns {string} e.g. "run-2026-08-18-001"
 */
export function generateRunId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");
  return `run-${dateStr}-${timeStr}`;
}

/**
 * Gets the research workspace path for a content slug.
 * Does NOT create the directory — use createResearchWorkspace for that.
 * @param {string} contentSlug — the content slug (e.g. "deepseek-funding")
 * @returns {string} absolute path to the research workspace
 */
export function getResearchWorkspace(contentSlug) {
  return join(CONTENT_BASE, contentSlug, "research");
}

/**
 * Creates the research workspace directory for a content slug + run ID.
 * Creates parent directories as needed. Idempotent — does nothing if dir exists.
 * @param {string} contentSlug
 * @param {string} researchRunId
 * @returns {string} absolute path to the research workspace
 */
export function createResearchWorkspace(contentSlug, researchRunId) {
  const workspacePath = getResearchWorkspace(contentSlug);
  mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
}

/**
 * Writes a research artifact (JSON) to the workspace.
 * @param {string} contentSlug
 * @param {string} researchRunId — not used in path (workspace is per-content, not per-run), but logged in manifest
 * @param {string} filename — one of RESEARCH_ARTIFACTS
 * @param {object} data — JSON-serializable data
 */
export function writeResearchArtifact(contentSlug, researchRunId, filename, data) {
  const workspacePath = getResearchWorkspace(contentSlug);
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  const filePath = join(workspacePath, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");

  // Update manifest
  updateManifest(contentSlug, researchRunId, {
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * Reads a research artifact (JSON) from the workspace.
 * @param {string} contentSlug
 * @param {string} researchRunId — accepted for API symmetry, not used in path resolution
 * @param {string} filename
 * @returns {object|null} parsed JSON or null if file doesn't exist
 */
export function readResearchArtifact(contentSlug, researchRunId, filename) {
  const workspacePath = getResearchWorkspace(contentSlug);
  const filePath = join(workspacePath, filename);
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Gets the manifest path for a content slug.
 * @param {string} contentSlug
 * @returns {string} absolute path
 */
function getManifestPath(contentSlug) {
  return join(getResearchWorkspace(contentSlug), RESEARCH_ARTIFACTS.MANIFEST);
}

/**
 * Reads the research manifest for a content slug.
 * Returns null if no manifest exists yet.
 * @param {string} contentSlug
 * @returns {object|null}
 */
export function readManifest(contentSlug) {
  const manifestPath = getManifestPath(contentSlug);
  if (!existsSync(manifestPath)) {
    return null;
  }
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Updates the research manifest with run metadata.
 * Creates the manifest if it doesn't exist.
 * Merges `updates` into the existing run entry (or creates a new one).
 * @param {string} contentSlug
 * @param {string} researchRunId
 * @param {object} updates — fields to merge into the run entry
 */
export function updateManifest(contentSlug, researchRunId, updates) {
  const manifestPath = getManifestPath(contentSlug);
  const workspacePath = getResearchWorkspace(contentSlug);
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }

  let manifest = readManifest(contentSlug);
  if (!manifest) {
    manifest = {
      schemaVersion: "1.0.0",
      contentId: contentSlug,
      runs: [],
    };
  }

  // Find or create the run entry
  let run = manifest.runs.find((r) => r.researchRunId === researchRunId);
  if (!run) {
    run = {
      researchRunId,
      createdAt: new Date().toISOString(),
      status: "started",
      artifacts: [],
    };
    manifest.runs.push(run);
  }

  // Merge updates
  Object.assign(run, updates);

  // Track which artifacts have been written
  if (updates.artifactWritten && !run.artifacts.includes(updates.artifactWritten)) {
    run.artifacts.push(updates.artifactWritten);
    delete run.artifactWritten;
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

/**
 * Gets the latest research run ID for a content slug.
 * "Latest" = most recent createdAt timestamp.
 * @param {string} contentSlug
 * @returns {string|null} run ID or null if no manifest exists
 */
export function getLatestRun(contentSlug) {
  const manifest = readManifest(contentSlug);
  if (!manifest || !manifest.runs || manifest.runs.length === 0) {
    return null;
  }

  // Sort by createdAt descending
  const sorted = [...manifest.runs].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return sorted[0].researchRunId;
}

/**
 * Gets all run IDs for a content slug, oldest first.
 * @param {string} contentSlug
 * @returns {string[]} array of run IDs
 */
export function getAllRuns(contentSlug) {
  const manifest = readManifest(contentSlug);
  if (!manifest || !manifest.runs) {
    return [];
  }
  return manifest.runs
    .sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map((r) => r.researchRunId);
}

/**
 * Checks if a research workspace exists for a content slug.
 * @param {string} contentSlug
 * @returns {boolean}
 */
export function hasResearchWorkspace(contentSlug) {
  return existsSync(getResearchWorkspace(contentSlug));
}
