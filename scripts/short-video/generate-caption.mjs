#!/usr/bin/env node
/**
 * TikTok Caption Generator
 *
 * Generates tiktok-caption.txt (human: paste into TikTok) and
 * tiktok-metadata.json (program: for ISSUE-01 API publishing).
 *
 * Usage:
 *   node scripts/short-video/generate-caption.mjs               # standalone (root scene-data)
 *   node scripts/short-video/generate-caption.mjs --content <dir>  # content pipeline
 *   # or auto-called by verify-video.mjs when all checks pass
 *
 * Reads:  scripts/short-video/{scene-data.mjs | content/<dir>/scene-data.mjs}
 * Writes: output/tiktok-caption.txt, output/tiktok-metadata.json
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  deriveTitle,
  deriveDescription,
  deriveHashtags,
  derivePinnedComment,
} from "./lib/caption-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const contentFlag = args.indexOf("--content");
const contentDir = contentFlag >= 0 ? args[contentFlag + 1] : "";

// ─── Per-content output dir (when --content is used) ───
const OUTPUT_DIR = contentDir ? join(__dirname, "output", contentDir) : join(__dirname, "output");
const SCENE_DATA_PATH = contentDir
  ? join(__dirname, "content", contentDir, "scene-data.mjs")
  : join(__dirname, "scene-data.mjs");
const META_PATH = contentDir
  ? join(__dirname, "content", contentDir, "meta.mjs")
  : join(__dirname, "meta.mjs");
const CAPTION_TXT_PATH = join(OUTPUT_DIR, "tiktok-caption.txt");
const METADATA_JSON_PATH = join(OUTPUT_DIR, "tiktok-metadata.json");

/**
 * Convert a raw entity string (e.g. "moonshot", "frontier_security")
 * to display format ("Moonshot", "Frontier Security").
 */
function formatEntityName(raw) {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function main() {
  // ─── Load scene data ───
  let scenes, metadata;
  try {
    const mod = await import(`file://${SCENE_DATA_PATH}`);
    scenes = mod.scenes || mod.default?.scenes;
    metadata = mod.metadata || mod.default?.metadata;
  } catch (e) {
    console.error(`❌ Failed to load scene-data.mjs: ${e.message}`);
    process.exit(1);
  }

  // ─── Load meta.mjs for primary entity + keyEntities ───
  let primaryEntity = null;
  let keyEntitiesCompanies = [];
  if (existsSync(META_PATH)) {
    try {
      const metaMod = await import(`file://${META_PATH}`);
      const meta = metaMod.meta || metaMod.default?.meta;
      if (meta?.keyEntities?.companies?.length > 0) {
        primaryEntity = formatEntityName(meta.keyEntities.companies[0]);
        keyEntitiesCompanies = meta.keyEntities.companies;
      }
    } catch (e) {
      console.log(`  ⚠️ meta.mjs found but failed to load: ${e.message}`);
    }
  }
  // Enrich metadata with primary entity + keyEntities
  metadata = { ...(metadata || {}), primaryEntity, keyEntitiesCompanies };

  if (!scenes || scenes.length === 0) {
    console.error("❌ No scenes found in scene-data.mjs");
    process.exit(1);
  }

  // ─── Derive caption components ───
  const title = deriveTitle(scenes, metadata);
  const description = deriveDescription(scenes, metadata);
  const hashtags = deriveHashtags(scenes, metadata);
  const pinnedComment = derivePinnedComment(scenes, metadata);

  // ─── Assemble caption text (one-block format for TikTok) ───
  // TikTok has no title field — caption is a single text block.
  // Title hook sentence is the first line of description.
  const hashtagLine = hashtags.join(" ");
  const captionText = `${description}\n\n${hashtagLine}\n`;

  // ─── Assemble metadata JSON ───
  // Categorize hashtags for transparency
  const trafficHashtags = hashtags.filter((t) =>
    ["#ainews", "#technews", "#ai", "#news"].includes(t),
  );
  const brandHashtags = hashtags.filter((t) => t === "#chinaai");
  // Trending hashtags are those from metadata.trendingHashtags that made it into the final set
  const trendingSourceTags = (metadata?.trendingHashtags || [])
    .map((t) => {
      // Normalize for comparison (lowercase, strip #)
      if (typeof t !== "string") return null;
      return t.trim().toLowerCase().replace(/^#/, "");
    })
    .filter(Boolean);
  const trendingHashtags = hashtags.filter((t) => {
    const normalized = t.replace(/^#/, "");
    return trendingSourceTags.includes(normalized);
  });
  const verticalHashtags = hashtags.filter(
    (t) =>
      !["#ainews", "#technews", "#ai", "#news", "#chinaai"].includes(t) &&
      !trendingHashtags.includes(t),
  );

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
      rule: "3-5 hashtags, wrong tags → wrong audience → algorithm penalty",
      researchedAt: "2026-08-08",
      dataSource: "tiktokhashtags.com + TikTok Creative Center + competitor analysis",
    },
    pinnedComment,
    generatedAt: new Date().toISOString(),
    source: metadata ? "scene-data-metadata" : "auto-derived",
  };

  // ─── Ensure output directory exists ───
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ─── Write files ───
  const PINNED_COMMENT_PATH = join(OUTPUT_DIR, "tiktok-pinned-comment.txt");

  writeFileSync(CAPTION_TXT_PATH, captionText, "utf8");
  writeFileSync(METADATA_JSON_PATH, JSON.stringify(metadataJson, null, 2) + "\n", "utf8");
  writeFileSync(PINNED_COMMENT_PATH, pinnedComment, "utf8");

  console.log("📝 Caption generated:");
  console.log(`   Title (SEO): ${title} (${title.length} chars)`);
  console.log(`   Description: ${description.length} chars (incl. CTA)`);
  console.log(`   Hashtags:    ${hashtags.join(" ")} (${hashtags.length})`);
  console.log(`   Total caption: ${captionText.length} chars (limit: 2200)`);
  console.log(`   Pinned comment: ${pinnedComment || "(none — AITL not set)"}`);
  console.log(`   Source:      ${metadataJson.source}`);
  console.log(`\n📁 Files written:`);
  console.log(`   ${CAPTION_TXT_PATH}`);
  console.log(`   ${METADATA_JSON_PATH}`);

  // ─── Validate constraints ───
  const violations = [];
  if (title.length > 60) {
    violations.push(`Title exceeds 60 chars (${title.length})`);
  }
  if (captionText.length > 2200) {
    violations.push(`Caption exceeds 2200 chars (${captionText.length})`);
  }
  if (hashtags.length < 3 || hashtags.length > 5) {
    violations.push(`Hashtag count out of range [3-5] (${hashtags.length})`);
  }

  if (violations.length > 0) {
    console.error("\n❌ Constraint violations:");
    for (const v of violations) {
      console.error(`   • ${v}`);
    }
    process.exit(1);
  } else {
    console.log("\n✅ All constraints satisfied (title ≤60, caption ≤2200, 3-5 hashtags)");
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
