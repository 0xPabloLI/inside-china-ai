import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createPublicClient } from "@/integrations/supabase/public-client";

const BASE_URL = "https://chinaai.news";
const TITLE = "China AI News";
const DESCRIPTION =
  "New writing on China's AI industry — models, chips, policy and the companies behind them.";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/rss.xml")({
  server: {
    handlers: {
      GET: async () => {
        let posts: Array<{
          slug: string;
          title: string;
          excerpt: string | null;
          published_at: string | null;
        }> = [];

        try {
          const sb = createPublicClient();
          const { data } = await sb
            .from("posts")
            .select("slug, title, excerpt, published_at")
            .eq("published", true)
            .order("published_at", { ascending: false })
            .limit(50);
          posts = data ?? [];
        } catch {
          // Serve an empty but valid feed rather than a 500.
        }

        const items = posts.map((p) => {
          const url = `${BASE_URL}/posts/${p.slug}`;
          return [
            `    <item>`,
            `      <title>${escapeXml(p.title)}</title>`,
            `      <link>${url}</link>`,
            `      <guid isPermaLink="true">${url}</guid>`,
            p.excerpt ? `      <description>${escapeXml(p.excerpt)}</description>` : null,
            p.published_at
              ? `      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>`
              : null,
            `    </item>`,
          ]
            .filter(Boolean)
            .join("\n");
        });

        const latest = posts.find((p) => p.published_at)?.published_at;

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
          `  <channel>`,
          `    <title>${escapeXml(TITLE)}</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>${escapeXml(DESCRIPTION)}</description>`,
          `    <language>en-us</language>`,
          latest ? `    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>` : null,
          `    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml" />`,
          ...items,
          `  </channel>`,
          `</rss>`,
        ]
          .filter(Boolean)
          .join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=1800",
          },
        });
      },
    },
  },
});
