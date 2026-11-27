/**
 * Hashtag quality gate for manual `meta.hashtags` overrides.
 *
 * The manual override path in caption-utils is deliberately locked: whatever
 * the producer writes is what ships. That is useful for editorial control, but
 * it also lets version strings (#glm54) and secondary company names (#maiya)
 * bypass the strategy that deliberately avoids them.
 *
 * This module adds the missing editorial check. It is pure: callers pass the
 * hashtag pool (hashtag-pool.json) so tests and preflight share one rule set.
 *
 * Pass criteria, in order:
 *   1. known hashtag-pool tag (not blacklisted / deprecated)
 *   2. primary subject, primary company, or a declared model/product brand
 *   3. editorial category allowlist (audience taxonomy, not brand names)
 *
 * Version-shaped tags (#brand54, #model2) fail unless the pool already has
 * sampled evidence for them. Secondary company names fail: a company name is
 * not a search category; the product or category tag is.
 */

import { normalizeHashtag as normalizeTag } from "./caption-utils.mjs";

/**
 * Category tags that describe an audience, not a company or a release.
 * These are safe even without a pool entry because the topic itself is the
 * search intent. Keep this list short and editorial; add a sampled pool entry
 * for anything brand-specific.
 */
const CATEGORY_ALLOWLIST = new Set([
  "#coding",
  "#llm",
  "#shortdrama",
  "#aishortdrama",
  "#microdrama",
  "#cdrama",
  "#robotics",
  "#humanoid",
  "#humanoidrobot",
  "#embodiedai",
  "#aivideo",
  "#aifilm",
  "#shortfilm",
  "#worldmodel",
  "#aiagent",
  "#aiagents",
]);

const POOL_BLOCKED_STATUSES = new Set(["blacklisted", "deprecated"]);

function tokenize(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.replace(/\d+.*$/, ""))
    .filter((token) => token.length >= 2);
}

function primaryTokens(meta) {
  const tokens = new Set();
  for (const value of [
    meta?.subject,
    meta?.keyEntities?.companies?.[0],
    ...(meta?.keyEntities?.models || []),
  ]) {
    for (const token of tokenize(value)) tokens.add(token);
  }
  return tokens;
}

function secondaryCompanyTokens(meta) {
  const tokens = new Set();
  for (const company of (meta?.keyEntities?.companies || []).slice(1)) {
    for (const token of tokenize(company)) tokens.add(token);
  }
  return tokens;
}

function poolEntry(pool, tag) {
  if (!Array.isArray(pool?.tags)) return null;
  return pool.tags.find((entry) => normalizeTag(entry.tag) === tag) || null;
}

/**
 * Audit manual hashtags before they reach a caption.
 *
 * @param {object} p
 * @param {string[]} p.hashtags - manual tags from meta.hashtags
 * @param {object} [p.meta] - meta.mjs payload (subject / keyEntities)
 * @param {object} p.pool - parsed hashtag-pool.json
 * @returns {{tag: string, code: string, message: string}[]} failures, empty when clean
 */
export function auditHashtags({ hashtags, meta, pool } = {}) {
  if (!Array.isArray(hashtags) || hashtags.length === 0) return [];

  const primary = primaryTokens(meta);
  const secondaryCompanies = secondaryCompanyTokens(meta);
  const issues = [];

  for (const raw of hashtags) {
    const tag = normalizeTag(raw);
    if (!tag) {
      issues.push({
        tag: String(raw),
        code: "invalid",
        message: `"${raw}" is not a valid hashtag`,
      });
      continue;
    }

    const entry = poolEntry(pool, tag);
    if (entry && !POOL_BLOCKED_STATUSES.has(entry.status)) continue;

    const body = tag.slice(1);

    // A known pool tag wins even when it contains digits (#hy4 is a product
    // name with sampled volume). Unknown digit tags are version strings.
    if (/\d/.test(body)) {
      issues.push({
        tag,
        code: "version",
        message: `${tag} looks like a version string and has no hashtag-pool entry; use the brand tag or a sampled tag instead`,
      });
      continue;
    }

    if (primary.has(body) || CATEGORY_ALLOWLIST.has(tag)) continue;

    if (secondaryCompanies.has(body)) {
      issues.push({
        tag,
        code: "company",
        message: `${tag} is a secondary company name, not a product or category; use the product tag instead`,
      });
      continue;
    }

    issues.push({
      tag,
      code: "unbacked",
      message: `${tag} has no hashtag-pool evidence and is not on the category allowlist; add a sampled pool entry or use a product/category tag`,
    });
  }

  return issues;
}

/**
 * Split manual hashtags into the tags that may ship and the ones the caption
 * generator must drop. The audit is the single rule set; this helper only
 * applies it, so preflight and package generation cannot drift.
 *
 * @param {object} p
 * @param {string[]} p.hashtags
 * @param {object} [p.meta]
 * @param {object} p.pool
 * @param {number} [p.min=3] - platform minimum after filtering
 * @returns {{kept: string[], dropped: {tag:string,code:string,message:string}[], usable: boolean}}
 */
export function sanitizeHashtags({ hashtags, meta, pool, min = 3 } = {}) {
  const raw = Array.isArray(hashtags) ? hashtags : [];
  const issues = auditHashtags({ hashtags: raw, meta, pool });
  const dropped = issues;
  const droppedSet = new Set(dropped.map((issue) => normalizeTag(issue.tag)));
  const kept = [];
  const seen = new Set();
  for (const tag of raw) {
    const normalized = normalizeTag(tag);
    if (!normalized || droppedSet.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(normalized);
  }
  return { kept, dropped, usable: kept.length >= min };
}
