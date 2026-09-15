/**
 * Source health tracking (#200).
 *
 * A CDP selector rotting into silent zero-results used to be
 * indistinguishable from "no news today": collectFromSource only surfaced
 * thrown failures, so a dead source never entered failedSources. This module
 * derives per-run zero-result sources from layer trajectories and maintains
 * the cross-run consecutive-zero-run streak in output/source-health.json so
 * selectors that have been silently dead for N runs surface for manual review.
 *
 * #269 Phase 1 extends this into a skip loop: a pre-flight URL probe verdict
 * judge (judgeUrlProbe), a keyword-relevance guard for false-positive result
 * sets (judgeRelevance), and a quarantined state — sources with
 * QUARANTINE_THRESHOLD consecutive invalid/zero runs are skipped by later runs
 * until a manual clear or a passing probe recheck after QUARANTINE_RECHECK_DAYS.
 *
 * Fail-open everywhere: health tracking must never break a discovery run.
 */

/** Consecutive zero-result runs before a source is flagged for review. */
export const REVIEW_THRESHOLD = 3;

/**
 * #269 Phase 1: consecutive invalid/zero runs before a source is quarantined
 * (skipped entirely by later runs until manual clear or probe recheck).
 * Aligned with REVIEW_THRESHOLD so a source flagged for review is also skipped.
 */
export const QUARANTINE_THRESHOLD = 3;

/**
 * #269 Phase 1: a quarantined source becomes eligible for one probe recheck
 * per run after this many days. Tunable: shorter = faster recovery detection,
 * longer = fewer wasted probes on long-dead sources.
 */
export const QUARANTINE_RECHECK_DAYS = 7;

/**
 * #269 Phase 1: a keyword-less result set of at least this many articles with
 * 0 keyword hits is a false positive (e.g. a dead search URL redirected CDP to
 * the homepage and articleScript's link-grab fallback scraped every link).
 * Tunable: lower = more aggressive invalidation, higher = more junk tolerated.
 * Small result sets are never invalidated — a genuine 3-article page that
 * happens not to repeat the keyword must survive.
 */
export const RELEVANCE_MIN_RESULTS = 10;

/** Homepage paths a search URL must never quietly become. */
const HOMEPAGE_PATHS = new Set(["", "/", "/index.html", "/index.htm", "/home", "/home.html"]);

/**
 * Normalize a URL for comparison: strip the leading "www." from the host and
 * trailing slashes from the path, so www↔apex and trailing-slash redirects
 * don't read as "off search".
 * @returns {{host: string, path: string, isHomepage: boolean}|null}
 */
function normalizeUrlParts(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return {
      host: u.hostname.replace(/^www\./, ""),
      path,
      isHomepage: HOMEPAGE_PATHS.has(path),
    };
  } catch {
    return null;
  }
}

/**
 * #269 Phase 1: judge a pre-flight probe of a source's search URL.
 *
 * Called with the raw probe outcome; pure and fail-open — without a real HTTP
 * response (network error, timeout, malformed URLs) the source stays alive and
 * the normal CDP layer runs.
 *
 * @param {object} probe
 * @param {string} probe.searchUrl - the registered search URL that was probed
 * @param {string|null} probe.finalUrl - post-redirect URL (null on network error)
 * @param {number|null} probe.httpStatus - HTTP status (null on network error)
 * @param {string} [probe.error] - network error message, if any
 * @returns {{dead: boolean, reason: "http-status"|"redirected-home"|"redirected-off-search"|null, detail: string}}
 */
export function judgeUrlProbe({ searchUrl, finalUrl, httpStatus, error } = {}) {
  if (httpStatus == null) {
    return { dead: false, reason: null, detail: error || "no http response" };
  }
  if (httpStatus >= 400) {
    return { dead: true, reason: "http-status", detail: `HTTP ${httpStatus}` };
  }
  const search = normalizeUrlParts(searchUrl);
  const final = normalizeUrlParts(finalUrl);
  if (!search || !final) {
    return { dead: false, reason: null, detail: "unparseable url" };
  }
  // Search path redirected to the site homepage / domain root — the classic
  // ithome failure form (#269): the search route is gone and the homepage
  // answers instead of erroring.
  if (!search.isHomepage && final.isHomepage) {
    return { dead: true, reason: "redirected-home", detail: `${search.path} → ${final.path}` };
  }
  // Redirected to a different site entirely (beyond www-normalization) with a
  // different path — the search endpoint is no longer where it was registered.
  if (search.host !== final.host && search.path !== final.path) {
    return {
      dead: true,
      reason: "redirected-off-search",
      detail: `${search.host}${search.path} → ${final.host}${final.path}`,
    };
  }
  return { dead: false, reason: null, detail: `HTTP ${httpStatus} ${final.host}${final.path}` };
}

/**
 * #269 Phase 1: split a search keyword into matchable tokens.
 * Chinese keywords (no spaces) survive as whole tokens — substring matching
 * applies. ASCII tokens match as whole words downstream; tokens shorter than
 * 2 chars are dropped ("V" alone would match everywhere).
 *
 * @param {string} keyword
 * @returns {string[]}
 */
export function keywordTokens(keyword) {
  const kw = (keyword ?? "").trim();
  if (!kw) return [];
  return kw
    .split(/[\s,，、;；|/+\-]+/)
    .map((t) => t.trim())
    .filter((t) => [...t].length >= 2);
}

/**
 * Whether one article (title/url) shows any token of the keyword.
 * Chinese tokens match by substring; pure-ASCII tokens match as whole words
 * (case-insensitive) so "V4" doesn't hit "V40".
 *
 * @param {string} keyword
 * @param {{title?: string, url?: string}} article
 * @returns {boolean}
 */
export function isKeywordRelevant(keyword, article) {
  const tokens = keywordTokens(keyword);
  if (tokens.length === 0) return true; // no keyword → cannot judge → pass
  // Chinese keywords often live in URLs percent-encoded (e.g. %E8%AE%AF%E9%A3%9E)
  let urlText = article?.url ?? "";
  try {
    urlText = decodeURIComponent(urlText);
  } catch {
    // keep the raw url — malformed escapes must not break matching
  }
  const haystack = `${article?.title ?? ""}\n${urlText}`;
  for (const token of tokens) {
    if (/^[\x20-\x7E]+$/.test(token)) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) return true;
    } else if (haystack.toLowerCase().includes(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * #269 Phase 1: relevance verdict for one source's result set.
 *
 * Invalid (false positive) only when the set is large (>= minResults) AND 0%
 * of items show the keyword. Fail-open in every other direction: no keyword,
 * small sets, or any hits → not invalid.
 *
 * @param {string|null} keyword
 * @param {Array<{title?: string, url?: string}>} articles
 * @param {{minResults?: number}} [opts]
 * @returns {{invalid: boolean, hits: number, total: number}}
 */
export function judgeRelevance(keyword, articles, opts = {}) {
  const minResults = opts.minResults ?? RELEVANCE_MIN_RESULTS;
  const list = Array.isArray(articles) ? articles : [];
  const total = list.length;
  if (!keywordTokens(keyword).length || total < minResults) {
    return { invalid: false, hits: total, total };
  }
  const hits = list.filter((a) => isKeywordRelevant(keyword, a)).length;
  return { invalid: hits === 0, hits, total };
}

/**
 * #269 Phase 1: quarantine gate for a health record.
 *
 * @param {object|null} record - health record for one source (null = unknown)
 * @param {number} now - current timestamp
 * @returns {{quarantined: boolean, recheckDue: boolean}}
 */
export function isQuarantined(record, now) {
  if (!record?.quarantined) return { quarantined: false, recheckDue: false };
  const recheckDue =
    typeof record.quarantinedAt === "number" &&
    now - record.quarantinedAt >= QUARANTINE_RECHECK_DAYS * 24 * 60 * 60 * 1000;
  return { quarantined: true, recheckDue };
}

/**
 * #269 Phase 1: clear the quarantine flags on a loaded health log in place
 * (used when a recheck probe passes or a source recovers). Returns the record
 * or null when the source is unknown. Fields-only change — old logs stay valid.
 *
 * @param {object|null} log - loaded health log ({version, sources})
 * @param {string} name
 * @returns {object|null} the cleared record
 */
export function clearQuarantine(log, name) {
  const record = log?.sources?.[name];
  if (!record) return null;
  delete record.quarantined;
  delete record.quarantinedAt;
  delete record.quarantineReason;
  record.consecutiveZeroRuns = 0;
  return record;
}

/**
 * Fold one run's per-source outcomes into the health log.
 *
 * @param {object|null} prevLog - previously loaded health log (null = fresh)
 * @param {Array<{name: string, count: number, zeroReason?: string, probe?: object}>} runEntries
 *   per-source collected-article counts for THIS run (sources that threw are
 *   excluded by the caller — they are already visible in failedSources).
 *   #269 Phase 1 extras: zeroReason labels why the run produced nothing
 *   ("zero-results" | "invalid-relevance" | "dead-url" | "dead-url-recheck" |
 *   "script-error" — #308 broken extraction script);
 *   probe persists the pre-flight URL probe outcome for observability.
 * @param {object} [opts]
 * @param {number} [opts.now] - timestamp override (tests)
 * @returns {{version: 1, sources: Record<string, object>}}
 */
export function updateSourceHealth(prevLog, runEntries, opts = {}) {
  const now = opts.now ?? Date.now();
  const sources = { ...(prevLog?.sources ?? {}) };
  for (const entry of runEntries ?? []) {
    if (!entry?.name) continue;
    const prev = sources[entry.name] ?? {
      consecutiveZeroRuns: 0,
      lastZeroAt: null,
      lastOkAt: null,
    };
    const probeFields = entry.probe ? { lastProbe: entry.probe } : {};
    if ((entry.count ?? 0) > 0) {
      const recovered = { ...prev, consecutiveZeroRuns: 0, lastOkAt: now, ...probeFields };
      // A recovering source clears its quarantine (#269 Phase 1).
      delete recovered.quarantined;
      delete recovered.quarantinedAt;
      delete recovered.quarantineReason;
      sources[entry.name] = recovered;
    } else {
      const next = {
        ...prev,
        consecutiveZeroRuns: (prev.consecutiveZeroRuns ?? 0) + 1,
        lastZeroAt: now,
        ...(entry.zeroReason ? { lastZeroReason: entry.zeroReason } : {}),
        ...probeFields,
      };
      if ((next.consecutiveZeroRuns ?? 0) >= QUARANTINE_THRESHOLD && !prev.quarantined) {
        next.quarantined = true;
        next.quarantinedAt = now;
        next.quarantineReason = entry.zeroReason ?? "zero-results";
      }
      sources[entry.name] = next;
    }
  }
  return { version: 1, sources };
}

/**
 * Derive this run's zero-result sources from the layer trajectory.
 *
 * A source is zero-result when every recorded layer produced 0 results.
 * Layers that were skipped (e.g. `skipped-same-url-as-api` — apiSearch and
 * CDP hit the same endpoint by design, issue #66) carry an explicit reason
 * so reviewers can tell "no next layer by design" from "all layers broken".
 *
 * @param {Array<{source: string, layer: string, count: number|null, reason?: string}>} attempts
 * @returns {Array<{source: string, attempts: Array, totalResults: number}>}
 */
export function deriveZeroResultSources(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) return [];
  const bySource = new Map();
  for (const e of attempts) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source).push(e);
  }
  const zero = [];
  for (const [source, events] of bySource) {
    const totalResults = events.reduce((sum, e) => sum + (e.count ?? 0), 0);
    if (totalResults === 0 && events.length > 0) {
      zero.push({ source, attempts: events, totalResults });
    }
  }
  return zero;
}
