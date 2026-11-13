/**
 * Extract Media — Detail page media cache script.
 *
 * SVE (#114): When the Agent opens article detail pages during Stage 0,
 * this script extracts all media URLs (images, videos, metadata) from
 * the page and caches them to content/<slug>/research/media-cache.json.
 *
 * asset-sourcer.mjs Phase 0b reads this cache to download already-seen
 * media without re-searching.
 *
 * CLI:
 *   node lib/extract-media.mjs --url <url> --content <slug>
 *   node lib/extract-media.mjs --tab <tabId> --content <slug>
 *
 * The --tab option reuses an already-open CDP tab (Agent opens the page
 * with /new, gets tabId, then calls this script with --tab to avoid
 * opening the same page twice).
 *
 * @module extract-media
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { cdpNewTab, cdpEval, cdpCloseTab, waitForPageLoad } from "./cdp-client.mjs";
import { isLogoOrIcon } from "./asset-sourcer.mjs";
import { EMBED_HOST_PLATFORMS, PAGE_DATE_META_SELECTORS } from "./page-media-signals.mjs";

// ─── Constants ───

export const MEDIA_CACHE_VERSION = 1;

/**
 * Minimum natural width for a content image.
 *
 * #1304: 400 was only a width test, so a 1200×90 "download our app" leaderboard
 * cleared it and landed in the cache named after the search query. 600 is the
 * smallest width a real article figure shows at on the pages this pipeline
 * reads; anything narrower is a chip, an inline icon or a table glyph.
 */
const MIN_IMAGE_WIDTH = 600;

/**
 * Width / height above which the image is a banner, not a picture.
 *
 * #1304: leaderboards and section rules are wide and short (13:1 measured on
 * the xinhua banner). A photographic figure on these pages stays under 3:1
 * even when cropped to a panorama.
 */
const MAX_ASPECT_RATIO = 3;

/**
 * Page furniture that is never article content.
 *
 * Split in two on purpose: the `alt` copy is human-written Chinese and can say
 * "扫码下载客户端", while a URL path only ever carries ASCII slugs — running the
 * Chinese half against URLs would be dead weight, and running the ASCII half
 * against `alt` would reject a legitimate photo captioned "banner year".
 */
const DECORATION_ALT = /二维码|扫码|下载|客户端|公众号|关注我们|广告|推广|logo|icon|banner|qrcode/i;
const DECORATION_URL = /qrcode|qr-code|banner|sprite|advert|promo|placeholder/i;

// ─── Eval script builder ───

/**
 * Build the CDP eval script that extracts all media from a page.
 *
 * The script runs in the browser context and returns:
 *   { images: [{url, alt}], videos: [{url, platform}], metadata: {ogImage?, ogTitle?, publishedTime?} }
 *
 * Extraction targets:
 * - <img> with naturalWidth >= 600 (content images, not thumbnails/icons);
 *   the reported height rides along so the parser can reject banners (#1304)
 * - <video> src + <source> child src
 * - <iframe> YouTube/Bilibili/Douyin embeds
 * - og:image, og:title, article:published_time meta tags
 *
 * @returns {string} JavaScript eval script string
 */
export function buildMediaExtractScript() {
  return `
    var results = { images: [], videos: [], metadata: {} };

    // Images: naturalWidth >= ${MIN_IMAGE_WIDTH} (content images, not icons/thumbnails).
    // data: URIs are excluded — WeChat 1x1 SVG placeholders report a
    // viewBox-derived naturalWidth that defeats the pixel filter (#128).
    // width/height ship with each hit so parseMediaExtractResult can drop
    // leaderboard-shaped images (#1304); a lazy image reports 0 and is kept
    // on width alone rather than silently discarded.
    document.querySelectorAll('img').forEach(function(img) {
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (w >= ${MIN_IMAGE_WIDTH} && img.src && !img.src.startsWith('data:')) {
        results.images.push({ url: img.src, alt: img.alt || '', width: w, height: h });
      }
    });

    // <video> elements
    document.querySelectorAll('video[src]').forEach(function(v) {
      if (v.src) results.videos.push({ url: v.src, platform: 'direct' });
    });
    document.querySelectorAll('video source[src]').forEach(function(s) {
      if (s.src) results.videos.push({ url: s.src, platform: 'direct' });
    });

    // <iframe> embeds — host list shared with search-sources (page-media-signals)
    var EMBED_HOST_PLATFORMS = ${JSON.stringify(EMBED_HOST_PLATFORMS)};
    document.querySelectorAll('iframe[src]').forEach(function(f) {
      var src = f.src || '';
      var lower = src.toLowerCase();
      var host = Object.keys(EMBED_HOST_PLATFORMS).find(function(h) { return lower.indexOf(h) !== -1; });
      if (host) {
        results.videos.push({ url: src, platform: EMBED_HOST_PLATFORMS[host] });
      }
    });

    // Metadata from <meta> tags
    var ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    var ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    var ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content');
    var PAGE_DATE_SELECTORS = ${JSON.stringify(PAGE_DATE_META_SELECTORS)};
    var publishedTime = null;
    for (var i = 0; i < PAGE_DATE_SELECTORS.length && !publishedTime; i++) {
      publishedTime = document.querySelector(PAGE_DATE_SELECTORS[i])?.getAttribute('content');
    }
    if (ogImage) results.metadata.ogImage = ogImage;
    if (ogTitle) results.metadata.ogTitle = ogTitle;
    if (publishedTime) results.metadata.publishedTime = publishedTime;
    if (ogVideo) results.videos.push({ url: ogVideo, platform: 'direct' });

    return results;
  `;
}

// ─── Platform detection (for testing) ───

/**
 * Detect video platform from URL.
 * @param {string} url - Video URL
 * @returns {string} Platform: youtube, bilibili, douyin, youku, or direct
 */
function detectPlatform(url) {
  if (!url || typeof url !== "string") return "direct";
  const lower = url.toLowerCase();
  for (const [host, platform] of Object.entries(EMBED_HOST_PLATFORMS)) {
    if (lower.includes(host)) return platform;
  }
  return "direct";
}

// ─── Parse raw CDP result ───

/**
 * Is this `<img>` page furniture rather than article content?
 *
 * Three independent tells, because each one alone has a false negative
 * (#1304): the width gate passes whatever is wide enough, the `alt` text is
 * empty on lazily loaded figures, and the URL slug is often the only honest
 * signal left (".../qrcode_share.png").
 *
 * A missing dimension is NOT evidence of a banner — lazy images report 0 — so
 * the shape test needs both sides before it fires.
 *
 * @param {{url: string, alt?: string, width?: number, height?: number}} img
 * @returns {boolean}
 */
export function isDecorationImage(img) {
  if (!img || typeof img.url !== "string") return true;
  const alt = typeof img.alt === "string" ? img.alt : "";
  if (DECORATION_ALT.test(alt)) return true;
  if (DECORATION_URL.test(img.url)) return true;
  const width = Number(img.width);
  const height = Number(img.height);
  if (Number.isFinite(width) && width > 0 && width < MIN_IMAGE_WIDTH) return true;
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    if (width / height > MAX_ASPECT_RATIO) return true;
  }
  return false;
}

/**
 * Parse the raw CDP eval result into a normalized media cache entry.
 *
 * Filters out logo/icon images, ensures video platform is identified,
 * and handles missing fields gracefully.
 *
 * @param {Object|null} raw - Raw CDP eval result { images, videos, metadata }
 * @param {string} sourceUrl - The URL of the page that was scraped
 * @returns {{sourceUrl, scrapedAt, images: [], videos: [], metadata: {}}}
 */
export function parseMediaExtractResult(raw, sourceUrl) {
  const empty = {
    sourceUrl: sourceUrl || "",
    scrapedAt: new Date().toISOString(),
    images: [],
    videos: [],
    metadata: {},
  };

  if (!raw || typeof raw !== "object") return empty;

  // Filter images: exclude logos/icons and page furniture. The dimensions
  // ride along into the cache so a triage pass can tell "rejected for shape"
  // from "rejected for alt copy" without re-scraping (#1304).
  const rawImages = Array.isArray(raw.images) ? raw.images : [];
  const images = rawImages
    .filter((img) => {
      if (!img || !img.url) return false;
      if (isLogoOrIcon(img.url)) return false;
      return !isDecorationImage(img);
    })
    .map((img) => {
      const kept = { url: img.url, alt: typeof img.alt === "string" ? img.alt : "" };
      if (Number.isFinite(Number(img.width)) && Number(img.width) > 0)
        kept.width = Number(img.width);
      if (Number.isFinite(Number(img.height)) && Number(img.height) > 0)
        kept.height = Number(img.height);
      return kept;
    });

  // Normalize videos: ensure platform is identified
  const rawVideos = Array.isArray(raw.videos) ? raw.videos : [];
  const videos = rawVideos
    .filter((v) => v && v.url)
    .map((v) => ({
      url: v.url,
      platform: v.platform || detectPlatform(v.url),
    }));

  // Normalize metadata
  const metadata = raw.metadata && typeof raw.metadata === "object" ? { ...raw.metadata } : {};

  return {
    sourceUrl: sourceUrl || "",
    scrapedAt: new Date().toISOString(),
    images,
    videos,
    metadata,
  };
}

// ─── File I/O ───

/**
 * Load the media cache file. Unknown, malformed, or incompatible
 * content is treated as a cache miss (empty cache).
 *
 * @param {string} filePath - Path to media-cache.json
 * @returns {{version: number, entries: []}}
 */
export function loadMediaCache(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return { version: MEDIA_CACHE_VERSION, entries: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (parsed && parsed.version === MEDIA_CACHE_VERSION && Array.isArray(parsed.entries)) {
      return parsed;
    }
    return { version: MEDIA_CACHE_VERSION, entries: [] };
  } catch {
    return { version: MEDIA_CACHE_VERSION, entries: [] };
  }
}

/**
 * Save the media cache file atomically.
 * Creates parent directories if needed.
 *
 * @param {string} filePath - Path to media-cache.json
 * @param {{version: number, entries: []}} cache - Cache object
 */
export function saveMediaCache(filePath, cache) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(cache, null, 2) + "\n", "utf8");
    // Atomic rename (same pattern as search-results-cache.mjs)
    renameSync(tmpPath, filePath);
  } catch (e) {
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup
      }
    }
    throw e;
  }
}

/**
 * Merge a new entry into the cache. If an entry with the same sourceUrl
 * already exists, it is replaced. Otherwise the new entry is appended.
 *
 * @param {{version: number, entries: []}} cache - Current cache
 * @param {{sourceUrl: string}} entry - New entry to merge
 * @returns {{version: number, entries: []}} Updated cache
 */
export function mergeMediaCacheEntry(cache, entry) {
  if (!cache || !Array.isArray(cache.entries)) {
    return { version: MEDIA_CACHE_VERSION, entries: [entry] };
  }

  const existingIndex = cache.entries.findIndex((e) => e && e.sourceUrl === entry.sourceUrl);

  if (existingIndex >= 0) {
    cache.entries[existingIndex] = entry;
  } else {
    cache.entries.push(entry);
  }

  return cache;
}

// ─── Main CLI ───

async function main() {
  const args = process.argv.slice(2);
  function getArg(name) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  }

  const url = getArg("url");
  const tabId = getArg("tab");
  const contentSlug = getArg("content");

  if (!contentSlug) {
    console.error(
      "Usage: node extract-media.mjs --url <url> --content <slug>  OR  --tab <tabId> --content <slug>",
    );
    process.exit(1);
  }

  if (!url && !tabId) {
    console.error("Error: either --url or --tab is required");
    process.exit(1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const cachePath = join(__dirname, "..", "content", contentSlug, "research", "media-cache.json");

  let ownTab = null;
  let useTabId = tabId;

  if (url && !tabId) {
    // Open a new CDP tab
    console.log(`🌐 Opening ${url}...`);
    try {
      ownTab = await cdpNewTab(url);
      useTabId = ownTab;
      console.log(`  📑 Tab: ${ownTab.substring(0, 12)}...`);
    } catch (e) {
      console.error(`❌ Failed to open tab: ${e.message}`);
      process.exit(1);
    }

    // Wait for page to load
    await new Promise((r) => setTimeout(r, 3000));
    await waitForPageLoad(useTabId);
  }

  // Extract media
  console.log("🔍 Extracting media...");
  const script = buildMediaExtractScript();
  const raw = await cdpEval(useTabId, `(async function(){${script}})()`);

  // Parse CDP response
  let data = raw?.result?.value || raw?.value || raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }

  const entry = parseMediaExtractResult(data, url || "(existing-tab)");

  console.log(`  📷 Images: ${entry.images.length}`);
  console.log(`  🎬 Videos: ${entry.videos.length}`);
  if (entry.metadata.ogImage) console.log(`  🖼️  og:image: ${entry.metadata.ogImage}`);
  if (entry.metadata.publishedTime) console.log(`  📅 Published: ${entry.metadata.publishedTime}`);

  // Merge into cache
  const cache = loadMediaCache(cachePath);
  mergeMediaCacheEntry(cache, entry);
  saveMediaCache(cachePath, cache);
  console.log(`💾 Cached to: ${cachePath}`);

  // Close tab if we opened it
  if (ownTab) {
    await cdpCloseTab(ownTab);
    console.log("🚪 Tab closed");
  }
}

// Run if called directly
const isMain =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
