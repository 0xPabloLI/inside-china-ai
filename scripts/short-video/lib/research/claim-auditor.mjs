/**
 * Research Evidence Pipeline — Claim-Evidence Auditor (MRL-1 Evidence Gate)
 *
 * Pure function that acts as the MRL-1 evidence audit gate.
 * Takes an article-claim-map.json and an evidence-pack.json and returns
 * { passed, failures }.
 *
 * Fails when:
 * - A material (fact-type) claim has no evidence mapping
 * - A claim maps to a rejected or stale evidence item
 * - A high-risk claim doesn't meet the routing tier's minimum evidence standard
 * - An evidence item's validUntil date has passed (staleness check)
 *
 * Passes when:
 * - All fact claims have valid evidence mappings
 * - Analysis-type claims don't require external evidence
 *
 * See: docs/specs/spec-research-evidence-pipeline.md (Design Decision #7)
 */

// ─── Helpers ───

/**
 * Builds a lookup map of evidenceId → evidence item.
 * @param {Array} evidence
 * @returns {Map}
 */
function buildEvidenceIndex(evidence) {
  const map = new Map();
  if (!Array.isArray(evidence)) return map;
  for (const item of evidence) {
    if (item && item.evidenceId) {
      map.set(item.evidenceId, item);
    }
  }
  return map;
}

/**
 * Checks if an evidence item is stale (validUntil has passed).
 * @param {object} evidenceItem
 * @returns {boolean} true if stale
 */
function isStale(evidenceItem) {
  if (!evidenceItem || !evidenceItem.verification) return false;
  const validUntil = evidenceItem.verification.validUntil;
  if (!validUntil) return false; // No expiry = not stale

  const expiryDate = new Date(validUntil);
  if (isNaN(expiryDate.getTime())) return false; // Invalid date = not stale

  return expiryDate < new Date();
}

/**
 * Counts independent verification sources for an evidence item.
 * Cross-verification IDs are other evidence IDs that corroborate this claim.
 * @param {object} evidenceItem
 * @param {Map} evidenceIndex
 * @returns {number} count of independent corroborating sources
 */
function countIndependentSources(evidenceItem, evidenceIndex) {
  if (!evidenceItem || !evidenceItem.verification) return 0;

  const crossIds = evidenceItem.verification.crossVerificationIds || [];
  // The evidence item itself + cross-verified items = total independent sources
  // But cross-verified items must actually exist in the pack
  let count = 1; // The item itself counts as 1 source
  for (const crossId of crossIds) {
    if (crossId && evidenceIndex.has(crossId)) {
      count++;
    }
  }
  return count;
}

/**
 * Gets the source type for tier threshold checking.
 * "primary" sources are the strongest evidence.
 * @param {object} evidenceItem
 * @returns {string}
 */
function getSourceType(evidenceItem) {
  return evidenceItem?.sourceType || "community";
}

// ─── Tier requirements ───

const TIER_REQUIREMENTS = {
  standard: {
    minSources: 1,
    requiresPrimary: false, // Standard doesn't strictly require primary, but high-risk claims do
  },
  deep: {
    minSources: 2, // At least 2 independent sources
    requiresPrimary: true, // Deep requires at least 1 primary source for high-risk claims
  },
};

// ─── Main auditor ───

/**
 * Audits claims against evidence pack.
 *
 * @param {object} claimMap — article-claim-map.json
 * @param {object} evidencePack — evidence-pack.json
 * @param {object} options — { researchTier: "standard" | "deep" }
 * @returns {{ passed: boolean, failures: Array<{claimId, reason, evidenceId}> }}
 */
export function auditClaims(claimMap, evidencePack, options = {}) {
  const tier = options.researchTier || "standard";
  const tierReq = TIER_REQUIREMENTS[tier] || TIER_REQUIREMENTS.standard;

  const failures = [];

  // Guard against bad input
  if (!claimMap || !Array.isArray(claimMap.claims)) {
    return {
      passed: false,
      failures: [{ claimId: "N/A", reason: "Invalid claim map: no claims array", evidenceId: "" }],
    };
  }

  if (!evidencePack || !Array.isArray(evidencePack.evidence)) {
    return {
      passed: false,
      failures: [
        { claimId: "N/A", reason: "Invalid evidence pack: no evidence array", evidenceId: "" },
      ],
    };
  }

  const evidenceIndex = buildEvidenceIndex(evidencePack.evidence);

  for (const claim of claimMap.claims) {
    if (!claim || !claim.claimId) continue;

    // Analysis-type claims don't need external evidence
    if (claim.type === "analysis") {
      continue;
    }

    // Fact-type claims must have an evidenceId
    if (!claim.evidenceId) {
      failures.push({
        claimId: claim.claimId,
        reason: "Fact-type claim has no evidence mapping",
        evidenceId: "",
      });
      continue;
    }

    // Evidence item must exist in the pack
    const evidenceItem = evidenceIndex.get(claim.evidenceId);
    if (!evidenceItem) {
      failures.push({
        claimId: claim.claimId,
        reason: `Evidence ID "${claim.evidenceId}" not found in evidence pack`,
        evidenceId: claim.evidenceId,
      });
      continue;
    }

    // Check for rejected or stale evidence
    const status = evidenceItem.verification?.status;
    if (status === "rejected") {
      failures.push({
        claimId: claim.claimId,
        reason: `Evidence is rejected: ${evidenceItem.verification?.conflictNote || "no note"}`,
        evidenceId: claim.evidenceId,
      });
      continue;
    }

    if (status === "stale" || isStale(evidenceItem)) {
      failures.push({
        claimId: claim.claimId,
        reason: `Evidence is stale (validUntil: ${evidenceItem.verification?.validUntil || "unknown"})`,
        evidenceId: claim.evidenceId,
      });
      continue;
    }

    // Check tier requirements for high-risk claims
    const riskLevel = claim.riskLevel || "medium";
    if (riskLevel === "high") {
      const independentCount = countIndependentSources(evidenceItem, evidenceIndex);

      if (independentCount < tierReq.minSources) {
        failures.push({
          claimId: claim.claimId,
          reason: `High-risk claim requires ${tierReq.minSources} independent source(s) for ${tier} tier, found ${independentCount}`,
          evidenceId: claim.evidenceId,
        });
        continue;
      }

      // Deep tier requires at least 1 primary source for high-risk claims
      if (tierReq.requiresPrimary) {
        const sourceType = getSourceType(evidenceItem);
        const hasPrimary =
          sourceType === "primary" ||
          evidenceItem.verification.crossVerificationIds?.some((id) => {
            const crossItem = evidenceIndex.get(id);
            return crossItem && getSourceType(crossItem) === "primary";
          });

        if (!hasPrimary) {
          failures.push({
            claimId: claim.claimId,
            reason: `Deep tier high-risk claim requires at least 1 primary source, all sources are ${sourceType}`,
            evidenceId: claim.evidenceId,
          });
        }
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
