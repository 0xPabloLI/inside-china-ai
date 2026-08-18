#!/usr/bin/env node
/**
 * Research Evidence Pipeline — CLI Orchestrator (Stage 0.5 Seam)
 *
 * Orchestrates the research evidence pipeline stages:
 * 1. Read discovery.json (from search-sources scoped output)
 * 2. Build research-brief.json (via brief-builder)
 * 3. Read/accept evidence-pack.json (from web-deep-research)
 * 4. Read/accept article-claim-map.json
 * 5. Run MRL-1 claim-evidence audit
 * 6. Report pass/fail
 *
 * Usage:
 *   node research-pipeline.mjs --content-id <slug> --run-id <runId> [--audit-only]
 *
 * If --audit-only is passed, skips brief building and goes straight to audit
 * (assumes evidence-pack.json and article-claim-map.json already exist).
 *
 * See: docs/specs/spec-research-evidence-pipeline.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  RESEARCH_ARTIFACTS,
  readResearchArtifact,
  writeResearchArtifact,
  generateRunId,
  getLatestRun,
} from "./lib/research/workspace.mjs";
import { buildBrief } from "./lib/research/brief-builder.mjs";
import { auditClaims } from "./lib/research/claim-auditor.mjs";

// ─── CLI argument parsing ───

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function log(stage, message) {
  console.log(`[research:${stage}] ${message}`);
}

function error(stage, message) {
  console.error(`[research:${stage}] ERROR: ${message}`);
}

// ─── Main ───

async function main() {
  const contentId = getArg("content-id");
  const auditOnly = process.argv.includes("--audit-only");
  const researchTier = getArg("tier") || "standard";

  if (!contentId) {
    error("init", "Missing required --content-id argument");
    process.exit(1);
  }

  // Resolve run ID
  let runId = getArg("run-id");
  if (!runId) {
    runId = getLatestRun(contentId);
    if (!runId) {
      // No existing run — create a new one
      runId = generateRunId();
      log("init", `No existing run found, created new run ID: ${runId}`);
    } else {
      log("init", `Using latest run: ${runId}`);
    }
  }

  log("init", `Content: ${contentId}, Run: ${runId}, Tier: ${researchTier}`);

  // ── Stage 1: Read discovery.json ──
  const discovery = readResearchArtifact(contentId, runId, RESEARCH_ARTIFACTS.DISCOVERY);
  if (!discovery) {
    error(
      "discovery",
      `No ${RESEARCH_ARTIFACTS.DISCOVERY} found for content="${contentId}" run="${runId}". Run search-sources.mjs --content-id ${contentId} first.`,
    );
    process.exit(1);
  }
  log("discovery", `Loaded ${discovery.sourceCount || 0} sources`);

  // ── Stage 2: Build research-brief.json ──
  if (!auditOnly) {
    const context = {
      researchQuestion: getArg("question") || `Research for ${contentId}`,
      audience: getArg("audience") || "general",
      contentFormat: "article",
      researchTier,
      claimsToVerify: [],
      daysBack: parseInt(getArg("days-back") || "30", 10),
    };

    const { valid, brief, errors } = buildBrief(discovery, context);
    if (!valid) {
      error("brief", `Brief validation failed: ${errors.join(", ")}`);
      process.exit(1);
    }

    writeResearchArtifact(contentId, runId, RESEARCH_ARTIFACTS.BRIEF, brief);
    log(
      "brief",
      `Built and saved research-brief.json (${brief.candidateSources.length} candidates)`,
    );
  }

  // ── Stage 3: Read evidence-pack.json ──
  const evidencePack = readResearchArtifact(
    contentId,
    runId,
    RESEARCH_ARTIFACTS.EVIDENCE_PACK_JSON,
  );
  if (!evidencePack) {
    log(
      "evidence",
      `No evidence-pack.json found yet. This is expected if web-deep-research hasn't run.`,
    );
    log(
      "evidence",
      `Pipeline paused here. Run web-deep-research with the brief, then re-run with --audit-only.`,
    );
    process.exit(0); // Not an error — just not ready yet
  }
  log("evidence", `Loaded evidence pack (${evidencePack.evidence?.length || 0} items)`);

  // ── Stage 4: Read article-claim-map.json ──
  const claimMap = readResearchArtifact(contentId, runId, RESEARCH_ARTIFACTS.CLAIM_MAP);
  if (!claimMap) {
    error("claims", `No article-claim-map.json found. Author must create claim map before audit.`);
    process.exit(1);
  }
  log("claims", `Loaded claim map (${claimMap.claims?.length || 0} claims)`);

  // ── Stage 5: Run MRL-1 audit ──
  const auditResult = auditClaims(claimMap, evidencePack, { researchTier });

  if (auditResult.passed) {
    log("audit", `PASS — All claims have sufficient evidence.`);
    process.exit(0);
  } else {
    error("audit", `FAIL — ${auditResult.failures.length} claim(s) failed:`);
    for (const f of auditResult.failures) {
      console.error(
        `  • ${f.claimId}: ${f.reason}${f.evidenceId ? ` (evidence: ${f.evidenceId})` : ""}`,
      );
    }
    process.exit(2); // Audit failure
  }
}

main().catch((err) => {
  error("fatal", err.message);
  console.error(err.stack);
  process.exit(1);
});
