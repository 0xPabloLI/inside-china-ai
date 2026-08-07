import ogDefault from "@/assets/og-default.jpg.asset.json";
import ogCompare from "@/assets/og-compare.jpg.asset.json";
import ogTiktok from "@/assets/og-tiktok.jpg.asset.json";

export const SITE_URL = "https://chinaai.news";

const abs = (url: string) => `${SITE_URL}${url}`;

/** Branded social preview images (1200x630). OG_DEFAULT is the fallback. */
export const OG_DEFAULT = abs(ogDefault.url);
export const OG_COMPARE = abs(ogCompare.url);
export const OG_TIKTOK = abs(ogTiktok.url);

/** og:image + twitter:image meta pair for a leaf route. */
export const ogImageMeta = (url: string = OG_DEFAULT) => [
  { property: "og:image", content: url },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { name: "twitter:image", content: url },
];
