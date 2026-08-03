/**
 * seriesMeta — type definition and validation for multi-video series.
 *
 * Pure functions — no side effects. Used by publish-utils.mjs and scene-data files.
 */

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_HOOK_TYPES = new Set(["standalone", "recap", "cliffhanger-close"]);

/**
 * Validate a seriesMeta object.
 *
 * @param {Object|null} meta - seriesMeta to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSeriesMeta(meta) {
  const errors = [];

  if (!meta || typeof meta !== "object") {
    return { valid: false, errors: ["seriesMeta is required"] };
  }

  // seriesId — required, kebab-case
  if (!meta.seriesId) {
    errors.push("seriesId is required");
  } else if (!KEBAB_CASE.test(meta.seriesId)) {
    errors.push("seriesId must be kebab-case (e.g. 'deepseek-distillation')");
  }

  // partNumber — required, integer 1-5
  if (meta.partNumber === undefined || meta.partNumber === null) {
    errors.push("partNumber is required");
  } else if (!Number.isInteger(meta.partNumber) || meta.partNumber < 1 || meta.partNumber > 5) {
    errors.push("partNumber must be an integer 1-5");
  }

  // totalParts — required, integer 1-5
  if (meta.totalParts === undefined || meta.totalParts === null) {
    errors.push("totalParts is required");
  } else if (!Number.isInteger(meta.totalParts) || meta.totalParts < 1 || meta.totalParts > 5) {
    errors.push("totalParts must be an integer 1-5");
  }

  // partNumber <= totalParts
  if (
    Number.isInteger(meta.partNumber) &&
    Number.isInteger(meta.totalParts) &&
    meta.partNumber > meta.totalParts
  ) {
    errors.push("partNumber must be <= totalParts");
  }

  // hookType — optional, enumerated
  if (meta.hookType !== undefined && meta.hookType !== null) {
    if (!VALID_HOOK_TYPES.has(meta.hookType)) {
      errors.push(`hookType must be one of: ${[...VALID_HOOK_TYPES].join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get series-related caption hashtag from seriesMeta.
 *
 * @param {Object} meta - validated seriesMeta (must have seriesId)
 * @returns {string} e.g. "#deepseekdistillation"
 */
export function getSeriesHashtag(meta) {
  const id = meta?.seriesId || "";
  return "#" + id.replace(/-/g, "");
}
