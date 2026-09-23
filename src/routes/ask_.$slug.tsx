import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { AskChinaAi } from "@/components/ask-china-ai";
import { getAskAnswer } from "@/lib/ask-answers.functions";
import { OG_DEFAULT, ogImageMeta } from "@/lib/og";
import {
  SITE,
  breadcrumbListJsonLd,
  graph,
  jsonLdScript,
  organization,
  type JsonLdNode,
} from "@/lib/structured-data";

const answerQuery = (slug: string) =>
  queryOptions({ queryKey: ["ask-answer", slug], queryFn: () => getAskAnswer({ data: { slug } }) });

/** QAPage + BreadcrumbList graph for an answer page (validated by the SEO gate). */
export function qaPageJsonLd(a: {
  slug: string;
  question: string;
  answer: string;
  created_at: string;
  answered_at: string;
}): JsonLdNode {
  const url = `${SITE}ask/${a.slug}`;
  return graph(
    organization(),
    {
      "@type": "QAPage",
      url,
      inLanguage: "en",
      dateModified: a.answered_at,
      mainEntity: {
        "@type": "Question",
        name: a.question,
        text: a.question,
        answerCount: 1,
        dateCreated: a.created_at,
        author: { "@id": `${SITE}#organization` },
        acceptedAnswer: {
          "@type": "Answer",
          text: a.answer,
          url,
          dateCreated: a.answered_at,
          author: { "@id": `${SITE}#organization` },
        },
      },
    },
    breadcrumbListJsonLd([
      { name: "Home", item: SITE },
      { name: "Chinese AI Q&A", item: `${SITE}ask` },
      { name: a.question, item: url },
    ]),
  );
}

export const Route = createFileRoute("/ask_/$slug")({
  loader: async ({ params, context }) => {
    const a = await context.queryClient.ensureQueryData(answerQuery(params.slug));
    if (!a) throw notFound();
    return a;
  },
  head: ({ loaderData: a }) => {
    if (!a) return { meta: [{ title: "Question not found — China AI News" }] };
    const url = `${SITE}ask/${a.slug}`;
    const title = `${a.seo_title} — China AI News`;
    return {
      meta: [
        { title },
        { name: "description", content: a.seo_description },
        { property: "og:type", content: "article" },
        { property: "og:site_name", content: "China AI News" },
        { property: "og:title", content: a.seo_title },
        { property: "og:description", content: a.seo_description },
        { property: "og:url", content: url },
        ...ogImageMeta(OG_DEFAULT),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: a.seo_title },
        { name: "twitter:description", content: a.seo_description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [jsonLdScript(qaPageJsonLd(a))],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="font-serif text-3xl">Question not found</h1>
        <Link to="/ask" className="mt-4 inline-block underline">
          Ask China AI a question
        </Link>
      </main>
    </div>
  ),
  component: AnswerPage,
});

function AnswerPage() {
  const { slug } = Route.useParams();
  const { data: a } = useSuspenseQuery(answerQuery(slug));
  if (!a) return null;
  const updated = new Date(a.answered_at).toISOString().slice(0, 10);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-12 pb-24">
        <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-wider text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span aria-hidden="true"> / </span>
          <Link to="/ask" className="hover:text-foreground">Chinese AI Q&amp;A</Link>
        </nav>

        <article>
          <header className="mt-4 border-b border-border/60 pb-6">
            <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">{a.question}</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Answered from China AI News reporting · updated <time dateTime={a.answered_at}>{updated}</time>
            </p>
          </header>

          <div className="mt-6 whitespace-pre-line text-lg leading-relaxed">{a.answer}</div>

          {a.sources.length > 0 && (
            <section className="mt-10 border-t border-border/60 pt-6">
              <h2 className="font-serif text-xl">Sources</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                {a.sources.map((s) => (
                  <li key={s.slug}>
                    <Link to="/posts/$slug" params={{ slug: s.slug }} className="underline underline-offset-4">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </article>

        {a.related.length > 0 && (
          <section className="mt-12 border-t border-border/60 pt-6">
            <h2 className="font-serif text-xl">Related questions</h2>
            <ul className="mt-3 space-y-2">
              {a.related.map((r) => (
                <li key={r.slug}>
                  <Link to="/ask/$slug" params={{ slug: r.slug }} className="hover:underline">
                    {r.question}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 border-t border-border/60 pt-6">
          <h2 className="font-serif text-xl">Ask your own question</h2>
          <div className="mt-4">
            <AskChinaAi />
          </div>
        </section>
      </main>
    </div>
  );
}
