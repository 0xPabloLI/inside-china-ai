/**
 * Hashtag pool SSOT — load / validate / lookup / freshness / ingest.
 *
 * The pool JSON lives at scripts/short-video/config/hashtag-pool.json. It is
 * the single source for tag traffic knowledge; caption derivation stays in
 * caption-utils.mjs, trending scraping in snapshot-trending.mjs, paid research
 * in research-hashtags.mjs. This module owns neither.
 *
 * Pure functions where possible; file IO is confined to loadPool().
 *
 * Schema (frozen, see tag-pool-spec.md):
 *   version, updatedAt, platform, region, thresholds{...}, sources[],
 *   tags[{tag, kind, views, posts, avgViewsPerPost, viewsText, postsText,
 *         status, grade, sampledAt, source, url, notes}],
 *   blacklist[], evergreen[]
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default SSOT location (overridable via --pool in the CLIs). */
export const DEFAULT_POOL_PATH = join(__dirname, "..", "config", "hashtag-pool.json");

const TAG_KINDS = ["traffic", "niche", "entity", "brand", "trending", "meta"];
const TAG_STATUSES = ["ok", "low-volume", "saturated", "unverified", "deprecated", "blacklisted"];
const TAG_GRADES = ["A", "B", "C"];
const SOURCE_METHODS = ["browser", "curl", "manual"];

const THRESHOLD_KEYS = [
  "poolWarnDays",
  "poolFailDays",
  "snapshotWarnDays",
  "snapshotFailDays",
  "tagWarnDays",
  "tagFailDays",
];

/** Raised when the pool file is missing or unparsable (CLI exit 2). */
export class PoolLoadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PoolLoadError";
    this.code = code; // "POOL_MISSING" | "POOL_UNPARSABLE"
  }
}

/**
 * Normalize a hashtag value to canonical `#lowercase` form.
 *
 * Mirrors caption-utils.normalizeHashtag semantics (TikTok hashtags are
 * case-insensitive): trim, strip one leading #, lowercase, reject empty or
 * whitespace-containing values. Returns null for invalid input.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeTag(value) {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (s.length === 0) return null;
  s = s.replace(/^#/, "").toLowerCase();
  if (s.length === 0 || /\s/.test(s)) return null;
  return `#${s}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return value === null || (Number.isInteger(value) && value >= 0);
}

function parseDateDays(dateLike, now = Date.now()) {
  if (dateLike === null || dateLike === undefined) return null;
  if (typeof dateLike !== "string" || dateLike.trim() === "") return null;
  const time = Date.parse(dateLike);
  if (Number.isNaN(time)) return null;
  return Math.floor((now - time) / 86_400_000);
}

/**
 * Age in whole days for a YYYY-MM-DD or ISO date string; null when absent/unparsable.
 * @param {string|null} dateLike
 * @param {number} [now] epoch ms
 * @returns {number|null}
 */
export function ageDays(dateLike, now = Date.now()) {
  return parseDateDays(dateLike, now);
}

/**
 * Freshness band against warn/fail day thresholds.
 * @param {number|null} ageDaysValue
 * @param {number} warnDays
 * @param {number} failDays
 * @returns {"ok"|"warn"|"fail"|"unknown"}
 */
export function freshnessLevel(ageDaysValue, warnDays, failDays) {
  if (ageDaysValue === null) return "unknown";
  if (ageDaysValue > failDays) return "fail";
  if (ageDaysValue > warnDays) return "warn";
  return "ok";
}

/**
 * Load and parse the pool file. Does NOT validate the schema — call validatePool().
 * @param {string} [poolPath]
 * @returns {object} parsed pool
 * @throws {PoolLoadError} missing (POOL_MISSING) or unparsable (POOL_UNPARSABLE)
 */
export function loadPool(poolPath = DEFAULT_POOL_PATH) {
  if (!existsSync(poolPath)) {
    throw new PoolLoadError("POOL_MISSING", `Pool file not found: ${poolPath}`);
  }
  let text;
  try {
    text = readFileSync(poolPath, "utf8");
  } catch (error) {
    throw new PoolLoadError("POOL_MISSING", `Cannot read pool ${poolPath}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PoolLoadError(
      "POOL_UNPARSABLE",
      `Invalid JSON in pool ${poolPath}: ${error.message}`,
    );
  }
}

/**
 * Validate the pool against the frozen schema.
 * @param {object} pool
 * @returns {{valid: boolean, errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}>}}
 */
export function validatePool(pool) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (field, message) => warnings.push({ field, message });

  if (!isPlainObject(pool)) {
    err("root", "pool must be a JSON object");
    return { valid: false, errors, warnings };
  }

  if (pool.version !== 1) err("version", `version must be 1 (got ${JSON.stringify(pool.version)})`);
  if (typeof pool.platform !== "string" || pool.platform.trim() === "") {
    err("platform", "platform must be a non-empty string");
  }
  if (typeof pool.region !== "string" || pool.region.trim() === "") {
    err("region", "region must be a non-empty string");
  }
  if (typeof pool.updatedAt !== "string" || pool.updatedAt.trim() === "") {
    err("updatedAt", "updatedAt is required (YYYY-MM-DD)");
  } else if (parseDateDays(pool.updatedAt) === null) {
    err("updatedAt", `updatedAt is not a parseable date: ${JSON.stringify(pool.updatedAt)}`);
  }

  // ─── Thresholds ───
  if (!isPlainObject(pool.thresholds)) {
    err("thresholds", "thresholds must be an object");
  } else {
    for (const key of THRESHOLD_KEYS) {
      const value = pool.thresholds[key];
      if (!Number.isInteger(value) || value < 0) {
        err(
          `thresholds.${key}`,
          `${key} must be a non-negative integer (got ${JSON.stringify(value)})`,
        );
      }
    }
  }

  // ─── Sources ───
  const sourceIds = new Set();
  if (!Array.isArray(pool.sources)) {
    err("sources", "sources must be an array");
  } else {
    pool.sources.forEach((source, i) => {
      const base = `sources[${i}]`;
      if (!isPlainObject(source)) {
        err(base, "source must be an object");
        return;
      }
      if (typeof source.id !== "string" || source.id.trim() === "") {
        err(`${base}.id`, "source.id must be a non-empty string");
      } else if (sourceIds.has(source.id)) {
        err(`${base}.id`, `duplicate source id "${source.id}"`);
      } else {
        sourceIds.add(source.id);
      }
      if (typeof source.label !== "string" || source.label.trim() === "") {
        err(`${base}.label`, "source.label must be a non-empty string");
      }
      if (source.method !== undefined && !SOURCE_METHODS.includes(source.method)) {
        err(`${base}.method`, `source.method must be one of ${SOURCE_METHODS.join("|")}`);
      }
    });
  }

  // ─── Tags ───
  if (!Array.isArray(pool.tags)) {
    err("tags", "tags must be an array");
  } else {
    const seen = new Set();
    pool.tags.forEach((entry, i) => {
      const base = `tags[${i}]`;
      if (!isPlainObject(entry)) {
        err(base, "tag entry must be an object");
        return;
      }
      const canonical = normalizeTag(entry.tag);
      if (!canonical) {
        err(`${base}.tag`, `tag is invalid: ${JSON.stringify(entry.tag)}`);
      } else {
        if (entry.tag !== canonical) {
          warn(`${base}.tag`, `tag "${entry.tag}" should be canonical "${canonical}"`);
        }
        if (seen.has(canonical)) {
          err(`${base}.tag`, `duplicate tag "${canonical}"`);
        }
        seen.add(canonical);
      }

      if (!TAG_KINDS.includes(entry.kind)) {
        err(
          `${base}.kind`,
          `kind must be one of ${TAG_KINDS.join("|")} (got ${JSON.stringify(entry.kind)})`,
        );
      }
      if (!TAG_STATUSES.includes(entry.status)) {
        err(
          `${base}.status`,
          `status must be one of ${TAG_STATUSES.join("|")} (got ${JSON.stringify(entry.status)})`,
        );
      }
      if (!TAG_GRADES.includes(entry.grade)) {
        err(
          `${base}.grade`,
          `grade must be one of ${TAG_GRADES.join("|")} (got ${JSON.stringify(entry.grade)})`,
        );
      }

      if (!isNonNegativeInteger(entry.views)) {
        err(
          `${base}.views`,
          `views must be a non-negative integer or null (got ${JSON.stringify(entry.views)})`,
        );
      }
      if (!isNonNegativeInteger(entry.posts)) {
        err(
          `${base}.posts`,
          `posts must be a non-negative integer or null (got ${JSON.stringify(entry.posts)})`,
        );
      }
      if (!isNonNegativeInteger(entry.avgViewsPerPost)) {
        err(`${base}.avgViewsPerPost`, `avgViewsPerPost must be a non-negative integer or null`);
      }
      if (
        entry.viewsText !== null &&
        entry.viewsText !== undefined &&
        typeof entry.viewsText !== "string"
      ) {
        err(`${base}.viewsText`, "viewsText must be a string or null");
      }
      if (
        entry.postsText !== null &&
        entry.postsText !== undefined &&
        typeof entry.postsText !== "string"
      ) {
        err(`${base}.postsText`, "postsText must be a string or null");
      }

      if (entry.sampledAt !== null && entry.sampledAt !== undefined) {
        if (typeof entry.sampledAt !== "string" || parseDateDays(entry.sampledAt) === null) {
          err(
            `${base}.sampledAt`,
            `sampledAt is not a parseable date: ${JSON.stringify(entry.sampledAt)}`,
          );
        }
      }
      if (entry.source !== null && entry.source !== undefined) {
        if (typeof entry.source !== "string") {
          err(`${base}.source`, "source must be a string or null");
        } else if (sourceIds.size > 0 && !sourceIds.has(entry.source)) {
          warn(`${base}.source`, `source "${entry.source}" is not listed in pool.sources`);
        }
      }
      if (entry.url !== null && entry.url !== undefined && typeof entry.url !== "string") {
        err(`${base}.url`, "url must be a string or null");
      }

      // avgViewsPerPost is derived only when both views and posts exist.
      const hasViews = entry.views !== null && entry.views !== undefined;
      const hasPosts = entry.posts !== null && entry.posts !== undefined;
      if (hasViews && hasPosts) {
        if (entry.avgViewsPerPost === null || entry.avgViewsPerPost === undefined) {
          err(
            `${base}.avgViewsPerPost`,
            "avgViewsPerPost is required when both views and posts exist",
          );
        } else {
          const expected = Math.round(entry.views / entry.posts);
          if (Math.abs(entry.avgViewsPerPost - expected) > 1) {
            err(
              `${base}.avgViewsPerPost`,
              `avgViewsPerPost ${entry.avgViewsPerPost} does not match views/posts ${expected}`,
            );
          }
        }
      } else if (entry.avgViewsPerPost !== null && entry.avgViewsPerPost !== undefined) {
        err(
          `${base}.avgViewsPerPost`,
          "avgViewsPerPost must be null when views or posts are missing",
        );
      }

      // Grade consistency (warning, not a schema error).
      if (entry.grade === "C" && (hasViews || hasPosts)) {
        warn(`${base}.grade`, "grade C (existence-only) should not carry numeric data");
      }
      if (entry.grade === "A" && (!hasViews || !hasPosts)) {
        warn(`${base}.grade`, "grade A requires both views and posts sampled");
      }
    });
  }

  for (const [field, label] of [
    ["blacklist", "blacklist"],
    ["evergreen", "evergreen"],
  ]) {
    if (pool[field] !== undefined) {
      if (!Array.isArray(pool[field])) {
        err(field, `${field} must be an array`);
      } else {
        pool[field].forEach((tag, i) => {
          if (!normalizeTag(tag))
            err(`${field}[${i}]`, `${label} entry is invalid: ${JSON.stringify(tag)}`);
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Look up a tag entry by canonical hashtag.
 * @param {object} pool
 * @param {string} tag
 * @returns {object|null}
 */
export function lookupTag(pool, tag) {
  const canonical = normalizeTag(tag);
  if (!canonical || !Array.isArray(pool?.tags)) return null;
  return pool.tags.find((entry) => entry.tag === canonical) || null;
}

/** Pool-level freshness band. */
export function evaluatePoolFreshness(pool, now = Date.now()) {
  const thresholds = pool?.thresholds ?? {};
  const age = ageDays(pool?.updatedAt, now);
  const level = freshnessLevel(
    age,
    thresholds.poolWarnDays ?? Number.POSITIVE_INFINITY,
    thresholds.poolFailDays ?? Number.POSITIVE_INFINITY,
  );
  return {
    ageDays: age,
    level,
    warnDays: thresholds.poolWarnDays ?? null,
    failDays: thresholds.poolFailDays ?? null,
  };
}

/** Per-tag freshness band. */
export function evaluateTagFreshness(entry, thresholds, now = Date.now()) {
  const age = ageDays(entry?.sampledAt, now);
  const level = freshnessLevel(age, thresholds.tagWarnDays, thresholds.tagFailDays);
  return { ageDays: age, level };
}

function deriveAvg(views, posts) {
  if (
    views === null ||
    views === undefined ||
    posts === null ||
    posts === undefined ||
    posts === 0
  ) {
    return null;
  }
  return Math.round(views / posts);
}

/** Grade for a new tag with no incoming grade: A = both metrics, B = partial, C = none. */
function deriveGradeFromMetrics(views, posts) {
  const hasViews = views !== null && views !== undefined;
  const hasPosts = posts !== null && posts !== undefined;
  if (hasViews && hasPosts) return "A";
  if (hasViews || hasPosts) return "B";
  return "C";
}

/**
 * Normalize a research `source.method` onto the frozen SOURCE_METHODS enum.
 * `cdp*`/`browser*` → browser, `manual*` → manual, `curl*`/`http*` → curl;
 * anything unrecognized falls back to `manual` and the original string is
 * preserved on `note` so no information is lost.
 *
 * @param {*} method
 * @returns {{method: string, note: string|null}}
 */
export function normalizeSourceMethod(method) {
  if (typeof method !== "string" || method.trim() === "") {
    return { method: "manual", note: typeof method === "string" && method.trim() ? method : null };
  }
  const m = method.trim().toLowerCase();
  if (m.startsWith("cdp") || m.startsWith("browser")) return { method: "browser", note: null };
  if (m.startsWith("manual")) return { method: "manual", note: null };
  if (m.startsWith("curl") || m.startsWith("http")) return { method: "curl", note: null };
  if (SOURCE_METHODS.includes(m)) return { method: m, note: null };
  return { method: "manual", note: method };
}

/** Effective value after the null-guard: incoming null never clobbers an existing value. */
function effectiveValue(incoming, existing) {
  if (incoming === undefined) return existing ?? null;
  if (incoming === null) return existing ?? null;
  return incoming;
}

const INGEST_FIELDS = [
  "kind",
  "status",
  "grade",
  "views",
  "posts",
  "viewsText",
  "postsText",
  "sampledAt",
  "source",
  "url",
  "notes",
];

/**
 * Normalize an incoming research record to pool entry shape.
 * Accepts `tag` or `hashtag`; metrics may arrive under views/posts/avgViewsPerPost.
 * @param {object} record
 * @returns {{tag: string, fields: object}|null}
 */
function normalizeIngestRecord(record) {
  if (!isPlainObject(record)) return null;
  const tag = normalizeTag(record.tag ?? record.hashtag);
  if (!tag) return null;
  const fields = {};
  for (const key of INGEST_FIELDS) {
    if (record[key] !== undefined) fields[key] = record[key];
  }
  if (record.avgViewsPerPost !== undefined) fields.avgViewsPerPost = record.avgViewsPerPost;
  // Research records may spell the notes field `note`; alias it to `notes`.
  if (fields.notes === undefined && record.note !== undefined) fields.notes = record.note;
  return { tag, fields };
}

/**
 * Merge incoming research records into a pool.
 *
 * Rules (frozen contract):
 *  - never overwrite a non-null pool value with null;
 *  - never invent numbers: absent metrics stay null;
 *  - avgViewsPerPost is recomputed only from views/posts, never estimated;
 *  - existing tags keep their kind/status/grade unless the incoming record
 *    supplies a valid one; new tags default to unverified / grade C.
 *
 * @param {object} pool
 * @param {object|Array} incoming research JSON (array of records, or {tags: [...], sources: [...]})
 * @param {{now?: Date, today?: string}} [opts]
 * @returns {{pool: object, changes: Array<{tag: string, action: string, field: string, oldValue: any, newValue: any}>, addedTags: string[], skipped: Array<{reason: string, record: any}>}}
 */
export function ingestPool(pool, incoming, opts = {}) {
  const now = opts.now ? opts.now.getTime() : Date.now();
  const today = opts.today || new Date(now).toISOString().slice(0, 10);

  const cloned = JSON.parse(JSON.stringify(pool));
  const changes = [];
  const addedTags = [];
  const skipped = [];

  const records = Array.isArray(incoming) ? incoming : incoming?.tags;
  if (!Array.isArray(records)) {
    throw new Error("ingest: incoming research JSON must be an array of records or {tags: [...]}");
  }

  for (const record of records) {
    const parsed = normalizeIngestRecord(record);
    if (!parsed) {
      skipped.push({ reason: "invalid tag", record });
      continue;
    }
    const { tag, fields } = parsed;
    let entry = cloned.tags.find((t) => t.tag === tag);
    const isNew = !entry;

    // Null-guarded effective metrics (needed for grade derivation + avg).
    const mergedViews = effectiveValue(fields.views, entry?.views ?? null);
    const mergedPosts = effectiveValue(fields.posts, entry?.posts ?? null);

    // ─── Enum sanitization (shared by new and update paths) ───
    let blacklistHit = false;
    let resolvedKind;
    if (TAG_KINDS.includes(fields.kind)) {
      resolvedKind = fields.kind;
    } else if (fields.kind === "blacklist") {
      // Research vocab: kind "blacklist" maps to status "blacklisted" + pool
      // blacklist membership; it is NOT a pool kind.
      blacklistHit = true;
      resolvedKind = entry?.kind ?? "niche";
    } else {
      resolvedKind = entry?.kind ?? "niche";
    }

    let resolvedStatus;
    if (TAG_STATUSES.includes(fields.status)) {
      resolvedStatus = fields.status;
    } else {
      resolvedStatus = entry?.status ?? "unverified";
    }
    if (blacklistHit) resolvedStatus = "blacklisted";

    let resolvedGrade;
    if (TAG_GRADES.includes(fields.grade)) {
      resolvedGrade = fields.grade;
    } else if (entry) {
      resolvedGrade = entry.grade;
    } else {
      resolvedGrade = deriveGradeFromMetrics(mergedViews, mergedPosts);
    }

    if (isNew) {
      entry = {
        tag,
        kind: resolvedKind,
        views: mergedViews,
        posts: mergedPosts,
        avgViewsPerPost: null,
        viewsText: effectiveValue(fields.viewsText, null),
        postsText: effectiveValue(fields.postsText, null),
        status: resolvedStatus,
        grade: resolvedGrade,
        sampledAt: typeof fields.sampledAt === "string" ? fields.sampledAt : today,
        source: effectiveValue(fields.source, null),
        url: effectiveValue(fields.url, null),
        notes: effectiveValue(fields.notes, null),
      };
      cloned.tags.push(entry);
      addedTags.push(tag);
      changes.push({ tag, action: "added", field: "entry", oldValue: null, newValue: tag });
    } else {
      // Scalar fields with the null-guard; enums were sanitized above.
      const scalarFields = [
        "views",
        "posts",
        "viewsText",
        "postsText",
        "sampledAt",
        "source",
        "url",
        "notes",
      ];
      for (const key of scalarFields) {
        if (fields[key] === undefined) continue;
        const incomingValue = fields[key];
        // Never overwrite a non-null value with null.
        if (incomingValue === null && entry[key] !== null && entry[key] !== undefined) continue;
        if (entry[key] === incomingValue) continue;
        changes.push({
          tag,
          action: "updated",
          field: key,
          oldValue: entry[key] ?? null,
          newValue: incomingValue,
        });
        entry[key] = incomingValue;
      }
      const enumUpdates = { kind: resolvedKind, status: resolvedStatus, grade: resolvedGrade };
      for (const [key, newValue] of Object.entries(enumUpdates)) {
        if (entry[key] === newValue) continue;
        changes.push({
          tag,
          action: "updated",
          field: key,
          oldValue: entry[key] ?? null,
          newValue,
        });
        entry[key] = newValue;
      }
    }

    // Blacklist side effect: idempotent membership for blacklist-kind records.
    if (blacklistHit || entry.status === "blacklisted") {
      if (!cloned.blacklist.includes(tag)) cloned.blacklist.push(tag);
    }

    // Recompute avg only from real views/posts; never estimate.
    const avg = deriveAvg(entry.views, entry.posts);
    if (entry.avgViewsPerPost !== avg) {
      changes.push({
        tag,
        action: "updated",
        field: "avgViewsPerPost",
        oldValue: entry.avgViewsPerPost ?? null,
        newValue: avg,
      });
      entry.avgViewsPerPost = avg;
    }
  }

  // Merge incoming sources by id (existing sources are never dropped);
  // normalize each incoming method onto the frozen enum.
  const incomingSources = Array.isArray(incoming?.sources) ? incoming.sources : [];
  for (const source of incomingSources) {
    if (!isPlainObject(source) || typeof source.id !== "string") continue;
    const existing = cloned.sources.find((s) => s.id === source.id);
    const { method, note } = normalizeSourceMethod(source.method);
    const normalized = { ...source, method };
    if (note) {
      normalized.note = existing?.note
        ? `${existing.note} (original method: ${note})`
        : `original method: ${note}`;
    }
    if (!existing) cloned.sources.push(normalized);
  }

  cloned.updatedAt = today;
  return { pool: cloned, changes, addedTags, skipped };
}
