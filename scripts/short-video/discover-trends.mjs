#!/usr/bin/env node
/**
 * China AI News Trend Discovery
 *
 * Scrapes 11 sources (5 news + 6 self-media) via Chrome CDP proxy,
 * filters for China AI topics, classifies into breaking/fermenting/data/explainer,
 * deduplicates, and outputs JSON.
 *
 * Sources:
 *   News: 量子位/机器之心/36氪/TechCrunch AI/Bloomberg Tech
 *   Self-media: 小红书/搜狗微信/微博热搜/B站/抖音/TikTok Creator Center
 *
 * Usage: node scripts/short-video/discover-trends.mjs [--keyword <kw>]
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
  cleanTitle,
} from "./lib/trends-utils.mjs";
import { ALL_SOURCES, DEFAULT_KEYWORDS } from "./lib/trend-sources.mjs";
import { callMcpTool, parseMcpResult } from "./lib/mcp-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "output");
const OUTPUT_PATH = join(OUTPUT_DIR, "trending-topics.json");

const CDP_BASE = "http://localhost:3456";
const PAGE_LOAD_WAIT_MS = 3000;
const RETRY_WAIT_MS = 3000;

// ─── CLI args ───

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const keywordArg = getArg("keyword");

// ─── CDP helper functions ───

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

async function checkLogin(tabId, loginCheckScript) {
  if (!loginCheckScript) return "ok";
  try {
    const wrappedScript = `(function(){${loginCheckScript}})()`;
    const resp = await cdpEval(tabId, wrappedScript);
    return resp?.result?.value || resp?.value || "ok";
  } catch {
    return "ok";
  }
}

// ─── Source collection ───

async function collectFromCdp(source, keyword) {
  const url = source.url(keyword || DEFAULT_KEYWORDS[0]);
  console.log(`\n🔍 Scraping ${source.label} (${source.name}) via CDP...`);

  let tabId;
  try {
    tabId = await cdpNewTab(url);
    console.log(`  📑 Opened tab: ${tabId.substring(0, 12)}...`);
  } catch (e) {
    console.warn(`  ⚠️  Failed to open ${source.label}: ${e.message}`);
    return [];
  }

  // Wait for page to load
  await new Promise((r) => setTimeout(r, PAGE_LOAD_WAIT_MS));
  const loaded = await waitForPageLoad(tabId);

  if (!loaded) {
    console.warn(`  ⚠️  Page did not finish loading, attempting extraction anyway...`);
  }

  // Check login if needed
  if (source.needsAuth && source.loginCheckScript) {
    const status = await checkLogin(tabId, source.loginCheckScript);
    if (status === "need_login") {
      console.warn(`  ⚠️  ${source.label} requires login — CDP failed`);
      await cdpCloseTab(tabId);
      return [];
    } else if (status === "captcha") {
      console.warn(`  ⚠️  ${source.label} triggered captcha — CDP failed`);
      await cdpCloseTab(tabId);
      return [];
    }
  }

  // Extract articles
  let articles = await extractFromTab(tabId, source.extractScript);
  console.log(`  📊 Extracted ${articles.length} articles`);

  if (articles.length === 0) {
    // Retry once
    console.log("  ⏳ No articles found, retrying...");
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    articles = await extractFromTab(tabId, source.extractScript);
    console.log(`  📊 Retry extracted ${articles.length} articles`);
  }

  // Close tab
  await cdpCloseTab(tabId);
  console.log("  🚪 Tab closed");

  return articles;
}

async function collectFromMcp(source, keyword) {
  const fb = source.mcpFallback;
  if (!fb) return [];

  console.log(`  📡 Trying MCP fallback for ${source.label}...`);

  const result = await callMcpTool({
    command: fb.command,
    args: fb.args,
    toolName: fb.toolName,
    toolArgs: fb.toolArgs(keyword || DEFAULT_KEYWORDS[0]),
    timeoutMs: 30000,
  });

  if (!result.success) {
    console.warn(`  ⚠️  MCP fallback failed: ${result.error}`);
    return [];
  }

  const parsed = parseMcpResult(result.data);
  const articles = fb.resultMapper(parsed);
  console.log(`  📊 MCP extracted ${articles.length} articles`);

  return articles;
}

async function collectFromSource(source, keyword) {
  // Step 1: Try CDP (primary)
  let articles = await collectFromCdp(source, keyword);

  // Step 2: If CDP failed and MCP fallback is configured, try MCP
  if (articles.length === 0 && source.mcpFallback) {
    const mcpArticles = await collectFromMcp(source, keyword);
    articles = mcpArticles;
  }

  // Step 3: Clean titles if needed
  if (source.useCleanTitle) {
    articles = articles.map((a) => ({
      ...a,
      title: cleanTitle(a.title || ""),
    }));
    // Filter out empty titles after cleaning
    articles = articles.filter((a) => a.title.length > 0);
  }

  // Add source name
  for (const a of articles) {
    a.source = source.name;
  }

  return articles;
}

// ─── Main ───

async function main() {
  console.log("📡 China AI News Trend Discovery");
  console.log("=".repeat(60));
  console.log(`  Sources: ${ALL_SOURCES.length} (5 news + 6 self-media)`);
  if (keywordArg) {
    console.log(`  Keyword: ${keywordArg}`);
  }

  // Check CDP proxy
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

  // Collect from all sources
  const allArticles = [];
  const failedSources = [];

  for (const source of ALL_SOURCES) {
    try {
      const articles = await collectFromSource(source, keywordArg);
      allArticles.push(...articles);
    } catch (e) {
      console.warn(`  ⚠️  ${source.label} failed: ${e.message}`);
      failedSources.push(source.name);
    }
  }

  console.log(`\n📊 Total articles scraped: ${allArticles.length}`);
  if (failedSources.length > 0) {
    console.warn(`⚠️  Failed sources: ${failedSources.join(", ")}`);
  }

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

  // Warn if fewer than 5 topics
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
