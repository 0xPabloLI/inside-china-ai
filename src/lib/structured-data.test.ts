import { describe, expect, it } from "vitest";
import { validateJsonLdDoc } from "../../scripts/seo/jsonld-schema.mjs";
import { JSONLD_REGISTRY, OG_EXPECTATIONS } from "@/lib/seo-jsonld-registry";
import { OG_DEFAULT, ogImageForPath } from "@/lib/og";

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
});
