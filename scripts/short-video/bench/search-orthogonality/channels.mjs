/**
 * Candidate channels for the orthogonality bench (#457).
 *
 * Every channel normalizes to `{ articles: [{title, url, snippet}] }`, capped
 * at the same `maxResults` so overlap numbers compare like with like. The
 * harness never re-implements a fetcher: pool engines come from
 * `scripts/short-video/lib/search-pool.mjs` (the `opts.engines` test seam), and
 * the six vertical sources come from the `web-access` skill module.
 *
 * `allowanceShare` is the fraction of a channel's monthly allowance one call
 * consumes — the single cost unit the greedy metric divides by:
 *
 * - Serper 1/2500, Brave 1/2000, Tavily 1/1000 calls per month.
 * - Jina is token-metered (1M tokens/month). One call is costed at the
 *   recorded 58.9k-tokens anchor (`search-pool.mjs` Jina comment, 2026-09-16
 *   probe) because the pool seam truncates snippets and therefore cannot
 *   report provider-side usage. Re-check the anchor before the full run.
 * - SearXNG (self-hosted) and the vertical sources are unmetered: 0.
 */

import { POOL_ENGINES, searchPool } from "../../lib/search-pool.mjs";

const SEARXNG_BASE = process.env.SEARXNG_URL || "http://localhost:8888";
const VERTICAL_MODULE = "../../../../skills/shared/web-access/scripts/vertical-search.mjs";

const JINA_TOKENS_PER_CALL_ANCHOR = 58900;
const JINA_MONTHLY_TOKENS = 1_000_000;

const POOL_ALLOWANCE = {
  serper: { perMonth: 2500, unit: "queries" },
  brave: { perMonth: 2000, unit: "queries" },
  tavily: { perMonth: 1000, unit: "queries" },
  jina: { perMonth: JINA_MONTHLY_TOKENS, unit: "tokens" },
};

const SEARXNG_ENGINES = ["google", "brave", "tavily"];
const VERTICAL_SOURCES = ["openalex", "arxiv", "hn", "stackoverflow", "wikipedia", "github"];

export const DEFAULT_CHANNELS = [
  ...POOL_ENGINES.map((engine) => `pool:${engine.name}`),
  ...SEARXNG_ENGINES.map((engine) => `searxng:${engine}`),
  ...VERTICAL_SOURCES.map((source) => `vertical:${source}`),
];

/** Metered = consumes a metered allowance; the pilot's budget guard counts these. */
export function isMetered(channelId) {
  return channelId.startsWith("pool:");
}

function allowanceShare(name) {
  const budget = POOL_ALLOWANCE[name];
  if (!budget) return 0;
  const perCall = budget.unit === "tokens" ? JINA_TOKENS_PER_CALL_ANCHOR : 1;
  return perCall / budget.perMonth;
}

function poolChannel(engine) {
  return {
    id: `pool:${engine.name}`,
    kind: "pool",
    allowanceShare: allowanceShare(engine.name),
    async run(query, { maxResults, timeoutMs }) {
      const result = await searchPool(query, { engines: [engine], timeoutMs });
      return {
        articles: result.articles.slice(0, maxResults),
        note: result.attempts.length
          ? result.attempts.map((a) => `${a.engine}: ${a.error}`).join("; ")
          : undefined,
      };
    },
  };
}

function searxngChannel(engine) {
  return {
    id: `searxng:${engine}`,
    kind: "searxng",
    allowanceShare: 0,
    async run(query, { maxResults, timeoutMs }) {
      const url = new URL("/search", SEARXNG_BASE);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("categories", "general");
      // `aggregate` = no engines param: SearXNG's default engine set in one
      // call. This is the realistic zero-quota breadth usage in
      // docs/tools-catalog.md. NOTE (#1276 data correction): the 2026-10-10
      // image has NO built-in tavily engine, so the pilot's `engines=tavily`
      // channel actually measured this aggregate (unknown engine name makes
      // SearXNG discard the whole engines param and run the default set).
      if (engine !== "aggregate") url.searchParams.set("engines", engine);
      // Aggregated SearXNG queries take 15-20s per docs/tools-catalog.md —
      // a short timeout reads as "unreachable" when it is just slow.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(timeoutMs, 30000)),
      });
      if (!response.ok) throw new Error(`SearXNG HTTP ${response.status}`);
      const data = await response.json();
      const unresponsive = (data?.unresponsive_engines ?? [])
        .map((entry) => (Array.isArray(entry) ? entry.join(": ") : String(entry)))
        .join("; ");
      return {
        articles: (data?.results ?? [])
          .filter((result) => typeof result?.url === "string" && result.url.startsWith("http"))
          .map((result) => ({
            title: result.title ?? "",
            url: result.url,
            snippet: result.content ?? "",
          }))
          .slice(0, maxResults),
        note: unresponsive ? `unresponsive_engines: ${unresponsive}` : undefined,
      };
    },
  };
}

function verticalChannel(source, module) {
  return {
    id: `vertical:${source}`,
    kind: "vertical",
    allowanceShare: 0,
    async run(query, { maxResults, lang }) {
      const result = await module.searchOne(source, query, maxResults, lang ? { lang } : {});
      if (result.error) {
        throw new Error(`${result.error}${result.hint ? ` (${result.hint})` : ""}`);
      }
      return { articles: (result.articles ?? []).slice(0, maxResults) };
    },
  };
}

/**
 * Build the requested channels. The vertical module is imported lazily so a
 * pool-only run works in a checkout where the `skills/shared` submodule is not
 * initialized.
 */
export async function loadChannels(ids = DEFAULT_CHANNELS) {
  const needsVertical = ids.some((id) => id.startsWith("vertical:"));
  const verticalModule = needsVertical
    ? await import(new URL(VERTICAL_MODULE, import.meta.url).href)
    : null;

  return ids.map((id) => {
    const [kind, name] = id.split(":");
    if (kind === "pool") {
      const engine = POOL_ENGINES.find((candidate) => candidate.name === name);
      if (!engine) throw new Error(`unknown pool engine: ${name}`);
      return poolChannel(engine);
    }
    if (kind === "searxng") return searxngChannel(name);
    if (kind === "vertical") {
      if (!verticalModule.SOURCES?.[name]) throw new Error(`unknown vertical source: ${name}`);
      return verticalChannel(name, verticalModule);
    }
    throw new Error(`unknown channel id: ${id}`);
  });
}
