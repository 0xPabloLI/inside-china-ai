#!/usr/bin/env node
/**
 * TikTok Trending Sounds Recommender
 *
 * Generates TikTok sound search URLs from BGM pool names + content keywords.
 * User opens the URLs in TikTok App and manually selects matching trending
 * sounds. Zero account risk — no scraping, no CDP, no API calls.
 *
 * Why not scrape? TikTok's web API requires JS signing (X-Bogus),
 * the web search has no Sounds tab, and CDP scraping with the user's
 * session risks account shadowban. TikTok has no official sound search API.
 * Third-party trend trackers (TokBoard, Exolyt) are either down or
 * Cloudflare-protected. Search URL recommendations are the only
 * risk-free, reliable approach.
 *
 * Usage:
 *   node scripts/short-video/trending-sounds.mjs --content <dir>
 *   node scripts/short-video/trending-sounds.mjs --keyword "breaking news"
 *
 * Output: Console recommendations + output/trending-sounds.json
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { scanBGMPool } from "./lib/bgm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const OUTPUT_PATH = join(OUTPUT_DIR, "trending-sounds.json");
const BGM_DIR = join(__dirname, "assets", "bgm");

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const contentDir = getArg("content");
const keywordArg = getArg("keyword");

// ─── Load content keywords from meta.mjs ───
async function loadKeywords() {
  const keywords = new Set();

  if (contentDir) {
    try {
      const metaMod = await import(`./content/${contentDir}/meta.mjs`);
      const meta = metaMod.meta;
      if (meta.title) {
        // Extract meaningful words from title
        meta.title
          .toLowerCase()
          .split(/\s+/)
          .forEach((w) => {
            if (w.length > 2 && !["the", "and", "for", "with", "from"].includes(w)) {
              keywords.add(w);
            }
          });
      }
      if (meta.subject) keywords.add(meta.subject.toLowerCase());
    } catch {}
  }

  if (keywordArg) keywords.add(keywordArg.toLowerCase());

  // Always include news-related terms
  ["news", "breaking news", "tech news", "ai news"].forEach((k) => keywords.add(k));

  return [...keywords];
}

// ─── Generate search terms from BGM pool names ───
function getBGMSearchTerms() {
  // Only extract news-related words from filenames
  // (e.g. "news-cc-theme01.mp3" → "news", not "theme01")
  const pool = scanBGMPool();
  const terms = new Set();
  const meaningfulWords = new Set([
    "news",
    "breaking",
    "urgent",
    "headline",
    "crime",
    "investigative",
    "broadcast",
    "alert",
    "flash",
    "report",
    "intro",
    "theme",
  ]);

  for (const bgm of pool) {
    const base = basename(bgm.filename, ".mp3");
    const words = base.split(/[-_]/);
    for (const w of words) {
      if (meaningfulWords.has(w.toLowerCase())) {
        terms.add(w.toLowerCase());
      }
    }
  }

  // Add compound search terms (most useful for TikTok sound search)
  terms.add("breaking news");
  terms.add("news intro");
  terms.add("news theme");
  terms.add("urgent news");
  terms.add("news background music");
  terms.add("breaking news sound");

  return [...terms];
}

// ─── Generate TikTok search URLs ───
function generateSearchURLs(keywords, bgmTerms) {
  const urls = [];

  // Combine content keywords with BGM terms
  const searchQueries = new Set();

  // Primary: content keywords
  for (const kw of keywords) {
    searchQueries.add(kw);
  }

  // Secondary: BGM-derived terms
  for (const term of bgmTerms) {
    searchQueries.add(term);
  }

  // Tertiary: combined searches
  searchQueries.add("breaking news sound");
  searchQueries.add("news background music");
  searchQueries.add("trending news sound");

  for (const q of searchQueries) {
    const encoded = encodeURIComponent(q);
    urls.push({
      keyword: q,
      // TikTok sound search (works in TikTok app)
      tiktokSoundSearch: `https://www.tiktok.com/search?q=${encoded}&type=sound`,
      // TikTok general search (works in browser)
      tiktokSearch: `https://www.tiktok.com/search?q=${encoded}`,
      // In-app: tiktok://search?keyword=xxx&type=sound
      tiktokApp: `tiktok://search?keyword=${encoded}&type=sound`,
    });
  }

  return urls;
}

// ─── Main ───

async function main() {
  console.log("🎵 TikTok Trending Sounds Recommender");
  console.log("=".repeat(50));

  // Load keywords
  const keywords = await loadKeywords();
  console.log(`\n  Content keywords: ${keywords.join(", ")}`);

  // Get BGM-derived search terms
  const bgmTerms = getBGMSearchTerms();
  console.log(`  BGM-derived terms: ${bgmTerms.join(", ")}`);

  // Generate search URLs
  const searchURLs = generateSearchURLs(keywords, bgmTerms);

  // Output recommendations
  console.log("\n" + "=".repeat(50));
  console.log("🎯 TIKTOK SOUND SEARCH RECOMMENDATIONS");
  console.log("=".repeat(50));
  console.log("\n在 TikTok App 中搜索以下关键词，选择 trending sound：\n");

  // Prioritize: content keywords first, then BGM-derived
  const prioritized = [
    ...searchURLs.filter((u) => keywords.includes(u.keyword)),
    ...searchURLs.filter((u) => !keywords.includes(u.keyword)),
  ].slice(0, 8);

  for (let i = 0; i < prioritized.length; i++) {
    const u = prioritized[i];
    const isContent = keywords.includes(u.keyword);
    const tag = isContent ? "📌 content" : "🎵 bgm-pool";
    console.log(`  ${i + 1}. [${tag}] "${u.keyword}"`);
    console.log(`     🔗 ${u.tiktokSearch}`);
    console.log();
  }

  console.log("─".repeat(50));
  console.log("💡 HOW TO USE:");
  console.log("  1. 打开 TikTok App → 发布界面 → Add sound → Search");
  console.log("  2. 搜索上面推荐的关键词");
  console.log("  3. 选一个 trending sound（使用人数多的）");
  console.log("  4. 音量调到 5-10%（不要盖过 VO）");
  console.log("  5. 确认 sound 不是商业音乐（选 Original Sound 或用户原创）");
  console.log("─".repeat(50));
  console.log("\n⚠️  为什么 trending sound > 混入 BGM？");
  console.log("  TikTok 算法对使用 trending sound 的视频有 discoverability 加权。");
  console.log("  混入视频的 BGM 不享受这个加权。");
  console.log("=".repeat(50));

  // Save JSON
  const output = {
    generatedAt: new Date().toISOString(),
    contentKeywords: keywords,
    bgmDerivedTerms: bgmTerms,
    recommendations: prioritized.map((u) => ({
      keyword: u.keyword,
      searchUrl: u.tiktokSearch,
      source: keywords.includes(u.keyword) ? "content" : "bgm-pool",
    })),
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\n📁 Saved: ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
