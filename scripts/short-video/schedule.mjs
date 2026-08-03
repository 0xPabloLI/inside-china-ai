#!/usr/bin/env node
/**
 * Cross-Platform Schedule Script (ISSUE-03)
 *
 * [辅助工具] Agent 可直接跑 publish-tiktok.mjs，此脚本为多平台场景预留。
 * 目前仅 TikTok 连接，等 YouTube/Instagram 连接后才有实际多平台价值。
 *
 * Usage:
 *   node scripts/short-video/schedule.mjs --schedule 2026-08-03T12:00:00Z
 *   node scripts/short-video/schedule.mjs --draft
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
