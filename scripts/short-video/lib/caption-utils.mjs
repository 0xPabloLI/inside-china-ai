/**
 * Caption derivation utilities for TikTok/YouTube/Reels post text.
 *
 * Pure functions — no file IO, no side effects.
 * Used by generate-caption.mjs and testable in isolation.
 *
 * Hashtag strategy researched 2026-08-08, updated 2026-08-25 via:
 * - tiktokhashtags.com (real view/post data from TikTok API cache)
 * - TikTok Creative Center (trending hashtags, Tech & Electronics industry)
 * - TikTok search (successful competitor hashtag analysis)
 * - Competitor intelligence: docs/research/tiktok-competitor-intelligence.md
 * See: docs/tiktok/tiktok-best-practices.md → Hashtag Strategy section
 *
 * Comment hooks are AITL-generated (Agent-in-the-Loop) during scene-data
 * production, not template-generated. See spec-caption-format-fix.md.
 */
import { buildEntityHashtagMap } from "./company-relations.mjs";


// ─── Curated Hashtag Pools (researched 2026-08-08, updated 2026-08-25) ───
//
// Data sources: tiktokhashtags.com (cached TikTok API data),
// TikTok Creative Center, TikTok search competitor analysis,
// competitor intelligence (docs/research/tiktok-competitor-intelligence.md).
// Refresh guidance: Agent checks Creative Center trending each video run
// (mandatory step in content-pipeline.md Stage 3 Step 7).
//
// Entity hashtags are matched from meta.keyEntities.companies only —
// NOT from voiceover full-text (prevents competitor false-positives).

/**
 * Core traffic hashtags — low competition, high precision.
 * Always include 1-2 of these.
 */
const CORE_TRAFFIC_HASHTAGS = [
  "#ainews", // 68.7M views, 8.9K posts — best ROI
  "#technews", // 1B views, 78.4K posts — tech news specific
  "#news", // competitor intelligence: 3/16 competitor videos use it
];

/**
 * Auxiliary traffic hashtags — broader reach, higher competition.
 * Pick 0-1 based on content focus.
 */
const AUXILIARY_TRAFFIC_HASHTAGS = [
  "#ai", // competitor intelligence: 9/16 use it — promoted from optional to pad candidate
  "#artificialintelligence", // competitor intelligence: 4/16 use it — more precise than #ai
  "#chinaai", // niche brand hashtag, always relevant
];

/**
 * Blacklisted hashtags — must never be used.
 *
 * #creatorsearchinsights was previously blacklisted based on 2-video sample
 * (tiktok-competitor-intelligence.md §3.2). Removed 2026-08-26 after deeper
 * research: (1) sample too small for attribution; (2) Buffer and TikTok
 * officially recommend using it; (3) it's a meta-tag for Creator Search
 * Insights content gap, not a content tag. It is not auto-added — Agent
 * adds it via metadata.hashtags when using Creator Search Insights.
 *
 * The array is kept empty but the filtering mechanism remains for future use.
 */
const BLACKLISTED_HASHTAGS = [];

/**
 * Vertical / entity hashtags — precision targeting.
 * Looked up from meta.keyEntities.companies (NOT from voiceover full-text).
 * Expanded 2026-08-26 via deep web research covering 60+ entities across
 * 7 tiers: Big Tech, startups, AI chips, robotics, autonomous driving,
 * international competitors, and product/platform brands.
 * See: docs/research/china-ai-hashtag-mapping.md
 */
/**
 * Vertical / entity hashtags — precision targeting, derived from the
 * company-relation SSOT (#248): lib/data/company-relations.json.
 * Looked up from meta.keyEntities.companies (NOT from voiceover full-text).
 * Graph sources: docs/research/china-ai-hashtag-mapping.md (2026-08-26)
 * + docs/research/company-relations.md (#248).
 */
const ENTITY_HASHTAG_MAP = buildEntityHashtagMap();

/**
 * Pad candidates used when entity-matched tags are insufficient.
 * Ordered by priority: #ai (competitor-validated) → #artificialintelligence → #news.
 */
const PAD_CANDIDATES = ["#ai", "#artificialintelligence", "#news"];

/**
 * Default hashtags when no metadata and no entity match.
 * Combines core traffic + brand niche.
 */
const DEFAULT_HASHTAGS = ["#ainews", "#chinaai", "#technews"];

// SEO keywords — "china" and "ai" are universal (channel name).
// The primary entity (e.g. "moonshot", "deepseek") is added dynamically
// from metadata.primaryEntity in hasSeoKeyword().
const BASE_SEO_KEYWORDS = ["china", "ai"];

/**
 * Get SEO keywords for a given primary entity.
 * @param {string} [primaryEntity] - e.g. "moonshot", "deepseek"
 * @returns {string[]}
 */
function getSeoKeywords(primaryEntity) {
  if (!primaryEntity) return BASE_SEO_KEYWORDS;
  return [...BASE_SEO_KEYWORDS, primaryEntity.toLowerCase()];
}

// Comment hook templates and extractEntities have been removed.
// Comment hooks are now AITL-generated (Agent writes metadata.commentHook
// during scene-data production). See derivePinnedComment.

/**
 * Derive a pinned comment from metadata.
 * Comment hook is AITL-generated (Agent writes it to metadata.commentHook
 * during scene-data production). This function just reads it.
 *
 * @param {Array} scenes - Scene array (unused, kept for API compat)
 * @param {Object} [metadata] - Optional metadata { commentHook, articleUrl }
 * @returns {string} Pinned comment text, or empty string if no commentHook
 */
export function derivePinnedComment(scenes, metadata) {
  const hook = metadata?.commentHook?.trim();
  if (!hook) return "";

  const url = metadata?.articleUrl?.trim();
  if (url) {
    return `${hook}\n\nFull analysis: ${url}`;
  }
  return hook;
}

/**
 * Truncate a string to maxLen at word boundary (never mid-word).
 */
function truncateAtWord(str, maxLen) {
  if (str.length <= maxLen) return str;
  const truncated = str.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace).trimEnd();
  }
  return truncated.trimEnd();
}

/**
 * Truncate a string to maxLen at sentence boundary.
 * Keeps complete sentences. If a single sentence exceeds maxLen, falls back to word boundary.
 */
function truncateAtSentence(str, maxLen) {
  if (str.length <= maxLen) return str;

  // Try to cut at sentence boundary
  const sentences = str.split(/(?<=[.!?\n])\s+/);
  let result = "";
  for (const sentence of sentences) {
    if ((result + " " + sentence).trim().length > maxLen) break;
    result = (result + " " + sentence).trim();
  }

  if (result.length === 0) {
    // Single sentence too long — fall back to word boundary
    return truncateAtWord(str, maxLen);
  }
  return result;
}

/**
 * Check if a title contains at least one SEO keyword.
 */
function hasSeoKeyword(text, primaryEntity) {
  const lower = text.toLowerCase();
  const keywords = getSeoKeywords(primaryEntity);
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Derive title from scene data.
 *
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {Object} [metadata] - Optional metadata { title, description, hashtags }
 * @param {Object} limits - Platform caption limits (injected from the profile
 *   by the publish-package generator — no local copies, #219 T02)
 * @param {number} limits.maxLength - max title chars
 * @returns {string} Title <= limits.maxLength chars
 */
export function deriveTitle(scenes, metadata, limits) {
  if (!limits || typeof limits.maxLength !== "number") {
    throw new Error(
      "deriveTitle: limits.maxLength (from the platform profile) is required — " +
        "caption limits are platform rules, not hardcoded values (#219 T02)",
    );
  }
  const maxLen = limits.maxLength;

  // Use metadata if provided and non-empty
  if (metadata?.title && metadata.title.trim().length > 0) {
    let title = metadata.title.trim();

    // S6: truncate to <= maxLen chars at word boundary
    title = truncateAtWord(title, maxLen);

    // S14: append SEO keyword if missing
    if (!hasSeoKeyword(title, metadata?.primaryEntity)) {
      const suffix = " | China AI";
      const truncated = truncateAtWord(title, maxLen - suffix.length);
      title = truncated + suffix;
    }

    return title;
  }

  // S2: auto-derive from scene 1
  const hook = scenes[0];
  if (!hook) return "";

  const vo = hook.voiceover || "";
  const texts = hook.texts || {};

  // Extract focus words from texts (line1, line2, title, etc.)
  const textWords = [];
  for (const [key, val] of Object.entries(texts)) {
    if (typeof val === "string" && val.length > 0) {
      textWords.push(val);
    }
  }

  // Strategy: combine text focus words with key entities from voiceover
  // Try: "{textFocus} {entity}'s {number} {action}"
  // Simpler: take first sentence, condense

  const firstSentence = vo.split(/(?<=[.!?])\s+/)[0].trim();

  // Build a title: prefer text words + key info from voiceover
  let title = "";

  if (textWords.length > 0) {
    // Use first text word as prefix
    title = textWords[0] + ": " + firstSentence;
  } else {
    title = firstSentence;
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Truncate to maxLen chars
  title = truncateAtWord(title, maxLen);

  // Ensure SEO keyword
  if (!hasSeoKeyword(title, metadata?.primaryEntity) && title.length > 0) {
    // Try to append SEO keyword
    const suffix = " | China AI";
    if (title.length + suffix.length <= maxLen) {
      title = title + suffix;
    } else {
      // Replace last few words
      const truncated = truncateAtWord(title, maxLen - suffix.length);
      title = truncated + suffix;
    }
  }

  return title;
}

/**
 * Derive description from scene data.
 *
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {Object} [metadata] - Optional metadata { title, description, hashtags }
 * @param {Object} limits - Platform caption limits (injected from the profile)
 * @param {number} limits.maxLength - max description chars
 * @returns {string} Description <= limits.maxLength chars (includes CTA, NOT hashtags)
 */
export function deriveDescription(scenes, metadata, limits) {
  if (!limits || typeof limits.maxLength !== "number") {
    throw new Error(
      "deriveDescription: limits.maxLength (from the platform profile) is required — " +
        "caption limits are platform rules, not hardcoded values (#219 T02)",
    );
  }
  const maxLen = limits.maxLength;

  // Use metadata if provided and non-empty
  if (metadata?.description && metadata.description.trim().length > 0) {
    let desc = metadata.description.trim();
    // Ensure CTA at end
    if (!/follow|subscribe/i.test(desc)) {
      desc = desc + "\nFollow for more China AI news.";
    }
    // Truncate to maxLen chars at sentence boundary
    return truncateAtSentence(desc, maxLen);
  }

  // S2: auto-derive from all scenes
  const CTA = "\nFollow for more China AI news.";
  const MAX_DESC_LEN = maxLen;

  const sentences = [];

  for (const scene of scenes) {
    const vo = scene?.voiceover || "";
    // Take first sentence of each scene
    const firstSent = vo.split(/(?<=[.!?])\s+/)[0].trim();
    if (firstSent.length > 0) {
      sentences.push(firstSent);
    }
  }

  // Join with newlines
  let body = sentences.join("\n");

  // Ensure primary entity is mentioned in the description for SEO.
  const primaryEntity = metadata?.primaryEntity;
  if (primaryEntity && !new RegExp(primaryEntity, "i").test(body)) {
    body = `${primaryEntity} analysis.\n` + body;
  }

  // Truncate body first, then add CTA (CTA is always preserved)
  body = truncateAtSentence(body, MAX_DESC_LEN - CTA.length);

  return body + CTA;
}

/**
 * Normalize a hashtag value to canonical form.
 *
 * - Accepts string only; rejects null, undefined, numbers, arrays.
 * - Trims whitespace, removes leading #, lowercases.
 * - Rejects empty values and values with internal whitespace.
 * - Returns null for invalid input.
 *
 * TikTok hashtags are case-insensitive (verified 2026-08-26 via multiple
 * sources: buffer.com, headlinecapitalization.com, integritive.com).
 * Lowercasing does not affect search weight, distribution, or algorithm matching.
 *
 * @param {*} value - Raw hashtag value (string, possibly with #, any case)
 * @returns {string|null} Normalized hashtag (e.g. "#aiviral") or null
 */
export function normalizeHashtag(value) {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (s.length === 0) return null;
  s = s.replace(/^#/, ""); // Remove leading #
  s = s.toLowerCase(); // Case-insensitive on TikTok
  if (s.length === 0 || /\s/.test(s)) return null; // Reject empty or whitespace-containing
  return `#${s}`;
}

/**
 * Derive hashtags from scene data.
 *
 * Strategy (researched 2026-08-08, updated 2026-08-26):
 * - 3-5 hashtags total (CapCut/TikTok official recommendation)
 * - Wrong tags → wrong audience → quick scroll → algorithm penalty
 * - Fewer is better than wrong
 *
 * Selection logic:
 * 1. Always include #ainews (core traffic, best ROI)
 * 2. Always include #chinaai (brand niche)
 * 3. Match entity hashtags from keyEntities (primary = companies[0], secondary = companies[1+])
 * 4. Pad with #ai/#artificialintelligence/#technews if < 3
 * 5. Merge trending hashtags from metadata.trendingHashtags (max 1):
 *    - If tags.length < 5: add trending tag directly
 *    - If tags.length >= 5: replace the last secondary vertical or pad candidate
 *    - Primary entity tag is never replaced
 * 6. Truncate to max 5
 *
 * Manual override: if metadata.hashtags is non-empty, it is a locked override.
 * trendingHashtags is NOT injected into the manual override path.
 * To use trending tags with manual override, add them to metadata.hashtags directly.
 *
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {Object} [metadata] - Optional metadata { title, description, hashtags, trendingHashtags, keyEntitiesCompanies }
 * @param {Object} limits - Platform hashtag limits (injected from the profile)
 * @param {number} limits.min - min hashtag count
 * @param {number} limits.max - max hashtag count
 * @returns {string[]} Array of limits.min–limits.max hashtags
 */
export function deriveHashtags(scenes, metadata, limits) {
  if (!limits || typeof limits.min !== "number" || typeof limits.max !== "number") {
    throw new Error(
      "deriveHashtags: limits.min/max (from the platform profile) are required — " +
        "hashtag limits are platform rules, not hardcoded values (#219 T02)",
    );
  }
  // ─── Manual override (locked) ───
  if (metadata?.hashtags && Array.isArray(metadata.hashtags) && metadata.hashtags.length > 0) {
    let tags = metadata.hashtags
      .map(normalizeHashtag)
      .filter((t) => t !== null && !BLACKLISTED_HASHTAGS.includes(t));
    // Deduplicate
    tags = [...new Set(tags)];
    if (tags.length > limits.max) tags = tags.slice(0, limits.max);
    if (tags.length < limits.min) {
      for (const broad of [...DEFAULT_HASHTAGS, ...PAD_CANDIDATES]) {
        if (!tags.includes(broad) && !BLACKLISTED_HASHTAGS.includes(broad)) tags.push(broad);
        if (tags.length >= limits.min) break;
      }
    }
    while (tags.length < limits.min) tags.push("#technews");
    return tags;
  }

  // ─── Auto-derive from keyEntities (NOT from voiceover full-text) ───
  const companies = metadata?.keyEntitiesCompanies || [];

  // Layer 1: Core traffic (always include)
  const coreTags = ["#ainews"];
  // Layer 2: Brand (always include)
  const brandTags = ["#chinaai"];
  // Layer 3: Primary vertical (companies[0] — not replaceable by trending)
  let primaryVerticalTag = null;
  // Layer 4: Secondary vertical (companies[1+] — replaceable by trending)
  const secondaryVerticalTags = [];

  for (let i = 0; i < companies.length; i++) {
    const key = companies[i].toLowerCase();
    if (ENTITY_HASHTAG_MAP[key]) {
      const tag = ENTITY_HASHTAG_MAP[key]; // Already lowercase
      if (i === 0) {
        primaryVerticalTag = tag;
      } else {
        if (!secondaryVerticalTags.includes(tag)) {
          secondaryVerticalTags.push(tag);
        }
      }
    }
  }

  // Build ordered tag list: core + brand + primary + secondary
  let tags = [...coreTags, ...brandTags];
  if (primaryVerticalTag) tags.push(primaryVerticalTag);
  tags.push(...secondaryVerticalTags);

  // Deduplicate
  tags = [...new Set(tags)];

  // Layer 5: Pad candidates (replaceable by trending)
  const padTagsAdded = [];
  if (tags.length < limits.min) {
    for (const broad of [...DEFAULT_HASHTAGS, ...PAD_CANDIDATES]) {
      if (!tags.includes(broad) && !BLACKLISTED_HASHTAGS.includes(broad)) {
        tags.push(broad);
        padTagsAdded.push(broad);
      }
      if (tags.length >= limits.min) break;
    }
  }
  while (tags.length < limits.min) {
    tags.push("#technews");
    padTagsAdded.push("#technews");
  }

  // ─── Merge trending hashtags (max 1) ───
  const trendingRaw = metadata?.trendingHashtags || [];
  if (Array.isArray(trendingRaw) && trendingRaw.length > 0) {
    // Normalize and filter trending candidates
    const trendingNormalized = trendingRaw
      .map(normalizeHashtag)
      .filter((t) => t !== null && !BLACKLISTED_HASHTAGS.includes(t));

    // Find the first trending tag not already in tags
    let trendingTag = null;
    for (const t of trendingNormalized) {
      if (!tags.includes(t)) {
        trendingTag = t;
        break;
      }
    }

    if (trendingTag) {
      if (tags.length < limits.max) {
        // Room to add directly
        tags.push(trendingTag);
      } else {
        // tags.length >= max: need to replace a replaceable tag
        // Priority for replacement: last secondary vertical, then last pad
        let replaceIdx = -1;

        // Find last secondary vertical tag in tags
        for (let i = tags.length - 1; i >= 0; i--) {
          if (secondaryVerticalTags.includes(tags[i])) {
            replaceIdx = i;
            break;
          }
        }

        // If no secondary vertical, find last pad tag
        if (replaceIdx === -1) {
          for (let i = tags.length - 1; i >= 0; i--) {
            if (padTagsAdded.includes(tags[i])) {
              replaceIdx = i;
              break;
            }
          }
        }

        if (replaceIdx >= 0) {
          tags[replaceIdx] = trendingTag;
        }
        // If no replaceable tag found, discard trending tag
      }
    }
  }

  // Truncate to max
  if (tags.length > limits.max) tags = tags.slice(0, limits.max);
  // Filter blacklisted
  tags = tags.filter((t) => !BLACKLISTED_HASHTAGS.includes(t));

  return tags;
}

/**
 * Classify final hashtags into strategy categories for analytics transparency.
 *
 * In auto-derive mode, trending tags are those from metadata.trendingHashtags
 * that made it into the final set. In manual override mode (metadata.hashtags
 * non-empty), trending is always empty — trendingHashtags is NOT injected
 * into the manual path (see deriveHashtags()), so classifying a tag as
 * "trending" would be a source attribution error.
 *
 * @param {string[]} hashtags - Final hashtag array (from deriveHashtags)
 * @param {Object} metadata - Scene metadata
 * @returns {{traffic: string[], brand: string[], vertical: string[], trending: string[], selectionMode: "auto"|"manual"}}
 */
export function classifyHashtags(hashtags, metadata) {
  const trafficSet = ["#ainews", "#technews", "#ai", "#news"];
  const brandSet = ["#chinaai"];

  const hasManualOverride =
    metadata?.hashtags && Array.isArray(metadata.hashtags) && metadata.hashtags.length > 0;
  const selectionMode = hasManualOverride ? "manual" : "auto";

  // Trending only classified in auto mode
  let trending = [];
  if (selectionMode === "auto") {
    const trendingSourceTags = (metadata?.trendingHashtags || [])
      .map((t) => {
        if (typeof t !== "string") return null;
        return t.trim().toLowerCase().replace(/^#/, "");
      })
      .filter(Boolean);
    trending = hashtags.filter((t) => {
      const normalized = t.replace(/^#/, "");
      return trendingSourceTags.includes(normalized);
    });
  }

  const traffic = hashtags.filter((t) => trafficSet.includes(t));
  const brand = hashtags.filter((t) => brandSet.includes(t));
  const vertical = hashtags.filter(
    (t) => !trafficSet.includes(t) && !brandSet.includes(t) && !trending.includes(t),
  );

  return { traffic, brand, vertical, trending, selectionMode };
}
