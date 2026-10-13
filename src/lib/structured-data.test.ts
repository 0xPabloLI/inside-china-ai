import { describe, expect, it } from "vitest";
import { validateJsonLdDoc } from "../../scripts/seo/jsonld-schema.mjs";
import { JSONLD_REGISTRY, OG_EXPECTATIONS } from "@/lib/seo-jsonld-registry";
import { OG_DEFAULT, articleOgImageUrl, ogImageForPath, ogImageMeta } from "@/lib/og";
import { postJsonLd } from "@/lib/post-structured-data";
import { jsonLdScript } from "@/lib/structured-data";

describe("jsonLdScript", () => {
  // #319 OCR lib scan: JSON.stringify alone let a "</script>" inside
  // user-controlled content close the script element and start a new one.
  it("escapes `<` so content cannot break out of the script element", () => {
    const doc = {
      "@context": "https://schema.org",
      headline: "Acme</script><script>alert(1)</script>",
    };
    const script = jsonLdScript(doc);
    expect(script.children).not.toContain("</script>");
    expect(script.children).not.toContain("<script>");
  });

  it("round-trips through JSON.parse unchanged", () => {
    const doc = { "@context": "https://schema.org", headline: "A <b>bold</b> claim" };
    expect(JSON.parse(jsonLdScript(doc).children)).toEqual(doc);
  });

  it("is byte-identical to JSON.stringify for documents without `<`", () => {
    const doc = { "@context": "https://schema.org", name: "China AI News" };
    expect(jsonLdScript(doc).children).toBe(JSON.stringify(doc));
  });
});

describe("structured data gate", () => {
  it.each(JSONLD_REGISTRY.map((e) => [e.label, e] as const))(
    "%s emits valid JSON-LD",
    (_label, entry) => {
      const errors = validateJsonLdDoc(entry.doc(), entry.label);
      expect(errors, errors.join("\n")).toEqual([]);
    },
  );

  it("covers Article, FAQPage and BreadcrumbList across the site", () => {
    const types = new Set<string>();
    for (const entry of JSONLD_REGISTRY) {
      const doc = entry.doc() as { "@graph"?: { "@type"?: string }[] };
      for (const node of doc["@graph"] ?? []) if (node["@type"]) types.add(node["@type"]);
    }
    for (const required of ["Article", "FAQPage", "BreadcrumbList"]) {
      expect(types.has(required), `missing ${required}`).toBe(true);
    }
  });
});

describe("og:image templates", () => {
  it.each(OG_EXPECTATIONS)("$path resolves to its template image", ({ path, image }) => {
    expect(ogImageForPath(path)).toBe(image);
  });

  it("falls back to the default image for unknown routes", () => {
    expect(ogImageForPath("/some/new/page")).toBe(OG_DEFAULT);
  });

  it("prefers an explicit cover and makes it absolute", () => {
    expect(ogImageForPath("/posts/x", "/covers/a.jpg")).toBe("https://chinaai.news/covers/a.jpg");
    expect(ogImageForPath("/posts/x", "https://cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });

  it("always returns an absolute https URL", () => {
    for (const path of ["/", "/companies", "/tiktok-connect", "/compare/x"]) {
      expect(ogImageForPath(path)).toMatch(/^https:\/\//);
    }
  });

  it("gives every article a unique, versioned image URL", () => {
    const first = articleOgImageUrl("first-story", "2026-09-14T00:00:00.000Z");
    const second = articleOgImageUrl("second-story", "2026-09-14T00:00:00.000Z");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^https:\/\/chinaai\.news\/api\/public\/og\/posts\/first-story\.png\?v=/);
  });

  it("emits complete social image metadata", () => {
    const image = articleOgImageUrl("first-story");
    expect(ogImageMeta(image, "First story — China AI News")).toEqual(
      expect.arrayContaining([
        { property: "og:image", content: image },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "First story — China AI News" },
        { name: "twitter:image", content: image },
        { name: "twitter:image:alt", content: "First story — China AI News" },
      ]),
    );
  });

  it("uses the same article image in JSON-LD with published and modified dates", () => {
    const image = articleOgImageUrl("first-story", "2026-09-14T01:00:00.000Z");
    const doc = postJsonLd({
      title: "First story",
      description: "A representative China AI news story.",
      url: "https://chinaai.news/posts/first-story",
      image,
      datePublished: "2026-09-14T00:00:00.000Z",
      dateModified: "2026-09-14T01:00:00.000Z",
    }) as { "@graph": Array<Record<string, unknown>> };
    const article = doc["@graph"].find((node) => node["@type"] === "Article");
    const breadcrumbs = doc["@graph"].find((node) => node["@type"] === "BreadcrumbList") as
      { itemListElement?: unknown[] } | undefined;
    expect(article?.image).toEqual([image]);
    expect(article?.datePublished).toBe("2026-09-14T00:00:00.000Z");
    expect(article?.dateModified).toBe("2026-09-14T01:00:00.000Z");
    expect(breadcrumbs?.itemListElement).toHaveLength(3);
  });
});
