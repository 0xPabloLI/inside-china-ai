#!/usr/bin/env node
/**
 * Fetch TikTok Analytics from CSV Export (ISSUE-18, Plan C)
 *
 * Parses a TikTok Analytics CSV export (from analytics.tiktok.com) into
 * a standardized JSON format. Uses fuzzy column matching to handle
 * variations in column names between TikTok versions/languages.
 *
 * Usage:
 *   node scripts/short-video/fetch-tiktok-analytics.mjs --csv <path>
 *
 * Options:
 *   --csv <path>    Path to TikTok Analytics CSV export (required)
 *   --output <path> Output JSON path (default: output/analytics-weekXX.json)
 *
 * Output: output/analytics-export.json (or specified path)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseAnalyticsCSV } from "./lib/analytics-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI args ───

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const csvPath = getArg("csv");
const outputPath = getArg("output") || join(__dirname, "output", "analytics-export.json");

if (!csvPath) {
  console.error("❌ --csv <path> is required");
  console.error("   Usage: node scripts/short-video/fetch-tiktok-analytics.mjs --csv <path>");
  console.error("   Export CSV from: https://analytics.tiktok.com → Export");
  process.exit(1);
}

if (!existsSync(csvPath)) {
  console.error(`❌ File not found: ${csvPath}`);
  process.exit(1);
}

// ─── Main ───

console.log("📊 Fetch TikTok Analytics (CSV → JSON)");
console.log("=".repeat(50));

// 1. Read CSV
console.log(`📄 Reading: ${csvPath}`);
const csvContent = readFileSync(csvPath, "utf8");

if (!csvContent.trim()) {
  console.error("❌ CSV file is empty");
  process.exit(1);
}

// 2. Parse
console.log("🔄 Parsing CSV...");
const result = parseAnalyticsCSV(csvContent);

console.log(`  Videos found: ${result.videos.length}`);

if (result.videos.length === 0) {
  console.warn("⚠️  No video data in CSV. Output will have empty videos array.");
} else {
  console.log("\n📌 Summary:");
  for (const v of result.videos.slice(0, 5)) {
    const views = v.views != null ? v.views.toLocaleString() : "N/A";
    console.log(`  • ${v.title?.substring(0, 50) ?? "Unknown"} — ${views} views`);
  }
  if (result.videos.length > 5) {
    console.log(`  ... and ${result.videos.length - 5} more`);
  }

  // Stats
  const totalViews = result.videos.reduce((s, v) => s + (v.views ?? 0), 0);
  const totalLikes = result.videos.reduce((s, v) => s + (v.likes ?? 0), 0);
  const totalShares = result.videos.reduce((s, v) => s + (v.shares ?? 0), 0);
  console.log(`\n📈 Totals:`);
  console.log(`  Views:  ${totalViews.toLocaleString()}`);
  console.log(`  Likes:  ${totalLikes.toLocaleString()}`);
  console.log(`  Shares: ${totalShares.toLocaleString()}`);
}

// 3. Write output
const outputDir = dirname(outputPath);
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");

console.log(`\n📁 Output: ${outputPath}`);
console.log("=".repeat(50));
