/**
 * zod schemas for the structured-data types we ship.
 *
 * Plain ESM so both vitest (src/lib/structured-data.test.ts) and the CLI gate
 * (scripts/seo/validate-jsonld.mjs) can share exactly the same rules.
 */
import { z } from "zod";

const url = z.string().url();
const nonEmpty = z.string().min(1);

const ArticleSchema = z
  .object({
    "@type": z.literal("Article"),
    headline: nonEmpty.max(110),
    description: nonEmpty.max(320),
    url: url,
    image: z.array(url).min(1),
    mainEntityOfPage: z.object({ "@type": z.literal("WebPage"), "@id": url }),
    datePublished: z.string().min(4).optional(),
    dateModified: z.string().min(4).optional(),
    inLanguage: nonEmpty,
    author: z.record(z.unknown()),
    publisher: z.record(z.unknown()),
  })
  .passthrough();

const FaqPageSchema = z
  .object({
    "@type": z.literal("FAQPage"),
    mainEntity: z
      .array(
        z.object({
          "@type": z.literal("Question"),
          name: nonEmpty,
          acceptedAnswer: z.object({
            "@type": z.literal("Answer"),
            text: nonEmpty,
          }),
        }),
      )
      .min(2),
  })
  .passthrough();

const BreadcrumbListSchema = z
  .object({
    "@type": z.literal("BreadcrumbList"),
    itemListElement: z
      .array(
        z.object({
          "@type": z.literal("ListItem"),
          position: z.number().int().positive(),
          name: nonEmpty,
          item: url,
        }),
      )
      .min(2),
  })
  .passthrough();

const ItemListSchema = z
  .object({
    "@type": z.literal("ItemList"),
    numberOfItems: z.number().int().positive(),
    itemListElement: z
      .array(
        z.object({
          "@type": z.literal("ListItem"),
          position: z.number().int().positive(),
        }),
      )
      .min(1),
  })
  .passthrough();

/** Types we enforce. Unknown @types are allowed through untouched. */
export const SCHEMAS = {
  Article: ArticleSchema,
  FAQPage: FaqPageSchema,
  BreadcrumbList: BreadcrumbListSchema,
  ItemList: ItemListSchema,
};

/** Breadcrumb positions must be 1..n in order. */
function checkBreadcrumbOrder(node, label, errors) {
  const items = node.itemListElement ?? [];
  items.forEach((it, i) => {
    if (it.position !== i + 1) {
      errors.push(`${label}: BreadcrumbList position ${it.position} should be ${i + 1}`);
    }
  });
}

/**
 * Validate one JSON-LD document (single node or `@graph`).
 * @returns {string[]} human-readable errors; empty means valid.
 */
export function validateJsonLdDoc(doc, label = "jsonld") {
  const errors = [];
  if (!doc || typeof doc !== "object") return [`${label}: document is not an object`];
  if (!doc["@context"]) errors.push(`${label}: missing @context`);

  const nodes = Array.isArray(doc["@graph"]) ? doc["@graph"] : [doc];
  if (nodes.length === 0) errors.push(`${label}: empty @graph`);

  for (const node of nodes) {
    const type = node?.["@type"];
    if (!type) {
      errors.push(`${label}: node without @type`);
      continue;
    }
    const schema = SCHEMAS[type];
    if (!schema) continue;
    const result = schema.safeParse(node);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${label}: ${type}.${issue.path.join(".") || "(root)"} — ${issue.message}`);
      }
    }
    if (type === "BreadcrumbList") checkBreadcrumbOrder(node, label, errors);
  }
  return errors;
}

/** Extract every ld+json document from an HTML string. */
export function extractJsonLdFromHtml(html) {
  const docs = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      docs.push(JSON.parse(m[1].trim()));
    } catch {
      docs.push({ __parseError: m[1].slice(0, 120) });
    }
  }
  return docs;
}
