import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listPublishedPosts } from "@/lib/posts.functions";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";

const postsQuery = queryOptions({
  queryKey: ["published-posts"],
  queryFn: () => listPublishedPosts(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "笔记 — 文章目录" },
      { name: "description", content: "写作与订阅。每周一封新文章。" },
      { property: "og:title", content: "笔记 — 文章目录" },
      { property: "og:description", content: "写作与订阅。每周一封新文章。" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: Index,
});

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Index() {
  const { data: posts } = useSuspenseQuery(postsQuery);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <section className="mb-16">
          <h1 className="font-serif text-5xl leading-tight tracking-tight sm:text-6xl">
            一个安静的
            <br />
            <span className="italic text-muted-foreground">写作空间。</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            这里发布我的文章。留下邮箱,每周会收到一次新内容的汇总。
          </p>
        </section>

        <section className="mb-20">
          <SubscribeForm />
        </section>

        <section>
          <h2 className="mb-8 font-serif text-3xl">最近的文章</h2>
          {posts.length === 0 ? (
            <p className="text-muted-foreground">还没有已发布的文章。</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {posts.map((p) => (
                <li key={p.id} className="py-6">
                  <Link
                    to="/posts/$slug"
                    params={{ slug: p.slug }}
                    className="group block"
                  >
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {formatDate(p.published_at)}
                    </div>
                    <h3 className="mt-1 font-serif text-2xl leading-snug group-hover:underline">
                      {p.title}
                    </h3>
                    {p.excerpt ? (
                      <p className="mt-2 text-muted-foreground">{p.excerpt}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · 用心写字
      </footer>
    </div>
  );
}
