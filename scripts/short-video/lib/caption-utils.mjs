/**
 * Caption derivation utilities for TikTok/YouTube/Reels post text.
 *
 * Pure functions — no file IO, no side effects.
 * Used by generate-caption.mjs and testable in isolation.
 *
 * Hashtag strategy researched 2026-08-08 via:
 * - tiktokhashtags.com (real view/post data from TikTok API cache)
 * - TikTok Creative Center (trending hashtags, Tech & Electronics industry)
 * - TikTok search (successful competitor hashtag analysis)
 * See: docs/tiktok/tiktok-best-practices.md → Hashtag Strategy section
 */

// ─── Curated Hashtag Pools (researched 2026-08-08) ───
//
// Data sources: tiktokhashtags.com (cached TikTok API data),
// TikTok Creative Center, TikTok search competitor analysis.
// Refresh guidance: Agent checks Creative Center trending each video run.

/**
 * Core traffic hashtags — low competition, high precision.
 * Always include 1-2 of these.
 */
const CORE_TRAFFIC_HASHTAGS = [
  "#ainews", // 68.7M views, 8.9K posts — best ROI
  "#technews", // 1B views, 78.4K posts — tech news specific
];

/**
 * Auxiliary traffic hashtags — broader reach, higher competition.
 * Pick 0-1 based on content focus.
 */
const AUXILIARY_TRAFFIC_HASHTAGS = [
  "#ai", // mega traffic, broad AI recognition
  "#chinaai", // niche brand hashtag, always relevant
];

/**
 * Vertical / entity hashtags — precision targeting.
 * Pick 1-2 based on video content (auto-derived from entity matching).
 */
const ENTITY_HASHTAG_MAP = [
  { keywords: ["deepseek", "深度求索"], hashtag: "#deepseek" },
  { keywords: ["openai", "gpt", "chatgpt", "sam altman"], hashtag: "#chatgpt" },
  { keywords: ["openai"], hashtag: "#openai" },
  { keywords: ["bytedance", "字节跳动", "douyin"], hashtag: "#bytedance" },
  { keywords: ["alibaba", "阿里", "qwen", "通义"], hashtag: "#alibaba" },
  { keywords: ["tencent", "腾讯", "hunyuan", "混元"], hashtag: "#tencent" },
  { keywords: ["baidu", "百度", "ernie", "文心"], hashtag: "#baidu" },
  { keywords: ["nvidia", "黄仁勋"], hashtag: "#nvidia" },
  { keywords: ["zhipu", "智谱", "glm"], hashtag: "#zhipu" },
  { keywords: ["moonshot", "kimi", "月之暗面"], hashtag: "#kimi" },
  { keywords: ["minimax", " minimax"], hashtag: "#minimax" },
  { keywords: ["huawei", "华为", "pangu", "盘古"], hashtag: "#huawei" },
  { keywords: ["xiaomi", "小米"], hashtag: "#xiaomi" },
  { keywords: ["iflytek", "科大讯飞"], hashtag: "#iflytek" },
  { keywords: ["sensetime", "商汤"], hashtag: "#sensetime" },
  { keywords: ["future", "未来", "前沿"], hashtag: "#futuretech" },
  { keywords: ["china", "chinese", "中国"], hashtag: "#chinanews" },
  { keywords: ["funding", "investment", "融资", "投资", "round"], hashtag: "#technews" },
  { keywords: ["open source", "open-source", "开源"], hashtag: "#opensource" },
];

/**
 * Default hashtags when no metadata and no entity match.
 * Combines core traffic + brand niche.
 */
const DEFAULT_HASHTAGS = ["#ainews", "#chinaai", "#technews"];

/**
 * @deprecated Use DEFAULT_HASHTAGS instead. Kept for backward compat.
 */
const DEFAULT_BROAD_HASHTAGS = DEFAULT_HASHTAGS;

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

/**
 * Comment hook templates — pick based on what the video contains.
 * Each returns a question string designed to elicit comments.
 */
const COMMENT_HOOK_TEMPLATES = [
  // Number-based: "X or Y — which surprised you more?"
  (entities) => {
    const nums = entities.numbers;
    if (nums.length >= 2) {
      return `${nums[0]} or ${nums[1]} — which surprised you more?`;
    }
    return null;
  },
  // Entity-based: "Will [company] catch up to [competitor]?"
  (entities) => {
    const companies = entities.companies;
    if (companies.length >= 2) {
      return `Will ${companies[0]} catch up to ${companies[1]}? Why or why not?`;
    }
    return null;
  },
  // Single entity: "What's your take on [company]?"
  (entities) => {
    if (entities.companies.length >= 1) {
      return `What's your take on ${entities.companies[0]}? Overhyped or underrated?`;
    }
    return null;
  },
  // Generic fallback
  () => `Did this change your mind about China AI? Let me know below 👇`,
];

/**
 * Extract entities from scene data for comment hook generation.
 * @returns {{ numbers: string[], companies: string[] }}
 */
function extractEntities(scenes) {
  const allText = scenes
    .map((s) => {
      const vo = s?.voiceover || "";
      const texts = JSON.stringify(s?.texts || {});
      return vo + " " + texts;
    })
    .join(" ");

  // Extract dollar amounts and large numbers
  const numbers = [];
  const dollarMatches = allText.match(/\$?[\d.]+\s*(?:billion|million|B|M)\b/gi);
  if (dollarMatches) {
    numbers.push(...dollarMatches.slice(0, 3).map((m) => m.replace(/\s+/g, " ")));
  }

  // Extract company names (known set + capitalized words)
  const knownCompanies = [
    "DeepSeek",
    "ByteDance",
    "Alibaba",
    "Tencent",
    "Baidu",
    "Alibaba",
    "Huawei",
    "Xiaomi",
    "OPPO",
    "vivo",
    "Zhipu",
    "MoonShot",
    "Kimi",
    "MiniMax",
    "01.AI",
    "StepFun",
    "Baichuan",
    "iFlytek",
    "SenseTime",
  ];
  const companies = [];
  for (const company of knownCompanies) {
    if (new RegExp(company, "i").test(allText) && !companies.includes(company)) {
      companies.push(company);
    }
  }

  return { numbers, companies: companies.slice(0, 3) };
}

/**
 * Derive a comment hook — a question appended to the caption
 * to encourage viewers to comment.
 *
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {Object} [metadata] - Optional metadata
 * @returns {string} A question string
 */
export function deriveCommentHook(scenes, metadata) {
  // Use metadata if provided
  if (metadata?.commentHook && metadata.commentHook.trim().length > 0) {
    return metadata.commentHook.trim();
  }

  const entities = extractEntities(scenes);
  for (const template of COMMENT_HOOK_TEMPLATES) {
    const hook = template(entities);
    if (hook) return hook;
  }
  return COMMENT_HOOK_TEMPLATES[COMMENT_HOOK_TEMPLATES.length - 1](entities);
}

/**
 * Derive a pinned comment — the first comment to post and pin
 * after publishing. Combines article link (if available) with
 * a comment hook.
 *
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {Object} [metadata] - Optional metadata { articleUrl, commentHook }
 * @returns {string} Pinned comment text
 */
export function derivePinnedComment(scenes, metadata) {
  const hook = deriveCommentHook(scenes, metadata);
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
  // Generate comment hook for this video
  const commentHook = deriveCommentHook(scenes, metadata);

  // Use metadata if provided and non-empty
  if (metadata?.description && metadata.description.trim().length > 0) {
    let desc = metadata.description.trim();
    // Append comment hook before CTA
    desc = desc + "\n\n" + commentHook;
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
  const commentHookLine = "\n\n" + commentHook;
  const maxBodyLen = MAX_DESC_LEN - CTA.length - commentHookLine.length;

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
  // Uses metadata.primaryEntity (derived from meta.keyEntities.companies[0])
  // instead of hardcoding "deepseek". If no primary entity is set, skip —
  // the description already contains company names from scene voiceovers.
  const primaryEntity = metadata?.primaryEntity;
  if (primaryEntity && !new RegExp(primaryEntity, "i").test(body)) {
    body = `${primaryEntity} analysis.\n` + body;
  }

  // Truncate body first, then add CTA (CTA is always preserved)
  body = truncateAtSentence(body, maxBodyLen);

  return body + commentHookLine + CTA;
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
  // Use metadata if provided and non-empty
  if (metadata?.hashtags && Array.isArray(metadata.hashtags) && metadata.hashtags.length > 0) {
    let tags = [...metadata.hashtags];

    // S5: truncate to max 5
    if (tags.length > 5) {
      tags = tags.slice(0, 5);
    }

    // S4: pad to min 3 if too few
    if (tags.length < 3) {
      for (const broad of DEFAULT_HASHTAGS) {
        if (!tags.includes(broad)) {
          tags.push(broad);
        }
        if (tags.length >= 3) break;
      }
    }

    return tags;
  }

  // S2: auto-derive from entity matching
  const allText = scenes
    .map((s) => {
      const vo = (s?.voiceover || "").toLowerCase();
      const texts = JSON.stringify(s?.texts || "").toLowerCase();
      return vo + " " + texts;
    })
    .join(" ");

  const matchedTags = new Set();

  // Always include #ainews (best ROI: 68.7M views, low competition)
  matchedTags.add("#ainews");

  // Always include #chinaai (brand niche hashtag)
  matchedTags.add("#chinaai");

  // Match entities from content
  for (const entry of ENTITY_HASHTAG_MAP) {
    if (entry.keywords.some((kw) => allText.includes(kw))) {
      matchedTags.add(entry.hashtag);
    }
  }

  // Convert to array
  let tags = Array.from(matchedTags);

  // S4: pad to min 3 with core traffic hashtags
  if (tags.length < 3) {
    for (const broad of DEFAULT_HASHTAGS) {
      if (!tags.includes(broad)) {
        tags.push(broad);
      }
      if (tags.length >= 3) break;
    }
  }

  // S5: truncate to max 5
  if (tags.length > 5) {
    tags = tags.slice(0, 5);
  }

  return tags;
}
