/**
 * Platform publish-package generator (#219 ticket 02).
 *
 * Evolved from the TikTok-only generate-caption.mjs hardcode:
 *   - one package per REGISTERED platform profile — new platforms come online
 *     by registering a profile, not by touching this module
 *   - packages land in output/{pipelineId}/publish/{platform}/ (S1), separated
 *     from kernel artifacts; regeneration is idempotent (S5)
 *   - caption/hashtag limits come from the profile — the review's "no third
 *     copy" convergence: generate-caption.mjs / publish-utils.mjs /
 *     caption-utils.mjs local literals were all removed
 *
 * Consumers:
 *   - generate-caption.mjs (CLI shell — loads scene-data/meta, calls
 *     generatePublishPackages, exits non-zero on violations)
 *   - verify-video.mjs (B6 checks each platform's caption against ITS limit)
 *   - publish-tiktok.mjs (reads the metadata file via packageFilePaths)
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  deriveTitle,
  deriveDescription,
  deriveHashtags,
  derivePinnedComment,
  classifyHashtags,
} from "../caption-utils.mjs";
import { listPlatformProfiles } from "./index.mjs";

/**
 * Package file paths for one platform — the single source of publish-path
 * truth. Every consumer (generator, verify B6, publisher, docs) derives the
 * layout from here; nothing constructs `publish/{platform}/...` by hand.
 *
 * @param {object} p
 * @param {string} p.outputRoot - scripts/short-video/output (or a test root)
 * @param {string} [p.pipelineId] - content dir name; omitted in standalone mode
 * @param {object} p.profile - platform profile (getPlatformProfile / list)
 * @returns {{dir: string, caption: string, metadata: string, pinnedComment: string}}
 */
export function packageFilePaths({ outputRoot, pipelineId, profile }) {
  const dir = join(outputRoot, ...(pipelineId ? [pipelineId] : []), "publish", profile.platform);
  return {
    dir,
    caption: join(dir, `${profile.platform}-caption.txt`),
    metadata: join(dir, `${profile.platform}-metadata.json`),
    pinnedComment: join(dir, `${profile.platform}-pinned-comment.txt`),
  };
}

/**
 * Convert a raw entity string (e.g. "moonshot", "frontier_security") to
 * display format ("Moonshot", "Frontier Security").
 */
function formatEntityName(raw) {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Caption-limit injection guard — limits are platform rules (#219 T02). */
function requireLimits(limits, fnName) {
  const ok =
    limits &&
    typeof limits.title === "number" &&
    typeof limits.description === "number" &&
    typeof limits.hashtags?.min === "number" &&
    typeof limits.hashtags?.max === "number";
  if (!ok) {
    throw new Error(
      `${fnName}: limits {title, description, hashtags:{min,max}} (from the ` +
        `platform profile) are required — caption limits are platform rules, ` +
        `not hardcoded values (#219 T02)`,
    );
  }
}

/**
 * Build one platform's publish package from scene data.
 * Pure: no I/O. Caption/hashtag limits are read from the profile and injected
 * into the generic caption-utils derivations.
 *
 * @param {object} profile - platform profile
 * @param {object} p
 * @param {Array} p.scenes - scene list (scene-data.mjs)
 * @param {object} [p.metadata] - scene-data metadata
 * @param {object} [p.meta] - meta.mjs payload (keyEntities, manual hashtags)
 * @returns {{title, description, hashtags, captionText, metadataJson, pinnedComment, violations}}
 */
export function buildPublishPackage(profile, { scenes, metadata, meta } = {}) {
  const limits = {
    title: profile.caption.titleMaxLength,
    description: profile.caption.maxLength,
    hashtags: { min: profile.hashtags.min, max: profile.hashtags.max },
  };
  requireLimits(limits, `buildPublishPackage(${profile.platform})`);

  // ─── Enrich metadata (primary entity + keyEntities + manual hashtag override) ───
  let primaryEntity = null;
  let keyEntitiesCompanies = [];
  let metaHashtags = null;
  if (meta?.keyEntities?.companies?.length > 0) {
    primaryEntity = formatEntityName(meta.keyEntities.companies[0]);
    keyEntitiesCompanies = meta.keyEntities.companies;
  }
  if (meta?.hashtags && Array.isArray(meta.hashtags) && meta.hashtags.length > 0) {
    metaHashtags = meta.hashtags;
  }
  const enriched = {
    ...(metadata || {}),
    primaryEntity,
    keyEntitiesCompanies,
    ...(metaHashtags ? { hashtags: metaHashtags } : {}),
  };

  if (!scenes || scenes.length === 0) {
    throw new Error("No scenes found in scene-data.mjs");
  }

  // ─── Derive caption components (platform limits injected) ───
  const title = deriveTitle(scenes, enriched, { maxLength: limits.title });
  const description = deriveDescription(scenes, enriched, { maxLength: limits.description });
  const hashtags = deriveHashtags(scenes, enriched, limits.hashtags);
  const pinnedComment = derivePinnedComment(scenes, enriched);

  // ─── Assemble caption text (one-block format) ───
  // TikTok has no title field — caption is a single text block; the title hook
  // sentence is the first line of the description.
  const hashtagLine = hashtags.join(" ");
  const captionText = `${description}\n\n${hashtagLine}\n`;

  // ─── Assemble metadata JSON ───
  // classifyHashtags returns {traffic, brand, vertical, trending, selectionMode}
  // In manual override mode, trending is always [] (P2 fix, review 2026-08-26)
  const {
    traffic: trafficHashtags,
    brand: brandHashtags,
    vertical: verticalHashtags,
    trending: trendingHashtags,
    selectionMode,
  } = classifyHashtags(hashtags, enriched);

  const metadataJson = {
    title,
    description: `${description}\n\n${hashtagLine}`,
    hashtags,
    hashtagStrategy: {
      total: hashtags.length,
      traffic: trafficHashtags,
      vertical: verticalHashtags,
      brand: brandHashtags,
      trending: trendingHashtags,
      selectionMode,
      rule: "3-5 hashtags, wrong tags → wrong audience → algorithm penalty",
      researchedAt: "2026-08-08",
      dataSource: "tiktokhashtags.com + TikTok Creative Center + competitor analysis",
    },
    pinnedComment,
    generatedAt: new Date().toISOString(),
    source: metadata ? "scene-data-metadata" : "auto-derived",
  };

  // ─── Validate constraints against the profile ───
  const violations = [];
  if (title.length > limits.title) {
    violations.push(`Title exceeds ${limits.title} chars (${title.length})`);
  }
  if (captionText.length > limits.description) {
    violations.push(`Caption exceeds ${limits.description} chars (${captionText.length})`);
  }
  if (hashtags.length < limits.hashtags.min || hashtags.length > limits.hashtags.max) {
    violations.push(
      `Hashtag count out of range [${limits.hashtags.min}-${limits.hashtags.max}] (${hashtags.length})`,
    );
  }

  return { title, description, hashtags, captionText, metadataJson, pinnedComment, violations };
}

/**
 * Write one platform's package files. Only the publish dir is touched —
 * kernel artifacts (final video / audio / subtitles) are never written here (S5).
 */
export function writePublishPackage(paths, pkg) {
  if (!existsSync(paths.dir)) {
    mkdirSync(paths.dir, { recursive: true });
  }
  writeFileSync(paths.caption, pkg.captionText, "utf8");
  writeFileSync(paths.metadata, JSON.stringify(pkg.metadataJson, null, 2) + "\n", "utf8");
  writeFileSync(paths.pinnedComment, pkg.pinnedComment, "utf8");
}

/**
 * Generate publish packages for ALL registered platform profiles.
 *
 * @param {object} p
 * @param {string} p.outputRoot
 * @param {string} [p.pipelineId]
 * @param {Array} p.scenes
 * @param {object} [p.metadata]
 * @param {object} [p.meta]
 * @returns {Array<{platform: string, paths: object, pkg: object, violations: string[]}>}
 */
export function generatePublishPackages({ outputRoot, pipelineId, scenes, metadata, meta } = {}) {
  return listPlatformProfiles().map((profile) => {
    const pkg = buildPublishPackage(profile, { scenes, metadata, meta });
    const paths = packageFilePaths({ outputRoot, pipelineId, profile });
    writePublishPackage(paths, pkg);
    return { platform: profile.platform, paths, pkg, violations: pkg.violations };
  });
}
