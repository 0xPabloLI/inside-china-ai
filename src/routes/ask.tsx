import { createFileRoute, Link } from "@tanstack/react-router";
import { AskChinaAi } from "@/components/ask-china-ai";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { OG_DEFAULT, ogImageMeta } from "@/lib/og";

const TITLE = "Ask China AI — Answers from our Chinese AI reporting";
const DESCRIPTION =
  "Ask a question about Chinese AI models, labs or policy and get an answer grounded in China AI News articles, with links to the reporting behind it.";
const URL = "https://chinaai.news/ask";

export const Route = createFileRoute("/ask")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
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
