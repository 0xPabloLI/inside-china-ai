#!/usr/bin/env node
/**
 * Weekly Content Calendar Generator
 *
 * Reads trending-topics.json, distributes across 7 days by pillar ratio.
 * Default ratio: breaking 40% / fermenting 30% / data 20% / explainer 10%
 * Agent can override with --ratio "50,25,15,10" (breaking,fermenting,data,explainer)
 *
 * Usage:
 *   node scripts/short-video/generate-calendar.mjs
 *   node scripts/short-video/generate-calendar.mjs --ratio "50,25,15,10"
 * Output: output/weekly-plan.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildWeeklyPlan } from "./lib/calendar-utils.mjs";

// Parse --ratio override (e.g. "50,25,15,10" = breaking,fermenting,data,explainer)
const args = process.argv.slice(2);
const ratioIdx = args.indexOf("--ratio");
let customRatio = null;
if (ratioIdx >= 0 && ratioIdx + 1 < args.length) {
  const parts = args[ratioIdx + 1].split(",").map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n) && n >= 0)) {
    const sum = parts.reduce((a, b) => a + b, 0);
    customRatio = {
      breaking: parts[0] / sum,
      fermenting: parts[1] / sum,
      data: parts[2] / sum,
      explainer: parts[3] / sum,
    };
    console.log(`⚙️  Custom ratio: breaking ${parts[0]}% / fermenting ${parts[1]}% / data ${parts[2]}% / explainer ${parts[3]}%`);
  } else {
    console.error('❌ Invalid --ratio. Use format: "40,30,20,10" (breaking,fermenting,data,explainer)');
    process.exit(1);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const INPUT_PATH = join(OUTPUT_DIR, "trending-topics.json");
const OUTPUT_PATH = join(OUTPUT_DIR, "weekly-plan.json");

const topicsData = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
const plan = buildWeeklyPlan(topicsData, customRatio);

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(plan, null, 2) + "\n", "utf8");

console.log("📅 Weekly Content Calendar Generated");
console.log("=".repeat(50));
console.log(`  Total topics: ${plan.totalTopics}`);
for (const day of plan.days) {
  if (day.topic) {
    console.log(`  Day ${day.day} (${day.date}): ${day.type} — ${day.topic.title.substring(0, 60)}`);
  } else {
    console.log(`  Day ${day.day} (${day.date}): — (no topic)`);
  }
}
console.log(`\n📁 ${OUTPUT_PATH}`);
