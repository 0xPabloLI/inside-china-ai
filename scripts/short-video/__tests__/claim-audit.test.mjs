/**
 * #61 — non-blocking evidence audit unit tests.
 *
 * The audit extracts the MRL-1 B6 four-level claim annotations (✅/⚠️/❌/🔴)
 * as the machine-readable claim layer, classifies risk deterministically
 * (docs/archive/reviews/research-evidence-pipeline-implementation-review.md
 * §2-§3 hard triggers + four dimensions), and emits warnings — never blocks.
 */
import { describe, it, expect } from "vitest";
import {
  parseClaimAnnotations,
  parseVerificationSummary,
  classifyClaimRisk,
  auditClaims,
  matchEvidence,
  generateCoverageReport,
} from "../lib/claim-audit.mjs";

const SAMPLE = `# Title

Anthropic attributed the campaign through IP correlation. _(✅ Verified: all figures match Anthropic's official blog)_

Per the source, a forged thinking-signature prefix could trick Claude. _(❌ Unverified: insider claim not confirmed by public sources)_

GLM reportedly became the first to crack the encrypted CoT. _(⚠️ Partially verified: partial public support with detail differences)_

The source claims Qwen was distilling GPT while routing data flowed to GLM. _(🔴 Contradicts public data: developers use DeepSeek as the cheaper backend)_
`;

describe("parseClaimAnnotations", () => {
  it("extracts all four statuses with note and line number", () => {
    const claims = parseClaimAnnotations(SAMPLE);
    expect(claims).toHaveLength(4);
    expect(claims[0]).toMatchObject({ status: "verified", line: 3 });
    expect(claims[0].note).toContain("official blog");
    expect(claims.map((c) => c.status)).toEqual([
      "verified",
      "unverified",
      "partially-verified",
      "contradicts",
    ]);
  });

  it("keeps the claim context (paragraph text before the annotation)", () => {
    const claims = parseClaimAnnotations(SAMPLE);
    expect(claims[1].context).toContain("forged thinking-signature");
  });

  it("returns [] for articles without annotations", () => {
    expect(parseClaimAnnotations("# Plain\n\nNo annotations here.\n")).toEqual([]);
  });
});

describe("parseVerificationSummary", () => {
  it("parses the summary table counts", () => {
    const md = SAMPLE + `\n## Verification Summary\n\n| Status | Count |\n| --- | --- |\n| ✅ Verified | 23 claims |\n| ❌ Unverified | 14 claims |\n`;
    const summary = parseVerificationSummary(md);
    expect(summary.found).toBe(true);
    expect(summary.counts.verified).toBe(23);
    expect(summary.counts.unverified).toBe(14);
  });

  it("reports found=false when no summary section exists", () => {
    expect(parseVerificationSummary(SAMPLE).found).toBe(false);
  });
});

describe("classifyClaimRisk", () => {
  it("hard-triggers financial claims to high", () => {
    const r = classifyClaimRisk("MiniMax raised approximately HK$16B in an emergency capital round at a HK$186 valuation");
    expect(r.riskLevel).toBe("high");
    expect(r.riskReasons).toContain("financial_or_pricing");
    expect(r.requiresPrimarySource).toBe(true);
  });

  it("hard-triggers unverified annotation status", () => {
    const r = classifyClaimRisk("The source claims Qwen was distilling GPT", { annotationStatus: "unverified" });
    expect(r.riskLevel).toBe("high");
    expect(r.riskReasons).toContain("unverified_or_conflicting");
  });

  it("scores non-hard claims via the four dimensions", () => {
    const r = classifyClaimRisk("DeepSeek released a developer guide for the agent framework");
    expect(r.riskLevel).toBe("low");
    expect(r.riskScore).toBeLessThanOrEqual(2);
    expect(r.riskReasons).toEqual([]);
  });

  it("current-status claims escalate to at least medium", () => {
    const r = classifyClaimRisk("GLM is currently the first Chinese lab offering this feature");
    expect(["medium", "high"]).toContain(r.riskLevel);
  });
});

describe("auditClaims", () => {
  it("cross-checks inline counts against the Verification Summary", () => {
    const md = SAMPLE + `\n## Verification Summary\n\n| Status | Count |\n| --- | --- |\n| ✅ Verified | 99 claims |\n`;
    const audit = auditClaims(md);
    expect(audit.warnings.some((w) => w.code === "summary_count_mismatch")).toBe(true);
  });

  it("warns when annotations exist without a summary section (B6 rule 4)", () => {
    const audit = auditClaims(SAMPLE);
    expect(audit.warnings.some((w) => w.code === "missing_summary_section")).toBe(true);
  });

  it("reports per-status stats and never throws on empty input", () => {
    expect(auditClaims("").stats.total).toBe(0);
    const audit = auditClaims(SAMPLE);
    expect(audit.stats.verified).toBe(1);
    expect(audit.stats.unverified).toBe(1);
    expect(audit.stats.contradicts).toBe(1);
  });

  it("flags high-risk unverified claims for editor review", () => {
    const audit = auditClaims(SAMPLE);
    const flagged = audit.claims.filter((c) => c.risk?.riskLevel === "high");
    expect(flagged.length).toBeGreaterThanOrEqual(2); // unverified + contradicts are hard triggers
  });
});

describe("matchEvidence", () => {
  it("matches claim notes against discovery evidence by token overlap", () => {
    const evidence = [
      { title: "Anthropic detects and prevents distillation attacks", snippet: "IP correlation and request metadata" },
      { title: " unrelated sports result ", snippet: "nothing to do with claims" },
    ];
    const matches = matchEvidence(
      [{ status: "verified", note: "all figures match Anthropic's distillation blog", context: "IP correlation" }],
      evidence,
    );
    expect(matches[0].matches).toHaveLength(1);
    expect(matches[0].matches[0].title).toContain("Anthropic");
  });

  it("returns no matches for evidence-free claims", () => {
    const matches = matchEvidence([{ status: "unverified", note: "insider allegation about routing", context: "" }], []);
    expect(matches[0].matches).toHaveLength(0);
  });
});

describe("generateCoverageReport", () => {
  it("emits a markdown section suitable for appending to MRL-1", () => {
    const audit = auditClaims(SAMPLE);
    const report = generateCoverageReport(audit, matchEvidence(audit.claims, []));
    expect(report).toContain("## Evidence Coverage Report");
    expect(report).toContain("verified");
    expect(report).toContain("non-blocking");
  });
});
