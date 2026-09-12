/**
 * Company-relation graph loader (#248) — single source of truth for
 * entity → hashtag / parent / color / presentation resolution.
 *
 * Data: lib/data/company-relations.json (compiled from
 * docs/research/china-ai-hashtag-mapping.md + #242/#245 evidence; the
 * human-readable graph lives in docs/research/company-relations.md).
 *
 * Consumers:
 * - caption-utils.mjs  — ENTITY_HASHTAG_MAP (derived via buildEntityHashtagMap)
 * - prompt-injection.mjs — ENTITY_ALIASES color inheritance (buildEntityColorAliases)
 * - 写稿辅助 (Stage 2/3) — howToPresent(entity) answers "这个公司该怎么说"
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const DATA_PATH = new URL("./data/company-relations.json", import.meta.url);

let cache = null;

/** Load and minimally validate the relations graph (process-lifetime cache). */
export function loadCompanyRelations() {
  if (cache) return cache;
  const parsed = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  if (!Array.isArray(parsed.entities) || parsed.entities.length === 0) {
    throw new Error("company-relations.json: entities[] missing or empty");
  }
  const byId = new Map();
  for (const e of parsed.entities) {
    for (const field of ["entity", "hashtag", "matchKeys", "overseasAwareness"]) {
      if (e[field] === undefined) throw new Error(`company-relations.json: ${e.entity ?? "?"} lacks ${field}`);
    }
    if (byId.has(e.entity)) throw new Error(`company-relations.json: duplicate entity ${e.entity}`);
    byId.set(e.entity, e);
  }
  for (const e of parsed.entities) {
    if (e.parent && !byId.has(e.parent)) {
      throw new Error(`company-relations.json: ${e.entity} parent ${e.parent} is not a known entity`);
    }
  }
  cache = parsed;
  return cache;
}

/** All matchKeys → entity record. */
function matchKeyIndex() {
  const data = loadCompanyRelations();
  const index = new Map();
  for (const e of data.entities) {
    for (const key of e.matchKeys) index.set(key, e);
  }
  return index;
}

/**
 * Resolved TikTok hashtag for an entity key (no "#"). Falls back to the
 * parent's hashtag when the key only matches a subsidiary without its own.
 * Returns null for unknown entities.
 * @param {string} key
 * @returns {string | null}
 */
export function resolveEntityHashtag(key) {
  const record = matchKeyIndex().get(String(key).toLowerCase());
  if (!record) return null;
  return record.hashtag ?? null;
}

/**
 * 写稿辅助: how captions should present an entity to an overseas audience.
 * Low-awareness subsidiaries get the "Parent's Brand" pattern (the #245
 * user feedback: 蚂蚁集团海外不知名，必须带出 Alibaba); mid/high return the
 * display alias or null when no rewrite is needed.
 * @param {string} key
 * @returns {{ text: string, awareness: string } | null}
 */
export function howToPresent(key) {
  const record = matchKeyIndex().get(String(key).toLowerCase());
  if (!record) return null;
  if (record.overseasAwareness === "low" && record.presentation) {
    return { text: record.presentation, awareness: "low" };
  }
  return { text: record.aliases[0] ?? record.entity, awareness: record.overseasAwareness };
}

/**
 * ENTITY_HASHTAG_MAP for caption-utils: matchKey → "#hashtag".
 * The literal map this replaces is locked by company-relations.test.mjs.
 * @returns {Record<string, string>}
 */
export function buildEntityHashtagMap() {
  const map = {};
  for (const [key, record] of matchKeyIndex()) {
    map[key] = `#${record.hashtag}`;
  }
  return map;
}

/**
 * ENTITY_ALIASES for prompt-injection color inheritance: matchKey →
 * ENTITY_COLORS key. A record inherits its parent-chain color: own
 * colorKey if present, else the nearest ancestor's, else the record is not
 * color-mapped (excluded).
 * @returns {Record<string, string>}
 */
export function buildEntityColorAliases() {
  const data = loadCompanyRelations();
  const byId = new Map(data.entities.map((e) => [e.entity, e]));
  const aliases = {};
  for (const e of data.entities) {
    let colorKey = e.colorKey;
    let parent = e.parent;
    while (!colorKey && parent) {
      const p = byId.get(parent);
      if (!p) break;
      colorKey = p.colorKey;
      parent = p.parent;
    }
    if (!colorKey) continue;
    for (const key of e.matchKeys) aliases[key] = colorKey;
  }
  return aliases;
}
