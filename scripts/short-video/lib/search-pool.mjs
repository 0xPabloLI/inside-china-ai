/**
 * General Search Pool (#65) — REST engine chain for Layer 3 fallback.
 *
 * Sits ahead of the Grok last resort for the 6 generic `web_search` sources
 * (youtube_search, arxiv_search, github_search, threads_search, google_search,
 * mcp_grok_search): quota engines (Serper > Brave > Tavily > Jina) run before
 * unlimited Grok. x_search is NOT pool-eligible by design (2026-09-15 user
 * verdict, #292): platform-specific, its Bigsong apiFallback returns
 * platform-faithful X tweets. Platform-specific MCP fallbacks (xhs,
 * sogou_weixin, weibo_hot, bilibili) are likewise excluded.
 *
 * Design (issue #65, 2026-08-25 精简版 — supersedes the 2026-08-20 handoff):
 * try-catch serial chain, NO quota tracking, NO persistence, NO monthly/day
 * resets. Each engine is called directly; an error, an HTTP 429/5xx, or an
 * empty result set falls through to the next engine. Grok (mcp-search-bridge)
 * remains the last resort and stays wired in search-sources.mjs via the
 * existing collectFromMcp path (or the direct Bigsong apiFallback for
 * x_search) — this module is pure REST.
 *
 * Engine priority: Serper (2500 q/mo, Google results) > Brave (2000 q/mo,
 * best quality) > Tavily (1000 credits/mo, AI-optimized) > Jina (1M tokens/mo).
 * Engines whose API
 * key is missing are skipped without a network call. Credentials live in repo-root .env.local.
 *
 * Known environment constraint (scripts/short-video/test-search-engines.mjs,
 * 2026-08 observation): Node fetch can fail DNS resolution for
 * api.search.brave.com under TUN fake-ip routing. The chain degrades to the
 * next engine on that failure; the Grok bridge remains the final fallback.
 * #281 retest (2026-09-14): NOT reproducing — fake-ip DNS still resolves
 * (198.18.x) but TUN now proxies the host correctly; Node fetch returns
 * HTTP 200 with results. If it recurs: add a proxy rule routing
 * api.search.brave.com through the proxy (not DIRECT), or DoH-resolve the
 * real IP and pin it with curl --resolve.
 *
 * CLI entry (#265): direct execution exposes an on-demand search CLI
 * (stdout = pure JSON, logs on stderr) — see the "CLI entry (#265)" section
 * at the bottom. skills/search-pool/SKILL.md documents agent-facing usage;
 * the resident MCP stdio server (search-pool-server.mjs) is deprecated.
 */

import { fileURLToPath } from "url";
import { loadEnv } from "./load-env.mjs";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_SNIPPET_LENGTH = 200;

// ─── publishedAt normalization (#309 news contract) ───
//
// The pool previously dropped every engine's date field in toArticle,
// leaving pool results outside any fail-closed freshness filter
// (filterRecentTrackedArticles needs a Date-parseable publishedAt). The
// 2026-09-16 probe confirmed: with news params on, Serper/Tavily/Brave
// carry dates on 100% of results (probe 1, #309). Normalize at this seam —
// relative strings ("1 day ago") degenerate to NaN downstream if passed raw.

const RELATIVE_AGO_RE = /^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i;
const RELATIVE_UNIT_MS = {
  second: 1e3,
  minute: 6e4,
  hour: 36e5,
  day: 864e5,
  week: 6048e5,
  month: 2592e6, // 30d approximation — freshness buckets, not calendar math
  year: 31536e6, // 365d approximation
};

/**
 * Normalize an engine date field into an ISO string.
 * Accepts RFC2822 / ISO / "Aug 9, 2025" (via Date), relative "N units ago",
 * and "Yesterday". Unparseable or missing input → undefined, so the entry
 * simply has no publishedAt (fail-closed consumers drop it downstream)
 * instead of a garbage date.
 *
 * @param {string|null|undefined} raw
 * @returns {string|undefined}
 */
export function normalizePublishedDate(raw) {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;

  if (/^just now$/i.test(s)) return new Date().toISOString();
  if (/^yesterday$/i.test(s)) return new Date(Date.now() - 864e5).toISOString();
  const rel = s.match(RELATIVE_AGO_RE);
  if (rel) {
    const n = Number(rel[1]);
    const unitMs = RELATIVE_UNIT_MS[rel[2].toLowerCase()];
    if (Number.isFinite(n) && unitMs) return new Date(Date.now() - n * unitMs).toISOString();
    return undefined;
  }

  const t = new Date(s).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

// ─── news-mode window buckets (#309 ruling (b)) ───
//
// Engines express a recency window differently: Serper tbs qdr:d/w/m/y,
// Brave freshness pd/pw/pm/py, Tavily a plain integer `days`. Bucket the
// requested window onto the smallest engine bucket that covers it.

export function tbsForDays(days) {
  if (days <= 1) return "qdr:d";
  if (days <= 7) return "qdr:w";
  if (days <= 30) return "qdr:m";
  return "qdr:y";
}

export function freshnessForDays(days) {
  if (days <= 1) return "pd";
  if (days <= 7) return "pw";
  if (days <= 30) return "pm";
  return "py";
}

/**
 * Map a raw engine result entry into the article shape consumed by
 * search-sources.mjs. Entries without a usable url are dropped; snippets are
 * capped so long descriptions don't bloat downstream prompt payloads.
 *
 * Two field vocabularies reach this seam (#281): Brave/Tavily/Jina return
 * `url` + `description`/`content`, while Serper.dev returns `link` +
 * `snippet` — normalizing both here keeps every engine adapter on one path
 * (the Serper-only `link`/`snippet` shape previously parsed as "0 results"
 * and silently burned quota each run).
 *
 * `publishedAt` (#309): each engine's date field is normalized to ISO here
 * (see normalizePublishedDate); entries without a usable date carry none —
 * fail-closed freshness filters drop them downstream.
 */
function toArticle(title, url, snippet, dateRaw) {
  const cleanUrl = typeof url === "string" ? url.trim() : "";
  if (!cleanUrl.startsWith("http")) return null;
  const article = {
    title: (title || "").trim(),
    url: cleanUrl,
    snippet: (snippet || "").trim().slice(0, MAX_SNIPPET_LENGTH),
  };
  const publishedAt = normalizePublishedDate(dateRaw);
  if (publishedAt) article.publishedAt = publishedAt;
  return article;
}

function parseArticles(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) =>
      toArticle(
        e?.title,
        e?.url ?? e?.link,
        e?.description ?? e?.snippet ?? e?.content,
        e?.published_date ?? e?.page_age ?? e?.date ?? e?.age,
      ),
    )
    .filter(Boolean);
}

/** Brave Search: GET + X-Subscription-Token header, results under web.results. */
async function searchBrave(keyword, apiKey, timeoutMs, news) {
  const freshness = news ? `&freshness=${freshnessForDays(news.days)}` : "";
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(keyword)}&count=20${freshness}`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `Brave HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.web?.results) };
}

/** Tavily: POST with bearer auth, results under results[].content. */
async function searchTavily(keyword, apiKey, timeoutMs, news) {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query: keyword,
      max_results: 20,
      ...(news ? { topic: "news", days: news.days } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `Tavily HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.results) };
}

/** Serper.dev: POST with X-API-KEY header, results under organic[].link. */
async function searchSerper(keyword, apiKey, timeoutMs, news) {
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: keyword, num: 20, ...(news ? { tbs: tbsForDays(news.days) } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return { ok: false, error: `Serper HTTP ${resp.status}` };
  const data = await resp.json();
  return { ok: true, articles: parseArticles(data?.organic) };
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
 *  `newsCapable` (#309): engines that honor a news window (tbs/freshness/topic)
 *  AND return per-entry dates on every result. Jina has no news param and
 *  only partial per-entry dates (probe 2026-09-16: 5/8 dated, 58.9k tokens
 *  per call) — it exits the news chain fail-closed and stays in the general
 *  chain.
 *  Exported so tests can pin an explicit engine list via the opts.engines seam. */
export const POOL_ENGINES = [
  { name: "serper", apiKeyEnv: "SERPER_API_KEY", newsCapable: true, search: searchSerper },
  { name: "brave", apiKeyEnv: "BRAVE_SEARCH_API_KEY", newsCapable: true, search: searchBrave },
  { name: "tavily", apiKeyEnv: "TAVILY_API_KEY", newsCapable: true, search: searchTavily },
  { name: "jina", apiKeyEnv: "JINA_API_KEY", newsCapable: false, search: searchJina },
];

/** Engine names in priority order — exported for tests and status logs. */
export const POOL_ENGINE_NAMES = POOL_ENGINES.map((e) => e.name);

/**
 * A source is pool-eligible when its mcpFallback is the generic Grok
 * web_search bridge (toolName "web_search") — the generic layer this pool
 * sits ahead of (#65: quota engines run before unlimited Grok). Six sources:
 * youtube_search, arxiv_search, github_search, threads_search, google_search,
 * mcp_grok_search.
 *
 * x_search is deliberately EXCLUDED (2026-09-15 user verdict, #292): it is a
 * platform-specific source (needsAuth) whose Grok access is the direct
 * Bigsong apiFallback (#90) returning platform-faithful X tweets. Generic
 * pool results would carry the x_search label without being X content and
 * preempt the higher-quality Bigsong take. Triage rule 1 (platform sources
 * never enter the generic pool) prevails over #65's stale 7-source letter.
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
 * @param {boolean|{days: number}} [opts.news] - News-contract mode (#309):
 *   engines receive a recency window (Serper tbs / Brave freshness /
 *   Tavily topic:"news"+days; default 7 days) and non-newsCapable engines
 *   (Jina) are skipped fail-closed. Omit for the general web chain.
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
  const news = opts.news ? { days: opts.news?.days ?? 7 } : null;

  if (opts.mode === "parallel") {
    return searchPoolParallel(keyword, engines, timeoutMs, news);
  }

  const attempts = [];

  for (const engine of engines) {
    if (news && engine.newsCapable === false) {
      attempts.push({
        engine: engine.name,
        ok: false,
        error:
          "skipped: no news window and only partial per-entry dates — fail-closed news exit (#309)",
      });
      continue;
    }
    const apiKey = process.env[engine.apiKeyEnv] || "";
    if (!apiKey) {
      attempts.push({ engine: engine.name, ok: false, error: `missing ${engine.apiKeyEnv}` });
      continue;
    }

    let result;
    try {
      result = await engine.search(keyword, apiKey, timeoutMs, news);
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
 * News-mode handling matches serial: non-newsCapable engines are skipped
 * fail-closed (#309).
 */
async function searchPoolParallel(keyword, engines, timeoutMs, news = null) {
  const attempts = [];

  const activeEngines = engines.filter((engine) => {
    if (news && engine.newsCapable === false) {
      attempts.push({
        engine: engine.name,
        ok: false,
        error:
          "skipped: no news window and only partial per-entry dates — fail-closed news exit (#309)",
      });
      return false;
    }
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
      const result = await engine.search(keyword, apiKey, timeoutMs, news);
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

/** Validate a positive-integer flag value, shared by both flag spellings. */
function parsePositiveIntFlag(name, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }
  return n;
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
      parsed.maxResults = parsePositiveIntFlag("--max-results", value);
    } else if (token.startsWith("--max-results=")) {
      parsed.maxResults = parsePositiveIntFlag(
        "--max-results",
        token.slice("--max-results=".length),
      );
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
    const articles = cliArgs.maxResults
      ? pool.articles.slice(0, cliArgs.maxResults)
      : pool.articles;
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
  loadEnv(); // #287 — the CLI entry owns env loading; the library never self-loads
  process.exitCode = await runSearchPoolCli(process.argv.slice(2));
}
