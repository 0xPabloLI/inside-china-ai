/**
 * Publish utilities for TikTok via Publora REST API.
 *
 * Pure functions — no network IO, no side effects.
 * Used by publish-tiktok.mjs and testable in isolation.
 */

import { existsSync, statSync } from "fs";
import { resolve } from "path";
import { validateSeriesMeta, getSeriesHashtag } from "./series-meta.mjs";
import { getPlatformProfile } from "./platforms/index.mjs";

// Caption/file limits come from the TikTok platform profile (#219 T02 —
// single-path convergence; no local literal copies).
const CAPTION_MAX = getPlatformProfile("tiktok").caption.maxLength;
const VIDEO_MAX_SIZE_BYTES = getPlatformProfile("tiktok").video.maxSizeBytes;

/**
 * Truncate a string at sentence boundary.
 */
function truncateAtSentence(str, maxLen) {
  if (str.length <= maxLen) return str;
  const sentences = str.split(/(?<=[.!?\n])\s+/);
  let result = "";
  for (const sentence of sentences) {
    if ((result + " " + sentence).trim().length > maxLen) break;
    result = (result + " " + sentence).trim();
  }
  if (result.length === 0) {
    return str.slice(0, maxLen).trimEnd();
  }
  return result;
}

/**
 * Build the full caption string from tiktok-metadata.json.
 * Format: title + "\n\n" + description (description includes hashtags).
 *
 * @param {Object} metadata - { title, description, hashtags, ... }
 * @returns {string} Caption <= 2200 chars
 */
export function buildCaption(metadata) {
  if (!metadata || typeof metadata !== "object") return "";

  const title = metadata.title?.trim() || "";
  const description = metadata.description?.trim() || "";

  let caption = "";
  if (title && description) {
    caption = title + "\n\n" + description;
  } else if (title) {
    caption = title;
  } else if (description) {
    caption = description;
  }

  return truncateAtSentence(caption, CAPTION_MAX);
}

/**
 * Build TikTok platform settings for Publora API.
 *
 * Defaults come from the TikTok platform profile (privacy/commerce groups) —
 * the profile is the single source (#219 T03; the pre-T03 local literals were
 * a mirror copy). Explicit options still win (e.g. SELF_ONLY for testing).
 *
 * Note: Publora may invert allow* booleans to TikTok's disable_* flags.
 * Test with SELF_ONLY before trusting values.
 *
 * @param {Object} [options] - Override profile defaults
 * @param {string} [options.viewerSetting]
 * @param {boolean} [options.allowComments]
 * @param {boolean} [options.allowDuet]
 * @param {boolean} [options.allowStitch]
 * @param {boolean} [options.commercialContent]
 * @param {boolean} [options.brandOrganic]
 * @param {boolean} [options.brandedContent]
 * @param {Object} [profile] - Injected profile (defaults to the TikTok profile)
 * @returns {Object} { [platform]: { ... } }
 */
export function buildTiktokSettings(options = {}, profile = getPlatformProfile("tiktok")) {
  const {
    viewerSetting = profile.privacy.defaultViewerSetting,
    allowComments = profile.privacy.allowComments,
    allowDuet = profile.privacy.allowDuet,
    allowStitch = profile.privacy.allowStitch,
    commercialContent = profile.commerce.defaultCommercialContent,
    brandOrganic = profile.commerce.defaultBrandOrganic,
    brandedContent = profile.commerce.defaultBrandedContent,
  } = options;

  // TikTok commercial disclosure rule — enforced from the profile declaration
  if (
    profile.commerce.commercialContentRequiresBrand &&
    commercialContent &&
    !(brandOrganic || brandedContent)
  ) {
    throw new Error(
      "commercialContent=true requires brandOrganic or brandedContent to also be true (TikTok commercial disclosure rule).",
    );
  }

  return {
    [profile.platform]: {
      viewerSetting,
      allowComments,
      allowDuet,
      allowStitch,
      commercialContent,
      brandOrganic,
      brandedContent,
    },
  };
}

// ─── Publish method resolution (HITL gate, #219 T03) ───

/**
 * Resolve the publish method for a platform run, enforcing the profile's
 * publish HITL gate (spec Implementation Decisions 4).
 *
 * - Default (no automation requested): the profile's publishMethod — for
 *   TikTok `manual-guide`, where the human executes the checklist (the HITL
 *   confirmation point itself).
 * - Automation request ({auto:true}): allowed ONLY when the profile enables
 *   that method — per-platform authorization + sandbox verification land
 *   there before `api`/`cdp` can run. Fail-closed otherwise.
 *
 * @param {Object} profile - Platform profile
 * @param {Object} [opts]
 * @param {boolean} [opts.auto=false] - Automation path requested (--auto)
 * @param {string} [opts.method] - Explicit method override (must be enabled)
 * @returns {string} Resolved publish method
 * @throws {Error} Fail-closed when the requested method is not enabled
 */
export function resolvePublishMethod(profile, opts = {}) {
  if (opts.method !== undefined) {
    if (!profile.enabledPublishMethods.includes(opts.method)) {
      throw new Error(
        `Publish method "${opts.method}" is not enabled for platform "${profile.platform}" ` +
          `(enabled: ${profile.enabledPublishMethods.join(", ")}). ` +
          `Automation paths require per-platform authorization ` +
          `(spec: docs/specs/spec-platform-profile-isolation.md, Implementation Decisions 4).`,
      );
    }
    return opts.method;
  }

  if (opts.auto) {
    if (!profile.enabledPublishMethods.includes("api")) {
      throw new Error(
        `API auto-publish is not enabled for platform "${profile.platform}" ` +
          `(enabled: ${profile.enabledPublishMethods.join(", ")}). ` +
          `The default publish method is "${profile.publishMethod}". ` +
          `Automation paths require per-platform authorization + sandbox verification ` +
          `(spec: docs/specs/spec-platform-profile-isolation.md, Implementation Decisions 4).`,
      );
    }
    return "api";
  }

  return profile.publishMethod;
}

/**
 * Validate a video file for TikTok publishing.
 *
 * @param {string} videoPath - Path to the video file
 * @returns {Object} { valid: boolean, error?: string, size?: number }
 */
export function validateVideoFile(videoPath) {
  const absPath = resolve(videoPath);

  if (!existsSync(absPath)) {
    return { valid: false, error: `Video file not found: ${absPath}` };
  }

  const stat = statSync(absPath);

  // Check extension
  if (!absPath.toLowerCase().endsWith(".mp4")) {
    return { valid: false, error: `Video file must be MP4 format (got: ${absPath})` };
  }

  // Check size (Publora limit — platform profile video.maxSizeBytes)
  if (stat.size > VIDEO_MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `Video file too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (limit: ${(VIDEO_MAX_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB)`,
    };
  }

  // Check minimum size (empty file)
  if (stat.size === 0) {
    return { valid: false, error: "Video file is empty (0 bytes)" };
  }

  return { valid: true, size: stat.size };
}

// ─── Pending Analysis (ISSUE-19) ───

/**
 * Build the pending-analysis.json content for a published video.
 * suggestedAnalysisTime = publishedAt + 48 hours.
 *
 * @param {string} postGroupId - Publora post group ID
 * @param {string} publishedAt - ISO timestamp of publish time
 * @returns {{ postGroupId: string, publishedAt: string, suggestedAnalysisTime: string, status: string }}
 */
export function buildPendingAnalysis(postGroupId, publishedAt) {
  const publishedDate = new Date(publishedAt);
  const suggestedDate = new Date(publishedDate.getTime() + 48 * 60 * 60 * 1000); // +48h

  return {
    postGroupId,
    publishedAt,
    suggestedAnalysisTime: suggestedDate.toISOString(),
    status: "pending",
  };
}

/**
 * Build the analytics guidance message printed after successful publish.
 */
export function buildAnalyticsGuidance(outputDir) {
  return [
    "",
    "📊 Analytics Reminder:",
    "  TikTok analytics data typically takes 24-48h to populate.",
    "  Once available:",
    `    1. Export CSV from https://analytics.tiktok.com`,
    `    2. Run: node scripts/short-video/fetch-tiktok-analytics.mjs --csv <csv-path>`,
    `    3. Run: node scripts/short-video/ab-test-tracker.mjs --result ${outputDir}/analytics-export.json`,
    `  Pending analysis file: ${outputDir}/pending-analysis.json`,
  ].join("\n");
}

// ─── TikTok URL Construction ───

/**
 * Build a full TikTok video URL from a postedId returned by Publora.
 *
 * @param {string} postedId - TikTok video ID (numeric string from Publora get-post response)
 * @returns {string} Full TikTok URL: https://www.tiktok.com/@chinaainews/video/{postedId}
 */
export function buildTikTokUrl(postedId) {
  return `https://www.tiktok.com/@chinaainews/video/${postedId}`;
}

// ─── Series Support (ISSUE-22) ───

/**
 * Build caption with series hashtag and part number.
 *
 * @param {Object} metadata - { title, description, hashtags }
 * @param {Object} seriesMeta - { seriesId, partNumber, totalParts, ... }
 * @returns {string} Caption with series info, <= 2200 chars
 */
export function buildSeriesCaption(metadata, seriesMeta) {
  const validation = validateSeriesMeta(seriesMeta);
  if (!validation.valid) {
    throw new Error(`Invalid seriesMeta: ${validation.errors.join(", ")}`);
  }

  const baseCaption = buildCaption(metadata);
  const hashtag = getSeriesHashtag(seriesMeta);
  const partInfo = `Part ${seriesMeta.partNumber}/${seriesMeta.totalParts}`;
  const seriesLine = `${partInfo} ${hashtag}`;

  const caption = `${baseCaption}\n\n${seriesLine}`;
  return truncateAtSentence(caption, CAPTION_MAX);
}

/**
 * Build pinned comment content linking to prev/next parts.
 *
 * @param {Object} seriesMeta - { partNumber, totalParts, prevPartSlug?, nextPartSlug? }
 * @returns {string} Pinned comment text
 */
export function buildSeriesPinnedComment(seriesMeta) {
  const validation = validateSeriesMeta(seriesMeta);
  if (!validation.valid) {
    throw new Error(`Invalid seriesMeta: ${validation.errors.join(", ")}`);
  }

  const { partNumber, totalParts, prevPartSlug, nextPartSlug, seriesId } = seriesMeta;
  const lines = [`Part ${partNumber}/${totalParts} of the ${seriesId} series`];

  if (partNumber > 1 && prevPartSlug) {
    lines.unshift(`Part 1: ${prevPartSlug}`);
  }

  if (partNumber < totalParts && nextPartSlug) {
    lines.push(`Part ${partNumber + 1} coming soon!`);
  }

  return lines.join("\n\n");
}

// ─── Manual Publishing Guide (zero-views fix) ───

/**
 * Build the manual publishing guide for a platform.
 *
 * The checklist is rendered FROM the platform profile's manualGuide.steps
 * (#219 T03 — the profile is the single source; no mirror copy). `label` is
 * the exact line template ({videoPath}/{slug} substituted); `detail` lines
 * render indented beneath. Steps flagged `omitWithoutAIVoice` swap to the
 * profile's aiDisclosure.noVoiceLabel line when no AI voice is detected.
 *
 * The intro (zero-views rationale), caption block and footer (posting time,
 * analytics) are renderer framing.
 *
 * @param {Object} params
 * @param {string} params.videoPath - Absolute path to the MP4 file
 * @param {string} params.caption - Full caption text (<= 2200 chars)
 * @param {string} [params.articleSlug] - Post slug for pinned comment URL
 * @param {boolean} [params.hasAIVoice=true] - Whether AI-generated voice is used
 * @param {string} [params.exampleEntity] - Primary entity for examples (e.g. "DeepSeek")
 * @param {Object} [params.profile] - Injected profile (defaults to the TikTok profile)
 * @returns {string} Formatted manual publishing guide
 */
export function buildManualPublishGuide({
  videoPath,
  caption,
  articleSlug,
  hasAIVoice = true,
  exampleEntity = "company",
  profile = getPlatformProfile("tiktok"),
}) {
  const slug = articleSlug || `${exampleEntity.replace(/\s/g, "-")}-news`;
  const substitutions = { videoPath, slug };
  const fill = (text) => text.replace(/\{(videoPath|slug)\}/g, (_, key) => substitutions[key]);

  const checklist = [];
  let stepNumber = 0;
  for (const step of profile.manualGuide.steps) {
    stepNumber += 1;
    if (step.omitWithoutAIVoice && !hasAIVoice) {
      checklist.push(`  [ ] ${stepNumber}. ${profile.aiDisclosure.noVoiceLabel}`);
      continue;
    }
    checklist.push(`  [ ] ${stepNumber}. ${fill(step.label)}`);
    for (const detail of step.detail ?? []) {
      checklist.push(`         ${fill(detail)}`);
    }
  }

  const lines = [
    "",
    "=".repeat(60),
    `📤 ${profile.displayName} Manual Publishing Guide`,
    "=".repeat(60),
    "",
    "⚠️  API Auto-Publish is DISABLED (zero-views prevention).",
    "   Publishing via API bypasses critical algorithm signals:",
    "   AIGC label, trending audio, in-app editing, geographic tag.",
    "   Manual in-app publishing is REQUIRED for video visibility.",
    "",
    `🎬 Video file: ${videoPath}`,
    "",
    "📋 Caption (copy to TikTok description field):",
    "─".repeat(50),
    caption,
    "─".repeat(50),
    "",
    "✅ Manual Publishing Checklist:",
    ...checklist,
    "",
    "⏰  Best posting time: 2-4 PM or 10 PM-12 AM (off-peak hours)",
    "    Off-peak = less competition = algorithm more likely to test your video.",
    "",
    "📊 After 48h: Export analytics from https://analytics.tiktok.com",
    "=".repeat(60),
  ];

  return lines.join("\n");
}

/**
 * Build the warning message shown when --auto flag is used.
 *
 * @returns {string} Warning text
 */
export function buildAutoPublishWarning() {
  return [
    "",
    "⚠️  ⚠️  ⚠️  WARNING: API Auto-Publish Mode  ⚠️  ⚠️  ⚠️",
    "=".repeat(60),
    "Publishing via Publora API bypasses critical TikTok algorithm signals:",
    "",
    "  ❌ No AIGC label      → TikTok penalizes unlabeled AI content",
    "  ❌ No trending audio   → Missing discoverability boost",
    "  ❌ No in-app editing    → Missing algorithm favor signal",
    "  ❌ No geographic tag   → Missing local content priority",
    "  ❌ No first-hour engagement → Missing engagement signal",
    "",
    "These are the TOP causes of zero views on TikTok.",
    "Manual in-app publishing is strongly recommended.",
    "",
    "To use manual mode (default): remove the --auto flag",
    "=".repeat(60),
    "",
  ].join("\n");
}
