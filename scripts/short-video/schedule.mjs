#!/usr/bin/env node
/**
 * Cross-Platform Schedule Script (ISSUE-03)
 *
 * Thin wrapper around publish-tiktok.mjs that supports multiple platforms.
 * Currently only TikTok is connected via Publora.
 * Add more platforms by connecting them in Publora dashboard.
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
