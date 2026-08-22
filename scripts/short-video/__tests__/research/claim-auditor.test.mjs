import { describe, it, expect } from "vitest";
import { auditClaims } from "../../lib/research/claim-auditor.mjs";

// ─── Fixtures ───

function makeEvidenceItem(id, claimId, overrides = {}) {
  return {
    evidenceId: id,
    claimId,
    statement: `Statement for ${id}`,
    sourceType: "independent-secondary",
    source: {
      url: `https://example.com/${id}`,
      title: `Source ${id}`,
      publisher: "Test Publisher",
      accessedAt: "2026-08-18",
    },
    verification: {
      status: "verified",
      crossVerificationIds: [],
      confidence: "high",
      validUntil: "2027-12-31",
      conflictNote: "",
    },
    ...overrides,
  };
}

function makeClaim(id, type, evidenceId, overrides = {}) {
  return {
    claimId: id,
    evidenceId,
    type,
    text: `Claim ${id}`,
    articleSection: "## Test",
    riskLevel: "medium",
    ...overrides,
  };
}

function makeClaimMap(claims) {
  return {
    schemaVersion: "1.0.0",
    contentId: "test",
    researchRunId: "run-1",
    claims,
  };
}

function makeEvidencePack(evidence) {
  return {
    schemaVersion: "1.0.0",
    contentId: "test",
    researchRunId: "run-1",
    evidence,
  };
}

// ─── Passing scenarios ───

describe("auditClaims — passing scenarios", () => {
  it("passes when all fact claims have valid verified evidence", () => {
    const evidence = [makeEvidenceItem("e1", "c1")];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("passes when analysis claims have no evidence (author opinion allowed)", () => {
    const claims = [
      makeClaim("c1", "analysis", ""),
      makeClaim("c2", "analysis", "", { riskLevel: "low" }),
    ];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack([]), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
  });

  it("passes when high-risk claim has 2+ independent sources in deep tier", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        sourceType: "primary",
        verification: {
          status: "verified",
          crossVerificationIds: ["e2"],
          confidence: "high",
          validUntil: "2027-12-31",
        },
      }),
      makeEvidenceItem("e2", "c1", {
        sourceType: "independent-secondary",
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1", { riskLevel: "high" })];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "deep",
    });
    expect(result.passed).toBe(true);
  });

  it("passes when medium-risk claim has 1 source in standard tier", () => {
    const evidence = [makeEvidenceItem("e1", "c1")];
    const claims = [makeClaim("c1", "fact", "e1", { riskLevel: "medium" })];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
  });
});

// ─── Failing scenarios (Scenario 4: conflicts, 6: high-risk, 7: stale, 11: skip) ───

describe("auditClaims — failing scenarios", () => {
  it("fails when a fact claim has no evidence mapping", () => {
    const claims = [makeClaim("c1", "fact", "")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack([]), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].claimId).toBe("c1");
    expect(result.failures[0].reason).toContain("no evidence");
  });

  it("fails when evidence ID not found in pack", () => {
    const claims = [makeClaim("c1", "fact", "nonexistent-eid")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack([]), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("not found");
  });

  it("fails when evidence status is rejected", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: {
          status: "rejected",
          crossVerificationIds: [],
          confidence: "low",
          validUntil: "2027-12-31",
          conflictNote: "source retracted",
        },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("rejected");
  });

  it("fails when evidence is stale (validUntil passed)", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: {
          status: "verified",
          crossVerificationIds: [],
          confidence: "high",
          validUntil: "2020-01-01",
          conflictNote: "",
        },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("stale");
  });

  it("fails when evidence status is explicitly stale", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: {
          status: "stale",
          crossVerificationIds: [],
          confidence: "low",
          validUntil: "2027-12-31",
          conflictNote: "",
        },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("stale");
  });

  it("fails when evidence status is conflicted (R1-1)", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: {
          status: "conflicted",
          crossVerificationIds: [],
          confidence: "medium",
          validUntil: "2027-12-31",
          conflictNote: "sources disagree",
        },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("conflicted");
  });

  it("fails when evidence status is context (R1-1)", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: {
          status: "context",
          crossVerificationIds: [],
          confidence: "medium",
          validUntil: "2027-12-31",
          conflictNote: "",
        },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("context-only");
  });

  it("fails when evidence status is analysis-grade (R1-1)", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: {
          status: "analysis",
          crossVerificationIds: [],
          confidence: "medium",
          validUntil: "2027-12-31",
          conflictNote: "",
        },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("analysis-grade");
  });

  it("fails when high-risk claim has only 1 source in deep tier (scenario 6)", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        sourceType: "primary",
        verification: {
          status: "verified",
          crossVerificationIds: [],
          confidence: "high",
          validUntil: "2027-12-31",
        },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1", { riskLevel: "high" })];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "deep",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("independent source");
  });

  it("fails when deep tier high-risk claim has no primary source (scenario 6)", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        sourceType: "independent-secondary",
        verification: {
          status: "verified",
          crossVerificationIds: ["e2"],
          confidence: "high",
          validUntil: "2027-12-31",
        },
      }),
      makeEvidenceItem("e2", "c1", {
        sourceType: "independent-secondary",
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1", { riskLevel: "high" })];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "deep",
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("primary source");
  });
});

// ─── Scenario 11: user wants to skip research ───

describe("auditClaims — scenario 11: skip research", () => {
  it("still fails on fact claims with no evidence even if user wanted to skip", () => {
    // User wanted to skip research, but article still has fact claims
    const claims = [
      makeClaim("c1", "fact", ""),
      makeClaim("c2", "analysis", "", { riskLevel: "low" }),
    ];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack([]), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].claimId).toBe("c1");
  });

  it("passes if user removed all fact claims (only analysis left)", () => {
    const claims = [makeClaim("c1", "analysis", ""), makeClaim("c2", "analysis", "")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack([]), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
  });
});

// ─── Scenario 8: author analysis ───

describe("auditClaims — scenario 8: author analysis", () => {
  it("analysis claim passes without external evidence", () => {
    const claims = [makeClaim("c1", "analysis", "", { text: "This is the author's opinion." })];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack([]), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
  });

  it("mixed analysis and fact claims: analysis passes, fact must have evidence", () => {
    const evidence = [makeEvidenceItem("e1", "c2")];
    const claims = [makeClaim("c1", "analysis", ""), makeClaim("c2", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
  });
});

// ─── Edge cases ───

describe("auditClaims — edge cases", () => {
  it("returns failure on null claim map", () => {
    const result = auditClaims(null, makeEvidencePack([]), {});
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("Invalid claim map");
  });

  it("returns failure on null evidence pack", () => {
    const result = auditClaims(makeClaimMap([]), null, {});
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toContain("Invalid evidence pack");
  });

  it("handles empty claims array (passes trivially)", () => {
    const result = auditClaims(makeClaimMap([]), makeEvidencePack([]), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
  });

  it("fails on multiple claims, reports all failures", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: {
          status: "rejected",
          crossVerificationIds: [],
          confidence: "low",
          validUntil: "2027-12-31",
          conflictNote: "",
        },
      }),
    ];
    const claims = [
      makeClaim("c1", "fact", "e1"), // rejected evidence
      makeClaim("c2", "fact", ""), // no evidence
      makeClaim("c3", "fact", "nonexistent"), // not found
    ];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(3);
    expect(result.failures.map((f) => f.claimId)).toEqual(["c1", "c2", "c3"]);
  });

  it("evidence without validUntil is not considered stale", () => {
    const evidence = [
      makeEvidenceItem("e1", "c1", {
        verification: { status: "verified", crossVerificationIds: [], confidence: "high" },
      }),
    ];
    const claims = [makeClaim("c1", "fact", "e1")];
    const result = auditClaims(makeClaimMap(claims), makeEvidencePack(evidence), {
      researchTier: "standard",
    });
    expect(result.passed).toBe(true);
  });
});
