import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createPublicClient } from "@/integrations/supabase/public-client";

const BASE_URL = "https://chinaai.news";
const PUBLICATION_NAME = "China AI News";
const PUBLICATION_LANGUAGE = "en";

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/news-sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Google News reads the freshest items first. This site publishes weekly, so use a
        // 30-day window (capped at 50 items) instead of 2 days — a strict 2-day window would
        // usually serve an empty file, which gives Google nothing to discover or review.
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const urls: string[] = [];
        try {
          const sb = createPublicClient();
          const { data } = await sb
            .from("posts")
            .select("slug, title, published_at")
            .eq("published", true)
            .gte("published_at", cutoff)
            .order("published_at", { ascending: false })
            .limit(50);


          for (const post of data ?? []) {
            if (!post.published_at) continue;
            urls.push(
              [
                `  <url>`,
                `    <loc>${BASE_URL}/posts/${escapeXml(post.slug)}</loc>`,
                `    <news:news>`,
                `      <news:publication>`,
                `        <news:name>${escapeXml(PUBLICATION_NAME)}</news:name>`,
                `        <news:language>${PUBLICATION_LANGUAGE}</news:language>`,
                `      </news:publication>`,
                `      <news:publication_date>${new Date(post.published_at).toISOString()}</news:publication_date>`,
                `      <news:title>${escapeXml(post.title)}</news:title>`,
                `    </news:news>`,
                `  </url>`,
              ].join("\n"),
            );
          }
        } catch {
          // Fall back to an empty urlset
        }

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=900",
          },
        });
      },
    },
  },
});
