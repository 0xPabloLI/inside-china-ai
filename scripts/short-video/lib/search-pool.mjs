/**
 * General Search Pool (#65) — REST engine chain for Layer 3 fallback.
 *
 * Replaces the Grok-only mcpFallback for the 7 generic `web_search` sources
 * (x_search, youtube_search, arxiv_search, github_search, threads_search,
 * google_search, mcp_grok_search). Platform-specific MCP fallbacks
 * (xhs, sogou_weixin, weibo_hot, bilibili) are NOT pool-eligible.
 *
 * Design (issue #65, 2026-08-25 精简版 — supersedes the 2026-08-20 handoff):
 * try-catch serial chain, NO quota tracking, NO persistence, NO monthly/day
 * resets. Each engine is called directly; an error, an HTTP 429/5xx, or an
 * empty result set falls through to the next engine. Grok (mcp-search-bridge)
 * remains the last resort but stays wired in search-sources.mjs Step 3 via
 * the existing collectFromMcp path — this module is pure REST.
 *
 * Engine priority: Serper (2500 q/mo, Google results) > Brave (2000 q/mo,
 * best quality) > Tavily (1000 credits/mo, AI-optimized) > Jina (1M tokens/mo).
 * GoogleCSE is NOT in the pool — it is site-scoped (50 AI news domains) and
 * belongs in the content pipeline, not general web search. Engines whose API
 * key is missing are skipped without a network call. Credentials live in repo-root .env.local.
 *
 * Known environment constraint (scripts/short-video/test-search-engines.mjs,
 * 2026-08 observation): Node fetch can fail DNS resolution for
 * api.search.brave.com under TUN fake-ip routing. The chain degrades to the
 * next engine on that failure; the Grok bridge remains the final fallback.
 *
 * CLI entry (#265): direct execution exposes an on-demand search CLI
 * (stdout = pure JSON, logs on stderr) — see the "CLI entry (#265)" section
 * at the bottom. skills/search-pool/SKILL.md documents agent-facing usage;
 * the resident MCP stdio server (search-pool-server.mjs) is deprecated.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_SNIPPET_LENGTH = 200;

/**
 * Map a raw engine result entry into the article shape consumed by
 * search-sources.mjs. Entries without a usable url are dropped; snippets are
 * capped so long descriptions don't bloat downstream prompt payloads.
 */
function toArticle(title, url, snippet) {
  const cleanUrl = typeof url === "string" ? url.trim() : "";
  if (!cleanUrl.startsWith("http")) return null;
  return {
    title: (title || "").trim(),
    url: cleanUrl,
    snippet: (snippet || "").trim().slice(0, MAX_SNIPPET_LENGTH),
  };
}

function parseArticles(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => toArticle(e?.title, e?.url, e?.description ?? e?.content))
    .filter(Boolean);
}

/** Brave Search: GET + X-Subscription-Token header, results under web.results. */
async function searchBrave(keyword, apiKey, timeoutMs) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(keyword)}&count=20`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `Brave HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.web?.results) };
}

/** Tavily: POST with bearer auth, results under results[].content. */
async function searchTavily(keyword, apiKey, timeoutMs) {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: keyword, max_results: 20 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `Tavily HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.results) };
}

/** Serper.dev: POST with X-API-KEY header, results under organic[].link. */
async function searchSerper(keyword, apiKey, timeoutMs) {
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: keyword, num: 20 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `Serper HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.organic) };
}

/** Google CSE: GET with key+cx params, results under items[].link. */
async function searchGoogleCse(keyword, apiKey, timeoutMs) {
  const cx = process.env.GOOGLE_CSE_ID || "";
  if (!cx) return { ok: false, error: "missing GOOGLE_CSE_ID" };
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(keyword)}&num=20`;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `GoogleCSE HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.items) };
}

/** Jina Search: GET s.jina.ai/{query}, results under data[].description. */
async function searchJina(keyword, apiKey, timeoutMs) {
  const url = `https://s.jina.ai/${encodeURIComponent(keyword)}`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `Jina HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.data) };
}

/** Fixed priority order — Serper (2500/mo, Google results) > Brave (2000/mo) > Tavily (1000/mo) > Jina.
 *  GoogleCSE removed from pool: it is site-scoped (50 AI news domains), not general web search.
 *  CSE lives in the content pipeline as a dedicated site-scoped source instead.
 *  Exported so tests can pin an explicit engine list via the opts.engines seam. */
export const POOL_ENGINES = [
  { name: "serper", apiKeyEnv: "SERPER_API_KEY", search: searchSerper },
  { name: "brave", apiKeyEnv: "BRAVE_SEARCH_API_KEY", search: searchBrave },
  { name: "tavily", apiKeyEnv: "TAVILY_API_KEY", search: searchTavily },
  { name: "jina", apiKeyEnv: "JINA_API_KEY", search: searchJina },
];

/** Engine names in priority order — exported for tests and status logs. */
export const POOL_ENGINE_NAMES = POOL_ENGINES.map((e) => e.name);

/**
 * A source is pool-eligible when its mcpFallback is the generic Grok
 * web_search bridge (toolName "web_search") — the layer this pool replaces.
 * Platform-specific MCP fallbacks keep their dedicated MCP path.
 *
 * @param {Object|null} source - Source definition from source-registry
 * @returns {boolean}
 */
export function isPoolEligible(source) {
  const fb = source?.capabilities?.articles?.mcpFallback ?? source?.mcpFallback;
  return fb?.toolName === "web_search";
}

/**
 * Run the pool's serial engine chain for one keyword.
 *
 * @param {string} keyword - Search keyword
 * @param {Object} [opts]
 * @param {Array} [opts.engines] - Engine override (test seam); defaults to the
 *   fixed Serper > Brave > Tavily > Jina order
 * @param {number} [opts.timeoutMs] - Per-engine fetch timeout (default 15s)
 * @param {string} [opts.mode] - "parallel" runs all engines simultaneously and
 *   merges/deduplicates results by URL; default (serial) returns first success
 * @returns {Promise<{articles: Array, engine: string|null, attempts: Array}>}
 *   serial: articles from the first engine that returned any; engine is null
 *   when all fail. parallel: merged deduplicated articles from all engines;
 *   engine is "serper+brave+tavily" etc. attempts records every failure
 */
export async function searchPool(keyword, opts = {}) {
  const engines = opts.engines ?? POOL_ENGINES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (opts.mode === "parallel") {
    return searchPoolParallel(keyword, engines, timeoutMs);
  }

  const attempts = [];

  for (const engine of engines) {
    const apiKey = process.env[engine.apiKeyEnv] || "";
    if (!apiKey) {
      attempts.push({ engine: engine.name, ok: false, error: `missing ${engine.apiKeyEnv}` });
      continue;
    }

    let result;
    try {
      result = await engine.search(keyword, apiKey, timeoutMs);
    } catch (err) {
      const reason =
        err.name === "TimeoutError" || err.name === "AbortError"
          ? `${engine.name} timed out after ${timeoutMs}ms`
          : err.message;
      attempts.push({ engine: engine.name, ok: false, error: reason });
      continue;
    }

    if (!result.ok) {
      attempts.push({ engine: engine.name, ok: false, error: result.error });
      continue;
    }
    if (result.articles.length === 0) {
      attempts.push({ engine: engine.name, ok: false, error: "0 results" });
      continue;
    }

    return { articles: result.articles, engine: engine.name, attempts };
  }

  return { articles: [], engine: null, attempts };
}

/**
 * Parallel mode: fire all engines simultaneously, merge + deduplicate by URL.
 * Best for deep research where coverage matters more than quota efficiency.
 */
async function searchPoolParallel(keyword, engines, timeoutMs) {
  const attempts = [];

  const activeEngines = engines.filter((engine) => {
    const apiKey = process.env[engine.apiKeyEnv] || "";
    if (!apiKey) {
      attempts.push({ engine: engine.name, ok: false, error: `missing ${engine.apiKeyEnv}` });
      return false;
    }
    return true;
  });

  const results = await Promise.allSettled(
    activeEngines.map(async (engine) => {
      const apiKey = process.env[engine.apiKeyEnv];
      const result = await engine.search(keyword, apiKey, timeoutMs);
      return { name: engine.name, result };
    }),
  );

  const seenUrls = new Set();
  const merged = [];
  const contributors = [];

  for (const settled of results) {
    if (settled.status === "rejected") {
      attempts.push({ engine: "unknown", ok: false, error: settled.reason?.message || "rejected" });
      continue;
    }

    const { name, result } = settled.value;
    if (!result.ok) {
      attempts.push({ engine: name, ok: false, error: result.error });
      continue;
    }
    if (result.articles.length === 0) {
      attempts.push({ engine: name, ok: false, error: "0 results" });
      continue;
    }

    contributors.push(name);
    for (const article of result.articles) {
      if (!seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        merged.push(article);
      }
    }
  }

  return { articles: merged, engine: contributors.join("+") || null, attempts };
}

// ─── CLI entry (#265) ───
//
// Thin on-demand CLI over searchPool(), replacing the resident MCP stdio
// server (lib/search-pool-server.mjs, now deprecated). stdout carries ONLY
// the pure JSON result ({articles, engine, attempts}); every log or debug
// line goes to stderr. Exit code: 0 on success or empty result set, 1 on
// fatal errors (bad args, unknown engine, unexpected exception).
//
// Usage:
//   node scripts/short-video/lib/search-pool.mjs "<query>" \
//     [--engine <serper|brave|tavily|jina>] [--max-results <n>]

/** Minimal repo-root .env.local loader so the CLI works when spawned bare. */
function loadCliDotEnv() {
  try {
    const here = fileURLToPath(import.meta.url);
    const envPath = join(dirname(here), "..", "..", "..", ".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const match = line.match(/^(\w+)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {
    // No .env.local — engines will report missing keys per engine.
  }
}

/**
 * Parse CLI argv into {query, engine, maxResults}. Throws Error on usage
 * mistakes — the caller turns that into exit code 1 + stderr message.
 * Exported as a test seam (#265); not part of the searchPool API surface.
 *
 * @param {string[]} argv - process.argv.slice(2)
 */
export function parseSearchPoolCliArgs(argv) {
  const parsed = { query: "", engine: null, maxResults: null };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--engine") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--engine requires a value");
      parsed.engine = value;
    } else if (token.startsWith("--engine=")) {
      parsed.engine = token.slice("--engine=".length);
    } else if (token === "--max-results") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--max-results requires a value");
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`--max-results must be a positive integer, got "${value}"`);
      }
      parsed.maxResults = n;
    } else if (token.startsWith("--max-results=")) {
      const value = token.slice("--max-results=".length);
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`--max-results must be a positive integer, got "${value}"`);
      }
      parsed.maxResults = n;
    } else if (token.startsWith("--")) {
      throw new Error(`unknown option: ${token}`);
    } else {
      positional.push(token);
    }
  }

  parsed.query = positional.join(" ").trim();
  return parsed;
}

/**
 * Run the CLI with the given argv. Returns the process exit code (0 or 1).
 * deps is a test seam: searchPool override and an `out` line collector keep
 * tests off the network and off the real stdout.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @param {Object} [deps]
 * @param {Function} [deps.searchPool] - defaults to the real searchPool
 * @param {Function} [deps.out] - line sink, defaults to process.stdout.write
 * @param {Function} [deps.log] - stderr sink, defaults to process.stderr.write
 * @returns {Promise<number>} exit code
 */
export async function runSearchPoolCli(argv, deps = {}) {
  const search = deps.searchPool ?? searchPool;
  const out = deps.out ?? ((line) => process.stdout.write(line + "\n"));
  const log = deps.log ?? ((line) => process.stderr.write(line + "\n"));
  const usage =
    'usage: node scripts/short-video/lib/search-pool.mjs "<query>" ' +
    "[--engine <serper|brave|tavily|jina>] [--max-results <n>]";

  let cliArgs;
  try {
    cliArgs = parseSearchPoolCliArgs(argv);
  } catch (err) {
    log(`error: ${err.message}`);
    log(usage);
    return 1;
  }

  if (!cliArgs.query) {
    log("error: query is required");
    log(usage);
    return 1;
  }

  let engineList;
  if (cliArgs.engine) {
    engineList = POOL_ENGINES.filter((e) => e.name === cliArgs.engine);
    if (engineList.length === 0) {
      log(`error: unknown engine "${cliArgs.engine}" (available: ${POOL_ENGINE_NAMES.join(", ")})`);
      return 1;
    }
  }

  try {
    const pool = await search(cliArgs.query, engineList ? { engines: engineList } : {});
    const articles = cliArgs.maxResults ? pool.articles.slice(0, cliArgs.maxResults) : pool.articles;
    out(JSON.stringify({ articles, engine: pool.engine, attempts: pool.attempts }));
    return 0;
  } catch (err) {
    log(`error: ${err.message}`);
    return 1;
  }
}

/** ESM direct-execution guard: only run main() when invoked as a script. */
const isMainModule = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  loadCliDotEnv();
  process.exitCode = await runSearchPoolCli(process.argv.slice(2));
}
