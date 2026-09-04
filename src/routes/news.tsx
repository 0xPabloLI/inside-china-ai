import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ogMetaForPath, SITE_URL } from "@/lib/og";
import { listPublishedPosts } from "@/lib/posts.functions";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { TOPICS, FILTER_TOPICS, getTopic, topicForPost, countByTopic } from "@/lib/news-topics";

const postsQuery = queryOptions({
  queryKey: ["published-posts"],
  queryFn: () => listPublishedPosts(),
});

const searchSchema = z.object({
  topic: z.enum(["all", "models", "policy", "chips", "companies", "industry"]).catch("all"),
});

const TITLE = "China AI News Hub — Latest Chinese AI Models, Policy & Chips";
const DESCRIPTION =
  "Browse China AI news by topic: Chinese AI model releases, China AI regulation, chips and compute, companies and funding. Updated weekly.";

export const Route = createFileRoute("/news")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/news` },
      ...ogMetaForPath("/news"),
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/news` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": `${SITE_URL}/news#collection`,
          name: "China AI News Hub",
          description: DESCRIPTION,
          url: `${SITE_URL}/news`,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: TOPICS.filter((t) => t.id !== "all").map((t) => ({
            "@type": "Thing",
            name: t.label,
          })),
        }),
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: NewsHub,
});

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function NewsHub() {
  const { data: posts } = useSuspenseQuery(postsQuery);
  const { topic: topicId } = Route.useSearch();
  const topic = getTopic(topicId);
  const counts = countByTopic(posts);

  const filtered = topic.id === "all" ? posts : posts.filter((p) => topicForPost(p) === topic.id);
  const [lead, ...rest] = filtered;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pt-12 pb-24">
        <nav
          aria-label="Breadcrumb"
          className="text-xs uppercase tracking-wider text-muted-foreground"
        >
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">News</span>
        </nav>

        <header className="mt-4 border-b border-border/60 pb-8">
          <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            China AI news
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            A topic hub for China's AI industry — Chinese AI models, policy and regulation, chips
            and compute, and the companies behind them.
          </p>
        </header>

        {/* Category filters */}
        <div className="sticky top-0 z-10 -mx-6 border-b border-border/60 bg-background/90 px-6 py-3 backdrop-blur">
          <ul className="flex flex-wrap items-center gap-2">
            {[TOPICS[0], ...FILTER_TOPICS].map((t) => {
              const active = t.id === topic.id;
              return (
                <li key={t.id}>
                  <Link
                    to="/news"
                    search={{ topic: t.id }}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    {t.label}
                    <span className={active ? "opacity-70" : "opacity-60"}>
                      {counts[t.id] ?? 0}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">{topic.blurb}</p>

        {filtered.length === 0 ? (
          <p className="mt-12 text-muted-foreground">
            No stories in this topic yet.{" "}
            <Link to="/news" search={{ topic: "all" }} className="underline">
              See all news
            </Link>
            .
          </p>
        ) : (
          <div className="mt-8 grid gap-10 lg:grid-cols-[2fr_1fr]">
            {/* Lead story + list */}
            <section aria-label="Stories">
              <article className="border-b border-border/60 pb-8">
                <Link to="/posts/$slug" params={{ slug: lead.slug }} className="group block">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <span>{getTopic(topicForPost(lead)).label}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(lead.published_at)}</span>
                  </div>
                  <h2 className="mt-2 font-serif text-3xl leading-snug group-hover:underline">
                    {lead.title}
                  </h2>
                  {lead.excerpt ? (
                    <p className="mt-3 text-muted-foreground">{lead.excerpt}</p>
                  ) : null}
                  <span className="mt-3 inline-block text-sm font-medium">Read story →</span>
                </Link>
              </article>

              {rest.length > 0 ? (
                <ul className="divide-y divide-border/60">
                  {rest.map((p) => (
                    <li key={p.id} className="py-6">
                      <Link to="/posts/$slug" params={{ slug: p.slug }} className="group block">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                          <span>{getTopic(topicForPost(p)).label}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDate(p.published_at)}</span>
                        </div>
                        <h3 className="mt-1 font-serif text-xl leading-snug group-hover:underline">
                          {p.title}
                        </h3>
                        {p.excerpt ? (
                          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                            {p.excerpt}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {/* Hub sidebar */}
            <aside className="space-y-8 lg:border-l lg:border-border/60 lg:pl-8">
              <div>
                <h2 className="font-serif text-xl">Weekly briefing</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  One piece a week on China's AI industry.
                </p>
                <div className="mt-4">
                  <SubscribeForm />
                </div>
              </div>

              <div>
                <h2 className="font-serif text-xl">Browse by topic</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {FILTER_TOPICS.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3">
                      <Link
                        to="/news"
                        search={{ topic: t.id }}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {t.label}
                      </Link>
                      <span className="text-xs text-muted-foreground">{counts[t.id] ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-xl">Reference guides</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link
                      to="/companies"
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Chinese AI companies →
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/compare/deepseek-vs-qwen-vs-glm"
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      DeepSeek vs Qwen vs GLM →
                    </Link>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        )}
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · China AI News
      </footer>
    </div>
  );
}
