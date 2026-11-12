/**
 * Search-source orthogonality metrics (#457, pilot stage).
 *
 * Pure functions only — no network, no fs. The harness hands in the raw
 * per-channel results, so every number in a report can be recomputed from a
 * stored run without spending quota again.
 *
 * Two dedupe keys are deliberately kept apart (ticket §2) and never merged
 * into one number:
 *
 * - URL level (`canonicalUrl`) — breadth: how many distinct results a set of
 *   channels surfaced.
 * - Published domain (`registrableDomain`) — independence: how many separate
 *   publishers, the same unit `web-deep-research` Phase 4 uses for
 *   triangulation. Three outlets reprinting one wire story are 3 results but
 *   1 independent source.
 *
 * `registrableDomain` approximates eTLD+1 with a small suffix table because
 * the repo has no public-suffix dependency; hosts it cannot split (IP
 * literals, exotic TLDs) degrade to the full hostname, which only makes the
 * domain column more conservative.
 */

const TRACKING_PARAM_RE = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|igshid|ref|ref_src|source|spm)$/i;

const MULTI_PART_SUFFIXES = new Set([
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "edu.cn",
  "ac.cn",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "co.jp",
  "co.kr",
  "com.tw",
  "com.hk",
  "com.sg",
  "com.au",
  "co.nz",
  "co.in",
  "com.br",
  "com.mx",
]);

/** URL-level key: host + path + sorted non-tracking query params. */
export function canonicalUrl(raw) {
  try {
    const url = new URL(String(raw));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM_RE.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length
      ? `?${params.map(([key, value]) => `${key}=${value}`).join("&")}`
      : "";
    return `${host}${url.pathname.replace(/\/+$/, "")}${query}`;
  } catch {
    return String(raw ?? "")
      .trim()
      .toLowerCase();
  }
}

/** Published-domain key (eTLD+1 approximation). */
export function registrableDomain(raw) {
  let host;
  try {
    host = new URL(String(raw)).hostname.toLowerCase();
  } catch {
    return "";
  }
  host = host.replace(/^(?:www|m)\./, "");
  if (!host) return "";
  // IPv4 literal — no registrable domain to extract.
  if (/^\d+(?:\.\d+){3}$/.test(host)) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

/** Count keys in `articles` that are neither in `seen` nor repeated here. */
export function uniqueCount(articles, keyOf, seen = new Set()) {
  const fresh = new Set();
  for (const article of articles ?? []) {
    const key = keyOf(article);
    if (!key || seen.has(key) || fresh.has(key)) continue;
    fresh.add(key);
  }
  return fresh.size;
}

/**
 * Greedy channel selection.
 *
 * Cost is one unit for every channel: the share of that channel's monthly
 * allowance a single call consumes (paid engines) — 0 for unmetered channels
 * (SearXNG, vertical sources). Free channels therefore have an infinite
 * marginal return and rank first; among them the faster one wins (p95 as the
 * tie-break, per the ticket), and paid channels rank by
 * `new unique keys / allowance share`. Calls and money are never mixed into
 * one denominator: Jina is token-metered, so its share is derived from the
 * recorded 58.9k-tokens-per-call anchor, not from a call count.
 *
 * @param {Array<{id: string, articles: Array, cost: number, latencyP95?: number|null}>} groups
 * @param {{keyOf: (article: any) => string}} opts
 */
export function greedySelection(groups, { keyOf }) {
  const remaining = groups.map((group) => ({
    id: group.id,
    articles: group.articles ?? [],
    cost: Number(group.cost) || 0,
    latencyP95: group.latencyP95 ?? null,
  }));
  const seen = new Set();
  const order = [];

  while (remaining.length > 0) {
    let best = null;
    for (const group of remaining) {
      const fresh = new Set();
      for (const article of group.articles) {
        const key = keyOf(article);
        if (!key || seen.has(key) || fresh.has(key)) continue;
        fresh.add(key);
      }
      if (fresh.size === 0) continue;
      const candidate = {
        id: group.id,
        uniqueAdded: fresh.size,
        cost: group.cost,
        latencyP95: group.latencyP95,
        score: group.cost > 0 ? fresh.size / group.cost : Number.POSITIVE_INFINITY,
        keys: fresh,
      };
      if (!best || ranksAbove(candidate, best)) best = candidate;
    }
    if (!best) break;
    for (const key of best.keys) seen.add(key);
    order.push({
      id: best.id,
      uniqueAdded: best.uniqueAdded,
      cost: best.cost,
      marginalPerShare: best.cost > 0 ? best.uniqueAdded / best.cost : null,
    });
    remaining.splice(
      remaining.findIndex((group) => group.id === best.id),
      1,
    );
  }

  return { order, totalUnique: seen.size };
}

function ranksAbove(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  const latencyA = a.latencyP95 ?? Number.POSITIVE_INFINITY;
  const latencyB = b.latencyP95 ?? Number.POSITIVE_INFINITY;
  if (latencyA !== latencyB) return latencyA < latencyB;
  return a.id < b.id;
}

/**
 * Pairwise overlap. `containment` (intersection / smaller set) is the mirror
 * signal — two channels returning the same 10 results score 1.0 even when
 * Jaccard alone would be diluted by one side returning extra noise.
 */
export function overlapMatrix(groups, { keyOf }) {
  const sets = new Map(
    groups.map((group) => [group.id, new Set((group.articles ?? []).map(keyOf).filter(Boolean))]),
  );
  const pairs = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = sets.get(groups[i].id);
      const b = sets.get(groups[j].id);
      if (!a.size || !b.size) continue;
      let intersection = 0;
      for (const key of a) if (b.has(key)) intersection++;
      const union = a.size + b.size - intersection;
      pairs.push({
        a: groups[i].id,
        b: groups[j].id,
        sizeA: a.size,
        sizeB: b.size,
        intersection,
        jaccard: union ? intersection / union : 0,
        containment: intersection / Math.min(a.size, b.size),
      });
    }
  }
  return pairs.sort((x, y) => y.containment - x.containment);
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "and",
  "or",
  "in",
  "on",
  "to",
  "with",
  "is",
  "are",
  "how",
  "what",
  "why",
]);
const CJK_RE = /[\u4e00-\u9fff]/;

/** Query terms for the cheap relevance heuristic: Latin words + CJK bigrams. */
function queryTerms(query) {
  const terms = new Set();
  for (const word of String(query)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9.+-]*/g) ?? []) {
    if (word.length >= 2 && !STOPWORDS.has(word)) terms.add(word);
  }
  for (const run of String(query).match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length === 1) terms.add(run);
    for (let i = 0; i + 1 < run.length; i++) terms.add(run.slice(i, i + 2));
  }
  return [...terms];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Heuristic topical relevance: share of query terms present in title+snippet.
 * Deliberately not an LLM judge — an LLM scores "unique but irrelevant" as
 * relevant, which is exactly the false positive marginal gain must exclude.
 */
export function relevanceCoverage(query, article) {
  const terms = queryTerms(query);
  if (terms.length === 0) return { coverage: 0, matched: 0, total: 0 };
  const text = `${article?.title ?? ""} ${article?.snippet ?? ""}`.toLowerCase();
  let matched = 0;
  for (const term of terms) {
    if (CJK_RE.test(term)) {
      if (text.includes(term)) matched++;
    } else if (new RegExp(`\\b${escapeRegExp(term)}`).test(text)) {
      matched++;
    }
  }
  return { coverage: matched / terms.length, matched, total: terms.length };
}

/** Token estimate for the payload we actually receive (CJK ≈ 1 token/char). */
export function estimateTokens(text) {
  const value = String(text ?? "");
  const cjk = (value.match(/[\u3000-\u9fff\uff00-\uffef]/g) ?? []).length;
  return Math.ceil(cjk + (value.length - cjk) / 4);
}

export function payloadTokens(articles) {
  return (articles ?? []).reduce(
    (total, article) => total + estimateTokens(article?.title) + estimateTokens(article?.snippet),
    0,
  );
}

export function latencyStats(samples) {
  const values = (samples ?? []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (values.length === 0) return { n: 0, p50: null, p95: null };
  const at = (p) =>
    values[Math.min(values.length - 1, Math.max(0, Math.ceil(p * values.length) - 1))];
  return { n: values.length, p50: at(0.5), p95: at(0.95) };
}

export function mean(values) {
  const xs = (values ?? []).filter((n) => Number.isFinite(n));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
