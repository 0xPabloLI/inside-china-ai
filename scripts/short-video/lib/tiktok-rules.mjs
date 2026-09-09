/**
 * TikTok Best Practices — Shared Rules Configuration (Single Source of Truth)
 *
 * All configurable rule constants for TikTok best practices compliance.
 * Consumed by scene-rules.mjs, verify-video.mjs, and tiktok-rules-sync.test.mjs.
 *
 * Source: docs/tiktok/tiktok-best-practices.md (audit checklist B1-B9, W1-W9)
 *         docs/refs/tiktok-skills/ (community skill references)
 *
 * #219 ticket 01: numeric thresholds (THRESHOLDS) now live in the TikTok
 * platform profile (lib/platforms/tiktok.mjs — spec
 * docs/specs/spec-platform-profile-isolation.md) and are derived from it here,
 * keeping this module's import surface unchanged for consumers.
 */

import { getPlatformProfile } from "./platforms/index.mjs";

const TIKTOK_PROFILE = getPlatformProfile("tiktok");

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

/**
 * Known China AI companies for subject visibility check (#199 2.7).
 * Lowercase display names matched against rendered copy — distinct from
 * asset-sourcer.mjs's private KNOWN_COMPANIES (mixed-case search keywords
 * extracted from voiceover). Intentionally not unified.
 */
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
// Numeric thresholds declared in the TikTok platform profile
// (lib/platforms/tiktok.mjs) and derived from it — do not add numeric
// literals here; edit the profile instead.

export const THRESHOLDS = TIKTOK_PROFILE.thresholds;
