import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createPublicClient } from "@/integrations/supabase/public-client";

export const getAskAnswer = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const sb = createPublicClient();
    const { data: row } = await sb
      .from("ask_answers")
      .select("slug, question, answer, seo_title, seo_description, source_slugs, answered_at, created_at")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (!row) return null;

    const [{ data: sources }, { data: related }] = await Promise.all([
      sb
        .from("posts")
        .select("slug, title, published_at")
        .eq("published", true)
        .in("slug", row.source_slugs.length ? row.source_slugs : ["-"]),
      sb
        .from("ask_answers")
        .select("slug, question, source_slugs")
        .eq("status", "published")
        .neq("slug", row.slug)
        .order("ask_count", { ascending: false })
        .limit(40),
    ]);
    const order = new Map(row.source_slugs.map((s, i) => [s, i]));
    const shared = (related ?? [])
      .map((r) => ({ ...r, overlap: r.source_slugs.filter((s) => order.has(s)).length }))
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5)
      .map(({ slug, question }) => ({ slug, question }));

    return {
      ...row,
      sources: (sources ?? []).sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)),
      related: shared,
    };
  });

/** Published answers that cite a given article — rendered as crawlable links on the article page. */
export const listAnswersForPost = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const sb = createPublicClient();
    const { data: rows } = await sb
      .from("ask_answers")
      .select("slug, question")
      .eq("status", "published")
      .contains("source_slugs", [data.slug])
      .order("ask_count", { ascending: false })
      .limit(6);
    return rows ?? [];
  });

export const listAskAnswers = createServerFn({ method: "GET" }).handler(async () => {
  const sb = createPublicClient();
  const { data } = await sb
    .from("ask_answers")
    .select("slug, question")
    .eq("status", "published")
    .order("ask_count", { ascending: false })
    .limit(20);
  return data ?? [];
});
