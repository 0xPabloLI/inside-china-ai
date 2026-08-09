import {
  SITE,
  articleJsonLd,
  breadcrumbListJsonLd,
  graph,
  organization,
  type JsonLdNode,
} from "@/lib/structured-data";
import { OG_DEFAULT, ogImageForPath } from "@/lib/og";

/**
 * Article + BreadcrumbList graph for a published post.
 * Kept out of the route file so the SEO gate can validate it with sample data.
 */
export function postJsonLd(post: {
  title: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  cover?: string | null;
}): JsonLdNode {
  let image = OG_DEFAULT;
  try {
    image = ogImageForPath(new URL(post.url).pathname, post.cover);
  } catch {
    image = ogImageForPath("/", post.cover);
  }

  return graph(
    organization(),
    articleJsonLd({
      headline: post.title,
      description: post.description,
      url: post.url,
      image,
      datePublished: post.datePublished,
      dateModified: post.dateModified ?? post.datePublished,
    }),
    breadcrumbListJsonLd([
      { name: "Home", item: SITE },
      { name: post.title, item: post.url },
    ]),
  );
}
