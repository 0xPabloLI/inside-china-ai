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
import { cdpNewTab, cdpCloseTab, waitForPageLoad, extractFromTab } from "./cdp-client.mjs";
import { callMcpTool, parseMcpResult } from "./mcp-client.mjs";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  rmSync,
  mkdtempSync,
} from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { tmpdir, homedir } from "os";
import { fileURLToPath } from "url";
import { dirname as _dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = _dirname(__filename);
import { execFileSync } from "child_process";

// ─── Constants ───

export const ADAPTER_IDS = {
  DIRECT_HTTP: "direct-http",
  YTDLP: "ytdlp",
  COBALT: "cobalt",
  DOUYIN_CDP: "douyin-cdp",
  REDNOTE_MCP: "rednote-mcp",
  XHS_CDP: "xhs-cdp",
  XHS_DOWNLOADER: "xhs-downloader",
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

/** Weibo status hosts (#75 Batch 2) — yt-dlp's weibo extractor handles both
 * desktop and mobile URLs with its built-in visitor-cookie flow. */
const WEIBO_HOSTS = ["weibo.com", "weibo.cn", "m.weibo.cn"];

/** Xiaohongshu note hosts (#75 Batch 3) — explore pages and share shortlinks. */
const XHS_HOSTS = ["xiaohongshu.com", "xhslink.com"];

/** 抖音/iesdouyin hostname patterns (download needs no login — share page). */
const DOUYIN_HOSTS = ["douyin.com", "www.douyin.com", "iesdouyin.com", "www.iesdouyin.com"];

/** Referer iesdouyin CDN requires for media downloads (verified 2026-09-03, issue #182). */
const DOUYIN_REFERER = "https://www.douyin.com/";

/** CDP eval script: the <video> element's currentSrc on the rendered share page.
 *  Returns an array — extractFromTab's contract is array-shaped (it JSON-parses
 *  string returns and swallows non-JSON strings to []).
 *  Polls in-page: the share page redirects to douyin.com and hydrates the
 *  xgplayer asynchronously — currentSrc only appears several seconds after
 *  page load (observed ~6s on real data, issue #182 smoke). */
const DOUYIN_CURRENT_SRC_SCRIPT = `let src = document.querySelector("video")?.currentSrc || "";
for (let i = 0; i < 5 && !src.trim(); i++) {
  await new Promise((r) => setTimeout(r, i === 0 ? 500 : 2000));
  src = document.querySelector("video")?.currentSrc || "";
}
return [src];`;

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
export function isXhsUrl(canonicalUrl) {
  try {
    const host = new URL(canonicalUrl).hostname;
    return XHS_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

export function isWeiboUrl(canonicalUrl) {
  try {
    const host = new URL(canonicalUrl).hostname;
    return WEIBO_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

function isBilibiliUrl(canonicalUrl) {
  try {
    const host = new URL(canonicalUrl).hostname.toLowerCase();
    return BILIBILI_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

/**
 * Check if a canonical URL is a 抖音/iesdouyin video page.
 * @param {string} canonicalUrl
 * @returns {boolean}
 */
function isDouyinUrl(canonicalUrl) {
  try {
    const host = new URL(canonicalUrl).hostname.toLowerCase();
    return DOUYIN_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

/**
 * Extract the aweme video id from a douyin/iesdouyin video URL.
 * Both forms carry it as the numeric segment after /video/:
 *   douyin.com/video/{id} · iesdouyin.com/share/video/{id}
 * @param {string} canonicalUrl
 * @returns {string|null} numeric id, or null when absent
 */
export function extractDouyinVideoId(canonicalUrl) {
  try {
    const { pathname } = new URL(canonicalUrl);
    const match = pathname.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
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
  if (isYoutubeUrl(canonical) || isBilibiliUrl(canonical) || isWeiboUrl(canonical)) {
    return { adapter: ADAPTER_IDS.YTDLP, canonicalUrl: canonical };
  }
  // #75 Batch 5: xhs primary backend is XHS-Downloader (battle-tested
  // signing/token/anti-bot handling; cookie via XHS_COOKIE env). The CDP
  // adapter is the in-process fallback; RedNote-MCP stays exported but
  // unrouted (upstream detail scraping currently returns empty).
  if (isXhsUrl(canonical)) {
    return { adapter: ADAPTER_IDS.XHS_DOWNLOADER, canonicalUrl: canonical };
  }

  // 2.5 抖音/iesdouyin → iesdouyin share page via CDP (no login needed for download)
  if (isDouyinUrl(canonical)) {
    return { adapter: ADAPTER_IDS.DOUYIN_CDP, canonicalUrl: canonical };
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
/**
 * Format a raw Cookie header string into yt-dlp Netscape cookie-file lines
 * covering the weibo domains (#75 Batch 2). HttpOnly cookies never reach
 * document.cookie, so only what a browser session exposes can be shared.
 *
 * @param {string} cookieStr - raw "k=v; k2=v2" cookie header value
 * @returns {string} Netscape cookie file content
 */
export function weiboCookieNetscape(cookieStr) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const pair of (cookieStr ?? "").split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name || !value) continue;
    for (const domain of ["weibo.com", ".weibo.com", "weibo.cn", ".weibo.cn"]) {
      // include-subdomains flag must match the leading dot, or python's
      // cookiejar asserts on load (domain_specified == initial_dot)
      const includeSub = domain.startsWith(".");
      lines.push([domain, includeSub ? "TRUE" : "FALSE", "/", "TRUE", "0", name, value].join("\t"));
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * Compose the yt-dlp argv string for one download (#75 Batch 2).
 *
 * Weibo-specific: `--playlist-items 1` pins mix_media statuses (one post,
 * several videos) to the MAIN video — the pipeline wants one clip per
 * candidate, not a playlist; and an optional `cookieFile` (written from the
 * `WEIBO_COOKIE` env, see weiboCookieNetscape) guards against the
 * visitor-cookie system changing again (the 2025 403 outage class).
 * yt-dlp rejects Cookie headers outright, so the file is the only channel.
 * Non-weibo URLs are byte-identical to the pre-#75 command.
 *
 * @param {string} url
 * @param {{tmpPath: string, cookieFile?: string}} opts
 * @returns {string} yt-dlp command string
 */
export function buildYtdlpCommand(url, { tmpPath, cookieFile } = {}) {
  const isWeibo = isWeiboUrl(url);
  const parts = [
    "yt-dlp",
    "--cookies-from-browser firefox",
    '-f "best[height<=720][ext=mp4]/best[height<=720]/bestvideo[height<=720]+bestaudio/best"',
    "--max-filesize 20M",
    '--download-sections "*0:00-0:08"',
  ];
  if (isWeibo) {
    parts.push("--playlist-items 1");
    if (cookieFile) {
      parts.push(`--cookies "${cookieFile}"`);
    }
  }
  parts.push(`-o "${tmpPath}"`, `"${url}"`);
  return parts.join(" ");
}

export function downloadYtdlpAdapter(url) {
  const source = isYoutubeUrl(url) ? "youtube" : isWeiboUrl(url) ? "weibo" : "bilibili";
  const tmpPath = join(tmpdir(), `vdl-ytdlp-${Date.now()}.mp4`);
  const cookieFile = join(tmpdir(), `vdl-ytdlp-cookies-${Date.now()}.txt`);

  // Ensure dir exists
  const dir = dirname(tmpPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let cmd = buildYtdlpCommand(url, { tmpPath });
  if (isWeiboUrl(url) && process.env.WEIBO_COOKIE) {
    writeFileSync(cookieFile, weiboCookieNetscape(process.env.WEIBO_COOKIE), "utf8");
    cmd = buildYtdlpCommand(url, { tmpPath, cookieFile });
  }

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

    // Cleanup temp files
    try {
      unlinkSync(tmpPath);
    } catch {}
    try {
      unlinkSync(cookieFile);
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
    // Cleanup temp files on error
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {}
    try {
      if (existsSync(cookieFile)) unlinkSync(cookieFile);
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

// ─── Adapter: DouyinCdp ───

/**
 * iesdouyin share-page download via CDP (issue #182, method verified 2026-09-03).
 *
 * Flow: cdpNewTab(share URL) → waitForPageLoad → extract <video>.currentSrc
 * → downloadDirectHttp with `Referer: https://www.douyin.com/` → close tab.
 * No douyin login needed for download (search is the login-gated half).
 *
 * All cdp-client functions are injectable for testing; production callers
 * get the real ones by default.
 *
 * @param {string} url - douyin/iesdouyin video URL
 * @param {Object} [opts]
 * @param {typeof fetch} [opts.fetchFn] - injectable fetch (media download)
 * @param {(url: string) => Promise<string>} [opts.cdpNewTabFn]
 * @param {(tabId: string) => Promise<boolean>} [opts.waitForPageLoadFn]
 * @param {(tabId: string, script: string) => Promise<string>} [opts.extractFn]
 * @param {(tabId: string) => Promise<void>} [opts.cdpCloseTabFn]
 * @returns {Promise<DownloadResult>}
 */
export async function downloadDouyinCdp(url, opts = {}) {
  const cdpNewTabFn = opts.cdpNewTabFn || cdpNewTab;
  const waitForPageLoadFn = opts.waitForPageLoadFn || waitForPageLoad;
  const extractFn = opts.extractFn || extractFromTab;
  const closeTabFn = opts.cdpCloseTabFn || cdpCloseTab;
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const source = "douyin";

  const videoId = extractDouyinVideoId(url);
  if (!videoId) {
    return makeResult({
      status: "unsupported",
      strategy: ADAPTER_IDS.DOUYIN_CDP,
      source,
      sourceUrl: url,
      reason: "no-video-id",
    });
  }

  const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}`;
  let tabId = null;
  try {
    tabId = await cdpNewTabFn(shareUrl);
    await waitForPageLoadFn(tabId);
    const extracted = await extractFn(tabId, DOUYIN_CURRENT_SRC_SCRIPT);
    const currentSrc = ((Array.isArray(extracted) ? extracted[0] : extracted) || "").trim();

    if (!currentSrc) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.DOUYIN_CDP,
        source,
        sourceUrl: url,
        reason: "no-current-src",
        retryable: true,
      });
    }

    const mediaResult = await downloadDirectHttp(currentSrc, {
      fetchFn,
      headers: { Referer: DOUYIN_REFERER },
    });

    // Re-shape the direct-http result onto this adapter's identity.
    return {
      ...mediaResult,
      strategy: ADAPTER_IDS.DOUYIN_CDP,
      source,
      sourceUrl: url,
    };
  } catch (e) {
    const message = e?.message?.substring(0, 200) || "cdp-error";
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.DOUYIN_CDP,
      source,
      sourceUrl: url,
      reason: tabId === null ? "cdp-unavailable" : message,
      retryable: true,
    });
  } finally {
    if (tabId !== null) {
      try {
        await closeTabFn(tabId);
      } catch {}
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
/**
 * Download an xiaohongshu note's video via RedNote-MCP (#75 Batch 3).
 *
 * Chain: `rednote-mcp get_note_content` (Playwright session → note detail
 * page) → xhscdn mp4 direct link → direct-http with the xhs Referer. The
 * MCP server spawns a fresh Chromium per call (>30s), so this adapter is
 * fallback-position: it is only selected for xhs URLs, which no other
 * adapter supports.
 *
 * Fail-closed: no video in the note, MCP error/timeout, or a failed CDN
 * download all return failed results — never a partial buffer.
 *
 * @param {string} url - xiaohongshu note URL
 * @param {object} [opts]
 * @param {Function} [opts.mcpCaller] - injectable callMcpTool (tests)
 * @param {Function} [opts.downloader] - injectable downloadDirectHttp (tests)
 * @returns {Promise<DownloadResult>}
 */
export async function downloadRednoteMcp(url, opts = {}) {
  const mcpCaller = opts.mcpCaller || callMcpTool;
  const downloader = opts.downloader || downloadDirectHttp;

  let note;
  try {
    const mcpResult = await mcpCaller({
      command: "rednote-mcp",
      args: ["--stdio"],
      toolName: "get_note_content",
      toolArgs: { url },
      timeoutMs: 90000, // fresh Chromium per call — the default 30s is too tight
    });
    const parsed = parseMcpResult(mcpResult);
    note = parsed[0];
  } catch (e) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.REDNOTE_MCP,
      sourceUrl: url,
      reason: `rednote-mcp failed: ${e.message}`,
      retryable: true,
    });
  }

  const videoUrl = Array.isArray(note?.videos) ? note.videos[0] : null;
  if (!videoUrl) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.REDNOTE_MCP,
      sourceUrl: url,
      reason: "note has no video",
      retryable: false,
    });
  }

  const dl = await downloader(videoUrl, {
    headers: { Referer: "https://www.xiaohongshu.com/" },
  });
  if (dl.status !== "downloaded") {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.REDNOTE_MCP,
      sourceUrl: url,
      finalUrl: videoUrl,
      reason: dl.reason ?? "cdn download failed",
      retryable: true,
    });
  }

  return makeResult({
    status: "downloaded",
    strategy: ADAPTER_IDS.REDNOTE_MCP,
    sourceUrl: url,
    finalUrl: videoUrl,
    mimeType: dl.mimeType ?? "video/mp4",
    extension: dl.extension ?? "mp4",
    byteLength: dl.byteLength,
    buffer: dl.buffer,
  });
}

/**
 * Download an xiaohongshu note's video via the logged-session CDP browser
 * (#75 Batch 4, the MediaCrawler-recommended pattern: reuse a real browser's
 * login state through CDP to stay under the anti-bot radar).
 *
 * Chain: open the note URL (feed-harvested URLs carry xsec_token) in the CDP
 * Chrome → wait for the detail page → extract `<video>` src (xhscdn direct
 * link) → direct-http with the xhs Referer.
 *
 * Fail-closed with reason classification: a page that renders without a
 * video element is reported as a login/anti-bot wall, never a silent empty.
 *
 * @param {string} url - xiaohongshu note URL (xsec_token included when known)
 * @param {object} [opts] - injectable seams: cdpNewTab, waitForPageLoad,
 *   extractFromTab, cdpCloseTab, downloader
 * @returns {Promise<DownloadResult>}
 */
export async function downloadXhsCdp(url, opts = {}) {
  const {
    cdpNewTab: newTab = cdpNewTab,
    extractFromTab: extract = extractFromTab,
    cdpCloseTab: closeTab = cdpCloseTab,
    downloader = downloadDirectHttp,
  } = opts;

  // Proven live mechanics (#75): open the feed first (session/context
  // prewarm), then navigate THE SAME TAB to the note URL — xhscdn tokens are
  // short-lived and context-bound, so a cold tab on the note URL alone lands
  // on "你访问的页面不见了". Navigation + lazy-media wait + extraction run as
  // one in-page async script.
  const FEED_URL = "https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend";
  let tabId;
  try {
    tabId = await newTab(FEED_URL);
    await new Promise((r) => setTimeout(r, 4000));
  } catch (e) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.XHS_CDP,
      sourceUrl: url,
      reason: `cdp open failed: ${e.message}`,
      retryable: true,
    });
  }

  try {
    const script = `
      location.assign(${JSON.stringify(url)});
      await new Promise(function(r) { setTimeout(r, 9000); });
      var v = document.querySelector("video");
      var src = v ? (v.src || (v.querySelector("source") ? v.querySelector("source").src : "")) : "";
      var notFound = document.title.indexOf("页面不见了") >= 0;
      var ogVideo = document.querySelector('meta[property="og:video:url"], meta[property="og:video"]');
      JSON.stringify([{
        videoSrc: src || (ogVideo ? ogVideo.content : "") || "",
        notFound: notFound,
        pageTitle: document.title.slice(0, 40),
      }]);
    `;
    const parsed = await extract(tabId, script);
    const info = Array.isArray(parsed) ? parsed[0] : null;

    if (!info?.videoSrc) {
      const reason = info?.notFound
        ? "note unreachable — xsec_token stale or note gone (tokens are short-lived; consume them fresh from the same CDP session)"
        : info
          ? `note has no video element (title: ${info.pageTitle || "?"})`
          : "note page extraction returned nothing";
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.XHS_CDP,
        sourceUrl: url,
        reason,
        retryable: true,
      });
    }

    const dl = await downloader(info.videoSrc, {
      headers: { Referer: "https://www.xiaohongshu.com/" },
    });
    if (dl.status !== "downloaded") {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.XHS_CDP,
        sourceUrl: url,
        finalUrl: info.videoSrc,
        reason: dl.reason ?? "cdn download failed",
        retryable: true,
      });
    }
    return makeResult({
      status: "downloaded",
      strategy: ADAPTER_IDS.XHS_CDP,
      sourceUrl: url,
      finalUrl: info.videoSrc,
      mimeType: dl.mimeType ?? "video/mp4",
      extension: dl.extension ?? "mp4",
      byteLength: dl.byteLength,
      buffer: dl.buffer,
    });
  } catch (e) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.XHS_CDP,
      sourceUrl: url,
      reason: `xhs cdp failed: ${e.message}`,
      retryable: true,
    });
  } finally {
    try {
      await closeTab(tabId);
    } catch {}
  }
}

/**
 * Download an xiaohongshu note's video via XHS-Downloader (#75 Batch 5, the
 * primary xhs backend — battle-tested signing/token/anti-bot handling).
 *
 * Requires the `XHS_COOKIE` env: a full logged-in xiaohongshu cookie string
 * (must contain web_session; refreshable from any logged-in browser). The
 * CLI downloads into a temp work dir; the newest mp4 is the note video.
 *
 * @param {string} url - tokened xiaohongshu note URL (xsec_token required —
 *   xhs rejects tokenless note access)
 * @param {object} [opts] - injectable seams: runner (argv array → stdout),
 *   pythonPath, scriptDir, workPath, cookie
 * @returns {Promise<DownloadResult>}
 */
/** Read XHS_COOKIE from the repo-root .env.local (same fallback as the
 * apify token), so the cookie persists across shells without exporting. */
function xhsCookieFromEnvLocal() {
  try {
    const envLocal = readFileSync(join(__dirname, "..", "..", "..", ".env.local"), "utf8");
    const m = envLocal.match(/^XHS_COOKIE=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

export async function downloadXhsDownloader(url, opts = {}) {
  // opts.cookie === null forces the absence path (tests); otherwise env,
  // then .env.local.
  const cookie =
    opts.cookie !== undefined ? opts.cookie : (process.env.XHS_COOKIE ?? xhsCookieFromEnvLocal());
  if (!cookie) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.XHS_DOWNLOADER,
      sourceUrl: url,
      reason:
        "XHS_COOKIE not configured — set it in .env.local or the environment: a logged-in xiaohongshu cookie string (web_session required)",
      retryable: false,
    });
  }

  const pythonPath =
    opts.pythonPath ??
    process.env.XHS_DOWNLOADER_PYTHON ??
    join(homedir(), "tools", "XHS-Downloader", ".venv", "bin", "python");
  const scriptDir =
    opts.scriptDir ?? process.env.XHS_DOWNLOADER_HOME ?? join(homedir(), "tools", "XHS-Downloader");
  const workPath = opts.workPath ?? mkdtempSync(join(tmpdir(), "xhs-dl-"));
  let cliOutput = "";
  const runner =
    opts.runner ??
    ((cmd) =>
      (cliOutput = execFileSync(cmd[0], cmd.slice(1), {
        encoding: "utf8",
        timeout: 180000,
        stdio: ["pipe", "pipe", "pipe"],
      })));

  try {
    const cmd = [
      pythonPath,
      join(scriptDir, "main.py"),
      "--url",
      url,
      "--cookie",
      cookie,
      "--work_path",
      workPath,
    ];
    runner(cmd);

    // The CLI writes into {workPath}/Download/ — pick the newest mp4.
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.toLowerCase().endsWith(".mp4")) files.push(full);
      }
    };
    walk(workPath);
    if (files.length === 0) {
      const tail = (cliOutput ?? "").trim().split("\n").slice(-3).join(" | ").slice(0, 200);
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.XHS_DOWNLOADER,
        sourceUrl: url,
        reason: `xhs-downloader produced no video file (image-only note, stale token, or anti-bot block) — cli: ${tail}`,
        retryable: true,
      });
    }
    files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    const buffer = readFileSync(files[0]);
    if (buffer.length < MIN_FILE_BYTES) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.XHS_DOWNLOADER,
        sourceUrl: url,
        reason: "file-too-small",
      });
    }
    return makeResult({
      status: "downloaded",
      strategy: ADAPTER_IDS.XHS_DOWNLOADER,
      sourceUrl: url,
      finalUrl: url,
      mimeType: "video/mp4",
      extension: "mp4",
      byteLength: buffer.length,
      buffer,
    });
  } catch (e) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.XHS_DOWNLOADER,
      sourceUrl: url,
      reason: `xhs-downloader failed: ${e.message?.substring(0, 150)}`,
      retryable: true,
    });
  } finally {
    try {
      rmSync(workPath, { recursive: true, force: true });
    } catch {}
  }
}

export async function downloadVideo(url, opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const cobalt = opts.cobaltAdapter || new CobaltAdapter();

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

  // Cobalt preflight only matters on the cobalt route
  if (adapter === ADAPTER_IDS.COBALT && cobalt.available === null && !opts.skipCobaltPreflight) {
    await cobalt.preflight(fetchFn);
  }

  switch (adapter) {
    case ADAPTER_IDS.DIRECT_HTTP:
      return downloadDirectHttp(canonicalUrl, { fetchFn, headers: opts.headers });

    case ADAPTER_IDS.YTDLP:
      return downloadYtdlpAdapter(canonicalUrl);

    case ADAPTER_IDS.DOUYIN_CDP:
      return downloadDouyinCdp(canonicalUrl, opts);

    case ADAPTER_IDS.REDNOTE_MCP:
      return downloadRednoteMcp(canonicalUrl, opts);

    case ADAPTER_IDS.XHS_CDP:
      return downloadXhsCdp(canonicalUrl, opts);

    case ADAPTER_IDS.XHS_DOWNLOADER: {
      const r = await downloadXhsDownloader(canonicalUrl, {
        runner: opts.xhsDownloaderRunner,
        workPath: opts.xhsDownloaderWorkPath,
      });
      if (r.status === "downloaded") return r;
      // Primary failed → the in-process CDP adapter is the fallback.
      if (opts.skipXhsCdpFallback) return r;
      console.log(`  ⚠️  xhs-downloader failed (${r.reason}) — falling back to xhs-cdp`);
      if (opts.xhsCdpAdapter) return opts.xhsCdpAdapter(canonicalUrl, opts);
      return downloadXhsCdp(canonicalUrl, opts);
    }

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
