import { createFileRoute } from "@tanstack/react-router";
import sourceSerifUrl from "@/assets/fonts/SourceSerif4.ttf?url";
import interUrl from "@/assets/fonts/Inter-Bold.ttf?url";

import {
  ARTICLE_OG_HEIGHT,
  ARTICLE_OG_WIDTH,
  createArticleOgSvg,
} from "@/lib/article-og-image";
import { createPublicClient } from "@/integrations/supabase/public-client";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let fontBuffersPromise: Promise<Uint8Array[]> | undefined;

function loadFontBuffers(request: Request): Promise<Uint8Array[]> {
  fontBuffersPromise ??= Promise.all(
    [sourceSerifUrl, interUrl].map(async (path) => {
      const response = await fetch(new URL(path, request.url));
      if (!response.ok) throw new Error(`Unable to load OG font: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
  return fontBuffersPromise;
}

export const Route = createFileRoute("/api/public/og/posts/$slug.png")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const routeValue = params["slug.png"];
        const pathValue = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? "");
        const slug = (routeValue || pathValue).replace(/\.png$/, "");
        if (!SLUG_PATTERN.test(slug)) return new Response("Not found", { status: 404 });

        const sb = createPublicClient();
        const { data: post, error } = await sb
          .from("posts")
          .select("title, published_at")
          .eq("slug", slug)
          .eq("published", true)
          .maybeSingle();

        if (error) return new Response("Unable to load article", { status: 500 });
        if (!post) return new Response("Not found", { status: 404 });

        try {
          const svg = createArticleOgSvg({ title: post.title, publishedAt: post.published_at });
          const resvg = await Resvg.async(svg, {
            font: {
              fontBuffers: await loadFontBuffers(request),
              loadSystemFonts: false,
              defaultFontFamily: "Inter",
              serifFamily: "Source Serif 4",
              sansSerifFamily: "Inter",
            },
          });
          const rendered = resvg.render();
          if (rendered.width !== ARTICLE_OG_WIDTH || rendered.height !== ARTICLE_OG_HEIGHT) {
            return new Response("Unable to render article image", { status: 500 });
          }
          const png = rendered.asPng();
          const body = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
          return new Response(body, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=3600, s-maxage=31536000, immutable",
              "Content-Disposition": `inline; filename="${slug}.png"`,
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Unable to render article image", { status: 500 });
        }
      },
    },
  },
});