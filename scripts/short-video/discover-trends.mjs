#!/usr/bin/env node
/**
 * China AI News Trend Discovery
 *
 * Scrapes 5 sources (量子位/机器之心/36氪/TechCrunch AI/Bloomberg Tech)
 * via Chrome CDP proxy, filters for China AI topics, classifies into
 * breaking/fermenting/data/explainer, deduplicates, and outputs JSON.
 *
 * Usage: node scripts/short-video/discover-trends.mjs
 *
 * Requires: Chrome Remote Debugging enabled + CDP proxy at localhost:3456
 *
 * Output: output/trending-topics.json
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  filterChinaAI,
  classifyTopic,
  deduplicateTopics,
  buildOutputJson,
} from "./lib/trends-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "output");
const OUTPUT_PATH = join(OUTPUT_DIR, "trending-topics.json");

const CDP_BASE = "http://localhost:3456";
const PAGE_LOAD_WAIT_MS = 3000;
const RETRY_WAIT_MS = 3000;

// ─── Source configurations ───

const SOURCES = [
  {
    name: "qbitai",
    label: "量子位",
    url: "https://www.qbitai.com/",
    extractScript: `
      var items = document.querySelectorAll('.article-item, .post-item, .list-item, article');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.article-item-title, .post-item-title, h2, h3, .title');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('qbitai.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "jiqizhixin",
    label: "机器之心",
    url: "https://www.jiqizhixin.com/",
    extractScript: `
      var items = document.querySelectorAll('.article-list__item, .post-item, article, .list-item');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.article__title, h2, h3, .title');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('jiqizhixin.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "36kr",
    label: "36氪",
    url: "https://36kr.com/",
    extractScript: `
      var items = document.querySelectorAll('.kr-flow-item, .article-item, .recommend-item, article');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.kr-flow-item-title, .article-item-title, h2, h3, .title, .pcach-name');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('36kr.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "techcrunch",
    label: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/",
    extractScript: `
      var items = document.querySelectorAll('article.post, article, .post-block');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('h2.article__title, h2, h3, .article__title');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 15 && text.length < 200 && a.href.includes('techcrunch.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "bloomberg",
    label: "Bloomberg Tech",
    url: "https://www.bloomberg.com/technology",
    extractScript: `
      var items = document.querySelectorAll('article, .story-package, .lede-package');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('h3.lede-text-v2, h2, h3, .headline');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 15 && text.length < 200 && a.href.includes('bloomberg.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
];

// ─── CDP helper functions (using fetch — no shell escaping issues) ───

async function cdpNewTab(url) {
  const resp = await fetch(`${CDP_BASE}/new?url=${encodeURIComponent(url)}`);
  const data = await resp.json();
  if (!data.targetId) {
    throw new Error(`Failed to create tab for ${url}`);
  }
  return data.targetId;
}

async function cdpEval(tabId, script) {
  const resp = await fetch(`${CDP_BASE}/eval?target=${tabId}`, {
    method: "POST",
    body: script,
  });
  return resp.json();
}

async function cdpCloseTab(tabId) {
  try {
    await fetch(`${CDP_BASE}/close?target=${tabId}`);
  } catch {
    // Ignore close errors
  }
}

async function waitForPageLoad(tabId, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await cdpEval(tabId, "document.readyState");
      const ready = resp?.result?.value || resp?.value || "";
      if (ready === "complete" || ready === "interactive") {
        return true;
      }
    } catch {
      // Tab not ready yet
    }
    if (i < retries) {
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    }
  }
  return false;
}

async function extractFromTab(tabId, extractScript) {
  try {
    // Wrap in IIFE — CDP eval doesn't support top-level return
    const wrappedScript = `(function(){${extractScript}})()`;
    const resp = await cdpEval(tabId, wrappedScript);
    // CDP eval returns { value: ... } — value may be array, string, or null
    let articles = resp?.result?.value || resp?.value || resp;
    if (Array.isArray(articles)) {
      return articles;
    }
    // Try parsing if it's a string (some CDP proxies serialize arrays as JSON strings)
    if (typeof articles === "string") {
      try {
        const parsed = JSON.parse(articles);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not JSON — return empty
      }
    }
    return [];
  } catch (e) {
    console.warn(`  ⚠️  Extract failed: ${e.message}`);
    return [];
  }
}

// ─── Main ───

async function main() {
  console.log("📡 China AI News Trend Discovery");
  console.log("=".repeat(60));

  // T2: Check CDP proxy
  console.log("\n🔌 Checking CDP proxy...");
  try {
    const resp = await fetch(`${CDP_BASE}/targets`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    console.log("  ✅ CDP proxy available");
  } catch {
    console.error("❌ CDP proxy not available at localhost:3456");
    console.error("   Enable Chrome Remote Debugging: chrome://inspect/#remote-debugging");
    process.exit(1);
  }

  // Scrape each source
  const allArticles = [];

  for (const source of SOURCES) {
    console.log(`\n🔍 Scraping ${source.label} (${source.name})...`);

    let tabId;
    try {
      tabId = await cdpNewTab(source.url);
      console.log(`  📑 Opened tab: ${tabId.substring(0, 12)}...`);
    } catch (e) {
      console.warn(`  ⚠️  Failed to open ${source.label}: ${e.message}`);
      continue;
    }

    // Wait for page to load
    await new Promise((r) => setTimeout(r, PAGE_LOAD_WAIT_MS));
    const loaded = await waitForPageLoad(tabId);

    if (!loaded) {
      console.warn(`  ⚠️  Page did not finish loading, attempting extraction anyway...`);
    }

    // Extract articles
    const articles = await extractFromTab(tabId, source.extractScript);
    console.log(`  📊 Extracted ${articles.length} articles`);

    if (articles.length === 0) {
      // T11: Retry once
      console.log("  ⏳ No articles found, retrying...");
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
      const retryArticles = await extractFromTab(tabId, source.extractScript);
      console.log(`  📊 Retry extracted ${retryArticles.length} articles`);

      for (const a of retryArticles) {
        allArticles.push({ ...a, source: source.name });
      }
    } else {
      for (const a of articles) {
        allArticles.push({ ...a, source: source.name });
      }
    }

    // Close tab
    await cdpCloseTab(tabId);
    console.log("  🚪 Tab closed");
  }

  console.log(`\n📊 Total articles scraped: ${allArticles.length}`);

  // Filter for China AI topics
  const filtered = filterChinaAI(allArticles);
  console.log(`🔍 China AI related: ${filtered.length}`);

  // Classify
  const classified = filtered.map((a) => ({
    ...a,
    category: classifyTopic(a.title),
  }));

  // Log classification summary
  const categoryCounts = {};
  for (const a of classified) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
  }
  console.log(`🏷️  Classification: ${JSON.stringify(categoryCounts)}`);

  // Deduplicate
  const deduplicated = deduplicateTopics(classified);
  console.log(`🔁 After dedup: ${deduplicated.length} unique topics`);

  // Build output
  const output = buildOutputJson(deduplicated);

  // T6: Warn if fewer than 5 topics
  if (output.totalTopics < 5) {
    console.warn(`⚠️  Only ${output.totalTopics} topics found (minimum 5 recommended)`);
  }

  // Write output
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`\n📁 Output written: ${OUTPUT_PATH}`);
  console.log(`   Total topics: ${output.totalTopics}`);
  console.log(`   Sources: ${JSON.stringify(output.sourceStats)}`);

  // Print top topics per category
  for (const [cat, topics] of Object.entries(output.topics)) {
    if (topics.length > 0) {
      console.log(`\n  📌 ${cat.toUpperCase()} (${topics.length}):`);
      for (const t of topics.slice(0, 3)) {
        console.log(`     • ${t.title}`);
      }
      if (topics.length > 3) {
        console.log(`     ... and ${topics.length - 3} more`);
      }
    }
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
