/**
 * Research Evidence Pipeline — Workspace Manager
 *
 * Creates and manages content-scoped research directories.
 * Each content pipeline run gets its own research/<researchRunId>/ subdirectory
 * under content/<slug>/research/. Artifacts (discovery.json, research-brief.json,
 * evidence-pack.json, evidence-pack.md, article-claim-map.json) are stored
 * per-run to prevent cross-run overwrites.
 *
 * research-manifest.json stays at the research root and tracks all runs.
 *
 * See: docs/specs/spec-research-evidence-pipeline.md
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

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
 * @returns {string} e.g. "run-2026-08-18-102030"
 */
export function generateRunId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");
  return `run-${dateStr}-${timeStr}`;
}

/**
 * Gets the research workspace root path for a content slug.
 * This is the parent of all run-specific directories.
 * Does NOT create the directory.
 * @param {string} contentSlug
 * @returns {string} absolute path to the research workspace root
 */
export function getResearchWorkspace(contentSlug) {
  return join(CONTENT_BASE, contentSlug, "research");
}

/**
 * Gets the run-specific directory path for a content slug + run ID.
 * Artifacts are stored per-run to prevent cross-run overwrites.
 * @param {string} contentSlug
 * @param {string} researchRunId
 * @returns {string} absolute path to the run-specific directory
 */
export function getRunPath(contentSlug, researchRunId) {
  return join(getResearchWorkspace(contentSlug), researchRunId);
}

/**
 * Creates the research workspace directory for a content slug + run ID.
 * Creates the run-specific subdirectory and parent directories as needed.
 * Idempotent — does nothing if dir exists.
 * @param {string} contentSlug
 * @param {string} researchRunId
 * @returns {string} absolute path to the run-specific directory
 */
export function createResearchWorkspace(contentSlug, researchRunId) {
  const runPath = getRunPath(contentSlug, researchRunId);
  mkdirSync(runPath, { recursive: true });
  return runPath;
}

/**
 * Computes a short content hash for an artifact, for manifest tracking.
 * Uses SHA-256 and returns the first 12 hex chars.
 * @param {object} data
 * @returns {string}
 */
function computeContentHash(data) {
  const str = JSON.stringify(data);
  return createHash("sha256").update(str).digest("hex").slice(0, 12);
}

/**
 * Writes a research artifact (JSON) to the run-specific directory.
 * Validates that artifact's contentId and researchRunId match the request.
 * Updates the manifest with artifact metadata (filename, schemaVersion, hash, timestamp).
 * @param {string} contentSlug
 * @param {string} researchRunId — used in path resolution
 * @param {string} filename — one of RESEARCH_ARTIFACTS (except MANIFEST)
 * @param {object} data — JSON-serializable data
 */
export function writeResearchArtifact(contentSlug, researchRunId, filename, data) {
  const runPath = getRunPath(contentSlug, researchRunId);
  if (!existsSync(runPath)) {
    mkdirSync(runPath, { recursive: true });
  }

  // Validate artifact ownership if it has contentId/researchRunId fields
  if (data && typeof data === "object") {
    if (data.contentId && data.contentId !== contentSlug) {
      throw new Error(
        `Artifact contentId "${data.contentId}" does not match requested slug "${contentSlug}"`,
      );
    }
    if (data.researchRunId && data.researchRunId !== researchRunId) {
      throw new Error(
        `Artifact researchRunId "${data.researchRunId}" does not match requested run "${researchRunId}"`,
      );
    }
  }

  const filePath = join(runPath, filename);
  const jsonStr = JSON.stringify(data, null, 2);
  writeFileSync(filePath, jsonStr, "utf-8");

  // Compute hash for manifest tracking
  const contentHash = createHash("sha256").update(jsonStr).digest("hex").slice(0, 12);

  // Update manifest with artifact metadata
  updateManifest(contentSlug, researchRunId, {
    artifactWritten: {
      filename,
      schemaVersion: data?.schemaVersion || null,
      contentHash,
      writtenAt: new Date().toISOString(),
    },
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * Reads a research artifact (JSON) from the run-specific directory.
 * Validates that the artifact's contentId and researchRunId match the request.
 * @param {string} contentSlug
 * @param {string} researchRunId — used in path resolution
 * @param {string} filename
 * @returns {object|null} parsed JSON or null if file doesn't exist
 */
export function readResearchArtifact(contentSlug, researchRunId, filename) {
  const runPath = getRunPath(contentSlug, researchRunId);
  const filePath = join(runPath, filename);
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  // Validate artifact ownership
  if (parsed && typeof parsed === "object") {
    if (parsed.contentId && parsed.contentId !== contentSlug) {
      throw new Error(
        `Artifact contentId "${parsed.contentId}" does not match requested slug "${contentSlug}"`,
      );
    }
    if (parsed.researchRunId && parsed.researchRunId !== researchRunId) {
      throw new Error(
        `Artifact researchRunId "${parsed.researchRunId}" does not match requested run "${researchRunId}"`,
      );
    }
  }

  return parsed;
}

/**
 * Gets the manifest path for a content slug.
 * Manifest stays at the research root (not per-run).
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
 * If `updates.artifactWritten` is an object, it's appended to the run's
 * `artifacts` array (deduplicated by filename).
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

  // Track written artifact (dedup by filename, replace if re-written)
  if (updates.artifactWritten) {
    const artifactInfo = updates.artifactWritten;
    const existingIdx = run.artifacts.findIndex((a) => a.filename === artifactInfo.filename);
    if (existingIdx >= 0) {
      run.artifacts[existingIdx] = artifactInfo;
    } else {
      run.artifacts.push(artifactInfo);
    }
    delete updates.artifactWritten;
  }

  // Merge remaining updates
  Object.assign(run, updates);

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
