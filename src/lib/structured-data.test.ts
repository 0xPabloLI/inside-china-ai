import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
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

describe("route JSON-LD goes through the escaping seam", () => {
  const ROUTES_DIR = new URL("../routes/", import.meta.url).pathname;

  /**
   * Every non-test .ts/.tsx under src/routes, at any depth (api/, _authenticated/, …).
   * Co-located route tests are exempt: they may legitimately assert on the
   * emitted `application/ld+json` marker.
   */
  function routeSources(dir = ROUTES_DIR): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : routeSources(full);
      return entry.isFile() &&
        /\.tsx?$/.test(entry.name) &&
        !/\.(test|spec)\.tsx?$/.test(entry.name)
        ? [full]
        : [];
    });
  }

  // The registry only guards the documents it lists, and a route that
  // hand-rolls `{ type: "application/ld+json", children: JSON.stringify(...) }`
  // bypasses the `<` escaping entirely (#319 OCR lib scan: three such sites
  // shipped that way). Naming the script type is the seam's job — `jsonLdScript`
  // in src/lib/structured-data.ts — so any route module that still names it is
  // emitting a document without the escaping.
  //
  // This is a floor, not a proof: a route that pulled the type from a shared
  // constant would slip past a literal scan. The defect it exists to catch is
  // exactly the literal, and the scan is falsifiable — add the string to
  // index.tsx and this fails.
  it("no route hand-rolls an ld+json script tag", () => {
    const offenders = routeSources()
      .filter((file) => readFileSync(file, "utf8").includes("application/ld+json"))
      .map((file) => file.slice(ROUTES_DIR.length));

    expect(offenders, `${offenders.join(", ")} must serialize through jsonLdScript()`).toEqual([]);
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
