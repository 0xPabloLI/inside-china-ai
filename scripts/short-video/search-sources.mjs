#!/usr/bin/env node
/**
 * China AI News — Source Search
 *
 * Unified search script with two modes:
 *   --trend    (default) Trend discovery: scrape all sources, filter for
 *              China AI, classify, deduplicate, output trending-topics.json
 *   --research Deep research: search only keyword-capable sources for a
 *              specific topic, no filtering/classification, output
 *              research-results.json grouped by source.
 *
 * Sources are defined in lib/source-registry.mjs (single source of source).
 * 28 sources total (7 news + 8 self-media + 4 western + 3 general + 5 last30days + 1 wechat).
 *
 * Fallback chain: apiSearch (if configured) → CDP → cdpFallback (Google site: search) → mcpFallback (mcp-search-bridge)
 * X search has mcp-search-bridge as MCP fallback (Grok has native X/Twitter data access).
 * Western/general sources primarily use mcp-search-bridge (Grok web search).
 * Sources with free APIs (arXiv, Reddit, HN, GitHub) use API direct-connect as first layer (Issue #34).
 *
 * Env vars for mcp-search-bridge:
 *   SEARCH_BASE_URL, SEARCH_API_KEY, SEARCH_MODEL
 *   MCP_SEARCH_BRIDGE_PATH (optional, defaults to ~/mcp-search-bridge/server.js)
 *
 * Usage:
 *   node scripts/short-video/search-sources.mjs [--keyword <kw>]           # --trend mode
 *   node scripts/short-video/search-sources.mjs --keyword "DeepSeek V4" --research
 *
 * Requires: Chrome Remote Debugging enabled + CDP proxy at localhost:3456
 *           (western/MCP sources work without CDP via mcp-search-bridge)
 *
 * Output:
 *   --trend:    output/trending-topics.json
 *   --research: output/research-results.json
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
import { ALL_SOURCES, DEFAULT_KEYWORDS } from "./lib/source-registry.mjs";
import { callMcpTool, parseMcpResult } from "./lib/mcp-client.mjs";
import {
  cdpNewTab,
  cdpCloseTab,
  waitForPageLoad,
  extractFromTab,
  checkLogin,
  CDP_BASE,
  RETRY_WAIT_MS,
} from "./lib/cdp-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "output");
const TREND_OUTPUT_PATH = join(OUTPUT_DIR, "trending-topics.json");
const RESEARCH_OUTPUT_PATH = join(OUTPUT_DIR, "research-results.json");

const PAGE_LOAD_WAIT_MS = 3000;

// ─── CLI args ───

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const keywordArg = getArg("keyword");
const isResearchMode = hasFlag("research");

// ─── Source collection ───

async function collectFromCdp(source, keyword) {
  const url = source.url(keyword || DEFAULT_KEYWORDS[0]);
  if (!url) return [];
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
      console.warn(`  ⚠️  ${source.label} 触发验证码，请在 Chrome 中手动通过验证码后重试`);
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

async function collectFromApi(source, keyword) {
  const api = source.apiSearch;
  if (!api) return [];

  const url = api.url(keyword || DEFAULT_KEYWORDS[0]);
  if (!url) return [];

  console.log(`  🔌 Trying API direct-connect for ${source.label}...`);

  try {
    const fetchOptions = {
      method: "GET",
      headers: api.headers || {},
      signal: AbortSignal.timeout(15000),
    };

    const resp = await fetch(url, fetchOptions);

    if (!resp.ok) {
      console.warn(`  ⚠️  API returned HTTP ${resp.status} for ${source.label}`);
      return [];
    }

    const text = await resp.text();
    const articles = api.parser(text);
    console.log(`  📊 API extracted ${articles.length} articles`);

    return articles;
  } catch (e) {
    console.warn(`  ⚠️  API direct-connect failed for ${source.label}: ${e.message}`);
    return [];
  }
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
    timeoutMs: fb.timeoutMs || 30000,
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
  // Step 0: Try API direct-connect (if configured — Issue #34)
  let articles = [];
  if (source.apiSearch) {
    articles = await collectFromApi(source, keyword);
  }

  // Step 1: If API failed (or not configured), try CDP
  if (articles.length === 0) {
    articles = await collectFromCdp(source, keyword);
  }

  // Step 2: If CDP failed and CDP fallback is configured, try it
  if (articles.length === 0 && source.cdpFallback) {
    console.log(`  📡 Trying CDP fallback for ${source.label}...`);
    const fallbackSource = {
      ...source,
      name: source.name + "_fallback",
      label: source.label + " (fallback)",
      url: source.cdpFallback.url,
      extractScript: source.cdpFallback.extractScript,
      loginCheckScript: null,
      needsAuth: false,
    };
    articles = await collectFromCdp(fallbackSource, keyword);
  }

  // Step 3: If still failed and MCP fallback is configured, try MCP
  if (articles.length === 0 && source.mcpFallback) {
    const mcpArticles = await collectFromMcp(source, keyword);
    articles = mcpArticles;
  }

  // Step 4: Clean titles if needed
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
  const mode = isResearchMode ? "research" : "trend";
  console.log(`📡 China AI News Source Search — ${mode} mode`);
  console.log("=".repeat(60));

  // Select sources based on mode
  const sources = isResearchMode ? ALL_SOURCES.filter((s) => s.supportsKeyword) : ALL_SOURCES;

  const sourceBreakdown = {
    news: sources.filter((s) => s.category === "news").length,
    self_media: sources.filter((s) => s.category === "self_media").length,
    western: sources.filter((s) => s.category === "western").length,
    general: sources.filter((s) => s.category === "general").length,
    last30days: sources.filter((s) => s.category === "last30days").length,
    wechat: sources.filter((s) => s.category === "wechat").length,
  };
  console.log(`  Sources: ${sources.length} (${JSON.stringify(sourceBreakdown)})`);
  if (keywordArg) {
    console.log(`  Keyword: ${keywordArg}`);
  }
  if (isResearchMode && !keywordArg) {
    console.error("❌ --research mode requires --keyword");
    process.exit(1);
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

  // Collect from selected sources
  const allArticles = [];
  const failedSources = [];
  const resultsBySource = {}; // For research mode

  for (const source of sources) {
    try {
      const articles = await collectFromSource(source, keywordArg);
      allArticles.push(...articles);
      if (isResearchMode) {
        resultsBySource[source.name] = {
          label: source.label,
          category: source.category,
          count: articles.length,
          articles: articles.map((a) => ({ title: a.title, url: a.url, snippet: a.snippet || "" })),
        };
      }
    } catch (e) {
      console.warn(`  ⚠️  ${source.label} failed: ${e.message}`);
      failedSources.push(source.name);
    }
  }

  console.log(`\n📊 Total articles scraped: ${allArticles.length}`);
  if (failedSources.length > 0) {
    console.warn(`⚠️  Failed sources: ${failedSources.join(", ")}`);
  }

  if (isResearchMode) {
    // ── Research mode: output raw results grouped by source ──
    const output = {
      keyword: keywordArg,
      mode: "research",
      timestamp: new Date().toISOString(),
      totalArticles: allArticles.length,
      sourceCount: sources.length,
      failedSources,
      results: resultsBySource,
    };

    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    writeFileSync(RESEARCH_OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

    console.log(`\n📁 Output written: ${RESEARCH_OUTPUT_PATH}`);
    console.log(`   Total articles: ${output.totalArticles}`);
    for (const [name, info] of Object.entries(resultsBySource)) {
      if (info.count > 0) {
        console.log(`   • ${info.label}: ${info.count} articles`);
      }
    }
    return;
  }

  // ── Trend mode: filter, classify, deduplicate ──

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
  writeFileSync(TREND_OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`\n📁 Output written: ${TREND_OUTPUT_PATH}`);
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
