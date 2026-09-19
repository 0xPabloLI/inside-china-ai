import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ogMetaForPath, SITE_URL } from "@/lib/og";
import { listPublishedPosts } from "@/lib/posts.functions";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { topicForPost } from "@/lib/news-topics";
import {
  breadcrumbListJsonLd,
  faqPageJsonLd,
  graph,
  type JsonLdNode,
} from "@/lib/structured-data";

const postsQuery = queryOptions({
  queryKey: ["published-posts"],
  queryFn: () => listPublishedPosts(),
});

export const PATH = "/news/chinese-ai-models";
export const URL = `${SITE_URL}${PATH}`;
export const TITLE = "Chinese AI Models (中国AI模型): DeepSeek, Qwen, Kimi & GLM News";
export const DESCRIPTION =
  "A topic page on Chinese AI models — DeepSeek, Qwen, Kimi, GLM and MiniMax releases, benchmarks, open weights and pricing, with every story we've published.";

/** Keyword cluster this page aggregates around. */
export const KEYWORDS = [
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

export const FAQ = [
  {
    q: "What are the leading Chinese AI models in 2026?",
    a: "DeepSeek, Alibaba's Qwen, Moonshot's Kimi, Zhipu's GLM and MiniMax lead the field. Most ship open weights, which is why they spread fast outside China — DeepSeek's reasoning models and Qwen's multilingual range are the most widely adopted.",
  },
  {
    q: "What is DeepSeek and why is it important?",
    a: "DeepSeek is a Hangzhou-based lab whose open-weight reasoning models (DeepSeek-R1 and successors) matched frontier US reasoning performance at a fraction of the training cost, proving that efficient distillation and reinforcement learning can close the compute gap.",
  },
  {
    q: "What is Qwen and how does it compare with DeepSeek?",
    a: "Qwen is Alibaba's model family, released across many sizes and languages. Where DeepSeek focuses on reasoning, Qwen targets broad multilingual and multimodal use, with strong coding and tool-use — both are open-weight, so developers often run them side by side.",
  },
  {
    q: "Are Chinese AI models open source?",
    a: "Many are released as open-weight models under permissive licences, so anyone can download and run them. Frontier variants are sometimes API-only at launch, then the weights follow weeks or months later.",
  },
  {
    q: "How much do Chinese AI models cost to run?",
    a: "Token pricing is usually a fraction of comparable US frontier models — often 10× to 20× cheaper per million tokens. Self-hosting open weights on your own GPUs removes per-token cost entirely, which is the main reason high-volume workloads adopt them.",
  },
  {
    q: "Which Chinese AI model is best for coding?",
    a: "Qwen's coder variants and DeepSeek's reasoning models are the strongest for programming tasks, regularly topping open leaderboards for code generation and agentic tool use. GLM also performs well on Chinese-language codebases.",
  },
  {
    q: "What is the difference between DeepSeek-R1 and a regular LLM?",
    a: "DeepSeek-R1 is a reasoning model: it spends extra compute 'thinking' through multi-step problems before answering, which improves math, logic and coding at the cost of longer responses. Regular LLMs answer in one pass without an explicit reasoning stage.",
  },
  {
    q: "Where can I follow new Chinese AI model releases?",
    a: "This page collects every model story we publish, and the weekly email sends one new piece on China's AI industry each week. For a side-by-side comparison, see our DeepSeek vs Qwen vs GLM guide.",
  },
];

/** Full JSON-LD graph for this topic page, validated by the SEO gate. */
export function chineseAiModelsJsonLd(): JsonLdNode {
  return graph(
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
    breadcrumbListJsonLd([
      { name: "Home", item: `${SITE_URL}/` },
      { name: "News", item: `${SITE_URL}/news` },
      { name: "Chinese AI models", item: URL },
    ]),
    faqPageJsonLd(FAQ),
  );
}

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
        children: JSON.stringify(chineseAiModelsJsonLd()),
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
