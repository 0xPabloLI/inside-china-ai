#!/usr/bin/env node
/**
 * TikTok Publish via Publora REST API
 *
 * Flow: create draft -> get upload URL -> upload MP4 to S3 -> schedule/publish
 *
 * Usage:
 *   node scripts/short-video/publish-tiktok.mjs [options]
 *
 * Options:
 *   --video <path>      Video file (default: output/deepseek-short.mp4)
 *   --metadata <path>   Metadata JSON (default: output/tiktok-metadata.json)
 *   --schedule <iso>    Schedule time (ISO 8601, e.g. 2026-08-03T12:00:00Z)
 *   --draft             Leave as draft (don't schedule)
 *   --self-only         Set viewerSetting to SELF_ONLY (for testing)
 *   --platform-id <id>  Override TikTok platform ID
 *
 * Requires: PUBLORA_API_KEY env var OR CatPaw MCP config fallback
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";

import {
  buildCaption,
  buildTiktokSettings,
  validateVideoFile,
  buildPendingAnalysis,
  buildAnalyticsGuidance,
} from "./lib/publish-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "output");
const DEFAULT_VIDEO = join(OUTPUT_DIR, "deepseek-short.mp4");
const DEFAULT_METADATA = join(OUTPUT_DIR, "tiktok-metadata.json");

const PUB_BASE_URL = "https://api.publora.com/api/v1";

// ─── CLI args ───

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const videoPath = getArg("video") || DEFAULT_VIDEO;
const metadataPath = getArg("metadata") || DEFAULT_METADATA;
const scheduleTime = getArg("schedule");
const isDraft = hasFlag("draft");
const isSelfOnly = hasFlag("self-only");
const platformIdOverride = getArg("platform-id");

// ─── API key resolution ───

async function getApiKey() {
  // 1. Env var
  if (process.env.PUBLORA_API_KEY) {
    return process.env.PUBLORA_API_KEY;
  }

  // 2. CatPaw MCP settings fallback
  const home = process.env.HOME || process.env.USERPROFILE;
  const mcpSettingsPaths = [
    `${home}/Library/Application Support/CatPawAI/User/globalStorage/mt-idekit.mt-idekit-code/settings/mcopilot_mcp_settings.json`,
    `${home}/.cursor/skills/web-access/mcp_settings.json`, // legacy
  ];

  for (const p of mcpSettingsPaths) {
    try {
      if (existsSync(p)) {
        const raw = await readFile(p, "utf8");
        const config = JSON.parse(raw);
        const authHeader = config?.mcpServers?.publora?.headers?.Authorization;
        if (authHeader?.startsWith("Bearer ")) {
          return authHeader.slice(7);
        }
      }
    } catch {
      // try next path
    }
  }

  console.error("❌ PUBLORA_API_KEY not found.");
  console.error("   Set it: export PUBLORA_API_KEY=sk_...");
  console.error("   Or configure Publora MCP in CatPaw settings.");
  process.exit(1);
}

// ─── Publora API client ───

async function publoraPost(path, body, apiKey) {
  const resp = await fetch(`${PUB_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "x-publora-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Publora POST ${path} failed: HTTP ${resp.status} — ${JSON.stringify(data)}`);
  }
  return data;
}

async function publoraPut(path, body, apiKey) {
  const resp = await fetch(`${PUB_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      "x-publora-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Publora PUT ${path} failed: HTTP ${resp.status} — ${JSON.stringify(data)}`);
  }
  return data;
}

async function uploadToS3(uploadUrl, filePath, contentType) {
  const buffer = readFileSync(filePath);
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`S3 upload failed: HTTP ${resp.status} — ${text.slice(0, 300)}`);
  }
}

async function getPlatformId(apiKey) {
  if (platformIdOverride) return platformIdOverride;

  const resp = await fetch(`${PUB_BASE_URL}/platform-connections`, {
    headers: { "x-publora-key": apiKey },
  });
  const data = await resp.json();
  const tiktokConn = data.connections?.find((c) => c.platformId?.startsWith("tiktok-"));
  if (!tiktokConn) {
    throw new Error("No TikTok connection found in Publora. Run list_connections first.");
  }
  if (tiktokConn.tokenStatus !== "valid") {
    console.warn(`⚠️  TikTok token status: ${tiktokConn.tokenStatus}`);
  }
  return tiktokConn.platformId;
}

// ─── Main ───

async function main() {
  console.log("📤 TikTok Publish via Publora");
  console.log("=".repeat(60));

  // 1. Get API key
  const apiKey = await getApiKey();
  console.log("🔑 API key: found ✅");

  // 2. Get platform ID
  const platformId = await getPlatformId(apiKey);
  console.log(`📱 TikTok platform: ${platformId}`);

  // 3. Read metadata
  if (!existsSync(metadataPath)) {
    console.error(`❌ Metadata not found: ${metadataPath}`);
    console.error("   Run: node scripts/short-video/generate-caption.mjs");
    process.exit(1);
  }
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  console.log(`📋 Metadata: ${metadata.title?.substring(0, 50)}...`);

  // 4. Build caption
  const caption = buildCaption(metadata);
  console.log(`📝 Caption: ${caption.length} chars (limit: 2200)`);

  // 5. Validate video
  const videoValidation = validateVideoFile(videoPath);
  if (!videoValidation.valid) {
    console.error(`❌ Video: ${videoValidation.error}`);
    process.exit(1);
  }
  console.log(`🎬 Video: ${(videoValidation.size / 1024 / 1024).toFixed(1)}MB`);

  // 6. Build TikTok settings
  const tiktokSettings = buildTiktokSettings({
    viewerSetting: isSelfOnly ? "SELF_ONLY" : "PUBLIC_TO_EVERYONE",
  });
  console.log(`⚙️  Viewer: ${tiktokSettings.tiktok.viewerSetting}`);

  // 7. Step 1: Create draft
  console.log("\n📦 Step 1: Creating draft post...");
  const draft = await publoraPost(
    "/create-post",
    {
      content: caption,
      platforms: [platformId],
      platformSettings: tiktokSettings,
    },
    apiKey,
  );
  const postGroupId = draft.postGroupId;
  if (!postGroupId) {
    console.error("❌ No postGroupId returned:", draft);
    process.exit(1);
  }
  console.log(`  ✅ Draft created: ${postGroupId}`);

  // 8. Step 2: Get upload URL
  console.log("\n📦 Step 2: Getting upload URL...");
  const fileName = resolve(videoPath).split("/").pop();
  const uploadResp = await publoraPost(
    "/get-upload-url",
    {
      fileName,
      contentType: "video/mp4",
      type: "video",
      postGroupId,
    },
    apiKey,
  );
  const { uploadUrl, mediaId } = uploadResp;
  if (!uploadUrl) {
    console.error("❌ No uploadUrl returned:", uploadResp);
    process.exit(1);
  }
  console.log(`  ✅ Upload URL obtained (mediaId: ${mediaId})`);

  // 9. Step 3: Upload to S3
  console.log("\n📦 Step 3: Uploading video to S3...");
  await uploadToS3(uploadUrl, videoPath, "video/mp4");
  console.log("  ✅ Upload complete");

  // 10. Step 4: Schedule or leave as draft
  if (isDraft) {
    console.log("\n📝 Post left as draft (use --schedule to publish)");
    console.log(`   PostGroupId: ${postGroupId}`);
    console.log("   Publish later: node publish-tiktok.mjs --schedule <iso>");
  } else if (scheduleTime) {
    console.log(`\n📅 Scheduling for ${scheduleTime}...`);
    await publoraPut(
      `/update-post/${postGroupId}`,
      {
        status: "scheduled",
        scheduledTime: scheduleTime,
      },
      apiKey,
    );
    console.log("  ✅ Scheduled");
  } else {
    // Default: schedule for now (immediate publish)
    const now = new Date().toISOString();
    console.log(`\n🚀 Scheduling for immediate publish (${now})...`);
    await publoraPut(
      `/update-post/${postGroupId}`,
      {
        status: "scheduled",
        scheduledTime: now,
      },
      apiKey,
    );
    console.log("  ✅ Published (may take a few minutes to appear)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary:");
  console.log(`  PostGroupId: ${postGroupId}`);
  console.log(`  MediaId:     ${mediaId}`);
  console.log(`  Platform:    ${platformId}`);
  console.log(`  Caption:     ${caption.length} chars`);
  console.log(`  Video:       ${(videoValidation.size / 1024 / 1024).toFixed(1)}MB`);
  console.log("=".repeat(60));

  // 11. Write pending-analysis.json (ISSUE-19) — only for non-draft
  if (!isDraft) {
    const publishedAt = new Date().toISOString();
    const pending = buildPendingAnalysis(postGroupId, publishedAt);
    const pendingPath = join(OUTPUT_DIR, "pending-analysis.json");
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + "\n", "utf8");
    console.log(buildAnalyticsGuidance(OUTPUT_DIR));
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
