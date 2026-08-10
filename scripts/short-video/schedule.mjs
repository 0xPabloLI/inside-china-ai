#!/usr/bin/env node
/**
 * Cross-Platform Schedule Script (ISSUE-03)
 *
 * [辅助工具] 委托 publish-tiktok.mjs。默认输出手动发布指南。
 * 加 --auto 才走 API 发布（会显示风险警告）。
 *
 * Usage:
 *   node scripts/short-video/schedule.mjs --video <path>           # 手动发布指南
 *   node scripts/short-video/schedule.mjs --video <path> --auto     # API 自动发布
 *   node scripts/short-video/schedule.mjs --video <path> --auto --schedule 2026-08-03T12:00:00Z
 */

import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Delegate to publish-tiktok.mjs (same flow, Publora handles multi-platform)
const publishScript = join(__dirname, "publish-tiktok.mjs");
const args = process.argv.slice(2).join(" ");

console.log("📅 Cross-Platform Scheduler");
console.log("=".repeat(50));
console.log("  Currently connected: TikTok (@chinaainews)");
console.log("  To add YouTube/Instagram: connect in Publora dashboard");
console.log("");

execSync(`node "${publishScript}" ${args}`, { stdio: "inherit" });
