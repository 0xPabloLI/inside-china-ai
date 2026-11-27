/**
 * Official-page dynamic media probe (#1551).
 *
 * Topic-stage `videoFit` under-counted entities whose official product page
 * embeds playable clips: the evidence row said `product:… (official, still)`
 * and `product` defaults to `dynamic:false`, so a page with four 1080p clips
 * scored like a page with four screenshots. This module probes the page itself
 * and turns its playable media into `demo` evidence rows.
 *
 * Boundaries that keep the score honest:
 *  - The caller declares whether the page is first-party (`official`). A
 *    third-party repost can supply clips, but they stay `official:false` and
 *    therefore cannot reach the 5-point official-dynamic band.
 *  - Only pages that already appear in the topic evidence are probed. This is
 *    not a crawler and it never guesses an official domain.
 *  - A page without a playable file or embed returns zero assets; the caller
 *    keeps the original score and records "no dynamic found".
 *
 * Layer: static HTML first (product pages usually ship the media URLs in the
 * markup, inline JSON or bundle config). JS-only pages that render their
 * player after hydration are a documented follow-up, not a silent success.
 *
 * @module official-media-probe
 */

import { fetchStatic } from "./fetch-page.mjs";
import { EMBED_HOST_PLATFORMS } from "./page-media-signals.mjs";

const MEDIA_EXTENSIONS = ["mp4", "mov", "webm", "m3u8", "m4v"];
const MEDIA_EXT_RE = new RegExp(`\\.(${MEDIA_EXTENSIONS.join("|")})(?:[?#]|$)`, "i");
const MEDIA_URL_SCAN_RE = new RegExp(
  `(?:https?:)?//[^\\s"'<>\\\\]+?\\.(${MEDIA_EXTENSIONS.join("|")})(?:\\?[^\\s"'<>\\\\]*)?`,
  "gi",
);
// Site chrome that happens to be a video file (PWA manifests, logo stings,
// loading spinners) is not product evidence. A `<video title>` can still
// override the filename, so a real clip named "intro" survives when labelled.
const SITE_CHROME_STEM_RE =
  /^(?:manifest|favicon|logo|sprite|placeholder|loader|loading|spinner|bgm|background|bg)(?:\s|$)/i;

const RELATIVE_MEDIA_SCAN_RE = new RegExp(
  `(?<![\\w:/])/[^\\s"'<>\\\\]*?\\.(${MEDIA_EXTENSIONS.join("|")})(?:\\?[^\\s"'<>\\\\]*)?`,
  "gi",
);

/**
 * Decode the entities that realistically wrap a media URL in HTML/JSON.
 * `&amp;` affects query strings; `&#x2F;` appears in CMS JSON payloads.
 */
function decodeUrlEntities(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&colon;/gi, ":")
    .replace(/&#58;/g, ":")
    .trim();
}

/** Parse one tag's attributes without a DOM dependency. */
export function parseTagAttributes(tag) {
  const attrs = {};
  const re = /([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = re.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

/** Resolve a raw src/href against the page URL; reject non-http(s) schemes. */
function resolveMediaUrl(raw, pageUrl) {
  if (!raw || typeof raw !== "string") return null;
  let value = decodeUrlEntities(raw).replace(/[),;]+$/g, "");
  if (!value) return null;
  if (/^(?:data|blob|javascript|mailto):/i.test(value)) return null;
  try {
    const resolved = new URL(value, pageUrl);
    if (!/^https?:$/i.test(resolved.protocol)) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

/** True when the resolved URL is a playable media file (not an image). */
function isMediaFileUrl(url) {
  try {
    return MEDIA_EXT_RE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Platform label for an embed URL, or null when the host is not a video embed. */
function embedPlatform(url) {
  const lower = url.toLowerCase();
  for (const [host, platform] of Object.entries(EMBED_HOST_PLATFORMS)) {
    if (lower.includes(host)) return platform;
  }
  return null;
}

/** Human label from a filename, dropping long CMS hash prefixes. */
function labelFromUrl(url, fallback) {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const base = pathname.split("/").pop() || "";
    let stem = base.replace(/\.(?:mp4|mov|webm|m3u8|m4v)$/i, "");
    // CMS files look like "2a017a298b5e-reliability" or "7a42d99233f39523-hero-h264".
    stem = stem.replace(/^[a-f0-9]{8,}[-_]/i, "");
    stem = stem.replace(/[-_]+/g, " ").trim();
    if (!stem || /^\d+$/.test(stem) || stem.length < 3) return fallback;
    return stem.slice(0, 80);
  } catch {
    return fallback;
  }
}

/**
 * Extract playable media candidates from page HTML.
 *
 * Order is page order (tag hits first, then raw bundle/config scans). Duplicate
 * URLs collapse to the first hit so a `<video title>` label survives the raw
 * scan that follows.
 *
 * @param {string} html
 * @param {string} pageUrl absolute page URL, used to resolve relative srcs
 * @returns {Array<{url: string, label: string, kind: "file"|"embed", platform?: string}>}
 */
export function extractPageMediaCandidates(html, pageUrl) {
  if (typeof html !== "string" || !html.trim()) return [];
  if (typeof pageUrl !== "string" || !/^https?:\/\//i.test(pageUrl)) {
    throw new TypeError("extractPageMediaCandidates requires an absolute http(s) page URL");
  }

  // JSON payloads escape slashes (`https:\/\/…`); normalise once before scanning.
  const source = html.replace(/\\\//g, "/");
  const candidates = [];
  const seen = new Set();

  const push = (rawUrl, { label, kind, platform } = {}) => {
    const url = resolveMediaUrl(rawUrl, pageUrl);
    if (!url || seen.has(url)) return;
    if (kind === "embed") {
      if (!platform) return;
      seen.add(url);
      candidates.push({ url, label: label || `${platform} embed`, kind, platform });
      return;
    }
    if (!isMediaFileUrl(url)) return;
    const resolvedLabel = label || labelFromUrl(url, "page video");
    if (!label && SITE_CHROME_STEM_RE.test(resolvedLabel)) return;
    seen.add(url);
    candidates.push({ url, label: resolvedLabel, kind: "file" });
  };

  const tagRe = /<(video|source|iframe|meta)\b([^>]*)>/gi;
  let tagMatch;
  while ((tagMatch = tagRe.exec(source))) {
    const tagName = tagMatch[1].toLowerCase();
    const attrs = parseTagAttributes(tagMatch[2]);
    const title = (attrs.title || attrs["aria-label"] || "").trim();

    if (tagName === "video" || tagName === "source") {
      const src = attrs.src || attrs["data-src"] || attrs["data-video-src"];
      if (src) push(src, { label: title, kind: "file" });
      continue;
    }

    if (tagName === "iframe") {
      const src = attrs.src || attrs["data-src"];
      if (!src) continue;
      const resolved = resolveMediaUrl(src, pageUrl);
      if (!resolved) continue;
      const platform = embedPlatform(resolved);
      if (platform) push(src, { kind: "embed", platform });
      continue;
    }

    if (tagName === "meta") {
      const key = (attrs.property || attrs.name || "").toLowerCase();
      if (!/^og:video(?::url|:secure_url)?$/.test(key)) continue;
      if (attrs.content) push(attrs.content, { kind: "file" });
    }
  }

  // Raw scan: inline player configs, bundle URLs, and CMS JSON arrays.
  for (const re of [MEDIA_URL_SCAN_RE, RELATIVE_MEDIA_SCAN_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source))) {
      push(match[0], { kind: "file" });
    }
  }

  return candidates;
}

/**
 * Fetch one declared official page and turn its playable media into scoring
 * rows. `official` is the caller's provenance verdict; this function never
 * upgrades a third-party page by itself.
 *
 * @param {object} options
 * @param {string} options.pageUrl
 * @param {boolean} [options.official=false]
 * @param {Function} [options.fetchImpl] seam for tests (defaults to fetchStatic)
 * @param {number} [options.timeoutMs=15000]
 * @returns {Promise<{ok: boolean, method: string, pageUrl: string, official: boolean,
 *   assets: Array<object>, candidates: Array<object>, error?: string}>}
 */
export async function probeOfficialPageMedia({
  pageUrl,
  official = false,
  fetchImpl = fetchStatic,
  timeoutMs = 15000,
} = {}) {
  if (typeof pageUrl !== "string" || !/^https?:\/\//i.test(pageUrl)) {
    return {
      ok: false,
      method: "static",
      pageUrl: pageUrl || "",
      official,
      assets: [],
      candidates: [],
      error: "invalid page URL (expected http(s)://…)",
    };
  }

  let result;
  try {
    result = await fetchImpl(pageUrl, { timeoutMs });
  } catch (error) {
    return {
      ok: false,
      method: "static",
      pageUrl,
      official,
      assets: [],
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!result || result.ok !== true || typeof result.text !== "string" || !result.text.trim()) {
    return {
      ok: false,
      method: result?.method || "static",
      pageUrl,
      official,
      assets: [],
      candidates: [],
      error: result?.error || `empty response (HTTP ${result?.status ?? "unknown"})`,
    };
  }

  const candidates = extractPageMediaCandidates(result.text, pageUrl);
  const assets = candidates.map((candidate) => ({
    type: "demo",
    label: candidate.label,
    url: candidate.url,
    official: official === true,
    dynamic: true,
  }));

  return {
    ok: true,
    method: result.method || "static",
    pageUrl,
    official: official === true,
    assets,
    candidates,
  };
}
