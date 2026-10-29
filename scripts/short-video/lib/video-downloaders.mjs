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
import { BROLL_CLIP_SECONDS, brollSectionSpec } from "./media-window.mjs";
import { cdpNewTab, cdpCloseTab, cdpEval, waitForPageLoad } from "./cdp-client.mjs";
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
import { dirname, extname, join } from "path";
import { execSync } from "child_process";
import {
  YTDLP_BROWSER_UA,
  ytdlpCookieSource,
  ytdlpContainerMime,
  ytdlpDomain,
  ytdlpGate,
  ytdlpRecord412,
  ytdlpRecordSuccess,
  matchYtdlp412,
  removeYtdlpStaleOutput,
  resolveYtdlpOutputPath,
  shellQuote,
  ytdlpProxyArg,
  ytdlpProxyEnv,
} from "./ytdlp-guard.mjs";
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

/** 抖音/iesdouyin hostname patterns (#314: download uses the desktop /video/
 *  page's signed CDN tracks — the iesdouyin share page now 302s there anyway). */
const DOUYIN_HOSTS = ["douyin.com", "www.douyin.com", "iesdouyin.com", "www.iesdouyin.com"];

/** TikTok hostname patterns (#300 stage 2) — video pages, share shortlinks. */
const TIKTOK_HOSTS = ["tiktok.com", "m.tiktok.com", "vt.tiktok.com"];

/**
 * TikTok full-length ceiling. Competitor/analysis videos are consumed whole
 * (duration, scene structure), so the 20MB B-roll budget does not apply here.
 */
const TIKTOK_MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * TikTok extraction budget. yt-dlp solves TikTok's JS challenge before the
 * media fetch (~40s measured on a 5-minute video, 2026-10-16), so the
 * 2-minute B-roll budget is too tight.
 */
const TIKTOK_TIMEOUT_MS = 300000;

/** Referer iesdouyin CDN requires for media downloads (verified 2026-09-03, issue #182). */
const DOUYIN_REFERER = "https://www.douyin.com/";

/** Referer xhscdn's signed stream URLs require (#1004, verified 2026-10-28). */
const XHS_REFERER = "https://www.xiaohongshu.com/";

/** Settle + poll windows: the note page hydrates its player after the
 *  document loads, and the signed mp4 lands ~1s after the player is kicked
 *  (verified live 2026-10-28). */
const XHS_NOTE_SETTLE_MS = 3500;
const XHS_MEDIA_POLL_INTERVAL_MS = 500;
const XHS_MEDIA_POLL_TIMEOUT_MS = 10000;

/** CDP eval script: signed media track URLs from the desktop player's resource
 *  timings. The player uses MSE (`blob:` currentSrc), so the <video> element
 *  carries no fetchable URL; the page does request separate signed
 *  video/audio tracks from douyinvod.com. Returns an array — written as an
 *  IIFE expression because CDP eval has no top-level return. Raises the
 *  resource-timing buffer first: the live page already holds ~240 entries and
 *  the media requests must not be evicted while the adapter polls. */
const DOUYIN_MEDIA_TRACKS_SCRIPT = `(() => {
  try {
    performance.setResourceTimingBufferSize(2000);
  } catch (e) {}
  try {
    return performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => /douyinvod\\.com/.test(u) && /mime_type=video_mp4/.test(u));
  } catch (e) {
    return [];
  }
})()`;

/** CDP eval script: xhs's signed stream URL from resource timings (#1004).
 *  The note player is MSE (`video.currentSrc` is `blob:`), so the `<video>`
 *  element carries no fetchable URL; the page requests an
 *  `sns-video*.xhscdn.com/stream/...mp4?sign=...` instead. Same IIFE shape and
 *  buffer bump as douyin's track reader. */
const XHS_MEDIA_TRACKS_SCRIPT = `(() => {
  try {
    performance.setResourceTimingBufferSize(2000);
  } catch (e) {}
  try {
    return performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => /sns-video.*\\.mp4/i.test(u));
  } catch (e) {
    return [];
  }
})()`;

/** Unwrap a CDP eval payload (`{result:{value}}`, `{value}`) to its value.
 *  A proxy page-script failure (`{error}`) throws instead of reading as an
 *  empty/undefined result — the same #308 rule evalTrackList applies.
 *  @param {unknown} raw
 *  @returns {any}
 */
function unwrapEvalValue(raw) {
  let v = raw;
  if (v && typeof v === "object") {
    if ("href" in v || "hasVideo" in v || "loginWall" in v) return v;
    if (v.result && typeof v.result === "object" && "value" in v.result) v = v.result.value;
    else if ("value" in v) v = v.value;
  }
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return v;
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v) && v.error) {
    throw new Error(`cdp eval failed: ${JSON.stringify(v.error).slice(0, 200)}`);
  }
  return v;
}

/** Track polling budget: the player requests its CDN tracks a few seconds
 *  after load (verified 2026-10-28 on a 65-minute clip). */
const DOUYIN_TRACK_POLL_INTERVAL_MS = 500;
const DOUYIN_TRACK_POLL_TIMEOUT_MS = 12000;

/** B-roll clip length, shared with the yt-dlp `--download-sections` spec
 *  (media-window.mjs). Douyin's full tracks are 23-139MB (measured live
 *  2026-10-28), so the adapter never pulls whole tracks — only this window. */
const DOUYIN_CLIP_SECONDS = BROLL_CLIP_SECONDS;
const CLIP_TIMEOUT_MS = 120000;

/**
 * Normalize a CDP eval response to an array of URL strings.
 * Accepts a raw array, `{ value }`, `{ result: { value } }`, or a JSON string.
 * @param {unknown} value
 * @returns {string[]}
 */
function evalTrackList(value) {
  let v = unwrapEvalValue(value);
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.filter((u) => typeof u === "string" && u) : [];
}

/**
 * Build the ffmpeg argv for an 8s B-roll clip (pure, exported for tests).
 *
 * Every input gets its own `-headers` (ffmpeg applies the option to the next
 * input only), then an output bounded by `-t` and transcoded to H.264/AAC for
 * Chromium/Remotion.
 *
 * @param {{inputs: Array<{url: string, referer: string}>, seconds: number, outPath: string}} params
 * @returns {string[]}
 */
export function buildClipArgs({ inputs, seconds, outPath }) {
  const args = ["-y"];
  for (const { url, referer } of inputs) {
    args.push("-headers", `Referer: ${referer}\r\n`, "-i", url);
  }
  args.push(
    "-t",
    String(seconds),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outPath,
  );
  return args;
}

/**
 * Douyin's two signed tracks (picture + optional sound) → the generalized
 * `buildClipArgs` input list. Kept as a thin wrapper (#314 shape) so callers
 * and tests that speak in video/audio URLs do not need to know about it.
 *
 * @param {{videoUrl: string, audioUrl?: string|null, referer: string, seconds: number, outPath: string}} params
 * @returns {string[]}
 */
export function buildDouyinClipArgs({ videoUrl, audioUrl, referer, seconds, outPath }) {
  const inputs = [{ url: videoUrl, referer }];
  if (audioUrl) inputs.push({ url: audioUrl, referer });
  return buildClipArgs({ inputs, seconds, outPath });
}

/**
 * Default clipper: an 8s H.264 b-roll clip straight off a signed CDN track.
 * Douyin serves picture and sound as separate URLs; xhs serves one mp4, so
 * `inputs` generalizes both (#1004). The CDNs only answer with the site's
 * Referer; ffmpeg reads them over HTTP with that header and, because `-t`
 * bounds the output, fetches only the byte ranges it needs (verified live
 * 2026-10-28: 0.5-0.8MB in 2-3s for sources weighing 23-139MB). Douyin's
 * source is HEVC, which Chromium/Remotion cannot decode reliably, so both
 * streams are transcoded to H.264/AAC.
 * Temp files are always removed; a failure carries the ffmpeg stderr tail.
 * @param {{videoUrl: string, audioUrl?: string|null, referer: string, seconds: number}} params
 * @returns {Buffer}
 */
function clipTracks({ videoUrl, audioUrl, referer, seconds }) {
  const workDir = mkdtempSync(join(tmpdir(), "clip-"));
  try {
    const outPath = join(workDir, "clip.mp4");
    const args = buildDouyinClipArgs({ videoUrl, audioUrl, referer, seconds, outPath });
    try {
      execFileSync("ffmpeg", args, {
        stdio: "pipe",
        timeout: CLIP_TIMEOUT_MS,
      });
    } catch (e) {
      const stderr = String(e.stderr || "")
        .trim()
        .slice(-400);
      const err = new Error(`ffmpeg clip failed: ${stderr || e.message}`);
      err.code = e.code;
      throw err;
    }
    return readFileSync(outPath);
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Read the hostname out of a URL string, or "" when there is none.
 * @param {string} url
 * @returns {string}
 */
function urlHost(url) {
  try {
    return new URL(url).hostname || "";
  } catch {
    return "";
  }
}

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
function isXhsUrl(canonicalUrl) {
  const host = urlHost(canonicalUrl);
  return XHS_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

export function isWeiboUrl(canonicalUrl) {
  const host = urlHost(canonicalUrl);
  return WEIBO_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

/**
 * Check if a canonical URL is a TikTok video page.
 * @param {string} canonicalUrl
 * @returns {boolean}
 */
export function isTiktokUrl(canonicalUrl) {
  const host = urlHost(canonicalUrl).toLowerCase();
  return TIKTOK_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

function isBilibiliUrl(canonicalUrl) {
  const host = urlHost(canonicalUrl).toLowerCase();
  return BILIBILI_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

/**
 * Check if a canonical URL is a 抖音/iesdouyin video page.
 * @param {string} canonicalUrl
 * @returns {boolean}
 */
function isDouyinUrl(canonicalUrl) {
  const host = urlHost(canonicalUrl).toLowerCase();
  return DOUYIN_HOSTS.some((h) => host === h || host.endsWith("." + h));
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

  // 0. Not an http(s) URL at all — a `data:`/`javascript:` placeholder or any
  //    other scheme is fetchable by NO adapter. News pages lazy-load cards
  //    this way (#636: Bing news `<img src>` is a base64 thumbnail until the
  //    CDN URL resolves); handing it to Cobalt posted the whole base64 body as
  //    a "url" and came back as a link error. Name the shape instead.
  //    (canonicalizeUrl already upgraded http:// and protocol-relative //host
  //    inputs, so this only rejects genuinely non-http(s) strings.)
  if (!/^https?:\/\//i.test(canonical)) {
    return { adapter: "none", canonicalUrl: canonical, status: "skipped", reason: "non-http-url" };
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
  // #314: keep the query — xhs note URLs need `xsec_token`, and both adapters
  // receive this canonicalUrl. The rest of the canonical form still applies
  // (scheme/host/trailing slash).
  if (isXhsUrl(canonical)) {
    return {
      adapter: ADAPTER_IDS.XHS_DOWNLOADER,
      canonicalUrl: canonicalizeUrl(url, { keepQuery: true }),
    };
  }

  // 2.5 抖音/iesdouyin → desktop /video/ page via CDP (#314: signed CDN
  //     tracks; the iesdouyin share page now redirects to the same page).
  if (isDouyinUrl(canonical)) {
    return { adapter: ADAPTER_IDS.DOUYIN_CDP, canonicalUrl: canonical };
  }

  // 2.6 TikTok → ytdlp (#300 stage 2, verified 2026-10-16). yt-dlp's extractor
  //     solves TikTok's JS challenge cookieless and returns one progressive
  //     mp4; the CDN serves only Chrome-fingerprinted clients, so the
  //     in-process fetch path (Cobalt/anchor/CDP-fetch) gets 403 on the media
  //     URL itself.
  if (isTiktokUrl(canonical)) {
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
 *
 * TikTok-specific (#300 stage 2): full-length, cookieless. Two independent
 * reasons. (a) Duration: competitor/analysis videos are consumed whole, not as
 * 8s B-roll slices — so no `--download-sections` (which also drops the ffmpeg
 * child dependency). (b) Cookies: the extractor solves TikTok's JS challenge
 * on its own, while `--cookies-from-browser` adds a host-dependent failure
 * mode (a machine without the firefox store errors out before extraction) and
 * `--max-filesize` would cut long-form uploads short of the analysis need.
 *
 * All URLs carry a browser-like `--user-agent` (ytdlp-guard.mjs): the
 * default python UA is part of what bilibili's 412 risk control flags
 * (yt-dlp #16571 workaround reports).
 *
 * @param {string} url
 * @param {{tmpPath: string, cookieFile?: string}} opts
 * @returns {string} yt-dlp command string
 */
export function buildYtdlpCommand(url, { tmpPath, cookieFile } = {}) {
  const isWeibo = isWeiboUrl(url);
  const isTiktok = isTiktokUrl(url);
  const parts = ["yt-dlp"];

  // #328: every B-roll platform reads the firefox plaintext cookie store, so
  // the Keychain-backed chrome store (and its blocking prompt) is off the
  // path. TikTok is cookieless by design — see the header note.
  if (!isTiktok) {
    parts.push(`--cookies-from-browser ${shellQuote(ytdlpCookieSource())}`);
  }
  parts.push(`--user-agent ${shellQuote(YTDLP_BROWSER_UA)}`);
  parts.push(
    isTiktok
      ? // One single-file format with audio, long side capped at 1920 (1080p).
        // TikTok is mostly 9:16, so `height` is the LONG side — a `height<=1080`
        // filter silently excludes the 1080x1920 and 720x1280 tracks and lands
        // on 576x1024 (measured 2026-10-16). Cap the long side instead.
        '-f "b[height<=1920]/b"'
      : '-f "best[height<=720][ext=mp4]/best[height<=720]/bestvideo[height<=720]+bestaudio/best"',
  );

  if (isTiktok) {
    parts.push("--no-playlist");
  } else {
    parts.push("--max-filesize 20M");
    parts.push(`--download-sections "${brollSectionSpec()}"`);
  }

  // #324: --download-sections delegates the fetch to ffmpeg, which only
  // reads a lowercase http_proxy — hand yt-dlp the proxy explicitly.
  const proxyArg = ytdlpProxyArg();
  if (proxyArg) parts.push(proxyArg);

  if (isWeibo) {
    parts.push("--playlist-items 1");
    if (cookieFile) {
      parts.push(`--cookies ${shellQuote(cookieFile)}`);
    }
  }
  // Every interpolated value goes through shellQuote (the module's single
  // quoting primitive): this string reaches execSync's shell, and since #300
  // the URL can originate from scraped page content, so `"${url}"` would let a
  // crafted href break out of the quotes and run commands.
  parts.push(`-o ${shellQuote(tmpPath)}`, shellQuote(url));

  // #329: ffmpeg reads only the lower-case http_proxy. A shell env assignment
  // on the command word delivers it to yt-dlp and to its ffmpeg child, which is
  // the same value already carried by `--proxy`; emitted only when this side
  // resolved a proxy (an exported lower-case variable needs no copy).
  const proxyEnv = ytdlpProxyEnv();
  const envPrefix = proxyEnv.http_proxy ? `http_proxy=${shellQuote(proxyEnv.http_proxy)} ` : "";
  return `${envPrefix}${parts.join(" ")}`;
}

export function downloadYtdlpAdapter(url) {
  const isTiktok = isTiktokUrl(url);
  const source = isTiktok
    ? "tiktok"
    : isYoutubeUrl(url)
      ? "youtube"
      : isWeiboUrl(url)
        ? "weibo"
        : "bilibili";
  const maxBytes = isTiktok ? TIKTOK_MAX_FILE_BYTES : MAX_FILE_BYTES;
  const timeoutMs = isTiktok ? TIKTOK_TIMEOUT_MS : 120000;
  const tmpPath = join(tmpdir(), `vdl-ytdlp-${Date.now()}.mp4`);
  const cookieFile = join(tmpdir(), `vdl-ytdlp-cookies-${Date.now()}.txt`);

  // Persistent 412 backoff — skip the invocation entirely while penalized.
  const domain = ytdlpDomain(url);
  if (ytdlpGate(domain)) {
    return makeResult({
      status: "failed",
      strategy: ADAPTER_IDS.YTDLP,
      source,
      sourceUrl: url,
      reason: "yt-dlp 412 backoff active — skipped",
      retryable: false,
    });
  }

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

  // #323 review: clear stale suffixed siblings so the resolver only sees THIS
  // invocation's output (pre-fix-era orphans must not pass as fresh).
  removeYtdlpStaleOutput(tmpPath);

  try {
    execSync(cmd, { encoding: "utf8", timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"] });

    // #323: resolve the actual output — a webm-only source lands at
    // `<tmpPath>.webm` (yt-dlp appends the real container extension).
    const produced = resolveYtdlpOutputPath(tmpPath);
    if (!produced) {
      return makeResult({
        status: "failed",
        strategy: ADAPTER_IDS.YTDLP,
        source,
        sourceUrl: url,
        reason: "yt-dlp completed but file not found",
      });
    }

    const buffer = readFileSync(produced);

    // Cleanup temp files (the actually produced file + cookie file)
    try {
      unlinkSync(produced);
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
    if (buffer.length > maxBytes) {
      return makeResult({
        status: "skipped",
        strategy: ADAPTER_IDS.YTDLP,
        source,
        sourceUrl: url,
        byteLength: buffer.length,
        reason: "exceeds-size-limit",
      });
    }

    ytdlpRecordSuccess(domain);

    // #323: report the container actually produced, not the requested one.
    const ext = extname(produced).slice(1) || "mp4";
    return makeResult({
      status: "downloaded",
      strategy: ADAPTER_IDS.YTDLP,
      source,
      sourceUrl: url,
      finalUrl: url,
      mimeType: ytdlpContainerMime(ext),
      extension: ext,
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
    // 412 penalty box — record before the generic classifications below.
    if (matchYtdlp412(e)) {
      ytdlpRecord412(domain);
    }
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
   *
   * `link` errors carry a URL-shaped cause, so the host is appended whenever
   * it can be read. A bare `invalid-url` cannot tell "no handler for this
   * site" (the measured class — Bing CDN thumbnails, #636) from "malformed
   * URL", and the report reader had to re-probe to learn which one it was.
   * The other families are code-only and keep their names.
   *
   * @param {string} code
   * @param {string} [sourceUrl] - the URL Cobalt was asked to process
   * @returns {{reason: string, retryable: boolean}}
   */
  classifyError(code, sourceUrl = "") {
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
      const host = urlHost(sourceUrl);
      return {
        reason: host ? `unsupported-by-downloader:${host}` : "unsupported-by-downloader",
        retryable: false,
      };
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
        const { reason, retryable } = this.classifyError(errorCode, url);
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
 * Douyin /video/ page download via CDP (issue #314; method verified live
 * 2026-10-28). The old iesdouyin share page now 302-redirects to the desktop
 * page, whose player is MSE-based (`blob:` currentSrc) — the <video> element
 * exposes no fetchable URL. The page does request signed CDN tracks:
 *
 * Flow: cdpNewTab(/video/{id}) → waitForPageLoad → poll
 * `performance.getEntriesByType("resource")` for douyinvod URLs → ffmpeg
 * clips 8s of both tracks to H.264/AAC with `Referer:
 * https://www.douyin.com/` → close tab.
 *
 * Only the first 8 seconds are fetched (B-roll semantics), so the 20MB
 * B-roll cap is not consulted here: live tracks weigh 23-139MB, and every
 * one of them would be rejected.
 *
 * All collaborators are injectable for testing; production callers get the
 * real ones by default.
 *
 * @param {string} url - douyin/iesdouyin video URL
 * @param {Object} [opts]
 * @param {(url: string) => Promise<string>} [opts.cdpNewTabFn]
 * @param {(tabId: string) => Promise<boolean>} [opts.waitForPageLoadFn]
 * @param {(tabId: string, script: string) => Promise<unknown>} [opts.evalFn]
 * @param {(ms: number) => Promise<void>} [opts.sleepFn]
 * @param {(params: {videoUrl: string, audioUrl: string|null, referer: string, seconds: number}) => Promise<Buffer>} [opts.clipFn]
 * @param {(tabId: string) => Promise<void>} [opts.cdpCloseTabFn]
 * @returns {Promise<DownloadResult>}
 */
export async function downloadDouyinCdp(url, opts = {}) {
  const cdpNewTabFn = opts.cdpNewTabFn || cdpNewTab;
  const waitForPageLoadFn = opts.waitForPageLoadFn || waitForPageLoad;
  const evalFn = opts.evalFn || cdpEval;
  const sleepFn = opts.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const clipFn = opts.clipFn || clipTracks;
  const closeTabFn = opts.cdpCloseTabFn || cdpCloseTab;
  const source = "douyin";
  const strategy = ADAPTER_IDS.DOUYIN_CDP;

  const videoId = extractDouyinVideoId(url);
  if (!videoId) {
    return makeResult({
      status: "unsupported",
      strategy,
      source,
      sourceUrl: url,
      reason: "no-video-id",
    });
  }

  let tabId = null;
  try {
    tabId = await cdpNewTabFn(`https://www.douyin.com/video/${videoId}`);
    await waitForPageLoadFn(tabId);

    // Poll the resource-timing list: the player hydrates asynchronously and
    // only then requests its signed CDN tracks.
    const maxAttempts = Math.ceil(DOUYIN_TRACK_POLL_TIMEOUT_MS / DOUYIN_TRACK_POLL_INTERVAL_MS);
    let tracks = [];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      tracks = evalTrackList(await evalFn(tabId, DOUYIN_MEDIA_TRACKS_SCRIPT));
      // Wait for the picture track specifically — audio may land first.
      if (tracks.some((u) => /media-video/.test(u))) break;
      if (attempt < maxAttempts - 1) await sleepFn(DOUYIN_TRACK_POLL_INTERVAL_MS);
    }

    const videoUrl = tracks.find((u) => /media-video/.test(u));
    const audioUrl = tracks.find((u) => /media-audio/.test(u));
    if (!videoUrl) {
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: "no-media-tracks",
        retryable: true,
      });
    }

    // Clip 8s straight off both signed tracks; ffmpeg bounds the HTTP fetch
    // by the requested duration, so no content-length pre-check is needed.
    let buffer;
    try {
      buffer = await clipFn({
        videoUrl,
        audioUrl: audioUrl ?? null,
        referer: DOUYIN_REFERER,
        seconds: DOUYIN_CLIP_SECONDS,
      });
    } catch (e) {
      // A missing ffmpeg binary is permanent, not retryable; anything else
      // (CDN hiccup, bad range, transcode failure) may succeed on a retry.
      const missingBinary = e?.code === "ENOENT";
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: missingBinary ? "ffmpeg-missing" : "clip-failed",
        cause: e?.message?.substring(0, 400) || undefined,
        retryable: !missingBinary,
      });
    }

    if (buffer.length < MIN_FILE_BYTES) {
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: "file-too-small",
      });
    }

    return makeResult({
      status: "downloaded",
      strategy,
      source,
      sourceUrl: url,
      finalUrl: videoUrl,
      mimeType: "video/mp4",
      extension: "mp4",
      byteLength: buffer.length,
      buffer,
    });
  } catch (e) {
    const message = e?.message?.substring(0, 200) || "cdp-error";
    return makeResult({
      status: "failed",
      strategy,
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
    headers: { Referer: XHS_REFERER },
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
 * Chain: open the note URL in a CDP tab (feed-harvested URLs carry
 * `xsec_token`; the search_result form redirects to the note) → muted
 * `load()` + `play()` to make the MSE player request its media → the signed
 * `sns-video*.xhscdn.com/...mp4?sign=...` URL is read from resource timings
 * (#1004) → ffmpeg clips the first 8s with the xhs Referer.
 *
 * Fail-closed with reason classification: a 404 page ("页面不见了"), a page
 * without `<video>` (image-only note / login wall) and a player that never
 * requests media are all reported by name, never as a silent empty.
 *
 * @param {string} url - xiaohongshu note URL (xsec_token included when known)
 * @param {object} [opts] - injectable seams: cdpNewTabFn, cdpCloseTabFn,
 *   waitForPageLoadFn, evalFn, sleepFn, clipFn
 * @returns {Promise<DownloadResult>}
 */
export async function downloadXhsCdp(url, opts = {}) {
  const newTab = opts.cdpNewTabFn || cdpNewTab;
  const closeTab = opts.cdpCloseTabFn || cdpCloseTab;
  const waitForPageLoadFn = opts.waitForPageLoadFn || waitForPageLoad;
  const evalFn = opts.evalFn || cdpEval;
  const sleepFn = opts.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const clipFn = opts.clipFn || clipTracks;
  const strategy = ADAPTER_IDS.XHS_CDP;
  const source = "xhs";

  let tabId = null;
  try {
    try {
      tabId = await newTab(url);
      await waitForPageLoadFn(tabId);
    } catch (e) {
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: "cdp-unavailable",
        cause: e?.message?.substring(0, 200) || undefined,
        retryable: true,
      });
    }
    await sleepFn(XHS_NOTE_SETTLE_MS);

    // Read the page state and kick the player: a paused MSE video never
    // requests its media. `load()` is the part that matters — `play()` alone
    // stays at readyState 0 with no media request (measured 2026-10-28);
    // `load()` + muted `play()` fetches the signed mp4. The same kick is
    // repeated if the first poll window comes back empty: slow hydrations
    // were observed live (2 of 4 notes needed a second kick).
    const kickScript = `(() => {
      var v = document.querySelector("video");
      if (v) {
        v.muted = true;
        try { v.load(); } catch (e) {}
        try { v.play().catch(function () {}); } catch (e) {}
      }
      return {
        href: location.href,
        title: document.title,
        hasVideo: !!v,
        loginWall: /登录后查看|扫码登录|请先登录/.test(document.body ? document.body.innerText : ""),
      };
    })()`;
    const state = unwrapEvalValue(await evalFn(tabId, kickScript));
    const href = typeof state?.href === "string" ? state.href : "";
    const title = typeof state?.title === "string" ? state.title : "";
    if (title.includes("页面不见了") || href.includes("/404")) {
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason:
          "note unreachable — page gone/404 (xsec_token stale or note deleted; consume tokens fresh from the same CDP session)",
        retryable: true,
      });
    }
    if (!state?.hasVideo) {
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: state?.loginWall
          ? "login wall (xhs session expired?)"
          : "note has no video element",
        retryable: true,
      });
    }

    // Poll resource timing: the signed mp4 lands ~1s after the kick.
    const maxAttempts = Math.ceil(XHS_MEDIA_POLL_TIMEOUT_MS / XHS_MEDIA_POLL_INTERVAL_MS);
    const pollOnce = async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const urls = evalTrackList(await evalFn(tabId, XHS_MEDIA_TRACKS_SCRIPT));
        if (urls.length > 0) return urls[0];
        if (attempt < maxAttempts - 1) await sleepFn(XHS_MEDIA_POLL_INTERVAL_MS);
      }
      return null;
    };
    let mediaUrl = await pollOnce();
    if (!mediaUrl) {
      await evalFn(tabId, kickScript);
      mediaUrl = await pollOnce();
    }
    if (!mediaUrl) {
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: "no-media-url",
        retryable: true,
      });
    }

    let buffer;
    try {
      buffer = await clipFn({
        videoUrl: mediaUrl,
        audioUrl: null,
        referer: XHS_REFERER,
        seconds: BROLL_CLIP_SECONDS,
      });
    } catch (e) {
      // A missing ffmpeg binary is permanent, not retryable; anything else
      // (CDN hiccup, bad range, transcode failure) may succeed on a retry.
      const missingBinary = e?.code === "ENOENT";
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: missingBinary ? "ffmpeg-missing" : "clip-failed",
        cause: e?.message?.substring(0, 400) || undefined,
        retryable: !missingBinary,
      });
    }

    if (buffer.length < MIN_FILE_BYTES) {
      return makeResult({
        status: "failed",
        strategy,
        source,
        sourceUrl: url,
        reason: "file-too-small",
      });
    }

    return makeResult({
      status: "downloaded",
      strategy,
      source,
      sourceUrl: url,
      finalUrl: mediaUrl,
      mimeType: "video/mp4",
      extension: "mp4",
      byteLength: buffer.length,
      buffer,
    });
  } catch (e) {
    return makeResult({
      status: "failed",
      strategy,
      source,
      sourceUrl: url,
      reason: `xhs cdp failed: ${e?.message?.substring(0, 200) || "cdp-error"}`,
      retryable: true,
    });
  } finally {
    if (tabId !== null) {
      try {
        await closeTab(tabId);
      } catch {}
    }
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
