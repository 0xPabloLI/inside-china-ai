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
      { title: "Inside China AI — Articles" },
      {
        name: "description",
        content: "Independent writing on China's AI industry. One email a week.",
      },
      { property: "og:title", content: "Inside China AI — Articles" },
      {
        property: "og:description",
        content: "Independent writing on China's AI industry. One email a week.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: Index,
});

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
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
            Reporting from
            <br />
            <span className="italic text-muted-foreground">inside China's AI industry.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Independent writing on the labs, the people, and the policy shaping AI in China. Leave
            your email and I'll send one new piece a week.
          </p>
        </section>

        <section className="mb-20">
          <SubscribeForm />
        </section>

        <section>
          <h2 className="mb-8 font-serif text-3xl">Recent articles</h2>
          {posts.length === 0 ? (
            <p className="text-muted-foreground">No articles published yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {posts.map((p) => (
                <li key={p.id} className="py-6">
                  <Link to="/posts/$slug" params={{ slug: p.slug }} className="group block">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {formatDate(p.published_at)}
                    </div>
                    <h3 className="mt-1 font-serif text-2xl leading-snug group-hover:underline">
                      {p.title}
                    </h3>
                    {p.excerpt ? <p className="mt-2 text-muted-foreground">{p.excerpt}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · Inside China AI
      </footer>
    </div>
  );
}
