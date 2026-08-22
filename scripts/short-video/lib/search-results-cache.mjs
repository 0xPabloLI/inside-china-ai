import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";

export const SEARCH_RESULTS_CACHE_VERSION = 1;
export const SEARCH_RESULTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function createSearchResultsCache() {
  return {
    version: SEARCH_RESULTS_CACHE_VERSION,
    entries: [],
  };
}

function normalizeCachePart(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasMatchingCacheKey(entry, source, keyword) {
  return (
    normalizeCachePart(entry?.source) === normalizeCachePart(source) &&
    normalizeCachePart(entry?.keyword) === normalizeCachePart(keyword)
  );
}

function isValidEnvelope(cache) {
  return (
    cache &&
    typeof cache === "object" &&
    cache.version === SEARCH_RESULTS_CACHE_VERSION &&
    Array.isArray(cache.entries)
  );
}

function hasValidSearchResults(results) {
  return (
    Array.isArray(results) &&
    results.length > 0 &&
    results.every((result) => result && typeof result === "object" && !Array.isArray(result))
  );
}

/**
 * Load the content-local search cache. Unknown, malformed, or incompatible
 * content is treated as a cache miss so it can never block live media search.
 */
export function loadSearchResultsCache(filePath) {
  if (!filePath || !existsSync(filePath)) return createSearchResultsCache();

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return isValidEnvelope(parsed) ? parsed : createSearchResultsCache();
  } catch {
    return createSearchResultsCache();
  }
}

/**
 * Return a reusable candidate array for one source/keyword pair, or null when
 * the entry is absent, expired, empty, or malformed.
 */
export function getCachedSearchResults(
  cache,
  { source, keyword, now = Date.now(), ttlMs = SEARCH_RESULTS_CACHE_TTL_MS },
) {
  if (!isValidEnvelope(cache)) return null;

  const normalizedSource = normalizeCachePart(source);
  const normalizedKeyword = normalizeCachePart(keyword);
  if (!normalizedSource || !normalizedKeyword) return null;

  const entry = cache.entries.find((candidate) => hasMatchingCacheKey(candidate, source, keyword));
  if (!entry || !hasValidSearchResults(entry.results)) return null;

  const timestampMs = Date.parse(entry.timestamp);
  if (!Number.isFinite(timestampMs) || now - timestampMs >= ttlMs) return null;

  return entry.results;
}

/**
 * Resolve a source/keyword candidate set with cache-first behavior. The caller
 * supplies the source-specific search so API, CDP, and yt-dlp searches all
 * retain their existing transport and error semantics.
 */
export async function getOrSearchResults(cache, { source, keyword, search, now = Date.now() }) {
  const cachedResults = getCachedSearchResults(cache, { source, keyword, now });
  if (cachedResults) {
    return { cacheHit: true, results: cachedResults };
  }

  const liveResults = await search();
  recordSearchResults(cache, { source, keyword, results: liveResults });
  return { cacheHit: false, results: liveResults };
}

/**
 * Add or replace one non-empty live-search result set. Empty results are not
 * cached because a temporary API/CDP/yt-dlp failure is indistinguishable from a
 * genuine empty result set at the current search-call boundary.
 */
export function recordSearchResults(
  cache,
  { source, keyword, results, timestamp = new Date().toISOString() },
) {
  if (!isValidEnvelope(cache) || !hasValidSearchResults(results)) return false;

  const normalizedSource = normalizeCachePart(source);
  const normalizedKeyword = normalizeCachePart(keyword);
  if (!normalizedSource || !normalizedKeyword) return false;

  const entry = {
    source: source.trim(),
    keyword: keyword.trim(),
    timestamp,
    results,
  };
  const existingIndex = cache.entries.findIndex((candidate) =>
    hasMatchingCacheKey(candidate, source, keyword),
  );

  if (existingIndex >= 0) {
    cache.entries[existingIndex] = entry;
  } else {
    cache.entries.push(entry);
  }

  return true;
}

/**
 * Persist a complete, already-merged cache envelope atomically. Search remains
 * successful if this optional optimization cannot be written.
 */
export function saveSearchResultsCache(filePath, cache) {
  if (!filePath || !isValidEnvelope(cache)) {
    return { success: false, error: "invalid cache path or envelope" };
  }

  let temporaryPath = null;
  try {
    const outputDir = dirname(filePath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(cache, null, 2) + "\n", "utf8");
    renameSync(temporaryPath, filePath);
    return { success: true };
  } catch (error) {
    if (temporaryPath && existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // The cache is an optional optimization; cleanup must not surface a new error.
      }
    }
    return { success: false, error: error.message };
  }
}
