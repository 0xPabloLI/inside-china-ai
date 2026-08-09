/**
 * Shared JSON-LD builders.
 *
 * Every route that emits structured data should build it here so the shapes are
 * validated once, in `src/lib/structured-data.test.ts`, against the zod schemas
 * in `scripts/seo/jsonld-schema.mjs`. That test runs in the SEO gate
 * (`npm run verify:seo`, wired to `prebuild`), so a malformed Article, FAQPage
 * or BreadcrumbList blocks the build instead of shipping.
 */

export const SITE = "https://chinaai.news/";
export const ORG_ID = `${SITE}#organization`;
const LOGO = `${SITE}china-ai-news-logo-gpt.png`;

export type JsonLdNode = Record<string, unknown>;

export function organization(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "China AI News",
    url: SITE,
    logo: { "@type": "ImageObject", url: LOGO },
  };
}

export const orgRef = () => ({ "@id": ORG_ID });

export function articleJsonLd(opts: {
  headline: string;
  description: string;
  url: string;
  image: string;
  datePublished?: string;
  dateModified?: string;
  about?: string;
}): JsonLdNode {
  return {
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    url: opts.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
    image: [opts.image],
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    inLanguage: "en",
    author: orgRef(),
    publisher: orgRef(),
    ...(opts.about ? { about: opts.about } : {}),
  };
}

export function faqPageJsonLd(faq: { q: string; a: string }[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbListJsonLd(items: { name: string; item: string }[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

export function itemListJsonLd(name: string, items: JsonLdNode[]): JsonLdNode {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  };
}

/** Wrap nodes into a single @graph document. */
export function graph(...nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** Serialize a graph for a route `head().scripts` entry. */
export function jsonLdScript(doc: JsonLdNode) {
  return { type: "application/ld+json", children: JSON.stringify(doc) };
}
