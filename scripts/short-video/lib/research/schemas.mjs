/**
 * Research Evidence Pipeline — Schema Definitions
 *
 * Canonical data contracts for the research evidence pipeline.
 * All schemas are plain objects describing field types and required flags.
 * Used by validate.mjs to validate parsed JSON inputs.
 *
 * See: docs/specs/spec-research-evidence-pipeline.md
 * See: docs/content-pipeline.md (Stage 0.5)
 */

// ─── Schema Versions ───

export const DISCOVERY_SCHEMA_VERSION = "1.0.0";
export const BRIEF_SCHEMA_VERSION = "1.0.0";
export const EVIDENCE_PACK_SCHEMA_VERSION = "1.0.0";
export const CLAIM_MAP_SCHEMA_VERSION = "1.0.0";

// ─── Allowed Enum Values ───

export const EVIDENCE_STATUSES = [
  "verified",
  "context",
  "analysis",
  "conflicted",
  "rejected",
  "stale",
];

export const SOURCE_TYPES = [
  "primary",
  "authoritative-secondary",
  "independent-secondary",
  "community",
  "analysis",
];

export const RESEARCH_TIERS = ["standard", "deep"];

export const CLAIM_RISK_LEVELS = ["low", "medium", "high"];

// ─── Schema Definitions ───
// Each schema describes:
// - version: the current schemaVersion string
// - required: top-level fields that must be present and non-null
// - fields: map of field name → { type, required, enum, fields (nested) }

export const DISCOVERY_SCHEMA = {
  version: DISCOVERY_SCHEMA_VERSION,
  required: [
    "schemaVersion",
    "contentId",
    "researchRunId",
    "timeWindow",
    "locale",
    "sources",
    "sourceCount",
  ],
  optional: ["failedSources", "runMetadata"],
  fields: {
    schemaVersion: { type: "string" },
    contentId: { type: "string" },
    researchRunId: { type: "string" },
    timeWindow: { type: "object" },
    locale: { type: "string" },
    sources: { type: "array" },
    failedSources: { type: "array" },
    sourceCount: { type: "number" },
    runMetadata: { type: "object" },
  },
};

export const BRIEF_SCHEMA = {
  version: BRIEF_SCHEMA_VERSION,
  required: [
    "schemaVersion",
    "contentId",
    "researchRunId",
    "researchQuestion",
    "researchTier",
    "claimsToVerify",
    "candidateSources",
  ],
  optional: [
    "audience",
    "contentFormat",
    "deadline",
    "knownFacts",
    "openQuestions",
    "userMaterials",
  ],
  fields: {
    schemaVersion: { type: "string" },
    contentId: { type: "string" },
    researchRunId: { type: "string" },
    researchQuestion: { type: "string" },
    audience: { type: "string" },
    contentFormat: { type: "string" },
    deadline: { type: "string" },
    researchTier: { type: "string", enum: RESEARCH_TIERS },
    claimsToVerify: { type: "array" },
    candidateSources: { type: "array" },
    knownFacts: { type: "array" },
    openQuestions: { type: "array" },
    userMaterials: { type: "array" },
  },
};

export const EVIDENCE_PACK_SCHEMA = {
  version: EVIDENCE_PACK_SCHEMA_VERSION,
  required: ["schemaVersion", "contentId", "researchRunId", "evidence"],
  optional: ["conflicts", "runMetadata"],
  fields: {
    schemaVersion: { type: "string" },
    contentId: { type: "string" },
    researchRunId: { type: "string" },
    evidence: { type: "array" },
    conflicts: { type: "array" },
    runMetadata: { type: "object" },
  },
};

// Each evidence item expected shape (used for per-item validation):
// {
//   evidenceId: string (required)
//   claimId: string (required)
//   statement: string (required)
//   sourceType: enum SOURCE_TYPES (required)
//   source: { url, title, publisher, publishedAt, accessedAt, excerpt, locator } (required)
//   verification: { status, crossVerificationIds, confidence, validUntil, conflictNote } (required)
//   usage: { phrasing, caveats, noVoiceover } (optional)
// }

export const EVIDENCE_ITEM_SCHEMA = {
  required: ["evidenceId", "claimId", "statement", "sourceType", "source", "verification"],
  optional: ["usage"],
  nestedSchemas: {
    source: {
      required: ["url", "title", "publisher", "accessedAt"],
      optional: ["publishedAt", "excerpt", "locator"],
    },
    verification: {
      required: ["status", "confidence"],
      optional: ["crossVerificationIds", "validUntil", "conflictNote"],
    },
    usage: {
      required: [],
      optional: ["phrasing", "caveats", "noVoiceover"],
    },
  },
};

export const CLAIM_MAP_SCHEMA = {
  version: CLAIM_MAP_SCHEMA_VERSION,
  required: ["schemaVersion", "contentId", "researchRunId", "claims"],
  optional: ["runMetadata"],
  fields: {
    schemaVersion: { type: "string" },
    contentId: { type: "string" },
    researchRunId: { type: "string" },
    claims: { type: "array" },
    runMetadata: { type: "object" },
  },
};

// Each claim item expected shape:
// {
//   claimId: string (required)
//   evidenceId: string (required — may be empty for analysis claims)
//   type: "fact" | "analysis" (required)
//   text: string (required)
//   articleSection: string (optional)
//   riskLevel: enum CLAIM_RISK_LEVELS (optional, defaults to "medium")
// }

export const CLAIM_ITEM_SCHEMA = {
  required: ["claimId", "type", "text"],
  optional: ["evidenceId", "articleSection", "riskLevel"],
  fields: {
    claimId: { type: "string" },
    evidenceId: { type: "string" },
    type: { type: "string", enum: ["fact", "analysis"] },
    text: { type: "string" },
    articleSection: { type: "string" },
    riskLevel: { type: "string", enum: CLAIM_RISK_LEVELS },
  },
};
