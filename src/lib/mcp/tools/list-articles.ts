import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { SITE_URL, supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_articles",
  title: "List published articles",
  description:
    "List the most recently published China AI News articles, newest first, with title, slug, excerpt and canonical URL.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("How many articles to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const supabase = supabaseAnon();
    const { data, error } = await supabase
      .from("posts")
      .select("title, slug, excerpt, published_at, updated_at")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) throw new ToolError(error.message);

    const articles = (data ?? []).map((row) => ({
      title: row.title as string,
      slug: row.slug as string,
      excerpt: (row.excerpt as string | null) ?? "",
      publishedAt: (row.published_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
      url: `${SITE_URL}/posts/${row.slug}`,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: articles.length
            ? articles.map((a) => `- ${a.title} (${a.url})`).join("\n")
            : "No published articles found.",
        },
      ],
      structuredContent: { articles },
    };
  },
});
