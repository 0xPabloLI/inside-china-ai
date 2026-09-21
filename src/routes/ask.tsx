import { createFileRoute, Link } from "@tanstack/react-router";
import { AskChinaAi } from "@/components/ask-china-ai";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { OG_DEFAULT, ogImageMeta } from "@/lib/og";
import {
  SITE,
  breadcrumbListJsonLd,
  faqPageJsonLd,
  graph,
  jsonLdScript,
  organization,
  type JsonLdNode,
} from "@/lib/structured-data";

const TITLE = "Chinese AI Q&A: Ask About China's AI Models";
const DESCRIPTION =
  "Ask questions about Chinese AI models — DeepSeek, Qwen, GLM, Kimi — and get sourced answers drawn from China AI News reporting, with citations to every article used.";
const URL = "https://chinaai.news/ask";

const FAQ = [
  {
    q: "What is Ask China AI?",
    a: "Ask China AI is a question-and-answer tool that answers questions about Chinese AI models, labs and policy using only China AI News published articles, citing each source it uses.",
  },
  {
    q: "Which Chinese AI models does it cover?",
    a: "It covers the models we report on, including DeepSeek, Alibaba's Qwen, Zhipu's GLM, Moonshot's Kimi and ByteDance's Doubao, plus the labs and regulation behind them.",
  },
  {
    q: "Where do the answers come from?",
    a: "Every answer is generated from excerpts of our published articles. If our reporting does not cover a question, the tool says so instead of guessing.",
  },
  {
    q: "Is it free to use?",
    a: "Yes. Asking questions is free and needs no account, with a fair-use limit on how many questions one visitor can ask each hour.",
  },
];

export const askJsonLd = (): JsonLdNode =>
  graph(
    organization(),
    faqPageJsonLd(FAQ),
    breadcrumbListJsonLd([
      { name: "Home", item: SITE },
      { name: "Chinese AI Q&A", item: URL },
    ]),
    {
      "@type": "WebApplication",
      name: "Ask China AI",
      url: URL,
      applicationCategory: "ReferenceApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE}#organization` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  );

export const Route = createFileRoute("/ask")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "Chinese AI Q&A, ask about Chinese AI models, DeepSeek questions, Qwen questions, GLM, Kimi, China AI policy",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "China AI News" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      ...ogImageMeta(OG_DEFAULT),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [jsonLdScript(askJsonLd())],
  }),
  component: AskPage,
});

function AskPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-12 pb-24">
        <nav
          aria-label="Breadcrumb"
          className="text-xs uppercase tracking-wider text-muted-foreground"
        >
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">Ask</span>
        </nav>

        <header className="mt-4 border-b border-border/60 pb-8">
          <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Ask China AI
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Questions about DeepSeek, Qwen, GLM, Kimi or China&apos;s AI rules, answered from our own
            published articles — never from guesswork.
          </p>
        </header>

        <section className="mt-8">
          <AskChinaAi autoFocus />
        </section>

        <section className="mt-16 border-t border-border/60 pt-8">
          <h2 className="font-serif text-xl">Weekly briefing</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            One piece a week on Chinese AI models and the labs behind them.
          </p>
          <div className="mt-4 max-w-md">
            <SubscribeForm />
          </div>
        </section>
      </main>
    </div>
  );
}
