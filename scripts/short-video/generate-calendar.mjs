#!/usr/bin/env node
/**
 * Weekly Content Calendar Generator
 *
 * Reads trending-topics.json, distributes across 7 days by pillar ratio
 * (breaking 40% / fermenting 30% / data 20% / explainer 10%),
 * and outputs weekly-plan.json.
 *
 * Usage: node scripts/short-video/generate-calendar.mjs
 * Output: output/weekly-plan.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildWeeklyPlan } from "./lib/calendar-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const INPUT_PATH = join(OUTPUT_DIR, "trending-topics.json");
const OUTPUT_PATH = join(OUTPUT_DIR, "weekly-plan.json");

const topicsData = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
const plan = buildWeeklyPlan(topicsData);

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
