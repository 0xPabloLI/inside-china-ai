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
 */

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
 *  CSE lives in the content pipeline as a dedicated site-scoped source instead. */
const POOL_ENGINES = [
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
