import {
  SITE,
  articleJsonLd,
  breadcrumbListJsonLd,
  graph,
  organization,
  type JsonLdNode,
} from "@/lib/structured-data";
import { articleOgImageUrl } from "@/lib/og";

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
  image?: string;
}): JsonLdNode {
  const slug = new URL(post.url).pathname.split("/").filter(Boolean).at(-1) ?? "article";
  const image = post.image ?? articleOgImageUrl(slug, post.dateModified ?? post.datePublished);

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
      { name: "News", item: `${SITE}news` },
      { name: post.title, item: post.url },
    ]),
  );
}
