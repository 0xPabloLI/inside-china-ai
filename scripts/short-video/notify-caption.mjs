#!/usr/bin/env node
/**
 * Caption push CLI (#1530).
 *
 * Reads the publish package of a finished run and pushes caption + hashtags to
 * IM (Feishu custom bot). Called by verify-video.mjs after all checks pass, and
 * usable standalone to re-push or to ping-test the webhook.
 *
 * Usage:
 *   node scripts/short-video/notify-caption.mjs --content <dir> [--run <id>] [--platform tiktok] [--force]
 *   node scripts/short-video/notify-caption.mjs --content <dir> --dry-run
 *   node scripts/short-video/notify-caption.mjs --test
 *
 * Exit codes:
 *   0 — sent, skipped (duplicate / no channel), or dry-run
 *   1 — send failed and NOTIFY_REQUIRED=1 (or --require-notify); without that
 *       switch a failure prints a warning and still exits 0, because the run's
 *       verification verdict must not depend on the chat channel.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/load-env.mjs";
import { resolveRun } from "./lib/run-history.mjs";
import { resolveOutputVideo } from "./lib/assemble.mjs";
import { listPlatformProfiles } from "./lib/platforms/index.mjs";
import {
  buildCopyText,
  buildFeishuPayload,
  buildSummaryText,
  chunkText,
  notifyCaption,
  resolveNotifyConfig,
} from "./lib/notify-caption.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

// #287 — the CLI entry owns .env.local loading; lib/** never self-loads.
loadEnv();

function getArg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const dryRun = hasFlag("dry-run");
const force = hasFlag("force");
const testMode = hasFlag("test");
const requireNotify = hasFlag("require-notify") || process.env.NOTIFY_REQUIRED === "1";
const contentDir = getArg("content");
const platformArg = getArg("platform");

const config = resolveNotifyConfig();
if (config.channel === "none" && !dryRun) {
  console.log("ℹ️  [notify] 未配置 FEISHU_BOT_WEBHOOK —— 跳过推送（不影响 verify 结果）。");
  console.log("   启用步骤：飞书建一个只含自己的群 → 群设置 → 群机器人 → 添加「自定义机器人」");
  console.log("   → 复制 webhook 地址写进 .env.local 的 FEISHU_BOT_WEBHOOK，再跑一次本命令验证。");
  process.exit(0);
}

if (testMode) {
  const text = [
    "🔔 China AI News 成片推送已接通",
    "这条是测试消息：以后每条视频 verify 全 PASS 后，caption + hashtags 会自动发到这里。",
    "正式推送分两条：① 运行信息（片名/文件/置顶评论/发布包路径）；② 可直接整段复制进 TikTok 的 caption + hashtags。",
  ].join("\n");
  if (dryRun) {
    console.log(text);
    process.exit(0);
  }
  const result = await notifyCaption({
    slug: "test",
    runId: "test",
    platform: "test",
    caption: text,
    hashtags: [],
    singleText: text,
    config,
    force: true,
  });
  if (result.ok) {
    console.log(
      `✅ [notify] 测试消息已发送（channel=${result.channel}，attempts=${result.attempts}）`,
    );
    process.exit(0);
  }
  console.error(`❌ [notify] 测试消息发送失败：${result.error}`);
  process.exit(requireNotify ? 1 : 0);
}

if (!contentDir) {
  const available = readdirSync(join(__dirname, "content"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  console.error("❌ --content flag is required (or --test). Available content:");
  available.forEach((name) => console.error(`   - ${name}`));
  process.exit(1);
}

let meta = null;
try {
  const metaModule = await import(`file://${join(__dirname, "content", contentDir, "meta.mjs")}`);
  meta = metaModule.meta ?? null;
} catch (error) {
  console.warn(`⚠️  [notify] meta.mjs 读取失败，按目录名推导 pipelineId：${error.message}`);
}
const pipelineId = meta?.pipelineId || contentDir.replace(/\//g, "-");
const subject = meta?.subject;
const filePrefix = subject && subject !== pipelineId ? `${subject}-${pipelineId}` : pipelineId;

// Prefer the run the verifier just judged; fall back to the legacy slug tree
// for packages produced before run history existed.
let runDir = null;
let runId = getArg("run") || "legacy";
try {
  const run = resolveRun({ root: __dirname, slug: pipelineId, runId: getArg("run") });
  runDir = run.dir;
  // Legacy packages have no run identity; "legacy" keeps the ledger key stable.
  runId = run.runId || "legacy";
} catch {
  runDir = join(__dirname, "output", pipelineId);
}

const platforms = platformArg
  ? [platformArg]
  : listPlatformProfiles().map((profile) => profile.platform);

let failures = 0;
let sent = 0;
let skipped = 0;

for (const platform of platforms) {
  const packageDir = join(runDir, "publish", platform);
  const captionPath = join(packageDir, `${platform}-caption.txt`);
  const metadataPath = join(packageDir, `${platform}-metadata.json`);
  const pinnedPath = join(packageDir, `${platform}-pinned-comment.txt`);

  if (!existsSync(captionPath)) {
    if (platformArg) {
      console.error(`❌ [notify] 找不到 ${captionPath}，先跑 generate-caption.mjs 生成发布包。`);
      failures += 1;
    }
    continue;
  }

  const caption = readFileSync(captionPath, "utf8");
  let metadata = {};
  if (existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    } catch (error) {
      console.warn(`⚠️  [notify] metadata JSON 解析失败（用空值继续）：${error.message}`);
    }
  }
  const pinnedComment = existsSync(pinnedPath)
    ? readFileSync(pinnedPath, "utf8")
    : String(metadata.pinnedComment ?? "");
  const videoPath = resolveOutputVideo(runDir, filePrefix);
  const logPath = join(runDir, "publish", "notify-log.jsonl");

  if (dryRun) {
    const messages = [
      buildSummaryText({
        slug: pipelineId,
        runId,
        platform,
        pinnedComment,
        videoPath,
        packageDir,
      }),
      buildCopyText({ caption, hashtags: metadata.hashtags ?? [] }),
    ].filter((message) => message && message.trim() !== "");
    const chunks = messages.flatMap((message) => chunkText(message));
    const chars = messages.reduce((sum, message) => sum + message.length, 0);
    console.log(`\n=== ${platform} · ${runId} ===`);
    messages.forEach((message, index) => {
      console.log(`\n--- 消息 ${index + 1}/${messages.length} ---`);
      console.log(message);
    });
    console.log(
      `\n[dry-run] ${messages.length} 条消息 · ${chars} chars · ${chunks.length} chunk(s) · payload ${Buffer.byteLength(
        JSON.stringify(
          buildFeishuPayload({ text: messages[0] ?? "", secret: config.secret || "" }),
        ),
        "utf8",
      )} bytes（首条）`,
    );
    continue;
  }

  const result = await notifyCaption({
    slug: pipelineId,
    runId,
    platform,
    caption,
    hashtags: metadata.hashtags ?? [],
    pinnedComment,
    videoPath,
    packageDir,
    logPath,
    config,
    force,
  });

  if (result.ok && result.skipped) {
    skipped += 1;
    console.log(
      `↩️  [notify] ${platform} 本 run 已推送过（${result.reason}），跳过。重推加 --force。`,
    );
    continue;
  }
  if (result.ok) {
    sent += 1;
    console.log(
      `✅ [notify] ${platform} 已推送到飞书（${result.parts} 条消息 / ${result.chunks} 块，${result.chars} 字，attempts=${result.attempts}）`,
    );
    continue;
  }
  failures += 1;
  console.error(`❌ [notify] ${platform} 推送失败（attempts=${result.attempts}）：${result.error}`);
}

if (dryRun) process.exit(0);

if (failures > 0) {
  console.warn(`⚠️  [notify] ${failures} 个平台推送失败，已记入 publish/notify-log.jsonl。`);
  process.exit(requireNotify ? 1 : 0);
}
if (sent === 0 && skipped === 0) {
  console.log("ℹ️  [notify] 没有需要推送的发布包。");
}
process.exit(0);
