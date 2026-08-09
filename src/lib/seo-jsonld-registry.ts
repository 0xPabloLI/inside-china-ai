/**
 * Registry of every JSON-LD document the site ships from a route `head()`.
 *
 * The SEO gate validates each entry, so anything registered here can never ship
 * with a malformed Article, FAQPage, BreadcrumbList or ItemList.
 */
import {
  SITE,
  articleJsonLd,
  breadcrumbListJsonLd,
  faqPageJsonLd,
  graph,
  itemListJsonLd,
  organization,
  type JsonLdNode,
} from "@/lib/structured-data";
import { OG_DEFAULT, OG_TIKTOK, ogImageForPath } from "@/lib/og";
import { compareJsonLd } from "@/routes/compare.deepseek-vs-qwen-vs-glm";
import { companiesJsonLd } from "@/routes/companies";
import { tiktokConnectJsonLd } from "@/routes/tiktok-connect";
import { postJsonLd } from "@/lib/post-structured-data";

/** A representative article graph, standing in for every /posts/$slug page. */
const samplePostJsonLd = () =>
  postJsonLd({
    title: "DeepSeek's art of restraint",
    description:
      "How DeepSeek keeps shipping frontier reasoning models on a fraction of the budget.",
    url: `${SITE}posts/deepseek-art-of-restraint`,
    datePublished: "2026-08-01T00:00:00.000Z",
  });

/** Guards the shared builders themselves, independent of any route. */
const builderSmokeJsonLd = (): JsonLdNode =>
  graph(
    organization(),
    articleJsonLd({
      headline: "Builder smoke test",
      description: "Ensures the shared Article builder keeps emitting a valid shape.",
      url: `${SITE}`,
      image: OG_DEFAULT,
      datePublished: "2026-01-01",
    }),
    itemListJsonLd("Smoke list", [{ "@type": "Organization", name: "China AI News", url: SITE }]),
    breadcrumbListJsonLd([
      { name: "Home", item: SITE },
      { name: "Smoke", item: `${SITE}smoke` },
    ]),
    faqPageJsonLd([
      { q: "Question one?", a: "Answer one." },
      { q: "Question two?", a: "Answer two." },
    ]),
  );

export const JSONLD_REGISTRY: { label: string; doc: () => JsonLdNode }[] = [
  { label: "/compare/deepseek-vs-qwen-vs-glm", doc: compareJsonLd },
  { label: "/companies", doc: companiesJsonLd },
  { label: "/tiktok-connect", doc: tiktokConnectJsonLd },
  { label: "/posts/$slug (sample)", doc: samplePostJsonLd },
  { label: "shared builders", doc: builderSmokeJsonLd },
];

/** og:image expectations, asserted alongside the JSON-LD. */
export const OG_EXPECTATIONS: { path: string; image: string }[] = [
  { path: "/compare/deepseek-vs-qwen-vs-glm", image: ogImageForPath("/compare/anything") },
  { path: "/tiktok-connect", image: OG_TIKTOK },
  { path: "/posts/some-article", image: OG_DEFAULT },
  { path: "/", image: OG_DEFAULT },
];
