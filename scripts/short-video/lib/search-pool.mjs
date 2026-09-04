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
 * Engine priority: Brave (2000 q/mo, best quality) > Tavily (1000 credits/mo,
 * AI-optimized) > Jina (1M tokens/mo). Engines whose API key is missing are
 * skipped without a network call. Credentials live in repo-root .env.local.
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

/** Fixed priority order — Brave > Tavily > Jina (see issue #65). */
const POOL_ENGINES = [
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
 *   fixed Brave > Tavily > Jina order
 * @param {number} [opts.timeoutMs] - Per-engine fetch timeout (default 15s)
 * @returns {Promise<{articles: Array, engine: string|null, attempts: Array}>}
 *   articles from the first engine that returned any; engine is null and
 *   attempts records every failure when all engines fail or return empty
 */
export async function searchPool(keyword, opts = {}) {
  const engines = opts.engines ?? POOL_ENGINES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
