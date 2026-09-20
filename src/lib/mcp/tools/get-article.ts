import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { SITE_URL, supabaseAnon } from "../supabase";

export default defineTool({
  name: "get_article",
  title: "Get article by slug",
  description:
    "Fetch the full Markdown text of one published China AI News article by its slug, with metadata.",
  inputSchema: {
    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("Article slug, e.g. 'kimi-ipo-50b' (from list_articles or the article URL)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug }) => {
    const supabase = supabaseAnon();
    const { data, error } = await supabase
      .from("posts")
      .select("title, slug, excerpt, content, published_at, updated_at, tiktok_url")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError(`No published article found for slug "${slug}".`);

    const article = {
      title: data.title as string,
      slug: data.slug as string,
      excerpt: (data.excerpt as string | null) ?? "",
      content: (data.content as string | null) ?? "",
      publishedAt: (data.published_at as string | null) ?? null,
      updatedAt: (data.updated_at as string | null) ?? null,
      tiktokUrl: (data.tiktok_url as string | null) ?? null,
      url: `${SITE_URL}/posts/${data.slug}`,
    };

    return {
      content: [
        { type: "text" as const, text: `# ${article.title}\n${article.url}\n\n${article.content}` },
      ],
      structuredContent: { article },
    };
  },
});
