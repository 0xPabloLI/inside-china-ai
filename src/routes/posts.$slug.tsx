import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPublishedPost } from "@/lib/posts.functions";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";

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
          { title: `${loaderData.title} — 笔记` },
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
    ? new Date(post.published_at).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 pt-12 pb-24">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回目录
        </Link>
        <article className="mt-8">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{date}</div>
          <h1 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl">{post.title}</h1>
          {post.excerpt ? (
            <p className="mt-4 text-lg italic text-muted-foreground">{post.excerpt}</p>
          ) : null}
          <div className="prose-article mt-10 text-[17px] leading-relaxed">
            {post.content.split(/\n{2,}/).map((para, i) => (
              <p key={i} style={{ whiteSpace: "pre-wrap" }}>
                {para}
              </p>
            ))}
          </div>
        </article>
        <div className="mt-16">
          <SubscribeForm />
        </div>
      </main>
    </div>
  );
}
