#!/usr/bin/env node
/**
 * TikTok Creative Center Trending Hashtag Snapshot
 *
 * Fetches trending hashtags from TikTok Creative Center via web-access CDP.
 * Matches against provided keywords to find relevant trending tags for a video.
 * Output is written to output/trending-snapshots/<date>.json and can be used
 * in scene-data's metadata.trendingHashtags field.
 *
 * Usage:
 *   node scripts/short-video/snapshot-trending.mjs
 *   node scripts/short-video/snapshot-trending.mjs --keywords "deepseek,ai,qwen"
 *   node scripts/short-video/snapshot-trending.mjs --period 30 --region US
 *
 * Options:
 *   --keywords <comma-sep>  Keywords from video content to match against trending tags
 *   --period <7|30|90>      Trending period (default: 7)
 *   --region <code>        Region code (default: US)
 *   --output <path>        Output file path (default: output/trending-snapshots/<date>.json)
 *
 * Requires: Chrome with TikTok Creative Center access via web-access CDP.
 * The Agent typically runs this during Stage 3 Step 7 of the content pipeline.
 *
 * See: docs/tiktok/tiktok-best-practices.md → TikTok Creative Center Trending 检查
 *      docs/content-pipeline.md Stage 3 Step 7
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output", "trending-snapshots");

// ─── CLI args ───
const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultVal;
}

const keywordsArg = getArg("keywords", "");
const period = getArg("period", "7");
const region = getArg("region", "US");
const outputPath = getArg("output", null);

const keywords = keywordsArg
  ? keywordsArg
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
  : [];

// ─── Trending Hashtag Fetching via CDP ───
//
// This script is designed to be run by the Agent using web-access CDP.
// The Agent will:
// 1. Open the Creative Center URL in Chrome
// 2. Wait for the page to render
// 3. Extract trending hashtag data from the DOM
// 4. Pass the results to this script (or this script triggers CDP itself)
//
// Since CDP access is handled by the Agent (not this script), this script
// provides:
// - A URL generator for the Creative Center
// - A matching function to find relevant trending tags
// - A snapshot writer for historical data
// - A format compatible with scene-data metadata.trendingHashtags

/**
 * Generate the Creative Center URL for trending hashtags.
 */
export function getCreativeCenterUrl(period, region) {
  return `https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?period=${period}&region=${region}`;
}

/**
 * Match trending hashtags against provided keywords.
 * Returns trending tags that are relevant to the video content.
 *
 * @param {Array} trendingTags - Array of { name, views, posts, trend } from CDP
 * @param {string[]} keywords - Keywords from video content
 * @returns {Array} Relevant trending tags sorted by relevance
 */
export function matchTrendingTags(trendingTags, keywords) {
  if (!trendingTags || trendingTags.length === 0) return [];
  if (!keywords || keywords.length === 0) return [];

  const matched = [];

  for (const tag of trendingTags) {
    const tagName = (tag.name || "").toLowerCase().replace(/^#/, "");

    // Check if any keyword is contained in the tag name or vice versa
    const isRelevant = keywords.some(
      (kw) =>
        tagName.includes(kw) ||
        kw.includes(tagName) ||
        // Also check if the tag name contains a substring of the keyword
        (kw.length > 3 && tagName.includes(kw.slice(0, Math.min(kw.length, 5)))),
    );

    if (isRelevant) {
      matched.push({
        ...tag,
        matchedKeywords: keywords.filter(
          (kw) =>
            tagName.includes(kw) ||
            kw.includes(tagName) ||
            (kw.length > 3 && tagName.includes(kw.slice(0, 5))),
        ),
      });
    }
  }

  // Sort by views descending
  matched.sort((a, b) => (b.views || 0) - (a.views || 0));

  return matched;
}

/**
 * Build a snapshot object from trending data.
 */
export function buildSnapshot(trendingTags, matchedTags, keywords, period, region) {
  return {
    snapshotDate: new Date().toISOString(),
    period,
    region,
    keywords,
    totalTrendingTags: trendingTags.length,
    matchedTags: matchedTags.length,
    trendingTags: trendingTags.slice(0, 50), // Keep top 50 for reference
    matchedTrendingTags: matchedTags,
    creativeCenterUrl: getCreativeCenterUrl(period, region),
    note:
      matchedTags.length === 0
        ? "No trending tags matched video keywords. Using curated hashtag pool."
        : `${matchedTags.length} trending tag(s) matched. Consider adding to metadata.trendingHashtags.`,
  };
}

/**
 * Write snapshot to output/trending-snapshots/<date>.json
 */
export function writeSnapshot(snapshot, customPath) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath =
    customPath || join(OUTPUT_DIR, `trending-${dateStr}.json`);

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  return filePath;
}

/**
 * Format output for Agent consumption.
 * The Agent reads this output and decides which tags to use.
 */
export function formatForAgent(snapshot) {
  const lines = [
    `📸 Trending Snapshot — ${snapshot.snapshotDate}`,
    `   Period: ${snapshot.period} days | Region: ${snapshot.region}`,
    `   Keywords: ${snapshot.keywords.join(", ") || "(none)"}`,
    `   Total trending: ${snapshot.totalTrendingTags}`,
    `   Matched: ${snapshot.matchedTags}`,
    "",
  ];

  if (snapshot.matchedTrendingTags.length > 0) {
    lines.push("✅ Matched trending tags:");
    for (const tag of snapshot.matchedTrendingTags) {
      lines.push(
        `   ${tag.name} — ${tag.views || "?"} views, ${tag.posts || "?"} posts (matched: ${tag.matchedKeywords.join(", ")})`,
      );
    }
    lines.push("");
    lines.push(
      "→ Add these to scene-data metadata.trendingHashtags field.",
    );
  } else {
    lines.push(
      "⚠️  No trending tags matched video keywords.",
    );
    lines.push(
      "→ Use curated hashtag pool (caption-utils.mjs deriveHashtags).",
    );
  }

  return lines.join("\n");
}

// ─── Main ───
async function main() {
  const url = getCreativeCenterUrl(period, region);

  console.log("📸 TikTok Creative Center Trending Hashtag Snapshot");
  console.log(`   URL: ${url}`);
  console.log(`   Period: ${period} days | Region: ${region}`);
  console.log(
    `   Keywords: ${keywords.length > 0 ? keywords.join(", ") : "(none — will list all trending)"}`,
  );
  console.log("");

  // The Agent will use web-access CDP to open the URL and extract data.
  // This script provides the URL and processing logic.
  //
  // Agent instructions:
  // 1. Use web-access CDP to open the URL above
  // 2. Wait for the hashtag list to render
  // 3. Extract hashtag data from DOM:
  //    - Tag name (e.g. "#aidigital")
  //    - Views count
  //    - Posts count
  //    - Trend direction (up/down/stable)
  // 4. Paste the extracted JSON array as stdin to this script
  //    OR save to a temp file and pass via --trending-file <path>
  // 5. This script will match, format, and save the snapshot

  // Check if trending data was provided via stdin
  let trendingData = [];

  // Check for --trending-file option
  const trendingFileIdx = args.indexOf("--trending-file");
  if (trendingFileIdx >= 0 && trendingFileIdx + 1 < args.length) {
    const filePath = args[trendingFileIdx + 1];
    try {
      const fileContent = readFileSync(filePath, "utf-8");
      trendingData = JSON.parse(fileContent);
      console.log(`   Loaded ${trendingData.length} trending tags from ${filePath}`);
    } catch (e) {
      console.error(`❌ Failed to read trending file: ${e.message}`);
      process.exit(1);
    }
  } else if (!process.stdin.isTTY) {
    // Read from stdin (piped JSON)
    try {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const stdinData = Buffer.concat(chunks).toString("utf-8").trim();
      if (stdinData) {
        trendingData = JSON.parse(stdinData);
        console.log(`   Loaded ${trendingData.length} trending tags from stdin`);
      }
    } catch (e) {
      // No stdin data — that's OK, just output the URL
    }
  }

  if (trendingData.length === 0) {
    console.log("");
    console.log("━━━ Agent Instructions ━━━");
    console.log("1. Use web-access CDP to open the URL above");
    console.log("2. Wait for hashtag list to render");
    console.log("3. Extract hashtag data from DOM");
    console.log("4. Pipe JSON array to this script:");
    console.log("   echo '[{\"name\":\"#ai\",\"views\":\"100M\",\"posts\":\"5K\"}]' | node scripts/short-video/snapshot-trending.mjs --keywords \"ai,deepseek\"");
    console.log("   OR: node scripts/short-video/snapshot-trending.mjs --keywords \"ai\" --trending-file /tmp/trending.json");
    console.log("");
    console.log("Expected JSON format per tag:");
    console.log('  {"name": "#aidigital", "views": "1.2B", "posts": "45K", "trend": "up"}');
    console.log("");
    console.log("Creative Center URL:");
    console.log(`  ${url}`);
    return;
  }

  // Process trending data
  const matchedTags = matchTrendingTags(trendingData, keywords);
  const snapshot = buildSnapshot(trendingData, matchedTags, keywords, period, region);
  const filePath = writeSnapshot(snapshot, outputPath);

  console.log("");
  console.log(formatForAgent(snapshot));
  console.log("");
  console.log(`   Snapshot saved: ${filePath}`);
}

// Run main() only when executed directly (not imported)
const isMain = process.argv[1] &&
  (process.argv[1].endsWith('snapshot-trending.mjs') ||
   process.argv[1].includes('snapshot-trending'));

if (isMain) {
  main();
}
