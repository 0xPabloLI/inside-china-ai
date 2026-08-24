/**
 * Progressive Search — Tier 3: Open Search Engine Image Search
 *
 * Provides tier evaluation logic and Brave/SearXNG image search functions.
 * Called by asset-sourcer.mjs when Tier 1 (stock API) + Tier 2 (CDP news)
 * yield insufficient results.
 *
 * Trigger condition: totalAssets < scenesNeedingMedia
 * Stop condition: totalAssets >= scenesNeedingMedia
 *
 * Brave Image Search API (verified 2026-08-24):
 *   GET https://api.search.brave.com/res/v1/images/search?q=...&count=20
 *   Header: X-Subscription-Token: <API_KEY>
 *   Response: { results: [{ title, properties: { url, width, height } }] }
 *
 * SearXNG Image Search (self-hosted, localhost:8888):
 *   GET http://localhost:8888/search?q=...&format=json&categories=images
 *   Response: { results: [{ title, img_src, resolution }] }
 *
 * @module progressive-search
 */

// ─── Tier evaluation ───

/**
 * Determine whether Tier 3 (open search engine) should be triggered.
 *
 * @param {number} totalAssets - Current total downloaded assets
 * @param {number} scenesNeedingMedia - Scenes that need media and don't have it
 * @returns {boolean} true if Tier 3 should run
 */
export function shouldTriggerTier3(totalAssets, scenesNeedingMedia) {
  if (!scenesNeedingMedia || scenesNeedingMedia <= 0) return false;
  return totalAssets < scenesNeedingMedia;
}

// ─── Brave Quota Tracker ───

/**
 * Simple in-memory counter for Brave API calls.
 * No persistence — resets each asset-sourcer run.
 * When #65 (unified search pool) is done, extract to shared module.
 */
export class BraveQuotaTracker {
  /**
   * @param {number} monthlyQuota - Monthly API call quota (default: 1000)
   */
  constructor(monthlyQuota = 1000) {
    this.count = 0;
    this.monthlyQuota = monthlyQuota;
  }

  track() {
    this.count++;
  }

  getCount() {
    return this.count;
  }

  getRemaining() {
    return Math.max(0, this.monthlyQuota - this.count);
  }

  canTrack() {
    return this.count < this.monthlyQuota;
  }
}

// ─── Response parsers (pure functions) ───

/**
 * Parse Brave Image Search API response into candidate objects.
 *
 * @param {Object} data - API response JSON
 * @param {string} keyword - Search keyword (unused, for API compat)
 * @returns {Array<{url: string, title: string, type: string, resolution: string|undefined, source: string}>}
 */
export function parseBraveImageResponse(data, keyword) {
  const results = data?.results || [];
  return results
    .filter((r) => r?.properties?.url)
    .map((r) => ({
      url: r.properties.url,
      title: r.title || keyword,
      type: "image",
      resolution:
        r.properties.width && r.properties.height
          ? `${r.properties.width}x${r.properties.height}`
          : undefined,
      source: "brave_image",
    }));
}

/**
 * Parse SearXNG image search response into candidate objects.
 *
 * @param {Object} data - API response JSON
 * @param {string} keyword - Search keyword (unused, for API compat)
 * @returns {Array<{url: string, title: string, type: string, resolution: string|undefined, source: string}>}
 */
export function parseSearXngImageResponse(data, keyword) {
  const results = data?.results || [];
  return results
    .filter((r) => r?.img_src)
    .map((r) => ({
      url: r.img_src,
      title: r.title || keyword,
      type: "image",
      resolution: r.resolution || undefined,
      source: "searxng_image",
    }));
}

// ─── Search functions ───

/**
 * Search Brave Image Search API.
 *
 * @param {string} keyword - Search query
 * @param {string|null} apiKey - Brave API key (null = skip)
 * @param {Object} options - { count, quotaTracker }
 * @returns {Promise<Array>} Candidates array
 */
export async function searchBraveImages(keyword, apiKey, options = {}) {
  const { count = 20, quotaTracker } = options;

  // Skip if no API key (scenario #3)
  if (!apiKey) return [];

  // Skip if quota exhausted (scenario #4)
  if (quotaTracker && !quotaTracker.canTrack()) return [];

  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(keyword)}&count=${count}&safesearch=strict`;

  try {
    const resp = await fetch(url, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
    });

    if (!resp.ok) return []; // 429, 401, etc.

    const data = await resp.json();

    if (quotaTracker) quotaTracker.track();

    return parseBraveImageResponse(data, keyword);
  } catch {
    return []; // Network error, timeout, etc.
  }
}

/**
 * Search SearXNG image search API.
 *
 * @param {string} keyword - Search query
 * @param {Object} options - { baseUrl, count }
 * @returns {Promise<Array>} Candidates array
 */
export async function searchSearXngImages(keyword, options = {}) {
  const { baseUrl = "http://localhost:8888", count = 20 } = options;

  const url = `${baseUrl}/search?q=${encodeURIComponent(keyword)}&format=json&categories=images`;

  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) return [];

    const data = await resp.json();

    return parseSearXngImageResponse(data, keyword).slice(0, count);
  } catch {
    return []; // Connection refused, timeout, etc.
  }
}
