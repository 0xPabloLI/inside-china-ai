#!/usr/bin/env node
/**
 * Hashtag Research CLI
 *
 * Fetches TikTok video samples for given hashtags via Apify.
 * Used during quarterly/triggered hashtag library maintenance.
 *
 * Usage:
 *   node scripts/short-video/research-hashtags.mjs --tags deepseek,qwen
 *   node scripts/short-video/research-hashtags.mjs --tags deepseek --max-items 10
 *   node scripts/short-video/research-hashtags.mjs --tags deepseek --live    # enable remote calls
 *
 * Output: output/hashtag-research/<date>.json
 *
 * Environment:
 *   APIFY_TOKEN — required for --live mode (set in .env.local)
 *
 * NOT used in per-video pipeline. See:
 *   - docs/analytics-workflow.md → Hashtag 库维护 → Step 2
 *   - docs/handoffs/handoff-hashtag-pipeline-gaps.md → 缺口 B
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { createApifyClient } from "./lib/apify-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI arg parsing ───

function parseArgs(argv) {
  const args = { tags: null, maxItems: 20, live: false, maxCostUsd: 0.1 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--tags":
        args.tags = argv[++i]
          ?.split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        break;
      case "--max-items":
        args.maxItems = parseInt(argv[++i], 10) || 20;
        break;
      case "--live":
        args.live = true;
        break;
      case "--max-cost":
        args.maxCostUsd = parseFloat(argv[++i]) || 0.1;
        break;
      case "--help":
      case "-h":
        console.log(`Usage: node scripts/short-video/research-hashtags.mjs --tags tag1,tag2 [options]

Options:
  --tags <csv>       Comma-separated hashtags (without #)
  --max-items <n>    Max videos per tag (default 20)
  --live             Enable remote requests (default: dry-run)
  --max-cost <usd>   Cost cap per tag (default 0.10)
  --help             Show this help

Output: output/hashtag-research/<date>.json
`);
        process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.tags || args.tags.length === 0) {
    console.error("Error: --tags is required. Example: --tags deepseek,qwen");
    process.exit(1);
  }

  const client = createApifyClient({
    dryRun: !args.live,
    maxRetries: 3,
  });

  const results = [];
  let hasError = false;

  for (const tag of args.tags) {
    const entry = {
      hashtag: tag,
      actor: "clockworks~tiktok-scraper",
      actorBuild: null,
      fetchedAt: new Date().toISOString(),
      input: { hashtags: [tag], resultsPerPage: args.maxItems },
      rawItemCount: 0,
      normalizedResult: [],
      error: null,
      costCapUsd: args.maxCostUsd,
    };

    try {
      const videos = await client.fetchHashtagVideos(tag, {
        maxItems: args.maxItems,
        maxTotalChargeUsd: args.maxCostUsd,
      });
      entry.rawItemCount = videos.length;
      entry.normalizedResult = videos;
    } catch (err) {
      entry.error = {
        name: err.name,
        message: err.message,
        status: err.status || null,
      };
      hasError = true;
    }

    results.push(entry);
    console.log(
      `[${tag}] ${entry.error ? `ERROR: ${entry.error.message}` : `${entry.rawItemCount} videos`}`,
    );
  }

  // Write artifact
  const outputDir = join(__dirname, "output", "hashtag-research");
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().slice(0, 10);
  const outputPath = join(outputDir, `${dateStr}.json`);
  writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log(`\nResults written to: ${outputPath}`);
  console.log(`Tags: ${args.tags.length} | Errors: ${results.filter((r) => r.error).length}`);

  process.exit(hasError ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
