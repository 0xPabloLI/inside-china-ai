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
 * 28 sources total (7 news + 8 self-media + 8 international + 5 general + 5 last30days + 1 wechat).
 *
 * Fallback chain: apiSearch (if configured) → CDP → googleSiteFallback (Google site: search) → apiFallback (direct Bigsong API, #90) → search pool (Brave > Tavily > Jina, #65) → mcpFallback (mcp-search-bridge/Grok, generic web_search sources only; other MCPs go straight to mcpFallback)
 * X search has mcp-search-bridge as MCP fallback (Grok has native X/Twitter data access).
 * International/general sources primarily use mcp-search-bridge (Grok web search).
 * Sources with free APIs (arXiv, Reddit, HN, GitHub) use API direct-connect as first layer (Issue #34).
 *
 * Env vars for mcp-search-bridge:
 *   SEARCH_BASE_URL, SEARCH_API_KEY, SEARCH_MODEL
 *   MCP_SEARCH_BRIDGE_PATH (optional, defaults to ~/mcp-search-bridge/server.js)
 *
 * Usage:
 *   node scripts/short-video/search-sources.mjs [--keyword <kw>]           # --trend mode
 *   node scripts/short-video/search-sources.mjs --keyword "DeepSeek V4" --research
 *   node scripts/short-video/search-sources.mjs --keyword "DeepSeek" --research --include-paid
 *
 * --include-paid: enable sources that consume paid API credits (ScrapeCreators, etc.)
 *                 Skipped by default to preserve free quota.
 *
 * Requires: Chrome Remote Debugging enabled + CDP proxy at localhost:3456
 *           (international/MCP sources work without CDP via mcp-search-bridge)
 *
 * Output:
 *   --trend:    output/trending-topics.json
 *   --research: output/research-results.json
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { DISCOVERY_SCHEMA_VERSION } from "./lib/research/schemas.mjs";
import {
  getResearchWorkspace,
  writeResearchArtifact,
  RESEARCH_ARTIFACTS,
} from "./lib/research/workspace.mjs";

import {
  filterChinaAI,
  classifyTopic,
  deduplicateTopics,
  buildOutputJson,
  cleanTitle,
  filterRecentTrackedArticles,
  dedupByUrl,
} from "./lib/trends-utils.mjs";
import { ALL_SOURCES, DEFAULT_KEYWORDS } from "./lib/source-registry.mjs";
import { callMcpTool, parseMcpResult } from "./lib/mcp-client.mjs";
import { searchX, searchXhs } from "./lib/bigsong-api.mjs";
import { searchPool, isPoolEligible } from "./lib/search-pool.mjs";
import {
  cdpNewTab,
  cdpCloseTab,
  waitForPageLoad,
  extractFromTab,
  checkLogin,
  ensureCdpProxy,
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
const includePaid = hasFlag("include-paid");
const contentIdArg = getArg("content-id");
const researchRunIdArg = getArg("research-run-id");

// When --content-id is provided, output goes to content-scoped discovery.json
const isScopedMode = !!contentIdArg;

// ─── Source collection ───

let cdpAvailable = true; // Set to false if CDP proxy check fails in main()

/**
 * SVE (#114): Enrich articles with imageUrl, videoUrls, and metadata
 * extracted from the same DOM.
 *
 * Runs a single CDP eval on the still-open tab to find:
 * - <img> elements near article links (existing image enrichment)
 * - <video> src, <iframe> embeds, og:video meta (video signals)
 * - og:image, og:title, article:published_time (metadata)
 *
 * This is zero additional navigation — the tab is already open
 * from the articleScript call.
 *
 * @param {string} tabId - CDP tab ID (still open)
 * @param {Array<{title: string, url: string}>} articles - Articles from articleScript
 * @returns {Promise<Array>} Articles with imageUrl/hasImage/videoUrls/metadata fields added
 */
async function enrichWithMedia(tabId, articles) {
  const mediaScript = `
    var results = { images: {}, videos: {}, metadata: {} };

    // Extract images near article links (existing behavior)
    var links = document.querySelectorAll('a[href]');
    links.forEach(function(a) {
      var img = a.querySelector('img') || a.parentElement?.querySelector('img') || a.closest('article, .article-item, .post-item, .list-item, .kr-flow-item, .recommend-item')?.querySelector('img');
      if (img && img.src && img.src.startsWith('http')) {
        results.images[a.href] = img.src;
      }
    });

    // Extract video signals from the page
    // <video> elements
    document.querySelectorAll('video[src]').forEach(function(v) {
      if (v.src) results.videos._page = results.videos._page || [];
      if (v.src && !results.videos._page.includes(v.src)) results.videos._page.push(v.src);
    });
    // <video><source> elements
    document.querySelectorAll('video source[src]').forEach(function(s) {
      if (s.src) {
        results.videos._page = results.videos._page || [];
        if (!results.videos._page.includes(s.src)) results.videos._page.push(s.src);
      }
    });
    // <iframe> embeds (YouTube, Bilibili, Douyin)
    document.querySelectorAll('iframe[src]').forEach(function(f) {
      var src = f.src || '';
      if (/youtube\.com\/embed|player\.bilibili\.com|douyin\.com|player\.youku\.com/i.test(src)) {
        results.videos._page = results.videos._page || [];
        if (!results.videos._page.includes(src)) results.videos._page.push(src);
      }
    });

    // Extract metadata from <meta> tags
    var ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    var ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    var ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content');
    var publishedTime = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content');
    if (ogImage) results.metadata.ogImage = ogImage;
    if (ogTitle) results.metadata.ogTitle = ogTitle;
    if (publishedTime) results.metadata.publishedTime = publishedTime;
    if (ogVideo) {
      results.videos._page = results.videos._page || [];
      if (!results.videos._page.includes(ogVideo)) results.videos._page.push(ogVideo);
    }

    return results;
  `;
  const mediaData = await extractFromTab(tabId, mediaScript);
  if (!mediaData || typeof mediaData !== "object") return articles;

  var pageVideos = (mediaData.videos && mediaData.videos._page) || [];
  var metadata = mediaData.metadata || {};

  return articles.map(function (a) {
    var imgUrl = a.imageUrl || (mediaData.images && mediaData.images[a.url]) || null;
    var result = Object.assign({}, a, {
      imageUrl: imgUrl,
      hasImage: !!imgUrl,
    });
    if (pageVideos.length > 0) result.videoUrls = pageVideos.slice();
    if (Object.keys(metadata).length > 0) result.metadata = Object.assign({}, metadata);
    return result;
  });
}

async function collectFromCdp(source, keyword) {
  if (!cdpAvailable) return [];
  // #67: Read from capabilities.articles with top-level fallback
  const cap = source.capabilities?.articles;
  const url = (cap?.url ?? source.url)(keyword || DEFAULT_KEYWORDS[0]);
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
  const needsAuth = cap?.needsAuth ?? source.needsAuth;
  const loginCheckScript = cap?.loginCheckScript ?? source.loginCheckScript;
  if (needsAuth && loginCheckScript) {
    const status = await checkLogin(tabId, loginCheckScript);
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
  const articleScript = cap?.articleScript ?? source.articleScript;
  let articles = await extractFromTab(tabId, articleScript);
  console.log(`  📊 Extracted ${articles.length} articles`);

  if (articles.length === 0) {
    // Retry once
    console.log("  ⏳ No articles found, retrying...");
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    articles = await extractFromTab(tabId, articleScript);
    console.log(`  📊 Retry extracted ${articles.length} articles`);
  }

  // R1: Extract imageUrl from the same DOM — zero additional requests.
  // The tab is still open; we run a second eval to find images alongside
  // the same article items. enrichWithImages adds imageUrl/hasImage to
  // each article that has a matching image.
  if (articles.length > 0) {
    try {
      articles = await enrichWithMedia(tabId, articles);
    } catch (e) {
      // Non-fatal — articles without media still work for trend discovery
      console.warn(`  ⚠️  Media enrichment failed: ${e.message}`);
    }
  }

  // Close tab
  await cdpCloseTab(tabId);
  console.log("  🚪 Tab closed");

  return articles;
}

async function collectFromApi(source, keyword) {
  // #67: Read from capabilities.articles with top-level fallback
  const api = source.capabilities?.articles?.apiSearch ?? source.apiSearch;
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
  // #67: Read from capabilities.articles with top-level fallback
  const fb = source.capabilities?.articles?.mcpFallback ?? source.mcpFallback;
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

/**
 * Issue #90: direct Bigsong API fallback — same upstream as the MCP bridge,
 * minus the subprocess + JSON-RPC hop. apiFallback carries the resultMapper;
 * the search function is picked per source (xhs → dots-chat, x → SEARCH_MODEL).
 *
 * @param {Object} source - Source definition from source-registry
 * @param {string|null} keyword - Search keyword (null → DEFAULT_KEYWORDS[0])
 * @param {Object} apiFallback - apiFallback config (resultMapper + optional model)
 * @returns {Array} Extracted articles, or empty array on failure
 */
async function collectFromBigsong(source, keyword, apiFallback) {
  console.log(`  🔎 Trying Bigsong API for ${source.label}...`);

  const kw = keyword || DEFAULT_KEYWORDS[0];
  const search = source.name === "xhs" ? searchXhs : searchX;
  const result = await search(kw, apiFallback);

  if (!result.success) {
    console.warn(`  ⚠️  Bigsong API failed: ${result.error}`);
    return [];
  }

  const mapped = apiFallback.resultMapper(result.data);
  console.log(`  📊 Bigsong API extracted ${mapped.length} articles`);

  return mapped;
}

/**
 * Issue #66 Step 0.5: should CDP be skipped when the API layer returned 0?
 *
 * True when the source's CDP url points at the SAME endpoint as its API url
 * (e.g. wechat2rss_* RSS feeds, hackernews_search Algolia JSON, reddit_search
 * .json): same URL means same result, so opening a browser tab after an API
 * failure is pure waste. Sources whose CDP url is a distinct site-search page
 * (gnews, arxiv_search, github_search, ...) keep the normal fallback.
 *
 * @param {Object} source - Source definition from source-registry
 * @param {string|null} keyword - Search keyword (null → DEFAULT_KEYWORDS[0])
 * @returns {boolean} true when CDP fallback after API failure is redundant
 */
export function shouldSkipCdpOnApiFail(source, keyword) {
  // #67: Read from capabilities.articles with top-level fallback
  const cap = source?.capabilities?.articles;
  const apiSearch = cap?.apiSearch ?? source?.apiSearch;
  const cdpUrlFn = cap?.url ?? source?.url;
  if (!apiSearch || !cdpUrlFn) return false;

  const kw = keyword || DEFAULT_KEYWORDS[0];
  let apiUrl;
  let cdpUrl;
  try {
    apiUrl = apiSearch.url(kw);
    cdpUrl = cdpUrlFn(kw);
  } catch {
    return false; // Can't prove redundancy → keep the normal fallback
  }
  return !!apiUrl && apiUrl === cdpUrl;
}

// Exported for tests/integration drivers (same pattern as shouldSkipCdpOnApiFail)
export async function collectFromSource(source, keyword) {
  // #67: Read from capabilities.articles with top-level fallback
  const cap = source.capabilities?.articles;
  const apiSearch = cap?.apiSearch ?? source.apiSearch;
  const googleSiteFallback = cap?.googleSiteFallback ?? source.googleSiteFallback;
  const mcpFallback = cap?.mcpFallback ?? source.mcpFallback;
  const apiFallback = cap?.apiFallback ?? source.apiFallback;
  const useCleanTitle = cap?.useCleanTitle ?? source.useCleanTitle;

  // Step 0: Try API direct-connect (if configured — Issue #34)
  let articles = [];
  if (apiSearch) {
    articles = await collectFromApi(source, keyword);
  }

  // Step 0.5 (Issue #66): If API failed AND the CDP url is the same endpoint
  // as the API url, skip CDP — same URL, same result, pure browser waste.
  // Sources without an API are unaffected (shouldSkipCdpOnApiFail returns false).
  if (articles.length === 0 && !shouldSkipCdpOnApiFail(source, keyword)) {
    articles = await collectFromCdp(source, keyword);
  }

  // Step 2: If CDP failed and CDP fallback is configured, try it
  if (articles.length === 0 && googleSiteFallback) {
    console.log(`  📡 Trying CDP fallback for ${source.label}...`);
    const fallbackSource = {
      ...source,
      name: source.name + "_fallback",
      label: source.label + " (fallback)",
      url: googleSiteFallback.url,
      articleScript: googleSiteFallback.articleScript,
      loginCheckScript: null,
      needsAuth: false,
    };
    articles = await collectFromCdp(fallbackSource, keyword);
  }

  // Step 2.5 (Issue #90): If still failed and a direct Bigsong API fallback is
  // configured, call lib/bigsong-api.mjs directly — no subprocess, no JSON-RPC.
  if (articles.length === 0 && apiFallback) {
    articles = await collectFromBigsong(source, keyword, apiFallback);
  }

  // Step 3: If still failed and MCP fallback is configured, try MCP.
  // #65: For the generic web_search sources (x_search/youtube/arxiv/github/
  // threads/google/mcp_grok_search), the REST pool (Brave > Tavily > Jina)
  // runs first; the Grok bridge stays as the last resort. Platform-specific
  // MCP fallbacks (xhs/sogou_weixin/weibo_hot/bilibili) keep the direct MCP
  // path — the pool does not replace them.
  if (articles.length === 0 && mcpFallback) {
    if (isPoolEligible(source)) {
      console.log(`  🏊 Trying search pool for ${source.label}...`);
      const poolResult = await searchPool(keyword || DEFAULT_KEYWORDS[0]);
      for (const attempt of poolResult.attempts) {
        console.warn(`  ⚠️  Pool engine ${attempt.engine}: ${attempt.error}`);
      }
      if (poolResult.articles.length > 0) {
        articles = poolResult.articles;
        console.log(`  📊 Pool (${poolResult.engine}) extracted ${articles.length} articles`);
      } else {
        articles = await collectFromMcp(source, keyword);
      }
    } else {
      const mcpArticles = await collectFromMcp(source, keyword);
      articles = mcpArticles;
    }
  }

  // Step 4: Clean titles if needed
  if (useCleanTitle) {
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

  // R2: Select sources based on mode — only sources with capabilities.articles
  // This excludes stock_media sources (Pexels, Unsplash, etc.) which only have
  // capabilities.images/videos and should not be used for article/trend discovery.
  // Research mode includes sources with supportsKeyword=true OR googleSiteFallback
  // (homepage-only sources can still contribute via Google site: fallback).
  let sources = isResearchMode
    ? ALL_SOURCES.filter(
        (s) =>
          s.capabilities?.articles?.supportsKeyword || s.capabilities?.articles?.googleSiteFallback,
      )
    : ALL_SOURCES.filter((s) => s.capabilities?.articles);

  // Filter out paid-API sources unless --include-paid is passed
  // #67: Read paidApi from capabilities.articles with top-level fallback
  const paidSources = sources.filter(
    (s) => s.capabilities?.articles?.paidApi ?? s.apiSearch?.paidApi,
  );
  if (paidSources.length > 0 && !includePaid) {
    const names = paidSources.map((s) => s.name).join(", ");
    console.log(`  💰 Skipping ${paidSources.length} paid-API source(s): ${names}`);
    console.log(`     Use --include-paid to enable them.`);
    sources = sources.filter((s) => !(s.capabilities?.articles?.paidApi ?? s.apiSearch?.paidApi));
  }

  const sourceBreakdown = {
    news: sources.filter((s) => s.category === "news").length,
    self_media: sources.filter((s) => s.category === "self_media").length,
    international: sources.filter((s) => s.category === "international").length,
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

  // Check CDP proxy availability
  // CDP is required for most sources, but MCP-only sources (e.g. mcp_grok_search)
  // and API-based sources (e.g. reddit_search, hackernews_search) can work without it.
  // #116: Auto-start CDP proxy if not running. Graceful degradation on failure.
  console.log("\n🔌 Checking CDP proxy...");
  cdpAvailable = await ensureCdpProxy();
  if (!cdpAvailable) {
    const mcpOrApiSources = sources.filter(
      (s) => s.accessMethod?.primary === "mcp" || s.apiSearch,
    ).length;
    if (mcpOrApiSources === sources.length) {
      console.log("  ⚠️  CDP proxy not available, but all sources are MCP/API-based — continuing");
    } else {
      console.warn("  ⚠️  CDP proxy could not be started. CDP sources will be skipped.");
      console.warn("     To enable: open Chrome and visit chrome://inspect/#remote-debugging");
      console.warn("     Or run: node ~/.agents/skills/web-access/scripts/check-deps.mjs");
    }
  }

  // Collect from selected sources
  const allArticles = [];
  const failedSources = [];
  const resultsBySource = {}; // For research mode

  for (const source of sources) {
    try {
      const fetchedArticles = await collectFromSource(source, keywordArg);
      const articles = filterRecentTrackedArticles(fetchedArticles, source.tracking);
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

  // #63: URL-level dedup — eliminate cross-source URL redundancy
  const beforeDedup = allArticles.length;
  const dedupedArticles = dedupByUrl(allArticles);
  allArticles.length = 0;
  allArticles.push(...dedupedArticles);
  const removedCount = beforeDedup - allArticles.length;
  if (removedCount > 0) {
    console.log(
      `🔗 URL dedup: ${beforeDedup} → ${allArticles.length} (${removedCount} duplicates removed)`,
    );
  }

  if (isResearchMode) {
    // ── Scoped mode: output discovery.json to content workspace ──
    if (isScopedMode) {
      const runId = researchRunIdArg || `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const discovery = {
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        contentId: contentIdArg,
        researchRunId: runId,
        timeWindow: { days: 7, until: new Date().toISOString().slice(0, 10) },
        locale: "zh-CN",
        sources: allArticles.map((a) => ({
          url: a.url || "",
          title: a.title || "",
          snippet: a.snippet || "",
          sourceName: a.source || "",
          sourceCategory: resultsBySource[a.source]?.category || "",
          publishedAt: a.publishedAt || null,
          collectionMethod: a.collectionMethod || "cdp",
          collectionStatus: "ok",
        })),
        failedSources: failedSources.map((name) => ({
          name,
          reason: resultsBySource[name]?.error || "unknown",
        })),
        sourceCount: allArticles.length,
        runMetadata: {
          startedAt: new Date().toISOString(),
          keyword: keywordArg,
          mode: "research",
        },
      };

      writeResearchArtifact(contentIdArg, runId, RESEARCH_ARTIFACTS.DISCOVERY, discovery);
      const workspacePath = getResearchWorkspace(contentIdArg);
      const discoveryPath = join(workspacePath, RESEARCH_ARTIFACTS.DISCOVERY);

      console.log(`\n📁 Discovery written: ${discoveryPath}`);
      console.log(`   Content ID: ${contentIdArg}`);
      console.log(`   Run ID: ${runId}`);
      console.log(`   Total sources: ${discovery.sourceCount}`);
      console.log(`   Failed sources: ${failedSources.length}`);
      return;
    }

    // ── Research mode (legacy): output raw results grouped by source ──
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

// Auto-run only when invoked directly as a CLI script (same pattern as
// asset-sourcer.mjs). Required so tests can import collectFromSource /
// shouldSkipCdpOnApiFail without triggering a live discovery run.
const isMainModule = process.argv[1] && process.argv[1].endsWith("search-sources.mjs");
if (isMainModule) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
