import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { SITE_URL, supabaseAnon } from "../supabase";

/** Escape PostgREST `or` filter separators and ILIKE wildcards in user input. */
function escapePattern(value: string): string {
  return value.replace(/[%_,()\\]/g, (m) => `\\${m}`);
}

export default defineTool({
  name: "search_articles",
  title: "Search articles",
  description:
    "Search published China AI News articles by keyword across title, excerpt and body; returns matching articles with excerpts and URLs.",
  inputSchema: {
    query: z.string().trim().min(2).max(200).describe("Keyword or phrase to search for."),
    limit: z.number().int().min(1).max(25).default(10).describe("Maximum matches to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
    const supabase = supabaseAnon();
    const pattern = `%${escapePattern(query)}%`;
    const { data, error } = await supabase
      .from("posts")
      .select("title, slug, excerpt, published_at")
      .eq("published", true)
      .or(`title.ilike.${pattern},excerpt.ilike.${pattern},content.ilike.${pattern}`)
      .order("published_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) throw new ToolError(error.message);

    const matches = (data ?? []).map((row) => ({
      title: row.title as string,
      slug: row.slug as string,
      excerpt: (row.excerpt as string | null) ?? "",
      publishedAt: (row.published_at as string | null) ?? null,
      url: `${SITE_URL}/posts/${row.slug}`,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: matches.length
            ? matches.map((m) => `- ${m.title} (${m.url})`).join("\n")
            : `No published articles match "${query}".`,
        },
      ],
      structuredContent: { matches },
    };
  },
});
