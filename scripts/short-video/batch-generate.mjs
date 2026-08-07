#!/usr/bin/env node
/**
 * Batch Scene Data Generator (ISSUE-07)
 *
 * [辅助工具] 只生成空模板文件，真正的内容由 agent 填写。
 * Agent 可以直接创建 scene-data 文件而不经过此脚本。
 * 保留此脚本用于批量从 weekly-plan 生成骨架文件的便捷场景。
 *
 * Usage: node scripts/short-video/batch-generate.mjs
 * Output: scripts/short-video/scene-data-{slug}.mjs
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAN_PATH = join(__dirname, "output", "weekly-plan.json");

if (!existsSync(PLAN_PATH)) {
  console.error("❌ weekly-plan.json not found. Run: node generate-calendar.mjs");
  process.exit(1);
}

const plan = JSON.parse(readFileSync(PLAN_PATH, "utf8"));
let count = 0;

for (const day of plan.days) {
  if (!day.topic) continue;

  const slug =
    day.topic.title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 40) || `topic-${day.day}`;

  const filePath = join(__dirname, `scene-data-${slug}.mjs`);

  if (existsSync(filePath)) {
    console.log(`  ⏭️  Day ${day.day}: ${slug} (already exists)`);
    continue;
  }

  const template = `/**
 * Scene data for: ${day.topic.title}
 * Type: ${day.type} | Hook: ${day.hookFormula} | Duration: ${day.duration}s
 * Source: ${day.topic.sources?.join(", ") || "unknown"}
 * Generated: ${new Date().toISOString()}
 *
 * Agent: Fill in voiceover, texts, and visualType for each scene.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "", // TODO: Write hook based on "${day.hookFormula}"
    texts: { line1: "", line2: "" },
  },
  // TODO: Add 8-11 more scenes
  {
    id: 12,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI intelligence.",
    // Standard end-card contract (see lib/scene-templates.mjs ctaScene):
    // brand / brandHighlight / tagline / action are the fixed slots.
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE", // TODO: per video — "FOLLOW FOR PART N" for series
    },
  },
];

export const metadata = {
  title: "", // TODO: <=60 chars
  description: "", // TODO: <=2200 chars
  hashtags: [], // TODO: 3-5 hashtags
};
`;

  writeFileSync(filePath, template, "utf8");
  console.log(`  ✅ Day ${day.day}: ${slug}.mjs`);
  count++;
}

console.log(`\n📊 Generated ${count} scene-data templates`);
console.log("   Agent: Open each file and fill in the TODOs.");
