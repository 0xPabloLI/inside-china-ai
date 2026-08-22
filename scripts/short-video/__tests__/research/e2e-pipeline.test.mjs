import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { join } from "path";

import {
  writeResearchArtifact,
  readResearchArtifact,
  getResearchWorkspace,
  RESEARCH_ARTIFACTS,
} from "../../lib/research/workspace.mjs";
import {
  DISCOVERY_SCHEMA_VERSION,
  EVIDENCE_PACK_SCHEMA_VERSION,
  CLAIM_MAP_SCHEMA_VERSION,
} from "../../lib/research/schemas.mjs";

const SCRIPT_PATH = join(process.cwd(), "scripts/short-video/research-pipeline.mjs");
const TEST_SLUG = "test-e2e-pipeline";
const TEST_RUN = "run-e2e-001";

// Helper: run the CLI script
function runPipeline(args = []) {
  const allArgs = ["--content-id", TEST_SLUG, "--run-id", TEST_RUN, ...args];
  try {
    const output = execFileSync("node", [SCRIPT_PATH, ...allArgs], {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
    });
    return { code: 0, output };
  } catch (err) {
    return { code: err.status || 1, output: err.stderr || err.stdout || "" };
  }
}

// Helper: create a valid discovery
function makeDiscovery() {
  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    contentId: TEST_SLUG,
    researchRunId: TEST_RUN,
    timeWindow: { days: 7, until: "2026-08-19" },
    locale: "zh-CN",
    sources: [
      {
        url: "https://example.com/article-1",
        title: "Article 1",
        sourceName: "qbitai",
        sourceCategory: "news",
        publishedAt: "2026-08-15",
        collectionMethod: "cdp",
        collectionStatus: "ok",
      },
      {
        url: "https://example.com/article-2",
        title: "Article 2",
        sourceName: "36kr",
        sourceCategory: "news",
        publishedAt: "2026-08-16",
        collectionMethod: "cdp",
        collectionStatus: "ok",
      },
    ],
    sourceCount: 2,
    runMetadata: { startedAt: "2026-08-19T00:00:00Z", keyword: "DeepSeek" },
  };
}

// Helper: create a valid evidence pack
function makeEvidencePack(evidence = []) {
  return {
    schemaVersion: EVIDENCE_PACK_SCHEMA_VERSION,
    contentId: TEST_SLUG,
    researchRunId: TEST_RUN,
    evidence,
  };
}

// Helper: create a valid claim map
function makeClaimMap(claims = []) {
  return {
    schemaVersion: CLAIM_MAP_SCHEMA_VERSION,
    contentId: TEST_SLUG,
    researchRunId: TEST_RUN,
    claims,
  };
}

afterEach(() => {
  const ws = getResearchWorkspace(TEST_SLUG);
  if (existsSync(ws)) {
    rmSync(ws, { recursive: true, force: true });
  }
});

describe("E2E: research-pipeline.mjs CLI", () => {
  it("builds brief from discovery and saves it", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY, makeDiscovery());

    const { code, output } = runPipeline();
    // Should pause at evidence stage (exit 0, no evidence pack yet)
    expect(code).toBe(0);
    expect(output).toContain("Built and saved research-brief.json");

    // Brief should exist
    const brief = readResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.BRIEF);
    expect(brief).not.toBeNull();
    expect(brief.candidateSources).toHaveLength(2);
  });

  it("pauses with exit 0 when no evidence pack exists", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY, makeDiscovery());

    const { code, output } = runPipeline();
    expect(code).toBe(0);
    expect(output).toContain("paused");
    expect(output).toContain("web-deep-research");
  });

  it("fails with exit 1 when no discovery exists", () => {
    const { code, output } = runPipeline();
    expect(code).toBe(1);
    expect(output).toContain("No discovery.json found");
  });

  it("passes audit when all claims have verified evidence", () => {
    // Write discovery + brief
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY, makeDiscovery());

    // Write evidence pack
    const evidence = [
      {
        evidenceId: "e1",
        claimId: "c1",
        statement: "DeepSeek raised $2B",
        sourceType: "independent-secondary",
        source: {
          url: "https://example.com/1",
          title: "Source 1",
          publisher: "Test",
          accessedAt: "2026-08-19",
        },
        verification: {
          status: "verified",
          crossVerificationIds: [],
          confidence: "high",
          validUntil: "2027-12-31",
          conflictNote: "",
        },
      },
    ];
    writeResearchArtifact(
      TEST_SLUG,
      TEST_RUN,
      RESEARCH_ARTIFACTS.EVIDENCE_PACK_JSON,
      makeEvidencePack(evidence),
    );

    // Write claim map
    const claims = [
      {
        claimId: "c1",
        evidenceId: "e1",
        type: "fact",
        text: "DeepSeek raised $2B",
        articleSection: "## Funding",
        riskLevel: "medium",
      },
    ];
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.CLAIM_MAP, makeClaimMap(claims));

    const { code, output } = runPipeline(["--audit-only"]);
    expect(code).toBe(0);
    expect(output).toContain("PASS");
  });

  it("fails audit with exit 2 when claim has no evidence", () => {
    // Write discovery (required for run resolution)
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY, makeDiscovery());

    // Write evidence pack (empty)
    writeResearchArtifact(
      TEST_SLUG,
      TEST_RUN,
      RESEARCH_ARTIFACTS.EVIDENCE_PACK_JSON,
      makeEvidencePack([]),
    );

    // Write claim map with a fact claim but no evidence
    const claims = [
      {
        claimId: "c1",
        evidenceId: "",
        type: "fact",
        text: "DeepSeek raised $2B",
        articleSection: "## Funding",
        riskLevel: "high",
      },
    ];
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.CLAIM_MAP, makeClaimMap(claims));

    const { code, output } = runPipeline(["--audit-only"]);
    expect(code).toBe(2);
    expect(output).toContain("FAIL");
    expect(output).toContain("c1");
  });

  it("fails audit when evidence is conflicted (R1-1 E2E)", () => {
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY, makeDiscovery());

    const evidence = [
      {
        evidenceId: "e1",
        claimId: "c1",
        statement: "Conflicted statement",
        sourceType: "independent-secondary",
        source: {
          url: "https://example.com/1",
          title: "Source 1",
          publisher: "Test",
          accessedAt: "2026-08-19",
        },
        verification: {
          status: "conflicted",
          crossVerificationIds: [],
          confidence: "medium",
          validUntil: "2027-12-31",
          conflictNote: "sources disagree",
        },
      },
    ];
    writeResearchArtifact(
      TEST_SLUG,
      TEST_RUN,
      RESEARCH_ARTIFACTS.EVIDENCE_PACK_JSON,
      makeEvidencePack(evidence),
    );

    const claims = [
      {
        claimId: "c1",
        evidenceId: "e1",
        type: "fact",
        text: "Some fact",
        articleSection: "## Body",
        riskLevel: "medium",
      },
    ];
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.CLAIM_MAP, makeClaimMap(claims));

    const { code, output } = runPipeline(["--audit-only"]);
    expect(code).toBe(2);
    expect(output).toContain("FAIL");
    expect(output).toContain("conflicted");
  });

  it("uses latest run when --run-id is not provided", () => {
    // Write discovery for the latest run
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY, makeDiscovery());

    // Run without --run-id (should auto-detect latest run)
    const result = runPipeline(["--content-id", TEST_SLUG]).output;
    // runPipeline adds --content-id itself, so let's call node directly
    let output = "";
    try {
      output = execFileSync("node", [SCRIPT_PATH, "--content-id", TEST_SLUG], {
        encoding: "utf-8",
        timeout: 10000,
        stdio: "pipe",
      });
    } catch (err) {
      output = err.stdout || err.stderr || "";
    }

    // Should find the latest run
    expect(output).toContain("Using latest run");
  });
});
