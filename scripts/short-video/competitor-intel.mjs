#!/usr/bin/env node
/**
 * Competitor Intelligence Script (ISSUE-05)
 *
 * Scrapes TikTok search for "China AI" related content,
 * extracts top videos' structure, and outputs analysis JSON.
 *
 * Usage: node scripts/short-video/competitor-intel.mjs
 * Requires: Chrome CDP proxy at localhost:3456
 * Output: output/competitor-analysis.json
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const OUTPUT_PATH = join(OUTPUT_DIR, "competitor-analysis.json");
const CDP_BASE = "http://localhost:3456";
const SEARCH_URL = "https://www.tiktok.com/search?q=china%20AI";

async function main() {
  console.log("🔍 Competitor Intelligence — TikTok China AI");
  console.log("=".repeat(50));

  // Check CDP
  try {
    const resp = await fetch(`${CDP_BASE}/targets`);
    if (!resp.ok) throw new Error();
    console.log("  ✅ CDP proxy available");
  } catch {
    console.error("❌ CDP proxy not available. Enable Chrome Remote Debugging.");
    process.exit(1);
  }

  // Open TikTok search
  const newResp = await fetch(`${CDP_BASE}/new?url=${encodeURIComponent(SEARCH_URL)}`);
  const newTab = await newResp.json();
  const tabId = newTab.targetId;
  console.log(`  📑 Opened TikTok search tab`);

  await new Promise((r) => setTimeout(r, 5000));

  // Extract video data
  const extractScript = `(function(){
    var videos = [];
    document.querySelectorAll('[data-e2e="search_video-item"], [data-e2e="search_top-item"], div[class*="DivItemContainer"]').forEach(function(el) {
      var link = el.querySelector('a[href*="/video/"]');
      var title = el.querySelector('[data-e2e="search_video-desc"] span, [data-e2e="video-desc"] span, .tiktok-1y3idas-DivContainer span');
      var author = el.querySelector('[data-e2e="search_video-author"] a, a[href*="/@"]');
      var views = el.querySelector('[data-e2e="search_video-views"], .video-views');
      if (link) {
        videos.push({
          url: link.href,
          title: title ? title.textContent.trim() : '',
          author: author ? author.textContent.trim() : '',
          views: views ? views.textContent.trim() : ''
        });
      }
    });
    if (videos.length === 0) {
      // Fallback: get all video links
      document.querySelectorAll('a[href*="/video/"]').forEach(function(a) {
        videos.push({ url: a.href, title: '', author: '', views: '' });
      });
    }
    return videos;
  })()`;

  const evalResp = await fetch(`${CDP_BASE}/eval?target=${tabId}`, {
    method: "POST",
    body: extractScript,
  });
  const evalData = await evalResp.json();
  const videos = evalData?.value || evalData?.result?.value || [];

  console.log(`  📊 Found ${videos.length} videos`);

  // Close tab
  await fetch(`${CDP_BASE}/close?target=${tabId}`);

  // Analyze
  const analysis = {
    scrapedAt: new Date().toISOString(),
    searchQuery: "China AI",
    totalVideos: videos.length,
    topVideos: videos.slice(0, 10).map((v, i) => ({
      rank: i + 1,
      url: v.url,
      title: v.title,
      author: v.author,
      views: v.views,
      // Agent can fill these in after watching:
      hookType: "",
      duration: "",
      captionStyle: "",
    })),
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(analysis, null, 2) + "\n", "utf8");

  console.log(`\n📁 ${OUTPUT_PATH}`);
  if (analysis.topVideos.length > 0) {
    console.log("\n📌 Top videos:");
    for (const v of analysis.topVideos.slice(0, 5)) {
      console.log(`  ${v.rank}. @${v.author}: ${v.title.substring(0, 60)}`);
    }
  }
  console.log("\n👤 Agent: watch top 3 videos and fill in hookType/duration/captionStyle fields.");
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
