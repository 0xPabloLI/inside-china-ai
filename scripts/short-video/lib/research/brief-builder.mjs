/**
 * Research Evidence Pipeline — Brief Builder
 *
 * Deterministic, pure-function module that transforms a discovery.json
 * into a research-brief.json. Only does:
 * - URL normalization
 * - Cross-source deduplication
 * - Time-window filtering
 * - Source metadata enrichment (best-effort)
 * - Priority sorting (primary > authoritative-secondary > independent-secondary > community)
 * - Schema validation
 *
 * Does NOT make fact judgments, write content, or access the network.
 *
 * See: docs/specs/spec-research-evidence-pipeline.md
 */

import { BRIEF_SCHEMA_VERSION } from "./schemas.mjs";
import { validateBrief } from "./validate.mjs";

// ─── URL normalization ───

// Tracking parameters to strip
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "source",
  "from",
  "share",
  "spm",
];

/**
 * Normalizes a URL by:
 * - Lowercasing the hostname
 * - Stripping tracking parameters
 * - Sorting remaining query parameters
 * - Removing trailing slashes from paths (except root)
 * - Removing fragments
 * @param {string} url
 * @returns {string} normalized URL
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== "string") return "";

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Not a valid URL — return as-is (might be a relative path)
    return url;
  }

  // Lowercase hostname
  parsed.hostname = parsed.hostname.toLowerCase();

  // Strip tracking params
  const params = new URLSearchParams(parsed.searchParams);
  for (const tp of TRACKING_PARAMS) {
    params.delete(tp);
  }

  // Sort params
  const sortedParams = new URLSearchParams(
    [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
  const searchStr = sortedParams.toString();
  parsed.search = searchStr ? `?${searchStr}` : "";

  // Remove fragment
  parsed.hash = "";

  // Remove trailing slash from path (except root "/")
  let pathStr = parsed.pathname;
  if (pathStr.length > 1 && pathStr.endsWith("/")) {
    pathStr = pathStr.slice(0, -1);
  }
  parsed.pathname = pathStr;

  return parsed.toString();
}

// ─── Source deduplication ───

/**
 * Deduplicates sources by normalized URL.
 * When two sources share the same normalized URL, keeps the one with
 * higher priority (primary > authoritative-secondary > independent-secondary > community).
 * If same priority, keeps the first encountered.
 *
 * @param {Array} sources — array of source objects with at least `url` field
 * @returns {Array} deduplicated sources
 */
export function deduplicateSources(sources) {
  if (!Array.isArray(sources)) return [];

  const SOURCE_PRIORITY = {
    primary: 4,
    "authoritative-secondary": 3,
    "independent-secondary": 2,
    community: 1,
  };

  const seen = new Map();

  for (const source of sources) {
    if (!source || !source.url) continue;

    const normalized = normalizeUrl(source.url);
    const existing = seen.get(normalized);

    if (!existing) {
      seen.set(normalized, source);
    } else {
      // Keep higher priority
      const existingPriority = SOURCE_PRIORITY[existing.sourceType] || 0;
      const newPriority = SOURCE_PRIORITY[source.sourceType] || 0;

      if (newPriority > existingPriority) {
        seen.set(normalized, source);
      }
    }
  }

  return [...seen.values()];
}

// ─── Time-window filtering ───

/**
 * Filters sources by a time window.
 * Sources without a publishedAt date are kept (don't filter them out).
 * Sources with publishedAt older than `daysBack` from `referenceDate` are removed.
 *
 * @param {Array} sources — array of source objects with optional `publishedAt` field
 * @param {number} daysBack — number of days to look back
 * @param {string} [referenceDate] — ISO date string to compare against (default: now)
 * @returns {Array} filtered sources
 */
export function filterByTimeWindow(sources, daysBack, referenceDate) {
  if (!Array.isArray(sources)) return [];

  const refDate = referenceDate ? new Date(referenceDate) : new Date();
  const cutoff = new Date(refDate);
  cutoff.setDate(cutoff.getDate() - daysBack);

  return sources.filter((source) => {
    // Keep sources without a date — can't determine staleness
    if (!source.publishedAt) return true;

    const pubDate = new Date(source.publishedAt);
    if (isNaN(pubDate.getTime())) return true; // Invalid date — keep

    return pubDate >= cutoff;
  });
}

// ─── Priority sorting ───

const PRIORITY_ORDER = {
  primary: 0,
  "authoritative-secondary": 1,
  "independent-secondary": 2,
  community: 3,
};

/**
 * Sorts sources by priority: primary first, then authoritative-secondary,
 * then independent-secondary, then community. Sources without a sourceType
 * are treated as lowest priority.
 *
 * @param {Array} sources
 * @returns {Array} sorted sources (does not mutate input)
 */
export function prioritizeSources(sources) {
  if (!Array.isArray(sources)) return [];

  return [...sources].sort((a, b) => {
    const aPriority = PRIORITY_ORDER[a.sourceType] ?? 99;
    const bPriority = PRIORITY_ORDER[b.sourceType] ?? 99;
    return aPriority - bPriority;
  });
}

// ─── Brief Builder ───

/**
 * Builds a research brief from a discovery object and caller-provided context.
 *
 * The caller (Agent) provides:
 * - researchQuestion: a falsifiable, completable question
 * - audience: who the content is for
 * - claimsToVerify: array of { claimId, question, riskLevel, requiresPrimarySource }
 * - researchTier: "standard" or "deep"
 * - knownFacts, openQuestions, userMaterials: optional context
 *
 * The builder:
 * 1. Deduplicates discovery sources by normalized URL
 * 2. Filters by time window (default: 30 days)
 * 3. Sorts by source priority
 * 4. Maps to candidateSources format
 * 5. Validates the output against the brief schema
 *
 * @param {object} discovery — a validated discovery.json object
 * @param {object} context — caller-provided research context
 * @returns {object} { valid, brief, errors } — if valid, brief is the research brief; if invalid, brief is null
 */
export function buildBrief(discovery, context) {
  const errors = [];

  if (!discovery || typeof discovery !== "object") {
    return { valid: false, brief: null, errors: ["discovery must be an object"] };
  }

  if (!Array.isArray(discovery.sources)) {
    return { valid: false, brief: null, errors: ["discovery.sources must be an array"] };
  }

  // Step 1: Deduplicate
  let candidates = deduplicateSources(discovery.sources);

  // Step 2: Time-window filter (default 30 days)
  const daysBack = context.daysBack || 30;
  candidates = filterByTimeWindow(candidates, daysBack);

  // Step 3: Sort by priority
  candidates = prioritizeSources(candidates);

  // Step 4: Map to candidateSources format
  const candidateSources = candidates.map((src) => ({
    url: normalizeUrl(src.url),
    title: src.title || "",
    sourceType: src.sourceType || src.sourceCategory || "independent-secondary",
    publishedAt: src.publishedAt || null,
  }));

  // Step 5: Build brief
  const brief = {
    schemaVersion: BRIEF_SCHEMA_VERSION,
    contentId: discovery.contentId,
    researchRunId: discovery.researchRunId,
    researchQuestion: context.researchQuestion || "",
    audience: context.audience || "general",
    contentFormat: context.contentFormat || "article",
    deadline: context.deadline || null,
    researchTier: context.researchTier || "standard",
    claimsToVerify: context.claimsToVerify || [],
    candidateSources,
    knownFacts: context.knownFacts || [],
    openQuestions: context.openQuestions || [],
    userMaterials: context.userMaterials || [],
  };

  // Step 6: Validate
  const validationResult = validateBrief(brief);
  if (!validationResult.valid) {
    return {
      valid: false,
      brief: null,
      errors: validationResult.errors,
    };
  }

  return { valid: true, brief, errors: [] };
}
