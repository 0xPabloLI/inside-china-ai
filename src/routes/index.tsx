import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ogImageMeta } from "@/lib/og";
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
      { title: "China AI News: Weekly Chinese AI Models & Policy" },
      {
        name: "description",
        content:
          "China AI news, weekly: Chinese AI model releases, the labs building them, and China's AI regulation. Independent reporting — one new piece a week.",
      },
      { property: "og:title", content: "China AI News: Weekly Chinese AI Models & Policy" },
      {
        property: "og:description",
        content:
          "China AI news, weekly: Chinese AI model releases, the labs building them, and China's AI regulation. Independent reporting — one new piece a week.",
      },
      { property: "og:url", content: "https://chinaai.news/" },
      ...ogImageMeta(),
      { name: "twitter:image", content: "https://chinaai.news/china-ai-news-logo-gpt.png" },
      { name: "twitter:title", content: "China AI News: Weekly Chinese AI Models & Policy" },
      {
        name: "twitter:description",
        content:
          "China AI news, weekly: Chinese AI model releases, the labs building them, and China's AI regulation.",
      },
    ],

    links: [{ rel: "canonical", href: "https://chinaai.news/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": "https://chinaai.news/#website",
              name: "China AI News",
              url: "https://chinaai.news/",
              description:
                "China AI news, weekly: Chinese AI model releases, the labs building them, and China's AI regulation.",
              publisher: { "@id": "https://chinaai.news/#organization" },
            },
            {
              "@type": "Organization",
              "@id": "https://chinaai.news/#organization",
              name: "China AI News",
              url: "https://chinaai.news/",
              logo: {
                "@type": "ImageObject",
                url: "https://chinaai.news/china-ai-news-logo-gpt.png",
              },
            },
          ],
        }),
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
    timeZone: "UTC",
  });
}

const GUIDES = [
  {
    to: "/companies" as const,
    title: "Chinese AI Companies",
    summary:
      "Profiles of 21 labs, startups, and tech giants — who funds them, what they ship, and how they compare.",
    cta: "Explore",
    readingMinutes: 12,
    updated: "2026-08-01",
  },
  {
    to: "/compare/deepseek-vs-qwen-vs-glm" as const,
    title: "Model Comparison",
    summary:
      "DeepSeek, Qwen, and GLM-5.2 side by side on token pricing, coding benchmarks, and open-weight access.",
    cta: "Compare",
    readingMinutes: 9,
    updated: "2026-08-08",
  },
  {
    to: "/tiktok-connect" as const,
    title: "TikTok Connect",
    summary:
      "Follow the short-video companion feed and link your TikTok account for weekly China AI explainers.",
    cta: "Connect",
    readingMinutes: 3,
    updated: "2026-07-28",
  },
];

function Index() {
  const { data: posts } = useSuspenseQuery(postsQuery);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pt-16 pb-24">
        <section className="mb-16">
          <h1 className="font-serif text-5xl leading-tight tracking-tight sm:text-6xl">
            China AI news
            <br />
            <span className="italic text-muted-foreground">
              from the front lines of China's AI industry.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Independent China AI news and analysis — the labs, the people, and the policy shaping AI
            in China, including the latest Chinese AI model releases and China AI regulation. Leave
            your email and I'll send one new piece a week.
          </p>
        </section>

        <section className="mb-20">
          <SubscribeForm />
        </section>

        <section id="articles" className="scroll-mt-20">
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

        <section className="mb-20">
          <h2 className="mb-8 font-serif text-3xl">Guides & Resources</h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {GUIDES.map((g) => (
              <li key={g.to}>
                <Link
                  to={g.to}
                  className="group flex h-full flex-col justify-between rounded-lg border border-border/60 p-5 transition-colors hover:bg-accent/50"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                      <span>Updated {formatDate(g.updated)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{g.readingMinutes} min read</span>
                    </div>
                    <h3 className="mt-2 font-serif text-xl leading-snug group-hover:underline">
                      {g.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">{g.summary}</p>
                  </div>
                  <span className="mt-4 text-sm font-medium">{g.cta} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · China AI News
      </footer>
    </div>
  );
}
