/**
 * Caption derivation utilities for TikTok/YouTube/Reels post text.
 *
 * Pure functions — no file IO, no side effects.
 * Used by generate-caption.mjs and testable in isolation.
 */

// ─── Entity → Hashtag mapping table ───

const ENTITY_HASHTAG_MAP = [
  { keywords: ["deepseek", "深度求索"], hashtag: "#deepseek" },
  { keywords: ["china", "chinese", "中国"], hashtag: "#chinaai" },
  { keywords: ["ai", "artificial intelligence", "人工智能", "大模型"], hashtag: "#ai" },
  { keywords: ["open source", "open-source", "开源"], hashtag: "#opensource" },
  { keywords: ["nvidia"], hashtag: "#nvidia" },
  { keywords: ["bytedance", "字节跳动"], hashtag: "#bytedance" },
  { keywords: ["alibaba", "阿里"], hashtag: "#alibaba" },
  { keywords: ["tencent", "腾讯"], hashtag: "#tencent" },
  { keywords: ["baidu", "百度"], hashtag: "#baidu" },
  { keywords: ["funding", "investment", "融资", "投资"], hashtag: "#technews" },
];

const DEFAULT_BROAD_HASHTAGS = ["#chinaai", "#ai", "#technews"];

const SEO_KEYWORDS = ["china", "ai", "deepseek"];

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
function hasSeoKeyword(text) {
  const lower = text.toLowerCase();
  return SEO_KEYWORDS.some((kw) => lower.includes(kw));
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
    if (!hasSeoKeyword(title)) {
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
  if (!hasSeoKeyword(title) && title.length > 0) {
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
  const maxBodyLen = MAX_DESC_LEN - CTA.length;

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

  // Ensure SEO keywords present
  if (!/deepseek/i.test(body)) {
    body = "DeepSeek analysis.\n" + body;
  }

  // Truncate body first, then add CTA (CTA is always preserved)
  body = truncateAtSentence(body, maxBodyLen);

  return body + CTA;
}

/**
 * Derive hashtags from scene data.
 *
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {Object} [metadata] - Optional metadata { title, description, hashtags }
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
      for (const broad of DEFAULT_BROAD_HASHTAGS) {
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

  // Always include #chinaai (core niche)
  matchedTags.add("#chinaai");

  // Match entities
  for (const entry of ENTITY_HASHTAG_MAP) {
    // Skip #chinaai since already added
    if (entry.hashtag === "#chinaai") {
      if (!entry.keywords.some((kw) => allText.includes(kw))) {
        // Don't force it if no China keyword — but we always include it anyway
      }
      continue;
    }
    if (entry.keywords.some((kw) => allText.includes(kw))) {
      matchedTags.add(entry.hashtag);
    }
  }

  // Convert to array
  let tags = Array.from(matchedTags);

  // S4: pad to min 3
  if (tags.length < 3) {
    for (const broad of DEFAULT_BROAD_HASHTAGS) {
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
