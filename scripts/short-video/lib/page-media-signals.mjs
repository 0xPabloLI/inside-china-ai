/**
 * Page-level media signals shared by the CDP page scripts: which iframe hosts
 * count as video embeds (and their platform), and which meta tags carry a
 * publish date.
 *
 * A leaf module on purpose: `search-sources.mjs` (search results, images keyed
 * by article href) and `extract-media.mjs` (detail-page cache, arrays) build
 * different script shapes from the same facts. Before #945 the host list had
 * three copies and the date-selector fact two — the copies had already started
 * to drift (only one learned the `og:` fallback).
 */

export const EMBED_HOST_PLATFORMS = {
  "youtube.com/embed": "youtube",
  "player.bilibili.com": "bilibili",
  "douyin.com": "douyin",
  "player.youku.com": "youku",
};

// Single-quoted CSS attribute values: these strings are JSON.stringify'd into
// a page script, and an escaped double quote inside a template literal would
// be consumed on the way in — the same class of bug as #945.
export const PAGE_DATE_META_SELECTORS = [
  "meta[property='article:published_time']",
  "meta[property='og:article:published_time']",
];
