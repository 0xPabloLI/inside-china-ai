/**
 * Research Evidence Pipeline — Validators
 *
 * Pure functions that validate parsed JSON objects against schema definitions.
 * Each validator returns { valid: boolean, errors: string[] }.
 *
 * See: docs/specs/spec-research-evidence-pipeline.md
 */

import {
  DISCOVERY_SCHEMA,
  BRIEF_SCHEMA,
  EVIDENCE_PACK_SCHEMA,
  EVIDENCE_ITEM_SCHEMA,
  CLAIM_MAP_SCHEMA,
  CLAIM_ITEM_SCHEMA,
  EVIDENCE_STATUSES,
  SOURCE_TYPES,
  RESEARCH_TIERS,
  CLAIM_RISK_LEVELS,
} from "./schemas.mjs";

// ─── Type checking helpers ───

function getType(val) {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  return typeof val;
}

function checkType(val, expectedType) {
  return getType(val) === expectedType;
}

function isNonEmptyString(val) {
  return typeof val === "string" && val.length > 0;
}

// ─── Core validation engine ───

/**
 * Validates a top-level object against a schema definition.
 * Checks required fields, field types, and enum constraints.
 */
function validateObject(obj, schema) {
  const errors = [];

  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { valid: false, errors: ["Input must be a plain object"] };
  }

  // Check schemaVersion matches
  if (schema.version && obj.schemaVersion !== schema.version) {
    errors.push(`schemaVersion "${obj.schemaVersion}" does not match expected "${schema.version}"`);
    return { valid: false, errors };
  }

  // Check required fields
  for (const field of schema.required || []) {
    if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check field types
  if (schema.fields) {
    for (const [field, spec] of Object.entries(schema.fields)) {
      if (field in obj && obj[field] !== null && obj[field] !== undefined) {
        if (!checkType(obj[field], spec.type)) {
          errors.push(`Field "${field}" must be of type ${spec.type}, got ${getType(obj[field])}`);
        }
        if (spec.enum && !spec.enum.includes(obj[field])) {
          errors.push(
            `Field "${field}" must be one of [${spec.enum.join(", ")}], got "${obj[field]}"`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an array of items against an item schema.
 * Returns accumulated errors across all items.
 */
function validateItems(items, itemSchema, label) {
  const errors = [];

  if (!Array.isArray(items)) {
    return { valid: false, errors: [`${label} must be an array`] };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `${label}[${i}]`;

    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${prefix} must be a plain object`);
      continue;
    }

    // Check required fields
    for (const field of itemSchema.required || []) {
      if (!(field in item) || item[field] === undefined || item[field] === null) {
        errors.push(`${prefix} missing required field: ${field}`);
      }
    }

    // Check field types and enums
    if (itemSchema.fields) {
      for (const [field, spec] of Object.entries(itemSchema.fields)) {
        if (field in item && item[field] !== null && item[field] !== undefined) {
          if (!checkType(item[field], spec.type)) {
            errors.push(
              `${prefix}.${field} must be of type ${spec.type}, got ${getType(item[field])}`,
            );
          }
          if (spec.enum && !spec.enum.includes(item[field])) {
            errors.push(
              `${prefix}.${field} must be one of [${spec.enum.join(", ")}], got "${item[field]}"`,
            );
          }
        }
      }
    }

    // Check nested schemas (e.g., source, verification, usage)
    if (itemSchema.nestedSchemas) {
      for (const [nestedKey, nestedSchema] of Object.entries(itemSchema.nestedSchemas)) {
        if (nestedKey in item && item[nestedKey] !== null && item[nestedKey] !== undefined) {
          const nestedVal = item[nestedKey];
          if (typeof nestedVal !== "object" || Array.isArray(nestedVal)) {
            errors.push(`${prefix}.${nestedKey} must be a plain object`);
            continue;
          }
          for (const reqField of nestedSchema.required || []) {
            if (
              !(reqField in nestedVal) ||
              nestedVal[reqField] === undefined ||
              nestedVal[reqField] === null
            ) {
              errors.push(`${prefix}.${nestedKey} missing required field: ${reqField}`);
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates evidence items specifically — checks enum values for
 * verification.status and sourceType that the generic validator doesn't
 * reach in nested objects.
 */
function validateEvidenceItems(evidence) {
  const errors = [];

  if (!Array.isArray(evidence)) {
    return { valid: false, errors: ["evidence must be an array"] };
  }

  for (let i = 0; i < evidence.length; i++) {
    const item = evidence[i];
    const prefix = `evidence[${i}]`;

    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${prefix} must be a plain object`);
      continue;
    }

    // Check verification.status enum
    if (item.verification && typeof item.verification === "object") {
      const status = item.verification.status;
      if (status && !EVIDENCE_STATUSES.includes(status)) {
        errors.push(
          `${prefix}.verification.status must be one of [${EVIDENCE_STATUSES.join(", ")}], got "${status}"`,
        );
      }
    }

    // Check sourceType enum
    if (item.sourceType && !SOURCE_TYPES.includes(item.sourceType)) {
      errors.push(
        `${prefix}.sourceType must be one of [${SOURCE_TYPES.join(", ")}], got "${item.sourceType}"`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Public validators ───

/**
 * Validates a discovery.json object.
 * Discovery is the raw candidate pool from search-sources.mjs.
 */
export function validateDiscovery(obj) {
  const baseResult = validateObject(obj, DISCOVERY_SCHEMA);
  if (!baseResult.valid) return baseResult;

  // Validate source items have required fields
  const errors = [...baseResult.errors];
  if (Array.isArray(obj.sources)) {
    for (let i = 0; i < obj.sources.length; i++) {
      const src = obj.sources[i];
      const prefix = `sources[${i}]`;
      if (!src || typeof src !== "object") {
        errors.push(`${prefix} must be a plain object`);
        continue;
      }
      // Each source needs at least a url or title
      if (!src.url && !src.title) {
        errors.push(`${prefix} must have at least a url or title`);
      }
    }
  }

  // Validate failedSources structure
  if (Array.isArray(obj.failedSources)) {
    for (let i = 0; i < obj.failedSources.length; i++) {
      const fs = obj.failedSources[i];
      const prefix = `failedSources[${i}]`;
      if (!fs || typeof fs !== "object") {
        errors.push(`${prefix} must be a plain object`);
        continue;
      }
      if (!isNonEmptyString(fs.name)) {
        errors.push(`${prefix}.name must be a non-empty string`);
      }
      if (!isNonEmptyString(fs.reason)) {
        errors.push(`${prefix}.reason must be a non-empty string`);
      }
    }
  }

  // Check sourceCount matches sources.length
  if (typeof obj.sourceCount === "number" && Array.isArray(obj.sources)) {
    if (obj.sourceCount !== obj.sources.length) {
      errors.push(
        `sourceCount (${obj.sourceCount}) does not match sources.length (${obj.sources.length})`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a research-brief.json object.
 * Brief is the structured input for web-deep-research.
 */
export function validateBrief(obj) {
  const baseResult = validateObject(obj, BRIEF_SCHEMA);
  if (!baseResult.valid) return baseResult;

  const errors = [...baseResult.errors];

  // Validate claimsToVerify items
  if (Array.isArray(obj.claimsToVerify)) {
    for (let i = 0; i < obj.claimsToVerify.length; i++) {
      const claim = obj.claimsToVerify[i];
      const prefix = `claimsToVerify[${i}]`;
      if (!claim || typeof claim !== "object") {
        errors.push(`${prefix} must be a plain object`);
        continue;
      }
      if (!isNonEmptyString(claim.claimId)) {
        errors.push(`${prefix}.claimId must be a non-empty string`);
      }
      if (!isNonEmptyString(claim.question)) {
        errors.push(`${prefix}.question must be a non-empty string`);
      }
      if (claim.riskLevel && !CLAIM_RISK_LEVELS.includes(claim.riskLevel)) {
        errors.push(
          `${prefix}.riskLevel must be one of [${CLAIM_RISK_LEVELS.join(", ")}], got "${claim.riskLevel}"`,
        );
      }
    }
  }

  // Validate researchTier enum (redundant with schema check, but explicit)
  if (obj.researchTier && !RESEARCH_TIERS.includes(obj.researchTier)) {
    errors.push(
      `researchTier must be one of [${RESEARCH_TIERS.join(", ")}], got "${obj.researchTier}"`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an evidence-pack.json object.
 * Evidence pack is the single source of truth for content evidence.
 */
export function validateEvidencePack(obj) {
  const baseResult = validateObject(obj, EVIDENCE_PACK_SCHEMA);
  if (!baseResult.valid) return baseResult;

  // Validate evidence items
  const itemResult = validateItems(obj.evidence, EVIDENCE_ITEM_SCHEMA, "evidence");
  const evidenceEnumResult = validateEvidenceItems(obj.evidence);

  const errors = [...baseResult.errors, ...itemResult.errors, ...evidenceEnumResult.errors];

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an article-claim-map.json object.
 * Claim map maps article claims to evidence items.
 */
export function validateClaimMap(obj) {
  const baseResult = validateObject(obj, CLAIM_MAP_SCHEMA);
  if (!baseResult.valid) return baseResult;

  // Validate claim items
  const itemResult = validateItems(obj.claims, CLAIM_ITEM_SCHEMA, "claims");

  const errors = [...baseResult.errors, ...itemResult.errors];

  // For fact-type claims, evidenceId should be non-empty
  if (Array.isArray(obj.claims)) {
    for (let i = 0; i < obj.claims.length; i++) {
      const claim = obj.claims[i];
      if (!claim || typeof claim !== "object") continue;
      if (claim.type === "fact" && !isNonEmptyString(claim.evidenceId)) {
        errors.push(`claims[${i}].evidenceId must be a non-empty string for fact-type claims`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
