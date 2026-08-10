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
 *   --video <path>      Video file (required)
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

import {
  buildCaption,
  buildSeriesCaption,
  buildSeriesPinnedComment,
  buildTiktokSettings,
  validateVideoFile,
  buildPendingAnalysis,
  buildAnalyticsGuidance,
  buildTikTokUrl,
} from "./lib/publish-utils.mjs";
import {
  getApiKey,
  publoraPost,
  publoraPut,
  publoraGet,
  uploadToS3,
  getPlatformId,
} from "./lib/publora-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "output");
const DEFAULT_METADATA = join(OUTPUT_DIR, "tiktok-metadata.json");

// ─── CLI args ───

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const videoPath = getArg("video");
if (!videoPath) {
  console.error(
    "❌ --video flag is required. Example: --video output/kimi-sandbox/kimi-kimi-sandbox-short.mp4",
  );
  process.exit(1);
}
const metadataPath = getArg("metadata") || DEFAULT_METADATA;
const scheduleTime = getArg("schedule");
const isDraft = hasFlag("draft");
const isSelfOnly = hasFlag("self-only");
const platformIdOverride = getArg("platform-id");

// Series args (optional — when present, enables series caption + pinned comment)
const seriesId = getArg("series-id");
const partArg = getArg("part"); // format: "n/total" e.g. "1/3"
const prevUrl = getArg("prev-url");
const nextUrl = getArg("next-url");

// TikTok URL auto-save arg
const postSlug = getArg("slug");

// ─── Main ───

async function main() {
  console.log("📤 TikTok Publish via Publora");
  console.log("=".repeat(60));

  // 1. Get API key
  const apiKey = await getApiKey();
  console.log("🔑 API key: found ✅");

  // 2. Get platform ID (CLI override or from Publora)
  const platformId = platformIdOverride || (await getPlatformId("tiktok-", apiKey));
  console.log(`📱 TikTok platform: ${platformId}`);

  // 3. Read metadata
  if (!existsSync(metadataPath)) {
    console.error(`❌ Metadata not found: ${metadataPath}`);
    console.error("   Run: node scripts/short-video/generate-caption.mjs");
    process.exit(1);
  }
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  console.log(`📋 Metadata: ${metadata.title?.substring(0, 50)}...`);

  // 4. Build caption (with optional series info)
  let caption;
  let pinnedComment = null;
  if (seriesId && partArg) {
    // Parse part "n/total"
    const [partNum, totalParts] = partArg.split("/").map(Number);
    const seriesMeta = {
      seriesId,
      partNumber: partNum,
      totalParts,
      prevPartSlug: prevUrl,
      nextPartSlug: nextUrl,
    };
    caption = buildSeriesCaption(metadata, seriesMeta);
    pinnedComment = buildSeriesPinnedComment(seriesMeta);
    console.log(`📝 Caption (series): ${caption.length} chars (limit: 2200)`);
    console.log(`🏷️  Series: ${seriesId} Part ${partNum}/${totalParts}`);
  } else {
    caption = buildCaption(metadata);
    console.log(`📝 Caption: ${caption.length} chars (limit: 2200)`);
  }

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

  // 12. Output pinned comment for series (user must manually pin it)
  if (pinnedComment) {
    console.log("\n📌 Pinned Comment (copy & pin manually):");
    console.log("─".repeat(40));
    console.log(pinnedComment);
    console.log("─".repeat(40));
  }

  // 13. Auto-save TikTok URL to post (if --slug provided)
  if (postSlug && !isDraft) {
    await autoSaveTikTokUrl(postGroupId, postSlug, apiKey);
  }
}

/**
 * Poll Publora get-post until TikTok status is "published", then save URL to Supabase.
 * Non-blocking: failures print warnings but don't affect exit code.
 */
async function autoSaveTikTokUrl(postGroupId, slug, apiKey) {
  const MAX_POLLS = 5;
  const POLL_INTERVAL_MS = 30_000;

  console.log(`\n🔗 Auto-saving TikTok URL to post "${slug}"...`);
  console.log(
    `   Polling Publora (up to ${MAX_POLLS} attempts, ${POLL_INTERVAL_MS / 1000}s interval)`,
  );

  let postedId = null;

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const resp = await publoraGet(`/get-post/${postGroupId}`, apiKey);
      const tiktokPost = resp.posts?.find((p) => p.platform === "tiktok");

      if (tiktokPost?.status === "published" && tiktokPost?.postedId) {
        postedId = tiktokPost.postedId;
        console.log(`  ✅ TikTok published! postedId: ${postedId}`);
        break;
      }

      console.log(
        `  ⏳ Attempt ${attempt}/${MAX_POLLS}: status=${tiktokPost?.status ?? "unknown"}, postedId=${tiktokPost?.postedId ?? "null"}`,
      );
    } catch (e) {
      console.log(`  ⚠️  Attempt ${attempt}/${MAX_POLLS}: poll failed — ${e.message}`);
    }
  }

  if (!postedId) {
    console.warn(`  ⚠️  Could not get TikTok postedId after ${MAX_POLLS} attempts.`);
    console.warn(`     Set the URL manually in the admin editor or run:`);
    console.warn(`     node scripts/article/set-tiktok-url.mjs --slug ${slug} --url <tiktok-url>`);
    return;
  }

  const tiktokUrl = buildTikTokUrl(postedId);

  // Save to Supabase via REST API
  try {
    const { loginAdmin, loadDotEnvFiles, getEnvVar } =
      await import("../../article/lib/supabase-auth.mjs");
    const { buildAttachmentHeaders } = await import("../../article/lib/attachment-utils.mjs");

    const dotenv = loadDotEnvFiles();
    const supabaseUrl = getEnvVar("SUPABASE_URL", dotenv);
    const supabaseKey = getEnvVar("SUPABASE_PUBLISHABLE_KEY", dotenv);

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
    }

    const auth = await loginAdmin();
    const headers = buildAttachmentHeaders(auth.access_token, supabaseKey);
    headers["Content-Type"] = "application/json";
    headers["Prefer"] = "return=minimal";

    const patchResp = await fetch(
      `${supabaseUrl}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ tiktok_url: tiktokUrl }),
      },
    );

    if (!patchResp.ok) {
      const text = await patchResp.text();
      throw new Error(`Supabase PATCH failed: HTTP ${patchResp.status} — ${text.slice(0, 200)}`);
    }

    console.log(`  ✅ Saved tiktok_url to post "${slug}": ${tiktokUrl}`);
  } catch (e) {
    console.warn(`  ⚠️  Failed to save tiktok_url to Supabase: ${e.message}`);
    console.warn(`     The video was published successfully. Set the URL manually later.`);
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
