/**
 * Progressive Search — Tier 3: Open Search Engine Image Search
 *
 * Provides tier evaluation logic and the pluggable image search engine pool
 * (IMAGE_SEARCH_ENGINES). Called by asset-sourcer.mjs when Tier 1 (stock API)
 * + Tier 2 (CDP news) yield insufficient results.
 *
 * Trigger condition: totalAssets < scenesNeedingMedia
 * Stop condition: totalAssets >= scenesNeedingMedia
 *
 * Engine pool (#112): each engine = { name, label, type, requiresApiKey?,
 * apiKeyEnv?, search(keyword, ctx) }. ctx = { apiKey, quotaTracker }.
 * asset-sourcer runs engines in Promise.allSettled and keeps keywords serial
 * within each engine (anti-bot). Engines:
 *   brave_image      — Brave Image API (BRAVE_SEARCH_API_KEY), #110
 *   searxng_image    — self-hosted SearXNG categories=images, #110
 *   google_images    — CDP google.com/search tbm=isch, #112
 *   bing_images      — CDP bing.com/images/search (a.iusc m=murl), #112
 *   duckduckgo_images— duckduckgo.com vqd token + i.js JSON, #112
 *   tavily_images    — Tavily REST include_images last-resort, #112
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

// ─── CDP search (moved from asset-sourcer.mjs, #112) ───

/**
 * Search a CDP source for image candidates.
 *
 * Opens a browser tab via cdp-client.mjs (dynamic import to avoid a hard
 * dependency when CDP is not needed), waits for load, extracts with the
 * source's imageScript, retries once, then falls back to imageFallbackScript.
 * Shared by Tier 2 CDP sources and the Tier 3 CDP image engines.
 *
 * @param {Object} source - CDP source definition ({ url, imageScript, imageFallbackScript })
 * @param {string} keyword - Search keyword
 * @param {Object} [options] - { waitMs } page-load wait override (tests)
 * @returns {Promise<Array>} Raw candidates array (empty on failure)
 */
export async function searchCdpSource(source, keyword, options = {}) {
  const { waitMs = 3000 } = options;
  // Dynamic import to avoid hard dependency when CDP not needed
  const { cdpNewTab, cdpCloseTab, extractFromTab, waitForPageLoad } =
    await import("./cdp-client.mjs");

  const url = source.url(keyword);
  let tabId;
  try {
    tabId = await cdpNewTab(url);
  } catch {
    return [];
  }

  // Wait for page load
  await new Promise((r) => setTimeout(r, waitMs));
  await waitForPageLoad(tabId);

  // Primary extraction
  let candidates = await extractFromTab(tabId, source.imageScript);

  // Retry once if empty
  if (candidates.length === 0) {
    await new Promise((r) => setTimeout(r, waitMs));
    candidates = await extractFromTab(tabId, source.imageScript);
  }

  // Fallback to generic extraction
  if (candidates.length === 0 && source.imageFallbackScript) {
    candidates = await extractFromTab(tabId, source.imageFallbackScript);
  }

  // Close tab
  await cdpCloseTab(tabId);

  return candidates;
}

// ─── CDP image engine shared normalization (#112) ───

/**
 * Normalize raw CDP extraction output into Tier 3 image candidates.
 *
 * Filters entries without a usable http(s) URL (data:/javascript: URIs are
 * inline placeholders; protocol-relative and non-http schemes are also
 * rejected — the download pipeline expects absolute http(s) URLs), stamps
 * `type: "image"` and the engine name as `source`, and falls back the title
 * to the keyword.
 *
 * @param {Array} raw - Raw extraction output (may be null/undefined)
 * @param {string} engineName - Engine name stamped into candidates
 * @param {string} [keyword] - Keyword used as title fallback
 * @returns {Array<{url: string, title: string, type: string, source: string, sourceUrl?: string}>}
 */
export function normalizeCdpImageCandidates(raw, engineName, keyword = "") {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const url = item?.url;
    if (!url || typeof url !== "string") continue;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      url,
      title: item.title || keyword,
      type: "image",
      source: engineName,
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
    });
  }
  return out;
}

// ─── Google Images CDP engine (#112) ───

// Extraction script for google.com/search?tbm=isch. Google image thumbnails
// sit on encrypted-tbn0.gstatic.com; the anchor wrapping each tile may expose
// the full-resolution original via an imgurl= (imgres) link — prefer those,
// then fall back to tile thumbnails, then to a generic img sweep.
const GOOGLE_IMAGES_IMAGE_SCRIPT = `
  var results = [];
  // 1) imgres links carry the full-resolution original in imgurl=
  document.querySelectorAll('a[href*="imgurl="]').forEach(function(a) {
    var m = a.href.match(/[?&]imgurl=([^&]+)/);
    if (!m) return;
    var full;
    try { full = decodeURIComponent(m[1]); } catch (e) { full = m[1]; }
    if (!full.startsWith('http')) return;
    var img = a.querySelector('img');
    results.push({ title: img ? (img.alt || '') : '', url: full, type: 'image' });
  });
  // 2) tile thumbnails (encrypted-tbn) when no imgres links found
  if (results.length === 0) {
    document.querySelectorAll('img[src*="encrypted-tbn"]').forEach(function(img) {
      if (img.src.startsWith('http')) {
        results.push({ title: img.alt || '', url: img.src, type: 'image' });
      }
    });
  }
  return results;
`;

// Generic sweep: any reasonably sized img element (skips favicons/logos by
// rendered width and data: URIs). Shared by the CDP image engines (#112).
const GENERIC_IMAGE_FALLBACK_SCRIPT = `
  var results = [];
  document.querySelectorAll('img[src]').forEach(function(img) {
    if (img.src.startsWith('data:') || img.src.startsWith('javascript:')) return;
    if ((img.naturalWidth > 100 || img.width > 100) && img.src.startsWith('http')) {
      results.push({ title: img.alt || '', url: img.src, type: 'image' });
    }
  });
  return results;
`;

const GOOGLE_IMAGES_SOURCE = {
  name: "google_images",
  label: "Google Images",
  url: (keyword) =>
    `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=isch&hl=en&safe=active`,
  imageScript: GOOGLE_IMAGES_IMAGE_SCRIPT,
  imageFallbackScript: GENERIC_IMAGE_FALLBACK_SCRIPT,
};

/**
 * Search Google Images via CDP (tbm=isch).
 *
 * @param {string} keyword - Search keyword
 * @param {Object} [options] - { waitMs } passthrough to searchCdpSource (tests)
 * @returns {Promise<Array>} Normalized candidates (empty on failure)
 */
export async function searchGoogleImages(keyword, options = {}) {
  const raw = await searchCdpSource(GOOGLE_IMAGES_SOURCE, keyword, options);
  return normalizeCdpImageCandidates(raw, "google_images", keyword);
}

// ─── Bing Images CDP engine (#112) ───

// Extraction script for bing.com/images/search. Bing tiles are anchors with
// class "iusc" whose "m" attribute holds JSON: murl = full-resolution image
// URL, turl = thumbnail, t = title, purl = source page.
const BING_IMAGES_IMAGE_SCRIPT = `
  var results = [];
  document.querySelectorAll('a.iusc').forEach(function(a) {
    try {
      var m = JSON.parse(a.getAttribute('m') || '{}');
      if (m && m.murl && typeof m.murl === 'string' && m.murl.startsWith('http')) {
        results.push({ title: m.t || '', url: m.murl, type: 'image', sourceUrl: m.purl });
      }
    } catch (e) {}
  });
  return results;
`;

const BING_IMAGES_SOURCE = {
  name: "bing_images",
  label: "Bing Images",
  url: (keyword) =>
    `https://www.bing.com/images/search?q=${encodeURIComponent(keyword)}&form=HDRSC2&safeSearch=strict`,
  imageScript: BING_IMAGES_IMAGE_SCRIPT,
  imageFallbackScript: GENERIC_IMAGE_FALLBACK_SCRIPT,
};

/**
 * Search Bing Images via CDP.
 *
 * @param {string} keyword - Search keyword
 * @param {Object} [options] - { waitMs } passthrough to searchCdpSource (tests)
 * @returns {Promise<Array>} Normalized candidates (empty on failure)
 */
export async function searchBingImages(keyword, options = {}) {
  const raw = await searchCdpSource(BING_IMAGES_SOURCE, keyword, options);
  return normalizeCdpImageCandidates(raw, "bing_images", keyword);
}

// ─── DuckDuckGo Images engine (#112) ───

/**
 * Parse DuckDuckGo i.js image search response into candidates.
 *
 * i.js response: { results: [{ title, image, width, height, thumbnail, ... }] }
 *
 * @param {Object} data - i.js response JSON
 * @param {string} keyword - Search keyword (title fallback)
 * @returns {Array<{url: string, title: string, type: string, resolution: string|undefined, source: string}>}
 */
export function parseDuckDuckGoImagesResponse(data, keyword) {
  const results = data?.results || [];
  return results
    .filter((r) => r?.image)
    .map((r) => ({
      url: r.image,
      title: r.title || keyword,
      type: "image",
      resolution: r.width && r.height ? `${r.width}x${r.height}` : undefined,
      source: "duckduckgo_images",
    }));
}

/**
 * Extract the dynamic vqd token from a duckduckgo.com HTML page.
 *
 * The token appears inline (e.g. vqd="4-1234...") and is required by the
 * i.js image endpoint. Handles double/single-quoted and bare forms.
 *
 * @param {string} html - Landing page HTML
 * @returns {string|null} vqd token or null
 */
export function extractVqd(html) {
  if (!html) return null;
  const quoted = html.match(/vqd=["']([^"']+)["']/);
  if (quoted) return quoted[1];
  const bare = html.match(/vqd=([\w-]+)/);
  return bare ? bare[1] : null;
}

// Browser-like headers: duckduckgo.com serves vqd only to plausible browsers.
// Note: unlike #91's html.duckduckgo.com text endpoint, this engine fetches
// the duckduckgo.com JS landing page — a different domain with a different
// anti-bot profile. A challenge page has no vqd → the engine degrades to [].
const DDG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Search DuckDuckGo Images via the vqd token + i.js JSON endpoint (plain
 * HTTP, no browser tab). i.js returns full-resolution image URLs with
 * dimensions — no CDP rendering needed.
 *
 * Flow: GET duckduckgo.com/?q=...&iax=images&ia=images → extract vqd →
 * GET duckduckgo.com/i.js?...&vqd=<token> → parse.
 *
 * @param {string} keyword - Search keyword
 * @returns {Promise<Array>} Candidates array (empty on failure)
 */
export async function searchDuckDuckGoImages(keyword) {
  try {
    const landingUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}&iax=images&ia=images`;
    const landingResp = await fetch(landingUrl, { headers: DDG_HEADERS });
    if (!landingResp.ok) return [];
    const html = await landingResp.text();
    const vqd = extractVqd(html);
    if (!vqd) return []; // challenge page or layout change — no token, no search

    const ijsUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(keyword)}&vqd=${vqd}&f=,,,&p=1`;
    const ijsResp = await fetch(ijsUrl, {
      headers: { ...DDG_HEADERS, Referer: "https://duckduckgo.com/" },
    });
    if (!ijsResp.ok) return [];

    const data = await ijsResp.json();
    return parseDuckDuckGoImagesResponse(data, keyword);
  } catch {
    return []; // Network error, timeout, etc.
  }
}

// ─── Tavily include_images last-resort engine (#112) ───

/**
 * Parse Tavily search response (include_images=true) into candidates.
 *
 * The images array mixes plain URL strings and {url, description} objects
 * depending on API version — both are handled.
 *
 * @param {Object} data - Tavily response JSON
 * @param {string} keyword - Search keyword (title fallback)
 * @returns {Array<{url: string, title: string, type: string, source: string}>}
 */
export function parseTavilyImagesResponse(data, keyword) {
  const images = data?.images || [];
  const out = [];
  for (const entry of images) {
    const url = typeof entry === "string" ? entry : entry?.url;
    if (!url || typeof url !== "string") continue;
    const description = typeof entry === "object" ? entry?.description : undefined;
    out.push({
      url,
      title: description || keyword,
      type: "image",
      source: "tavily_images",
    });
  }
  return out;
}

/**
 * Search Tavily with include_images=true (last resort — images piggyback on
 * the text search API, not a dedicated image endpoint).
 *
 * Auth pattern matches lib/search-pool.mjs (#65): POST + Bearer token.
 *
 * @param {string} keyword - Search keyword
 * @param {string|null} apiKey - Tavily API key (null = skip)
 * @returns {Promise<Array>} Candidates array (empty on failure)
 */
export async function searchTavilyImages(keyword, apiKey) {
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: keyword, max_results: 20, include_images: true }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    return parseTavilyImagesResponse(data, keyword);
  } catch {
    return []; // Network error, timeout, etc.
  }
}

// ─── CDP video engine (from CDP_MEDIA_CAPABILITIES videoScript, #183) ───

/**
 * Search a CDP source page for video candidates (videoScript field).
 * Same tab flow as searchCdpSource but extracts with source.videoScript.
 *
 * @param {Object} source - Flattened CDP video source ({ url, videoScript })
 * @param {string} keyword - Search keyword
 * @param {Object} [options] - { waitMs }
 * @returns {Promise<Array>} Raw extraction output (empty on failure)
 */
export async function searchCdpVideoSource(source, keyword, options = {}) {
  const { waitMs = 3000 } = options;
  const { cdpNewTab, cdpCloseTab, extractFromTab, waitForPageLoad } =
    await import("./cdp-client.mjs");

  let tabId;
  try {
    tabId = await cdpNewTab(source.url(keyword));
  } catch {
    return [];
  }

  await new Promise((r) => setTimeout(r, waitMs));
  await waitForPageLoad(tabId);

  let candidates = await extractFromTab(tabId, source.videoScript);
  if (candidates.length === 0) {
    await new Promise((r) => setTimeout(r, waitMs));
    candidates = await extractFromTab(tabId, source.videoScript);
  }

  await cdpCloseTab(tabId);
  return candidates;
}

/**
 * Normalize raw CDP video extraction into candidates with a canonical
 * watch URL and a download platform hint (#183).
 *
 * - Bilibili player iframes (player.bilibili.com/player.html?bvid=BVx)
 *   → https://www.bilibili.com/video/BVx (platform "bilibili")
 * - YouTube embeds (/embed/ID) → https://www.youtube.com/watch?v=ID
 *   (platform "youtube")
 * - Direct self-hosted video sources kept as-is (platform null)
 * - Dedupe by URL; non-video URLs dropped.
 *
 * @param {Array} raw - Raw extraction output (may be null/undefined)
 * @param {string} sourceName - Source name stamped into candidates
 * @param {string} [keyword] - Keyword used as title fallback
 * @returns {Array<{url: string, title: string, type: string, source: string, platform: string|null}>}
 */
export function normalizeCdpVideoCandidates(raw, sourceName, keyword = "") {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    let url = item?.url;
    if (!url || typeof url !== "string") continue;
    url = url.trim();

    let platform = null;
    let m = url.match(/player\.bilibili\.com\/player\.html\?.*?bvid=([\w]+)/);
    if (m) {
      url = `https://www.bilibili.com/video/${m[1]}`;
      platform = "bilibili";
    } else if ((m = url.match(/(?:youtube(?:-nocookie))?\.com\/embed\/([\w-]+)/))) {
      url = `https://www.youtube.com/watch?v=${m[1]}`;
      platform = "youtube";
    } else if ((m = url.match(/^https?:\/\/www\.bilibili\.com\/video\/([\w]+)/))) {
      url = `https://www.bilibili.com/video/${m[1]}`;
      platform = "bilibili";
    } else if (/^https?:\/\//i.test(url) && /\.(mp4|webm|m3u8|mov|ogg)([?#]|$)/i.test(url)) {
      platform = null; // self-hosted direct video source
    } else {
      continue; // relative/data:/garbage
    }

    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: item.title || keyword,
      type: "video",
      source: sourceName,
      platform,
    });
  }
  return out;
}

// ─── Pluggable engine pool (#112) ───

/**
 * Pluggable Tier 3 image search engine pool.
 *
 * Each engine: { name, label, type, requiresApiKey?, apiKeyEnv?, search }.
 * - type "api"/"fetch": plain HTTP, no browser tab.
 * - type "cdp": opens a browser tab via cdp-client (anti-bot rate limiter in
 *   cdpNewTab applies per domain).
 * - search(keyword, ctx) returns candidates [{url, title, type, source, ...}].
 * - requiresApiKey engines are skipped upstream when the key is missing.
 *
 * Order matters: brave first preserves the #110 behavior, tavily_images is
 * the last resort (images piggyback on a text search API, not a dedicated
 * image endpoint).
 *
 * @type {Array<{name: string, label: string, type: string, requiresApiKey?: boolean, apiKeyEnv?: string|null, search: (keyword: string, ctx?: object) => Promise<Array>}>}
 */
export const IMAGE_SEARCH_ENGINES = [
  {
    name: "brave_image",
    label: "Brave Image",
    type: "api",
    requiresApiKey: true,
    apiKeyEnv: "BRAVE_SEARCH_API_KEY",
    search: (keyword, ctx = {}) =>
      searchBraveImages(keyword, ctx.apiKey, {
        count: 20,
        quotaTracker: ctx.quotaTracker,
      }),
  },
  {
    name: "searxng_image",
    label: "SearXNG Image",
    type: "api",
    requiresApiKey: false,
    apiKeyEnv: null,
    search: (keyword) => searchSearXngImages(keyword, { count: 20 }),
  },
  {
    name: "google_images",
    label: "Google Images",
    type: "cdp",
    search: searchGoogleImages,
  },
  {
    name: "bing_images",
    label: "Bing Images",
    type: "cdp",
    search: searchBingImages,
  },
  {
    name: "duckduckgo_images",
    label: "DuckDuckGo Images",
    type: "fetch",
    search: searchDuckDuckGoImages,
  },
  {
    name: "tavily_images",
    label: "Tavily Images",
    type: "fetch",
    requiresApiKey: true,
    apiKeyEnv: "TAVILY_API_KEY",
    search: (keyword, ctx = {}) => searchTavilyImages(keyword, ctx.apiKey),
  },
];
