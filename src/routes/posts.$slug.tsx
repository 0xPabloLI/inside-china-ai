import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPublishedPost } from "@/lib/posts.functions";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { MarkdownContent } from "@/components/markdown-content";
import { FileText, ExternalLink } from "lucide-react";
import { Suspense } from "react";
import { splitContent } from "@/components/widgets/content-splitter";
import { WIDGETS, isRegisteredWidget, isBreakoutWidget } from "@/components/widgets/registry";
import { ReadingProgress } from "@/components/reading-progress";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const postQuery = (slug: string) =>
  queryOptions({
    queryKey: ["post", slug],
    queryFn: () => getPublishedPost({ data: { slug } }),
  });

const SUFFIX = " — China AI News";

/** Keep the rendered <title> under 60 characters. */
function buildTitle(title: string): string {
  const full = `${title}${SUFFIX}`;
  if (full.length <= 60) return full;
  const room = 60 - SUFFIX.length - 1;
  if (room < 20) return title.length <= 60 ? title : `${title.slice(0, 59).trimEnd()}…`;
  return `${title.slice(0, room).trimEnd()}…${SUFFIX}`;
}

function clampDescription(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 160 ? clean : `${clean.slice(0, 157).trimEnd()}…`;
}

export const Route = createFileRoute("/posts/$slug")({
  loader: async ({ context, params }) => {
    const post = await context.queryClient.ensureQueryData(postQuery(params.slug));
    if (!post) throw notFound();
    return post;
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) return { meta: [] };
    const url = `https://chinaai.news/posts/${params.slug}`;
    const description = clampDescription(loaderData.excerpt ?? loaderData.title);
    return {
      meta: [
        { title: buildTitle(loaderData.title) },
        { name: "description", content: description },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:title", content: loaderData.title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: loaderData.title,
            description,
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            url,
            datePublished: loaderData.published_at ?? undefined,
            dateModified: loaderData.published_at ?? undefined,
            publisher: {
              "@type": "Organization",
              name: "China AI News",
              url: "https://chinaai.news/",
              logo: {
                "@type": "ImageObject",
                url: "https://chinaai.news/china-ai-news-logo-gpt.png",
              },
            },
          }),
        },
      ],
    };
  },
  component: PostPage,
});

function PostPage() {
  const params = Route.useParams();
  const { data: post } = useSuspenseQuery(postQuery(params.slug));
  if (!post) return null;

  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";

  return (
    <div className="min-h-screen">
      <ReadingProgress />
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pt-12 pb-24">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to articles
        </Link>
        <article className="mt-8">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{date}</div>
          <h1 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl">{post.title}</h1>
          {post.excerpt ? (
            <p className="mt-4 text-lg italic text-muted-foreground">{post.excerpt}</p>
          ) : null}
          <div className="mt-10">
            <div className="text-lg leading-[1.6]">
              {splitContent(post.content).map((segment, i) => {
                if (segment.type === "markdown") {
                  return <MarkdownContent key={i} content={segment.content} />;
                }
                // Widget segment
                if (!isRegisteredWidget(segment.name)) {
                  return (
                    <div
                      key={i}
                      className="my-8 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-center text-sm text-muted-foreground"
                    >
                      Unknown widget: {segment.name}
                    </div>
                  );
                }
                const Widget = WIDGETS[segment.name];
                const isBreakout = isBreakoutWidget(segment.name);
                return (
                  <div
                    key={i}
                    className={`my-10 rounded-lg border border-border/60 bg-card px-4 py-5 sm:px-6 sm:py-6 ${
                      isBreakout ? "max-w-none" : "max-w-prose"
                    }`}
                  >
                    <Suspense
                      fallback={
                        <div className="animate-pulse text-sm text-muted-foreground">
                          Loading widget…
                        </div>
                      }
                    >
                      <Widget lang="en" />
                    </Suspense>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
        {post.attachments && post.attachments.length > 0 ? (
          <section className="mt-12 border-t border-border/60 pt-8">
            <h2 className="mb-4 font-serif text-2xl">Attachments</h2>
            <ul className="space-y-3">
              {post.attachments.map((att) => (
                <li key={att.id}>
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-border/60 p-4 transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <FileText className="h-6 w-6 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{att.file_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {att.mime_type === "application/pdf" ? "PDF" : att.mime_type || "File"}
                        {att.file_size ? ` · ${formatSize(att.file_size)}` : ""}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="mt-16">
          <SubscribeForm />
        </div>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · China AI News
      </footer>
    </div>
  );
}
