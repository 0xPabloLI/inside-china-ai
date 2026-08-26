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
 * #creatorsearchinsights: our analytics data shows it attracts wrong audience
 * (search queries "creator insights part 3 4 5" instead of topic keywords).
 * See: docs/research/tiktok-competitor-intelligence.md §3.2
 */
const BLACKLISTED_HASHTAGS = [
  "#creatorsearchinsights",
];

/**
 * Vertical / entity hashtags — precision targeting.
 * Looked up from meta.keyEntities.companies (NOT from voiceover full-text).
 */
const ENTITY_HASHTAG_MAP = {
  deepseek: "#deepseek",
  openai: "#chatgpt",
  bytedance: "#bytedance",
  doubao: "#doubao",
  feishu: "#feishu",
  lark: "#feishu",
  qwen: "#qwen",
  alibaba: "#alibaba",
  tencent: "#tencent",
  baidu: "#baidu",
  nvidia: "#nvidia",
  zhipu: "#zhipu",
  moonshot: "#kimi",
  minimax: "#minimax",
  huawei: "#huawei",
  xiaomi: "#xiaomi",
  iflytek: "#iflytek",
  sensetime: "#sensetime",
};

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
 * @returns {string} Title <= 60 chars
 */
export function deriveTitle(scenes, metadata) {
  // Use metadata if provided and non-empty
  if (metadata?.title && metadata.title.trim().length > 0) {
    let title = metadata.title.trim();

    // S6: truncate to <= 60 chars at word boundary
    title = truncateAtWord(title, 60);

    // S14: append SEO keyword if missing
    if (!hasSeoKeyword(title, metadata?.primaryEntity)) {
      const suffix = " | China AI";
      const truncated = truncateAtWord(title, 60 - suffix.length);
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

  const firstSentence = vo.split(/[.!?]/)[0].trim();

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

  // Truncate to 60 chars
  title = truncateAtWord(title, 60);

  // Ensure SEO keyword
  if (!hasSeoKeyword(title, metadata?.primaryEntity) && title.length > 0) {
    // Try to append SEO keyword
    const suffix = " | China AI";
    if (title.length + suffix.length <= 60) {
      title = title + suffix;
    } else {
      // Replace last few words
      const truncated = truncateAtWord(title, 60 - suffix.length);
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
 * @returns {string} Description <= 2200 chars (includes CTA, NOT hashtags)
 */
export function deriveDescription(scenes, metadata) {
  // Use metadata if provided and non-empty
  if (metadata?.description && metadata.description.trim().length > 0) {
    let desc = metadata.description.trim();
    // Ensure CTA at end
    if (!/follow|subscribe/i.test(desc)) {
      desc = desc + "\nFollow for more China AI news.";
    }
    // Truncate to 2200 chars at sentence boundary
    return truncateAtSentence(desc, 2200);
  }

  // S2: auto-derive from all scenes
  const CTA = "\nFollow for more China AI news.";
  const MAX_DESC_LEN = 2200;

  const sentences = [];

  for (const scene of scenes) {
    const vo = scene?.voiceover || "";
    // Take first sentence of each scene
    const firstSent = vo.split(/[.!?]/)[0].trim();
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
 * Derive hashtags from scene data.
 *
 * Strategy (researched 2026-08-08):
 * - 3-5 hashtags total (CapCut/TikTok official recommendation)
 * - Wrong tags → wrong audience → quick scroll → algorithm penalty
 * - Fewer is better than wrong
 *
 * Selection logic:
 * 1. Always include #ainews (core traffic, best ROI)
 * 2. Always include #chinaai (brand niche)
 * 3. Match entity hashtags from content (1-2)
 * 4. Pad with #technews if < 3
 * 5. Truncate to max 5
 * 6. If trending tags from Creative Center are provided in metadata.trendingHashtags,
 *    and they're relevant, include 1 (replacing a less important tag)
 *
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {Object} [metadata] - Optional metadata { title, description, hashtags, trendingHashtags }
 * @returns {string[]} Array of 3-5 hashtags
 */
export function deriveHashtags(scenes, metadata) {
  // Use metadata.hashtags if explicitly provided (manual override)
  if (metadata?.hashtags && Array.isArray(metadata.hashtags) && metadata.hashtags.length > 0) {
    let tags = [...metadata.hashtags];
    tags = tags.filter((t) => !BLACKLISTED_HASHTAGS.includes(t));
    if (tags.length > 5) tags = tags.slice(0, 5);
    if (tags.length < 3) {
      for (const broad of [...DEFAULT_HASHTAGS, ...PAD_CANDIDATES]) {
        if (!tags.includes(broad) && !BLACKLISTED_HASHTAGS.includes(broad)) tags.push(broad);
        if (tags.length >= 3) break;
      }
    }
    return tags;
  }

  // Auto-derive from keyEntities (NOT from voiceover full-text)
  const companies = metadata?.keyEntitiesCompanies || [];
  const matchedTags = new Set();

  // Always include #ainews (best ROI)
  matchedTags.add("#ainews");
  // Always include #chinaai (brand niche)
  matchedTags.add("#chinaai");

  // Match entity hashtags from keyEntities only
  for (const company of companies) {
    const key = company.toLowerCase();
    if (ENTITY_HASHTAG_MAP[key]) {
      matchedTags.add(ENTITY_HASHTAG_MAP[key]);
    }
  }

  let tags = Array.from(matchedTags);

  // Pad to min 3
  if (tags.length < 3) {
    for (const broad of [...DEFAULT_HASHTAGS, ...PAD_CANDIDATES]) {
      if (!tags.includes(broad) && !BLACKLISTED_HASHTAGS.includes(broad)) tags.push(broad);
      if (tags.length >= 3) break;
    }
  }
  while (tags.length < 3) tags.push("#technews");

  // Truncate to max 5
  if (tags.length > 5) tags = tags.slice(0, 5);
  // Filter blacklisted
  tags = tags.filter((t) => !BLACKLISTED_HASHTAGS.includes(t));

  return tags;
}
