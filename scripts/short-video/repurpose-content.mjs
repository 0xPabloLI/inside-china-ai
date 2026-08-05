#!/usr/bin/env node
/**
 * Content Repurposing Script (ISSUE-13)
 *
 * [辅助工具] 只做 voiceover 文本拼接，输出为快速草稿。
 * 真正的 repurposing（重写、扩写、适配平台风格）应由 agent 完成。
 * 仅在用户明确要求时运行，不在默认工作流中。
 *
 * Reads scene-data.mjs and generates:
 * 1. Blog post (markdown)
 * 2. Newsletter (plain text)
 * 3. X/Twitter thread (array of tweets)
 *
 * Usage: node scripts/short-video/repurpose-content.mjs
 * Output: output/repurposed/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENE_DATA_PATH = join(__dirname, "scene-data.mjs");
const OUTPUT_DIR = join(__dirname, "output", "repurposed");

const mod = await import(`file://${SCENE_DATA_PATH}`);
const scenes = mod.scenes || mod.default?.scenes;

if (!scenes) {
  console.error("❌ No scenes found in scene-data.mjs");
  process.exit(1);
}

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── 1. Blog Post (Markdown) ───
const blogPost = `# ${scenes[0]?.texts?.line1 || scenes[0]?.texts?.title || "China AI News"}

${scenes
  .map((s, i) => {
    const heading = s.texts?.line1 || s.texts?.title || `Section ${i + 1}`;
    const body = s.voiceover || "";
    return `## ${heading}\n\n${body}\n`;
  })
  .join("\n")}

---

*This article was generated from video scene data. Follow [@chinaainews](https://tiktok.com/@chinaainews) for more China AI intelligence.*
`;

writeFileSync(join(OUTPUT_DIR, "blog-post.md"), blogPost, "utf8");
console.log("📝 Blog post generated: output/repurposed/blog-post.md");

// ─── 2. Newsletter (Plain Text) ───
const newsletter = `CHINA AI NEWS — ${new Date().toLocaleDateString()}
${"=".repeat(50)}

${scenes[0]?.voiceover || ""}

${scenes
  .slice(1, -1)
  .map((s, i) => `${i + 2}. ${s.voiceover || ""}`)
  .join("\n\n")}

${scenes[scenes.length - 1]?.voiceover || ""}

${"=".repeat(50)}
Follow @chinaainews on TikTok for daily China AI news.
`;

writeFileSync(join(OUTPUT_DIR, "newsletter.txt"), newsletter, "utf8");
console.log("📧 Newsletter generated: output/repurposed/newsletter.txt");

// ─── 3. X/Twitter Thread ───
const tweets = [];

// Tweet 1: Hook
tweets.push({
  text: `${scenes[0]?.voiceover || ""}\n\n🧵 Thread on China's AI moves 👇`,
});

// Tweets 2-N: Body
for (let i = 1; i < scenes.length - 1; i++) {
  const s = scenes[i];
  const text = s.voiceover || "";
  if (text.length <= 270) {
    tweets.push({ text: `${i + 1}/ ${text}` });
  } else {
    // Split long text
    tweets.push({ text: `${i + 1}/ ${text.substring(0, 270)}...` });
    tweets.push({ text: `...${text.substring(270)}` });
  }
}

// Last tweet: CTA
tweets.push({
  text: `Follow @chinaainews on TikTok for daily China AI intelligence.\n\n#ChinaAI #DeepSeek`,
});

writeFileSync(join(OUTPUT_DIR, "x-thread.json"), JSON.stringify(tweets, null, 2) + "\n", "utf8");
console.log(`🐦 X thread generated: output/repurposed/x-thread.json (${tweets.length} tweets)`);

console.log(`\n📁 All repurposed content in: ${OUTPUT_DIR}`);
