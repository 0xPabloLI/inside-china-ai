import { describe, expect, it } from "vitest";
import { OG_DEFAULT, OG_TIKTOK, ogImageMeta } from "./og";

const typeOf = (meta: { property?: string; content?: string }[]) =>
  meta.find((entry) => entry.property === "og:image:type")?.content;

describe("ogImageMeta", () => {
  // #319 OCR lib scan: og:image:type was hardcoded to image/png while the
  // fallback assets (OG_DEFAULT, OG_TIKTOK, OG_COMPARE) are JPEGs.
  it("labels the JPEG fallback assets as image/jpeg", () => {
    expect(typeOf(ogImageMeta(OG_DEFAULT))).toBe("image/jpeg");
    expect(typeOf(ogImageMeta(OG_TIKTOK))).toBe("image/jpeg");
  });

  it("labels the generated article card as image/png", () => {
    expect(typeOf(ogImageMeta("https://chinaai.news/api/public/og/posts/x.png?v=2"))).toBe(
      "image/png",
    );
  });

  it("keeps the og/twitter pair and the 1200x630 declaration", () => {
    const meta = ogImageMeta("https://chinaai.news/a.jpg");
    expect(meta).toContainEqual({ property: "og:image", content: "https://chinaai.news/a.jpg" });
    expect(meta).toContainEqual({
      name: "twitter:image",
      content: "https://chinaai.news/a.jpg",
    });
    expect(meta).toContainEqual({ property: "og:image:width", content: "1200" });
    expect(meta).toContainEqual({ property: "og:image:height", content: "630" });
  });
});
