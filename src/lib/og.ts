import ogDefault from "@/assets/og-default.jpg.asset.json";
import ogCompare from "@/assets/og-compare.jpg.asset.json";
import ogTiktok from "@/assets/og-tiktok.jpg.asset.json";

export const SITE_URL = "https://chinaai.news";

const abs = (url: string) => (/^https?:\/\//.test(url) ? url : `${SITE_URL}${url}`);

/** Branded social preview images (1200x630). OG_DEFAULT is the fallback. */
export const OG_DEFAULT = abs(ogDefault.url);
export const OG_COMPARE = abs(ogCompare.url);
export const OG_TIKTOK = abs(ogTiktok.url);

export function articleOgImageUrl(slug: string, updatedAt?: string | null): string {
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${SITE_URL}/api/public/og/posts/${encodeURIComponent(slug)}.png${version}`;
}

/**
 * Per-route og:image templates. First matching pattern wins; anything without
 * a match falls back to OG_DEFAULT, so no route ever ships without a preview
 * image and nothing has to be uploaded by hand.
 */
const OG_TEMPLATES: { match: RegExp; image: string }[] = [
  { match: /^\/compare(\/|$)/, image: OG_COMPARE },
  { match: /^\/tiktok-connect$/, image: OG_TIKTOK },
];

/**
 * Resolve the og:image for a route.
 * @param path route pathname, e.g. "/compare/deepseek-vs-qwen-vs-glm"
 * @param cover optional per-page cover (absolute URL or site-relative path)
 */
export function ogImageForPath(path: string, cover?: string | null): string {
  if (cover && cover.trim()) return abs(cover.trim());
  return OG_TEMPLATES.find((t) => t.match.test(path))?.image ?? OG_DEFAULT;
}

/** og:image + twitter:image meta pair for a leaf route. */
export const ogImageMeta = (url: string = OG_DEFAULT, alt?: string) => [
  { property: "og:image", content: url },
  { property: "og:image:type", content: "image/png" },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  ...(alt ? [{ property: "og:image:alt", content: alt }] : []),
  { name: "twitter:image", content: url },
  ...(alt ? [{ name: "twitter:image:alt", content: alt }] : []),
];

/** og:image meta pair resolved from the route path (with automatic fallback). */
export const ogMetaForPath = (path: string, cover?: string | null) =>
  ogImageMeta(ogImageForPath(path, cover));
