import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createPublicClient } from "@/integrations/supabase/public-client";

const BASE_URL = "https://chinaai.news";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/companies", changefreq: "weekly", priority: "0.9" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },

          { path: "/terms", changefreq: "yearly", priority: "0.3" },
        ];

        try {
          const sb = createPublicClient();
          const { data } = await sb
            .from("posts")
            .select("slug, updated_at, published_at")
            .eq("published", true)
            .order("published_at", { ascending: false })
            .limit(500);
          for (const post of data ?? []) {
            const stamp = (post.updated_at ?? post.published_at) as string | null;
            entries.push({
              path: `/posts/${post.slug}`,
              lastmod: stamp ? new Date(stamp).toISOString() : undefined,
              changefreq: "monthly",
              priority: "0.8",
            });
          }
        } catch {
          // Fall back to static routes only
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
