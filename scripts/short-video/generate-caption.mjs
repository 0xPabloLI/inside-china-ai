#!/usr/bin/env node
/**
 * TikTok Caption Generator
 *
 * Generates tiktok-caption.txt (human: paste into TikTok) and
 * tiktok-metadata.json (program: for ISSUE-01 API publishing).
 *
 * Usage:
 *   node scripts/short-video/generate-caption.mjs   # standalone
 *   # or auto-called by verify-video.mjs when all checks pass
 *
 * Reads:  scripts/short-video/scene-data.mjs (scenes + optional metadata)
 * Writes: output/tiktok-caption.txt, output/tiktok-metadata.json
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { deriveTitle, deriveDescription, deriveHashtags } from "./lib/caption-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "output");
const SCENE_DATA_PATH = join(__dirname, "scene-data.mjs");
const CAPTION_TXT_PATH = join(OUTPUT_DIR, "tiktok-caption.txt");
const METADATA_JSON_PATH = join(OUTPUT_DIR, "tiktok-metadata.json");

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

  if (!scenes || scenes.length === 0) {
    console.error("❌ No scenes found in scene-data.mjs");
    process.exit(1);
  }

  // ─── Derive caption components ───
  const title = deriveTitle(scenes, metadata);
  const description = deriveDescription(scenes, metadata);
  const hashtags = deriveHashtags(scenes, metadata);

  // ─── Assemble caption text ───
  const hashtagLine = hashtags.join(" ");
  const captionText = `${title}\n\n${description}\n\n${hashtagLine}\n`;

  // ─── Assemble metadata JSON ───
  const metadataJson = {
    title,
    description: `${description}\n\n${hashtagLine}`,
    hashtags,
    generatedAt: new Date().toISOString(),
    source: metadata ? "scene-data-metadata" : "auto-derived",
  };

  // ─── Ensure output directory exists ───
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ─── Write files ───
  writeFileSync(CAPTION_TXT_PATH, captionText, "utf8");
  writeFileSync(METADATA_JSON_PATH, JSON.stringify(metadataJson, null, 2) + "\n", "utf8");

  console.log("📝 Caption generated:");
  console.log(`   Title:       ${title} (${title.length} chars)`);
  console.log(`   Description: ${description.length} chars (incl. CTA)`);
  console.log(`   Hashtags:    ${hashtags.join(" ")} (${hashtags.length})`);
  console.log(`   Total caption: ${captionText.length} chars (limit: 2200)`);
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
