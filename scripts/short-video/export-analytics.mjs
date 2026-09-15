#!/usr/bin/env node
/**
 * Analytics Export (ISSUE-10)
 *
 * Exports published post data from Publora (list_posts).
 * Publora provides post status/metadata but not view/engagement metrics.
 * For full TikTok analytics, use TikTok's own analytics dashboard.
 *
 * Usage: node scripts/short-video/export-analytics.mjs
 * Output: output/analytics-export.json
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "./lib/logger.mjs";

// Status/diagnostics go to stderr as structured log lines (JSON default,
// LOG_FORMAT=text for interactive runs); stdout stays reserved for the
// human-readable post summary. The key never appears in log output — the
// logger scrubs it, but we also simply never pass it anywhere.
const log = createLogger("export-analytics");

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const OUTPUT_PATH = join(OUTPUT_DIR, "analytics-export.json");
const PUB_BASE_URL = "https://api.publora.com/api/v1";

async function getApiKey() {
  if (process.env.PUBLORA_API_KEY) return process.env.PUBLORA_API_KEY;
  const home = process.env.HOME;
  const mcpPath = `${home}/Library/Application Support/CatPawAI/User/globalStorage/mt-idekit.mt-idekit-code/settings/mcopilot_mcp_settings.json`;
  try {
    const raw = await import("fs/promises").then((fs) => fs.readFile(mcpPath, "utf8"));
    const config = JSON.parse(raw);
    const auth = config?.mcpServers?.publora?.headers?.Authorization;
    return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  } catch {
    return null;
  }
}

async function main() {
  log.info("analytics export start");

  const apiKey = await getApiKey();
  if (!apiKey) {
    log.error("no Publora API key found");
    process.exit(1);
  }

  // Fetch all published posts
  const resp = await fetch(`${PUB_BASE_URL}/posts?status=published&limit=100`, {
    headers: { "x-publora-key": apiKey },
  });
  const data = await resp.json();
  const posts = data.posts || [];

  log.info("posts fetched", { count: posts.length });

  const export_ = {
    exportedAt: new Date().toISOString(),
    platform: "tiktok",
    totalPosts: posts.length,
    posts: posts.map((p) => ({
      postGroupId: p.postGroupId,
      content: p.content?.substring(0, 200),
      status: p.status,
      scheduledTime: p.scheduledTime,
      publishedAt: p.publishedAt,
      platforms: p.platforms,
    })),
    note: "Publora provides post status/metadata only. For view/engagement metrics, use TikTok Analytics dashboard or TikTok API.",
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(export_, null, 2) + "\n", "utf8");

  log.info("analytics export written", { path: OUTPUT_PATH, count: posts.length });
  if (posts.length > 0) {
    console.log("\n📌 Published posts:");
    for (const p of posts.slice(0, 5)) {
      console.log(`  • ${p.publishedAt || p.scheduledTime}: ${p.content?.substring(0, 60)}...`);
    }
  }
}

main().catch((e) => {
  // e.message only — never the error object, which can carry request headers
  // (including the API key) in its stack or cause fields.
  log.error("analytics export failed", { err: e?.message });
  process.exit(1);
});
