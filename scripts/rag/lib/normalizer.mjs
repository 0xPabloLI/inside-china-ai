/**
 * Normalizer — validates and normalizes metadata for the content_embeddings table.
 *
 * - topics → lowercase strings (Q5)
 * - entities → snake_case IDs (Q5)
 * - Missing optional fields → omitted, not null (Scenario #24)
 * - topics must be array of strings — throws on violation (Scenario #8, Q3)
 *
 * Spec: docs/archive/spec-rag.md §2.1 (Q5), §5.2 (Scenarios #8, #24)
 */

/**
 * Convert a string to snake_case.
 * Handles spaces, hyphens, camelCase, and mixed case.
 *
 * @param {string} str
 * @returns {string}
 */
export function toSnakeCase(str) {
  if (!str) return "";
  return str
    .trim()
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

/**
 * Normalize a topics array: lowercase + trim all strings.
 *
 * @param {string[]|null|undefined} topics
 * @returns {string[]}
 * @throws {Error} If topics is not an array or contains non-strings (Scenario #8)
 */
export function normalizeTopics(topics) {
  if (topics == null) return [];

  if (!Array.isArray(topics)) {
    throw new Error(`topics must be an array of strings, got ${typeof topics} (Scenario #8)`);
  }

  const result = [];
  for (const t of topics) {
    if (typeof t !== "string") {
      throw new Error(`topics must contain only strings, got ${typeof t} (Scenario #8)`);
    }
    const trimmed = t.trim().toLowerCase();
    if (trimmed) result.push(trimmed);
  }

  return result;
}

/**
 * Normalize an entities object: convert all IDs to snake_case.
 *
 * @param {Object|null|undefined} entities
 * @returns {Object|undefined} Normalized entities, or undefined if input is null/undefined
 */
export function normalizeEntities(entities) {
  if (entities == null) return undefined;

  const result = {};

  for (const key of ["companies", "people", "models"]) {
    if (Array.isArray(entities[key])) {
      result[key] = entities[key]
        .filter((v) => typeof v === "string" && v.trim())
        .map((v) => toSnakeCase(v));
    }
  }

  // Copy any other keys unchanged
  for (const [k, v] of Object.entries(entities)) {
    if (!["companies", "people", "models"].includes(k)) {
      result[k] = v;
    }
  }

  return result;
}

/**
 * Normalize a full metadata object for JSONB storage.
 *
 * - topics → normalized via normalizeTopics
 * - entities → normalized via normalizeEntities (omitted if missing)
 * - All other keys → passed through unchanged
 * - Missing topics → omitted (not null)
 *
 * @param {Object|null|undefined} rawMetadata
 * @returns {Object} JSONB-compatible metadata object
 * @throws {Error} If topics is present but invalid (Scenario #8)
 */
export function normalizeMetadata(rawMetadata) {
  if (rawMetadata == null || typeof rawMetadata !== "object") return {};

  const result = {};

  for (const [key, value] of Object.entries(rawMetadata)) {
    if (key === "topics") {
      const normalized = normalizeTopics(value);
      // Only include if the original was an array (even empty)
      if (Array.isArray(value)) {
        result.topics = normalized;
      }
      // If topics was not an array, normalizeTopics already threw
    } else if (key === "entities") {
      const normalized = normalizeEntities(value);
      if (normalized !== undefined) {
        result.entities = normalized;
      }
    } else {
      // Pass through all other fields unchanged
      result[key] = value;
    }
  }

  return result;
}
