/**
 * Video Downloaders — Unified video download layer.
 *
 * Strategy selector + adapter registry + DownloadResult contract.
 * Addresses GitHub Issue #75: integrate alternate download solutions
 * covering Douyin/TikTok/Weibo/XHS video downloads.
 *
 * Architecture:
 *   URL → canonicalizeUrl → selectStrategy → adapter.download → DownloadResult
 *
 * This module is intentionally NOT integrated into asset-sourcer.mjs yet.
 * It stays independent until a follow-up integration ticket.
 *
 * @module video-downloaders
 */

import { canonicalizeUrl } from "./url-normalizer.mjs";
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { tmpdir } from "os";

// ─── Constants ───

export const ADAPTER_IDS = {
  DIRECT_HTTP: "direct-http",
  YTDLP: "ytdlp",
  COBALT: "cobalt",
};

/** Max file size: 20MB (matches existing yt-dlp --max-filesize 20M) */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Min file size: 1KB (matches existing downloadAsset check) */
const MIN_FILE_BYTES = 1024;

/** Cobalt default instance URL (port 9000 per official docs) */
const DEFAULT_COBALT_URL = "http://localhost:9000";

/** Cobalt API request timeout (ms) */
const COBALT_TIMEOUT_MS = 30000;

// ─── DownloadResult type (JSDoc) ───

/**
 * @typedef {Object} DownloadResult
 * @property {"downloaded"|"skipped"|"needs-selection"|"unsupported"|"failed"} status
 * @property {string} strategy - adapter ID
 * @property {string} source - source name or "unknown"
 * @property {string} sourceUrl - canonical public source URL
 * @property {string} [finalUrl] - resolved media URL
 * @property {string} [mimeType] - e.g. "video/mp4"
 * @property {string} [extension] - e.g. "mp4"
 * @property {number} byteLength - 0 if not downloaded
 * @property {number} durationMs - 0 if unknown
 * @property {{adapterVersion: string, authenticated: boolean}} provenance
 * @property {string} [reason] - machine-readable failure/skip reason
 * @property {Buffer} [buffer] - downloaded data (only when status="downloaded")
 * @property {boolean} [retryable] - for status="failed", whether a retry makes sense
 */

/**
 * Create a DownloadResult with sensible defaults.
 * @param {Partial<DownloadResult>} overrides
 * @returns {DownloadResult}
 */
function makeResult(overrides = {}) {
  return {
    status: "skipped",
    strategy: "unknown",
    source: "unknown",
    sourceUrl: "",
    byteLength: 0,
    durationMs: 0,
    provenance: { adapterVersion: "1.0.0", authenticated: false },
    ...overrides,
  };
}

// ─── Known CDN / direct media patterns ───

/** Domains that serve direct media files (no adapter needed). */
const DIRECT_MEDIA_DOMAINS = [
  "cdn.pexels.com",
  "videos.pexels.com",
  "images.unsplash.com",
  "images.pexels.com",
  "img.pexels.com",
  "commondatastorage.googleapis.com",
  "cdn.coverr.co",
  "player.vimeo.com",
];

/** File extensions that indicate direct media (video + image). */
const DIRECT_MEDIA_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
];

/** YouTube hostname patterns. */
const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "m.youtube.com"];

/** B站 hostname patterns. */
const BILIBILI_HOSTS = ["bilibili.com", "b23.tv", "m.bilibili.com"];

/**
 * Check if a canonical URL points to a direct media file.
 * @param {string} canonicalUrl
 * @returns {boolean}
 */
function isDirectMediaUrl(canonicalUrl) {
  try {
    const url = new URL(canonicalUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    // Check known CDN domains
    if (DIRECT_MEDIA_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
      return true;
    }

    // Check direct media file extensions
    if (DIRECT_MEDIA_EXTENSIONS.some((ext) => path.endsWith(ext))) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a canonical URL is a YouTube video.
 * @param {string} canonicalUrl
 * @returns {boolean}
 */
function isYoutubeUrl(canonicalUrl) {
  try {
    const host = new URL(canonicalUrl).hostname.toLowerCase();
    return YOUTUBE_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

/**
 * Check if a canonical URL is a B站 video.
 * @param {string} canonicalUrl
 * @returns {boolean}
 */
function isBilibiliUrl(canonicalUrl) {
  try {
    const host = new URL(canonicalUrl).hostname.toLowerCase();
    return BILIBILI_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

// ─── Strategy selector ───

/**
 * Select the download strategy for a URL.
 *
 * Priority:
 *   1. Direct media URL → direct-http
 *   2. YouTube/B站 → ytdlp
 *   3. Unknown public URL → cobalt (if available)
 *   4. Fallback → unsupported
 *
 * @param {string|null|undefined} url
 * @param {Object} [options] - optional context (e.g., cobaltAvailable)
 * @returns {{adapter: string, canonicalUrl: string, status?: string, reason?: string}}
 */
export function selectStrategy(url, options = {}) {
  const canonical = canonicalizeUrl(url);

  if (!canonical) {
    return { adapter: "none", canonicalUrl: "", status: "skipped", reason: "empty-url" };
  }

  // 1. Direct media URL
  if (isDirectMediaUrl(canonical)) {
    return { adapter: ADAPTER_IDS.DIRECT_HTTP, canonicalUrl: canonical };
  }

  // 2. YouTube / B站
  if (isYoutubeUrl(canonical) || isBilibiliUrl(canonical)) {
    return { adapter: ADAPTER_IDS.YTDLP, canonicalUrl: canonical };
  }

  // 3. Unknown public URL → Cobalt
  // (Cobalt availability is checked at download time, not strategy selection time)
  return { adapter: ADAPTER_IDS.COBALT, canonicalUrl: canonical };
}

// ─── Adapter: DirectHttp ───

/**
 * Download a direct media URL via HTTP fetch.
 *
 * Wraps the existing downloadAsset() pattern but returns DownloadResult.
 * Uses dependency-injected fetchFn for testability.
 *
 * @param {string} url - Direct media URL
 * @param {Object} [opts]
 * @param {typeof fetch} [opts.fetchFn] - injectable fetch (default: global.fetch)
 * @returns {Promise<DownloadResult>}
 */
export async function downloadDirectHttp(url, opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const source = "direct";

  try {
    const resp = await fetchFn(url, opts.headers ? { headers: opts.headers } : undefined);
    if (!resp.ok) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.DIRECT_HTTP,
        source,
        sourceUrl: url,
        reason: `http-${resp.status}`,
        retryable: resp.status >= 500,
      });
    }

    // Check Content-Type before downloading body
    const contentType = resp.headers.get("content-type") || "";
    if (
      contentType &&
      !contentType.startsWith("video/") &&
      !contentType.startsWith("image/") &&
      !contentType.includes("octet-stream")
    ) {
      return makeResult({
        status: "skipped",
        strategy: ADAPTER_IDS.DIRECT_HTTP,
        source,
        sourceUrl: url,
        reason: "non-media-mime",
      });
    }

    const buffer = Buffer.from(await resp.arrayBuffer());

    // Size checks
    if (buffer.length < MIN_FILE_BYTES) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.DIRECT_HTTP,
        source,
        sourceUrl: url,
        reason: "file-too-small",
      });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return makeResult({
        status: "skipped",
        strategy: ADAPTER_IDS.DIRECT_HTTP,
        source,
        sourceUrl: url,
        byteLength: buffer.length,
        reason: "exceeds-size-limit",
      });
    }

    return makeResult({
      status: "downloaded",
      strategy: ADAPTER_IDS.DIRECT_HTTP,
      source,
      sourceUrl: url,
      finalUrl: url,
      mimeType: contentType || "video/mp4",
      extension: "mp4",
      byteLength: buffer.length,
      buffer,
    });
  } catch (e) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.DIRECT_HTTP,
      source,
      sourceUrl: url,
      reason: e.message?.substring(0, 200) || "fetch-error",
      retryable: true,
    });
  }
}

// ─── Adapter: Ytdlp ───

/**
 * Download a video using yt-dlp.
 *
 * Wraps the existing downloadYtdlp() pattern but returns DownloadResult.
 *
 * @param {string} url - YouTube/B站 video URL
 * @returns {DownloadResult}
 */
export function downloadYtdlpAdapter(url) {
  const source = isYoutubeUrl(url) ? "youtube" : "bilibili";
  const tmpPath = join(tmpdir(), `vdl-ytdlp-${Date.now()}.mp4`);

  // Ensure dir exists
  const dir = dirname(tmpPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const cmd = [
    "yt-dlp",
    "--cookies-from-browser firefox",
    '-f "best[height<=720][ext=mp4]/best[height<=720]/bestvideo[height<=720]+bestaudio/best"',
    "--max-filesize 20M",
    '--download-sections "*0:00-0:08"',
    `-o "${tmpPath}"`,
    `"${url}"`,
  ].join(" ");

  try {
    execSync(cmd, { encoding: "utf8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] });

    if (!existsSync(tmpPath)) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.YTDLP,
        source,
        sourceUrl: url,
        reason: "yt-dlp completed but file not found",
      });
    }

    const buffer = readFileSync(tmpPath);

    // Cleanup temp file
    try {
      unlinkSync(tmpPath);
    } catch {}

    if (buffer.length < MIN_FILE_BYTES) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.YTDLP,
        source,
        sourceUrl: url,
        reason: "file-too-small",
      });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return makeResult({
        status: "skipped",
        strategy: ADAPTER_IDS.YTDLP,
        source,
        sourceUrl: url,
        byteLength: buffer.length,
        reason: "exceeds-size-limit",
      });
    }

    return makeResult({
      status: "downloaded",
      strategy: ADAPTER_IDS.YTDLP,
      source,
      sourceUrl: url,
      finalUrl: url,
      mimeType: "video/mp4",
      extension: "mp4",
      byteLength: buffer.length,
      buffer,
    });
  } catch (e) {
    // Cleanup temp file on error
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {}

    const stderr = e.stderr?.toString()?.substring(0, 200) ?? "";
    if (stderr.toLowerCase().includes("login")) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.YTDLP,
        source,
        sourceUrl: url,
        reason: "needs-auth",
        retryable: false,
      });
    }
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.YTDLP,
      source,
      sourceUrl: url,
      reason: stderr || e.message?.substring(0, 200) || "yt-dlp failed",
      retryable: false,
    });
  }
}

// ─── Cobalt Adapter ───

/**
 * Cobalt adapter — handles preflight, POST /, and response state machine.
 *
 * Lifecycle:
 *   1. preflight() — GET / to check availability + services
 *   2. download(url) — POST / with full response handling
 */
class CobaltAdapter {
  constructor() {
    this.apiUrl = process.env.COBALT_API_URL || DEFAULT_COBALT_URL;
    this.apiKey = process.env.COBALT_API_KEY || null;
    this.available = null; // null = not checked, true/false after preflight
    this.services = [];
    this.version = null;
    this.turnstileRequired = false;
  }

  /**
   * Preflight: call GET / to check instance availability.
   * @param {typeof fetch} [fetchFn]
   * @returns {Promise<boolean>} true if available
   */
  async preflight(fetchFn = globalThis.fetch) {
    try {
      const resp = await fetchFn(`${this.apiUrl}/`);
      if (!resp.ok) {
        this.available = false;
        return false;
      }
      const data = await resp.json();
      this.version = data?.cobalt?.version || "unknown";
      this.services = Array.isArray(data?.cobalt?.services) ? data.cobalt.services : [];
      this.turnstileRequired = !!data?.cobalt?.turnstileSitekey;
      this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Check if a URL's platform is supported by this Cobalt instance.
   * Uses the services[] list from preflight.
   * @param {string} canonicalUrl
   * @returns {boolean}
   */
  supportsPlatform(canonicalUrl) {
    if (!this.available || this.services.length === 0) return true; // be permissive if no services list
    try {
      const host = new URL(canonicalUrl).hostname.toLowerCase();
      // Cobalt services are lowercase service names like "youtube", "tiktok", "douyin", "bilibili"
      // Map common domains to service names
      const domainToService = {
        "youtube.com": "youtube",
        "youtu.be": "youtube",
        "tiktok.com": "tiktok",
        "www.tiktok.com": "tiktok",
        "douyin.com": "douyin",
        "www.douyin.com": "douyin",
        "iesdouyin.com": "douyin",
        "www.iesdouyin.com": "douyin",
        "bilibili.com": "bilibili",
        "www.bilibili.com": "bilibili",
        "instagram.com": "instagram",
        "twitter.com": "twitter",
        "x.com": "twitter",
        "reddit.com": "reddit",
        "weibo.com": "weibo",
        "vimeo.com": "vimeo",
        "pinterest.com": "pinterest",
        "tumblr.com": "tumblr",
        "soundcloud.com": "soundcloud",
        "vk.com": "vk",
        "twitch.tv": "twitch",
      };
      const service = domainToService[host];
      if (!service) return true; // unknown domain — be permissive, let Cobalt decide
      return this.services.includes(service);
    } catch {
      return true; // can't parse — be permissive
    }
  }

  /**
   * Classify Cobalt error code into retryable/non-retryable.
   * @param {string} code
   * @returns {{reason: string, retryable: boolean}}
   */
  classifyError(code) {
    if (!code) return { reason: "unknown-error", retryable: false };

    if (code.includes("rate_exceeded")) {
      return { reason: "rate-limited", retryable: true };
    }
    if (code.includes("auth")) {
      return { reason: "requires-auth", retryable: false };
    }
    if (code.includes("fetch")) {
      return { reason: "fetch-error", retryable: false };
    }
    if (code.includes("link")) {
      return { reason: "invalid-url", retryable: false };
    }
    if (code.includes("content")) {
      return { reason: "content-unavailable", retryable: false };
    }
    return { reason: "unknown-error", retryable: false };
  }

  /**
   * Download a video via Cobalt POST /.
   * @param {string} url - canonical source URL
   * @param {Object} [opts]
   * @param {typeof fetch} [opts.fetchFn]
   * @returns {Promise<DownloadResult>}
   */
  async download(url, opts = {}) {
    const fetchFn = opts.fetchFn || globalThis.fetch;
    const source = "cobalt";

    // If preflight not done, do it now
    if (this.available === null) {
      await this.preflight(fetchFn);
    }

    // Cobalt unavailable
    if (!this.available) {
      return makeResult({
        status: "skipped",
        strategy: ADAPTER_IDS.COBALT,
        source,
        sourceUrl: url,
        reason: "cobalt-unavailable",
      });
    }

    // Turnstile required
    if (this.turnstileRequired) {
      return makeResult({
        status: "unsupported",
        strategy: ADAPTER_IDS.COBALT,
        source,
        sourceUrl: url,
        reason: "cobalt-requires-turnstile",
      });
    }

    // Platform not in services
    if (!this.supportsPlatform(url)) {
      return makeResult({
        status: "skipped",
        strategy: ADAPTER_IDS.COBALT,
        source,
        sourceUrl: url,
        reason: "platform-not-supported-by-cobalt",
      });
    }

    // POST /
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Api-Key ${this.apiKey}`;
    }

    let postData;
    try {
      const resp = await fetchFn(this.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ url, videoQuality: "1080" }),
      });

      // Check Content-Type — reject HTML pages
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return makeResult({
          status: "failed",
          strategy: ADAPTER_IDS.COBALT,
          source,
          sourceUrl: url,
          reason: "invalid-response",
          retryable: false,
        });
      }

      postData = await resp.json();
    } catch (e) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.COBALT,
        source,
        sourceUrl: url,
        reason: e.message?.substring(0, 200) || "fetch-error",
        retryable: true,
      });
    }

    const status = postData?.status;

    switch (status) {
      case "tunnel":
      case "redirect": {
        // Download the media URL
        const mediaUrl = postData.url;
        if (!mediaUrl) {
          return makeResult({
            status: "failed",
            strategy: ADAPTER_IDS.COBALT,
            source,
            sourceUrl: url,
            reason: "no-url-in-response",
          });
        }

        try {
          const mediaResp = await fetchFn(mediaUrl);
          if (!mediaResp.ok) {
            return makeResult({
              status: "failed",
              strategy: ADAPTER_IDS.COBALT,
              source,
              sourceUrl: url,
              finalUrl: mediaUrl,
              reason: `media-http-${mediaResp.status}`,
              retryable: mediaResp.status >= 500,
            });
          }

          // Check Content-Type — reject HTML/auth pages
          const mediaContentType = mediaResp.headers.get("content-type") || "";
          if (
            mediaContentType &&
            !mediaContentType.startsWith("video/") &&
            !mediaContentType.includes("octet-stream")
          ) {
            return makeResult({
              status: "failed",
              strategy: ADAPTER_IDS.COBALT,
              source,
              sourceUrl: url,
              finalUrl: mediaUrl,
              reason: "non-video-response",
            });
          }

          const buffer = Buffer.from(await mediaResp.arrayBuffer());

          if (buffer.length < MIN_FILE_BYTES) {
            return makeResult({
              status: "failed",
              strategy: ADAPTER_IDS.COBALT,
              source,
              sourceUrl: url,
              finalUrl: mediaUrl,
              reason: "file-too-small",
            });
          }
          if (buffer.length > MAX_FILE_BYTES) {
            return makeResult({
              status: "skipped",
              strategy: ADAPTER_IDS.COBALT,
              source,
              sourceUrl: url,
              finalUrl: mediaUrl,
              byteLength: buffer.length,
              reason: "exceeds-size-limit",
            });
          }

          return makeResult({
            status: "downloaded",
            strategy: ADAPTER_IDS.COBALT,
            source,
            sourceUrl: url,
            finalUrl: mediaUrl,
            mimeType: mediaContentType || "video/mp4",
            extension: "mp4",
            byteLength: buffer.length,
            buffer,
            provenance: { adapterVersion: this.version || "unknown", authenticated: !!this.apiKey },
          });
        } catch (e) {
          return makeResult({
            status: "failed",
            strategy: ADAPTER_IDS.COBALT,
            source,
            sourceUrl: url,
            reason: e.message?.substring(0, 200) || "media-fetch-error",
            retryable: true,
          });
        }
      }

      case "picker":
        return makeResult({
          status: "needs-selection",
          strategy: ADAPTER_IDS.COBALT,
          source,
          sourceUrl: url,
          reason: "picker-response",
        });

      case "local-processing":
        return makeResult({
          status: "unsupported",
          strategy: ADAPTER_IDS.COBALT,
          source,
          sourceUrl: url,
          reason: "local-processing-not-supported",
        });

      case "error": {
        const errorCode = postData?.error?.code || "";
        const { reason, retryable } = this.classifyError(errorCode);
        return makeResult({
          status: "failed",
          strategy: ADAPTER_IDS.COBALT,
          source,
          sourceUrl: url,
          reason,
          retryable,
        });
      }

      default:
        return makeResult({
          status: "failed",
          strategy: ADAPTER_IDS.COBALT,
          source,
          sourceUrl: url,
          reason: `unknown-status:${status}`,
          retryable: false,
        });
    }
  }
}

// ─── Top-level orchestrator ───

/**
 * Download a video using the unified download layer.
 *
 * Flow: canonicalize → selectStrategy → adapter.download → DownloadResult
 *
 * @param {string} url - Source video URL
 * @param {Object} [opts]
 * @param {typeof fetch} [opts.fetchFn] - injectable fetch for testing
 * @param {CobaltAdapter} [opts.cobaltAdapter] - pre-configured Cobalt adapter
 * @returns {Promise<DownloadResult>}
 */
export async function downloadVideo(url, opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const cobalt = opts.cobaltAdapter || new CobaltAdapter();

  // If Cobalt adapter is provided and preflight not done, do it
  if (cobalt.available === null && !opts.skipCobaltPreflight) {
    await cobalt.preflight(fetchFn);
  }

  const { adapter, canonicalUrl, status, reason } = selectStrategy(url);

  // Empty URL
  if (status === "skipped") {
    return makeResult({
      status,
      strategy: "none",
      sourceUrl: canonicalUrl,
      reason,
    });
  }

  switch (adapter) {
    case ADAPTER_IDS.DIRECT_HTTP:
      return downloadDirectHttp(canonicalUrl, { fetchFn, headers: opts.headers });

    case ADAPTER_IDS.YTDLP:
      return downloadYtdlpAdapter(canonicalUrl);

    case ADAPTER_IDS.COBALT:
      return cobalt.download(canonicalUrl, { fetchFn });

    default:
      return makeResult({
        status: "unsupported",
        strategy: "none",
        sourceUrl: canonicalUrl,
        reason: "no-adapter",
      });
  }
}

// Export CobaltAdapter for testing
export { CobaltAdapter };
