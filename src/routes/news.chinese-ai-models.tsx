import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ogMetaForPath, SITE_URL } from "@/lib/og";
import { listPublishedPosts } from "@/lib/posts.functions";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { topicForPost } from "@/lib/news-topics";

const postsQuery = queryOptions({
  queryKey: ["published-posts"],
  queryFn: () => listPublishedPosts(),
});

const PATH = "/news/chinese-ai-models";
const URL = `${SITE_URL}${PATH}`;
const TITLE = "Chinese AI Models (中国AI模型): DeepSeek, Qwen, Kimi & GLM News";
const DESCRIPTION =
  "A topic page on Chinese AI models — DeepSeek, Qwen, Kimi, GLM and MiniMax releases, benchmarks, open weights and pricing, with every story we've published.";

/** Keyword cluster this page aggregates around. */
const KEYWORDS = [
  "Chinese AI models",
  "中国AI模型",
  "DeepSeek",
  "Qwen",
  "Kimi",
  "GLM",
  "MiniMax",
  "open-weight models",
  "reasoning models",
  "model benchmarks",
  "token pricing",
  "distillation",
  "world models",
  "China AI news",
];

const FAQ = [
  {
    q: "What are the leading Chinese AI models?",
    a: "DeepSeek, Alibaba's Qwen, Moonshot's Kimi, Zhipu's GLM and MiniMax lead the field. Most ship open weights, which is why they spread fast outside China.",
  },
  {
    q: "Are Chinese AI models open source?",
    a: "Many are released as open-weight models under permissive licences, so anyone can download and run them. Frontier variants are sometimes API-only at launch.",
  },
  {
    q: "How do Chinese AI models compare with US models on price?",
    a: "Token pricing is usually a fraction of comparable US frontier models, which is the main reason developers adopt them for high-volume workloads.",
  },
  {
    q: "Where can I follow new Chinese AI model releases?",
    a: "This page collects every model story we publish, and the weekly email sends one new piece on China's AI industry each week.",
  },
];

export const Route = createFileRoute("/news/chinese-ai-models")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "news_keywords", content: KEYWORDS.slice(0, 10).join(", ") },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "China AI News" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      ...ogMetaForPath(PATH),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": `${URL}#collection`,
              name: TITLE,
              description: DESCRIPTION,
              url: URL,
              inLanguage: "en",
              isPartOf: { "@id": `${SITE_URL}/#website` },
              about: KEYWORDS.map((k) => ({ "@type": "Thing", name: k })),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "News", item: `${SITE_URL}/news` },
                { "@type": "ListItem", position: 3, name: "Chinese AI models", item: URL },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ],
        }),
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: ChineseAiModels,
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

function ChineseAiModels() {
  const { data: posts } = useSuspenseQuery(postsQuery);
  const stories = posts.filter((p) => topicForPost(p) === "models");

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
          <Link to="/news" className="hover:text-foreground">
            News
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">Chinese AI models</span>
        </nav>

        <header className="mt-4 border-b border-border/60 pb-8">
          <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Chinese AI models
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            The models coming out of China — DeepSeek, Qwen, Kimi, GLM and MiniMax — and what each
            release actually changes: open weights, benchmark claims, token pricing, and the
            training tricks behind them.
          </p>
        </header>

        <div className="mt-8 grid gap-10 lg:grid-cols-[2fr_1fr]">
          <section aria-label="Stories on Chinese AI models">
            <h2 className="font-serif text-2xl">Latest coverage</h2>
            {stories.length === 0 ? (
              <p className="mt-4 text-muted-foreground">
                No model stories yet.{" "}
                <Link to="/news" search={{ topic: "all" }} className="underline">
                  See all news
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
                {stories.map((p) => (
                  <li key={p.id} className="py-6">
                    <Link to="/posts/$slug" params={{ slug: p.slug }} className="group block">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        {formatDate(p.published_at)}
                      </div>
                      <h3 className="mt-1 font-serif text-xl leading-snug group-hover:underline">
                        {p.title}
                      </h3>
                      {p.excerpt ? (
                        <p className="mt-1.5 text-sm text-muted-foreground">{p.excerpt}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mt-12 font-serif text-2xl">Common questions</h2>
            <dl className="mt-4 divide-y divide-border/60 border-t border-border/60">
              {FAQ.map((f) => (
                <div key={f.q} className="py-5">
                  <dt className="font-medium">{f.q}</dt>
                  <dd className="mt-1.5 text-sm text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <aside className="space-y-8 lg:border-l lg:border-border/60 lg:pl-8">
            <div>
              <h2 className="font-serif text-xl">Weekly briefing</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                One piece a week on Chinese AI models and the labs behind them.
              </p>
              <div className="mt-4">
                <SubscribeForm />
              </div>
            </div>

            <div>
              <h2 className="font-serif text-xl">Topic keywords</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {KEYWORDS.map((k) => (
                  <li
                    key={k}
                    className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {k}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="font-serif text-xl">Go deeper</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link
                    to="/compare/deepseek-vs-qwen-vs-glm"
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    DeepSeek vs Qwen vs GLM →
                  </Link>
                </li>
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
                    to="/news"
                    search={{ topic: "all" }}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    All China AI news →
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · China AI News
      </footer>
    </div>
  );
}
