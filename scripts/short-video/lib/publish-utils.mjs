/**
 * Publish utilities for TikTok via Publora REST API.
 *
 * Pure functions — no network IO, no side effects.
 * Used by publish-tiktok.mjs and testable in isolation.
 */

import { existsSync, statSync } from "fs";
import { resolve } from "path";
import { validateSeriesMeta, getSeriesHashtag } from "./series-meta.mjs";

const CAPTION_MAX = 2200;

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
 * Note: Publora may invert allow* booleans to TikTok's disable_* flags.
 * Test with SELF_ONLY before trusting values.
 *
 * @param {Object} [options] - Override defaults
 * @param {string} [options.viewerSetting="PUBLIC_TO_EVERYONE"]
 * @param {boolean} [options.allowComments=true]
 * @param {boolean} [options.allowDuet=false]
 * @param {boolean} [options.allowStitch=false]
 * @param {boolean} [options.commercialContent=false]
 * @param {boolean} [options.brandOrganic=false]
 * @param {boolean} [options.brandedContent=false]
 * @returns {Object} { tiktok: { ... } }
 */
export function buildTiktokSettings(options = {}) {
  const {
    viewerSetting = "PUBLIC_TO_EVERYONE",
    allowComments = true,
    allowDuet = false,
    allowStitch = false,
    commercialContent = false,
    brandOrganic = false,
    brandedContent = false,
  } = options;

  // TikTok commercial disclosure rule
  if (commercialContent && !(brandOrganic || brandedContent)) {
    throw new Error(
      "commercialContent=true requires brandOrganic or brandedContent to also be true (TikTok commercial disclosure rule).",
    );
  }

  return {
    tiktok: {
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

  // Check size (Publora limit: 150MB for videos)
  const MAX_SIZE = 150 * 1024 * 1024; // 150MB
  if (stat.size > MAX_SIZE) {
    return {
      valid: false,
      error: `Video file too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (limit: 150MB)`,
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
