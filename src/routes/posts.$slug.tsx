import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPublishedPost } from "@/lib/posts.functions";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { MarkdownContent } from "@/components/markdown-content";
import { FileText, ExternalLink } from "lucide-react";
import { Suspense } from "react";
import { splitContent } from "@/components/widgets/content-splitter";
import { WIDGETS, isRegisteredWidget } from "@/components/widgets/registry";

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

export const Route = createFileRoute("/posts/$slug")({
  loader: async ({ context, params }) => {
    const post = await context.queryClient.ensureQueryData(postQuery(params.slug));
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — China AI News` },
          { name: "description", content: loaderData.excerpt ?? loaderData.title },
          { property: "og:title", content: loaderData.title },
          { property: "og:description", content: loaderData.excerpt ?? loaderData.title },
          { property: "og:type", content: "article" },
        ]
      : [],
  }),
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
      })
    : "";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto px-6 pt-12 pb-24" style={{ maxWidth: "min(92vw, 1100px)" }}>
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
            <div className="text-[17px] leading-relaxed">
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
                return (
                  <div key={i} className="my-10">
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
    </div>
  );
}
