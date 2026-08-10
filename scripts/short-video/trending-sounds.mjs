#!/usr/bin/env node
/**
 * TikTok Trending Sounds — fetches trending sounds and matches them
 * against content keywords for manual selection during publishing.
 *
 * This does NOT bake BGM into the video. Instead, it recommends TikTok's
 * own trending sounds (which the algorithm favors) for the user to manually
 * add in the TikTok app when publishing. This is superior to baked-in BGM
 * because:
 *   1. TikTok algorithm boosts videos using trending sounds
 *   2. No copyright issues (TikTok has the rights)
 *   3. Sound is added in-app, not baked into video
 *
 * Usage:
 *   node scripts/short-video/trending-sounds.mjs [--content <dir>] [--keyword <kw>]
 *
 * Requires: Chrome CDP proxy at localhost:3456 (user's authenticated session)
 * Output: Console recommendations + output/trending-sounds.json
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  cdpNewTab,
  cdpCloseTab,
  cdpEval,
  waitForPageLoad,
  CDP_BASE,
} from "./lib/cdp-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const OUTPUT_PATH = join(OUTPUT_DIR, "trending-sounds.json");

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const contentDir = getArg("content");
const keywordArg = getArg("keyword");

// ─── Load content keywords ───
async function loadKeywords() {
  if (!contentDir) return keywordArg ? [keywordArg] : [];
  try {
    const metaMod = await import(`./content/${contentDir}/meta.mjs`);
    const meta = metaMod.meta;
    const keywords = new Set();

    // Extract keywords from meta
    if (meta.title) keywords.add(meta.title.toLowerCase());
    if (meta.subject) keywords.add(meta.subject.toLowerCase());
    if (meta.pipelineId) keywords.add(meta.pipelineId.toLowerCase());

    // Add general news/tech keywords
    keywords.add("news");
    keywords.add("breaking");
    keywords.add("tech");
    keywords.add("ai");

    return [...keywords];
  } catch {
    return keywordArg ? [keywordArg] : ["news", "breaking", "tech", "ai"];
  }
}

// ─── Scrape TikTok trending sounds ───
async function fetchTrendingSounds() {
  console.log("\n🔍 Fetching TikTok trending sounds...\n");

  // TikTok trending sounds page
  const url = "https://www.tiktok.com/music/trending";
  const tabId = await cdpNewTab(url);
  console.log(`  📑 Opened tab: ${tabId.substring(0, 12)}...`);

  // Wait for page load
  await new Promise((r) => setTimeout(r, 5000));
  await waitForPageLoad(tabId);

  // Extract trending sounds
  const extractScript = `(function(){
    var sounds = [];
    // TikTok sound cards
    var cards = document.querySelectorAll('[data-e2e="trending-sound-item"], [data-e2e="search_sound-item"], div[class*="DivSoundItem"], div[class*="SoundItem"], a[href*="/music/"]');
    
    cards.forEach(function(el, i) {
      if (i >= 20) return; // limit to 20
      var nameEl = el.querySelector('[data-e2e="sound-title"], .sound-title, h3, [class*="Title"]') || el;
      var linkEl = el.tagName === 'A' ? el : el.querySelector('a[href*="/music/"]');
      var countEl = el.querySelector('[data-e2e="sound-video-count"], .video-count, [class*="Count"]');
      
      var name = nameEl ? nameEl.textContent.trim() : '';
      var link = linkEl ? linkEl.href : '';
      var count = countEl ? countEl.textContent.trim() : '';
      
      if (name && name.length > 1) {
        sounds.push({ name: name, url: link, videoCount: count });
      }
    });
    
    // Fallback: extract from any music links on page
    if (sounds.length === 0) {
      document.querySelectorAll('a[href*="/music/"]').forEach(function(a, i) {
        if (i >= 20) return;
        var name = a.textContent.trim() || a.href.split('/').pop() || '';
        if (name && name.length > 1) {
          sounds.push({ name: name, url: a.href, videoCount: '' });
        }
      });
    }
    
    return sounds;
  })()`;

  const resp = await cdpEval(tabId, extractScript);
  const sounds = resp?.result?.value || resp?.value || [];

  await cdpCloseTab(tabId);
  console.log(`  📊 Found ${sounds.length} trending sounds`);

  return sounds;
}

// ─── Match sounds against keywords ───
function matchSounds(sounds, keywords) {
  if (keywords.length === 0) return sounds;

  const matched = [];
  const unmatched = [];

  for (const sound of sounds) {
    const lowerName = sound.name.toLowerCase();
    const isMatch = keywords.some((kw) => lowerName.includes(kw.toLowerCase()));
    if (isMatch) {
      matched.push({ ...sound, matchScore: 2 });
    } else {
      unmatched.push({ ...sound, matchScore: 0 });
    }
  }

  return { matched, unmatched };
}

// ─── Main ──

async function main() {
  console.log("🎵 TikTok Trending Sounds Recommender");
  console.log("=".repeat(50));

  // Load keywords
  const keywords = await loadKeywords();
  console.log(`  Keywords: ${keywords.join(", ") || "(none)"}`);

  // Check CDP
  try {
    const resp = await fetch(`${CDP_BASE}/targets`);
    if (!resp.ok) throw new Error();
    console.log("  ✅ CDP proxy available");
  } catch {
    console.error("❌ CDP proxy not available at localhost:3456");
    console.error("   Enable Chrome Remote Debugging + start web-access skill");
    process.exit(1);
  }

  // Fetch trending sounds
  const sounds = await fetchTrendingSounds();

  if (sounds.length === 0) {
    console.log("\n⚠️  No trending sounds found. TikTok may have changed their page structure.");
    console.log("   Try browsing https://www.tiktok.com/music/trending manually.");
    process.exit(0);
  }

  // Match against keywords
  const { matched, unmatched } = matchSounds(sounds, keywords);

  // Output
  console.log("\n" + "=".repeat(50));
  console.log("🎯 RECOMMENDED SOUNDS (matched content keywords)");
  console.log("=".repeat(50));
  if (matched.length > 0) {
    for (const s of matched) {
      console.log(`  ✅ ${s.name}`);
      console.log(`     ${s.url || "(no URL)"}`);
      if (s.videoCount) console.log(`     📊 ${s.videoCount} videos`);
      console.log();
    }
  } else {
    console.log("  No keyword matches found. Top trending sounds below:");
  }

  console.log("─".repeat(50));
  console.log("📈 ALL TRENDING SOUNDS (top 10)");
  console.log("─".repeat(50));
  const topSounds = (matched.length > 0 ? unmatched : sounds).slice(0, 10);
  for (const s of topSounds) {
    console.log(`  • ${s.name}`);
    if (s.url) console.log(`    ${s.url}`);
    console.log();
  }

  console.log("=".repeat(50));
  console.log("💡 HOW TO USE:");
  console.log("  1. Open TikTok app → Create → Add sound");
  console.log("  2. Search for a recommended sound name above");
  console.log("  3. Set volume: original audio 100%, trending sound 5-10%");
  console.log("  4. Publish with AIGC label + geographic tag");
  console.log("=".repeat(50));

  // Save JSON
  const output = {
    scrapedAt: new Date().toISOString(),
    keywords,
    matched: matched.length,
    total: sounds.length,
    sounds: { matched, unmatched: unmatched.slice(0, 10) },
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\n📁 Saved: ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
