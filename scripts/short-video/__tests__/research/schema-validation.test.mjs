import { describe, it, expect } from "vitest";
import {
  validateDiscovery,
  validateBrief,
  validateEvidencePack,
  validateClaimMap,
} from "../../lib/research/validate.mjs";
import {
  DISCOVERY_SCHEMA_VERSION,
  BRIEF_SCHEMA_VERSION,
  EVIDENCE_PACK_SCHEMA_VERSION,
  CLAIM_MAP_SCHEMA_VERSION,
} from "../../lib/research/schemas.mjs";

// ─── Fixtures ───

const validDiscovery = {
  schemaVersion: DISCOVERY_SCHEMA_VERSION,
  contentId: "deepseek-funding",
  researchRunId: "run-2026-08-18-001",
  timeWindow: { days: 7, until: "2026-08-18" },
  locale: "zh-CN",
  sources: [
    {
      url: "https://qbitai.com/2026/08/deepseek-funding",
      title: "DeepSeek pauses $1.4B funding round",
      sourceName: "qbitai",
      sourceCategory: "news",
      publishedAt: "2026-08-15",
      collectionMethod: "cdp",
      collectionStatus: "ok",
    },
  ],
  failedSources: [{ name: "bloomberg", reason: "paywall" }],
  sourceCount: 1,
  runMetadata: { startedAt: "2026-08-18T10:00:00Z" },
};

const validBrief = {
  schemaVersion: BRIEF_SCHEMA_VERSION,
  contentId: "deepseek-funding",
  researchRunId: "run-2026-08-18-001",
  researchQuestion: "Did DeepSeek pause its $1.4B funding round?",
  audience: "general tech readers",
  researchTier: "standard",
  claimsToVerify: [
    {
      claimId: "c1",
      question: "Is the funding round $1.4B?",
      riskLevel: "high",
      requiresPrimarySource: true,
    },
  ],
  candidateSources: [
    {
      url: "https://qbitai.com/2026/08/deepseek-funding",
      title: "DeepSeek pauses $1.4B funding round",
      sourceType: "independent-secondary",
    },
  ],
  knownFacts: ["DeepSeek is an AI company"],
  openQuestions: ["Who are the investors?"],
  userMaterials: [],
};

const validEvidencePack = {
  schemaVersion: EVIDENCE_PACK_SCHEMA_VERSION,
  contentId: "deepseek-funding",
  researchRunId: "run-2026-08-18-001",
  evidence: [
    {
      evidenceId: "e1",
      claimId: "c1",
      statement: "DeepSeek paused its $1.4B funding round after a leaked meeting.",
      sourceType: "primary",
      source: {
        url: "https://deepseek.com/blog/funding-pause",
        title: "Funding Round Update",
        publisher: "DeepSeek Official",
        publishedAt: "2026-08-15",
        accessedAt: "2026-08-18",
        excerpt: "We have decided to pause the current funding round...",
        locator: "paragraph 2",
      },
      verification: {
        status: "verified",
        crossVerificationIds: ["e2"],
        confidence: "high",
        validUntil: "2026-12-31",
        conflictNote: "",
      },
      usage: {
        phrasing: "Must cite as 'official announcement'",
        caveats: "Do not speculate on reason",
        noVoiceover: false,
      },
    },
  ],
  conflicts: [],
  runMetadata: { completedAt: "2026-08-18T12:00:00Z" },
};

const validClaimMap = {
  schemaVersion: CLAIM_MAP_SCHEMA_VERSION,
  contentId: "deepseek-funding",
  researchRunId: "run-2026-08-18-001",
  claims: [
    {
      claimId: "c1",
      evidenceId: "e1",
      type: "fact",
      text: "DeepSeek paused its $1.4B funding round.",
      articleSection: "## Background",
      riskLevel: "high",
    },
    {
      claimId: "c2",
      evidenceId: "",
      type: "analysis",
      text: "This pause suggests internal strategic recalibration.",
      articleSection: "## Analysis",
      riskLevel: "low",
    },
  ],
  runMetadata: {},
};

// ─── Discovery validation ───

describe("validateDiscovery", () => {
  it("passes on a valid discovery object", () => {
    const result = validateDiscovery(validDiscovery);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects unknown schemaVersion", () => {
    const result = validateDiscovery({ ...validDiscovery, schemaVersion: "99.0.0" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("99.0.0");
  });

  it("fails when contentId is missing", () => {
    const { contentId, ...noContent } = validDiscovery;
    const result = validateDiscovery(noContent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("contentId"))).toBe(true);
  });

  it("fails when researchRunId is missing", () => {
    const { researchRunId, ...noRun } = validDiscovery;
    const result = validateDiscovery(noRun);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("researchRunId"))).toBe(true);
  });

  it("fails when sources is not an array", () => {
    const result = validateDiscovery({ ...validDiscovery, sources: "not-array" });
    expect(result.valid).toBe(false);
  });

  it("fails when sourceCount does not match sources.length", () => {
    const result = validateDiscovery({ ...validDiscovery, sourceCount: 99 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("sourceCount"))).toBe(true);
  });

  it("passes when failedSources is omitted (optional)", () => {
    const { failedSources, ...noFailed } = validDiscovery;
    const result = validateDiscovery(noFailed);
    expect(result.valid).toBe(true);
  });

  it("fails when failedSources item lacks name", () => {
    const result = validateDiscovery({
      ...validDiscovery,
      failedSources: [{ reason: "timeout" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });
});

// ─── Brief validation ───

describe("validateBrief", () => {
  it("passes on a valid brief object", () => {
    const result = validateBrief(validBrief);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects unknown schemaVersion", () => {
    const result = validateBrief({ ...validBrief, schemaVersion: "0.0.1" });
    expect(result.valid).toBe(false);
  });

  it("fails when researchQuestion is missing", () => {
    const { researchQuestion, ...noRQ } = validBrief;
    const result = validateBrief(noRQ);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("researchQuestion"))).toBe(true);
  });

  it("fails when researchTier is not standard or deep", () => {
    const result = validateBrief({ ...validBrief, researchTier: "ultra" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("researchTier"))).toBe(true);
  });

  it("fails when a claimsToVerify item lacks claimId", () => {
    const result = validateBrief({
      ...validBrief,
      claimsToVerify: [{ question: "test?", riskLevel: "low" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("claimId"))).toBe(true);
  });

  it("fails when a claimsToVerify item has invalid riskLevel", () => {
    const result = validateBrief({
      ...validBrief,
      claimsToVerify: [{ claimId: "c1", question: "test?", riskLevel: "extreme" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("riskLevel"))).toBe(true);
  });
});

// ─── Evidence Pack validation ───

describe("validateEvidencePack", () => {
  it("passes on a valid evidence pack", () => {
    const result = validateEvidencePack(validEvidencePack);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects unknown schemaVersion", () => {
    const result = validateEvidencePack({ ...validEvidencePack, schemaVersion: "0.0.1" });
    expect(result.valid).toBe(false);
  });

  it("fails when evidence item lacks evidenceId", () => {
    const bad = {
      ...validEvidencePack,
      evidence: [{ ...validEvidencePack.evidence[0], evidenceId: undefined }],
    };
    const result = validateEvidencePack(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("evidenceId"))).toBe(true);
  });

  it("fails when verification.status is not a valid enum", () => {
    const bad = {
      ...validEvidencePack,
      evidence: [
        {
          ...validEvidencePack.evidence[0],
          verification: { ...validEvidencePack.evidence[0].verification, status: "maybe" },
        },
      ],
    };
    const result = validateEvidencePack(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("status"))).toBe(true);
  });

  it("fails when sourceType is not a valid enum", () => {
    const bad = {
      ...validEvidencePack,
      evidence: [{ ...validEvidencePack.evidence[0], sourceType: "rumor" }],
    };
    const result = validateEvidencePack(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("sourceType"))).toBe(true);
  });

  it("fails when source object lacks url", () => {
    const bad = {
      ...validEvidencePack,
      evidence: [
        {
          ...validEvidencePack.evidence[0],
          source: { title: "test", publisher: "test", accessedAt: "2026-08-18" },
        },
      ],
    };
    const result = validateEvidencePack(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("url"))).toBe(true);
  });

  it("passes when usage is omitted (optional)", () => {
    const noUsage = {
      ...validEvidencePack,
      evidence: [
        {
          ...validEvidencePack.evidence[0],
          usage: undefined,
        },
      ],
    };
    const result = validateEvidencePack(noUsage);
    expect(result.valid).toBe(true);
  });

  it("accepts all valid evidence statuses", () => {
    for (const status of ["verified", "context", "analysis", "conflicted", "rejected", "stale"]) {
      const pack = {
        ...validEvidencePack,
        evidence: [
          {
            ...validEvidencePack.evidence[0],
            verification: { ...validEvidencePack.evidence[0].verification, status },
          },
        ],
      };
      const result = validateEvidencePack(pack);
      expect(result.valid).toBe(true);
    }
  });

  it("accepts all valid source types", () => {
    for (const sourceType of [
      "primary",
      "authoritative-secondary",
      "independent-secondary",
      "community",
      "analysis",
    ]) {
      const pack = {
        ...validEvidencePack,
        evidence: [{ ...validEvidencePack.evidence[0], sourceType }],
      };
      const result = validateEvidencePack(pack);
      expect(result.valid).toBe(true);
    }
  });
});

// ─── Claim Map validation ───

describe("validateClaimMap", () => {
  it("passes on a valid claim map", () => {
    const result = validateClaimMap(validClaimMap);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects unknown schemaVersion", () => {
    const result = validateClaimMap({ ...validClaimMap, schemaVersion: "2.0.0" });
    expect(result.valid).toBe(false);
  });

  it("fails when a fact-type claim lacks evidenceId", () => {
    const bad = {
      ...validClaimMap,
      claims: [
        {
          claimId: "c1",
          evidenceId: "",
          type: "fact",
          text: "Some factual claim.",
        },
      ],
    };
    const result = validateClaimMap(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("evidenceId"))).toBe(true);
  });

  it("passes when analysis-type claim has empty evidenceId", () => {
    const good = {
      ...validClaimMap,
      claims: [
        {
          claimId: "c2",
          evidenceId: "",
          type: "analysis",
          text: "This is the author's opinion.",
        },
      ],
    };
    const result = validateClaimMap(good);
    expect(result.valid).toBe(true);
  });

  it("fails when a claim lacks type", () => {
    const bad = {
      ...validClaimMap,
      claims: [{ claimId: "c1", evidenceId: "e1", text: "test" }],
    };
    const result = validateClaimMap(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("fails when type is not fact or analysis", () => {
    const bad = {
      ...validClaimMap,
      claims: [{ claimId: "c1", evidenceId: "e1", type: "opinion", text: "test" }],
    };
    const result = validateClaimMap(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });
});
