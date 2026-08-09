/**
 * TikTok Best Practices — Shared Rules Configuration (Single Source of Truth)
 *
 * All configurable rule constants for TikTok best practices compliance.
 * Consumed by scene-rules.mjs, verify-video.mjs, and tiktok-rules-sync.test.mjs.
 *
 * Source: docs/tiktok/tiktok-best-practices.md (audit checklist B1-B9, W1-W9)
 *         docs/refs/tiktok-skills/ (community skill references)
 */

// ─── AI Vocabulary Blacklist ───
// Source: tiktok-best-practices.md "词汇黑名单" section
// Any of these words in voiceover = FAIL (audit checklist B7)

export const AI_BLACKLIST = [
  // 书面化动词
  "leverage",
  "utilize",
  "facilitate",
  "streamline",
  "robust",
  "seamless",
  "delve",
  "navigate",
  "unlock",
  "harness",
  "foster",
  "cultivate",
  // 书面化副词
  "fundamentally",
  "essentially",
  "ultimately",
  "crucially",
  "notably",
  "moreover",
  "furthermore",
  // 书面化名词
  "myriad",
  "paradigm",
  "ecosystem",
  "landscape",
  "realm",
  "tapestry",
  "journey",
  // 陈词滥调
  "game-changer",
  "deep dive",
  "at the end of the day",
  "dive in",
  "it's not just",
  "in today's fast-paced world",
  // 开场废话
  "hey guys",
  "what's up everyone",
  "without further ado",
  // AI 工具标记 (safety net for LLM-assisted scene-data)
  "oaicite",
  "contentreference",
  "turn0search0",
  // AI 知识截止
  "as of my last update",
  "i cannot browse",
  // AI 模板
  "[your name]",
  "[insert hook]",
  "[brand]",
  // AI 包装语
  "certainly!",
  "sure, here is",
  "i hope this helps",
];

// ─── Pattern Constants ───

/** B1: Em/en/double dash detection */
export const DASH_PATTERN = /\u2014|\u2013|--/;

/** B9: Dead closer phrases in last scene */
export const DEAD_CLOSER_PATTERN =
  /thanks for watching|don't forget to (like|subscribe)|subscribe for more|what do you think|drop your thoughts|let me know in the comments|hit subscribe/i;

/** Hook compelling element: strong words */
export const STRONG_WORD_PATTERN =
  /\b(leaked|paused|crash|surge|breakthrough|exclusive|secret|revealed|banned|crisis|first|never|only)\b/i;

/** Hook compelling element: numbers */
export const NUMBER_PATTERN = /\$?\d+[.,]?\d*\s*(billion|million|thousand|%|B|M|K)?/i;

/** B3: Written-style opener detection */
export const WRITTEN_OPENER_PATTERN =
  /in this video,? i will|today i want to talk about|in this video,? we will|today we're going to/i;

/** Source attribution pattern */
export const SOURCE_PATTERN =
  /\b(reported|said|told|according to|revealed|stated|announced|confirmed|bloomberg|reuters|ft|wall street journal|sources?)\b/i;

/** CTA detection pattern */
export const CTA_PATTERN =
  /follow|subscribe|like|comment|share|save|download|click|sign up|check out|visit/gi;

/** Clickbait pattern detection */
export const CLICKBAIT_PATTERNS = [
  /\byou won't believe\b/i,
  /\bshocking truth\b/i,
  /\bthis will blow your mind\b/i,
  /\bclick here\b/i,
];

/** Cross-platform watermark detection */
export const WATERMARK_PATTERN = /@instagram|@youtube|@facebook|tiktok watermark|repost from/i;

/** B2: Greeting detection — checks first 3 words of Hook VO */
export const GREETING_PATTERN =
  /\b(hey|hi|hello|what's up|welcome back|good morning|good evening|yo|sup)\b/i;

/** Named source pattern for unverified claims check */
export const NAMED_SOURCE_PATTERN =
  /\b(according to|reported by|bloomberg|reuters|FT|wall street journal)\b/i;

// ─── Keyword Lists ───

/** SEO target keywords — must appear in ≥2 scenes each.
 * "china" and "ai" are universal (channel name). Company-specific keywords
 * (e.g. "deepseek", "kimi") are NOT hardcoded — they come from the video's
 * own content and meta data. */
export const TARGET_KEYWORDS = ["china", "ai"];

/** Known China AI companies for subject visibility check */
export const KNOWN_COMPANIES = [
  "deepseek",
  "huawei",
  "zhipu",
  "moonshot",
  "kimi",
  "minimax",
  "baidu",
  "alibaba",
  "tencent",
  "bytedance",
];

// ─── Thresholds ───
// Centralized numeric thresholds for all checks.
// Drift detection test validates these match documented values.

export const THRESHOLDS = {
  /** Max voiceover words for 60-70s target (2.5 wps) */
  maxVoiceoverWords: 180,

  /** Max words per sentence for one-breath check */
  maxOneBreathWords: 25,

  /** Min scene count */
  minScenes: 6,

  /** Max scene count */
  maxScenes: 10,

  /** B4: Hook VO vs text overlap — FAIL threshold (≥ this = Blocker) */
  hookTextOverlapFailThreshold: 0.8,

  /** Body-scene VO duplication: on-screen text repeating a verbatim VO
      phrase of ≥ this many words (normalized) = three-tier repetition */
  bodyTextDuplicateMinWords: 4,

  /** B4: Hook VO vs text overlap — WARN threshold (≥ this, < fail = Warning) */
  hookTextOverlapWarnThreshold: 0.5,

  /** Min source attribution scenes */
  minSourceScenes: 2,

  /** Min SEO keyword scenes */
  minKeywordScenes: 2,

  /** Min ratio of scenes with data points */
  minDataSceneRatio: 0.5,

  /** Teleprompter rhythm: max deviation from average (fraction) */
  teleprompterMaxDeviation: 0.15,

  /** CTA stacking: count per scene that triggers warning */
  ctaStackThreshold: 3,

  /** Max goal signals before warning */
  maxGoalSignals: 2,

  /** Caption max length (API limit) */
  maxCaptionLength: 2200,

  /** Title max length */
  maxTitleLength: 60,

  /** Min hashtags */
  minHashtags: 3,

  /** Max hashtags */
  maxHashtags: 5,

  /** Hook greeting: max words to check from start */
  greetingCheckWords: 3,
};
