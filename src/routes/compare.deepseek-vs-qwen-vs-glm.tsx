import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { ogImageForPath, ogMetaForPath } from "@/lib/og";
import {
  SITE,
  articleJsonLd,
  breadcrumbListJsonLd,
  faqPageJsonLd,
  graph,
  itemListJsonLd,
  jsonLdScript,
  organization,
} from "@/lib/structured-data";

const PATH = "/compare/deepseek-vs-qwen-vs-glm";
const TITLE = "DeepSeek vs Qwen vs GLM-5.2: Chinese Model Comparison";
const DESCRIPTION =
  "Compare DeepSeek, Alibaba Qwen and Zhipu GLM-5.2 on reasoning, coding, agents, context length, licences and API pricing to pick the right Chinese open model in 2026.";
const URL = `https://chinaai.news${PATH}`;
const PUBLISHED = "2026-08-07";
const MODIFIED = "2026-08-09";
const OG_IMAGE = ogImageForPath(PATH);

type Model = {
  key: "deepseek" | "qwen" | "glm";
  name: string;
  lab: string;
  city: string;
  flagship: string;
  licence: string;
  context: string;
  strength: string;
  weakness: string;
  bestFor: string;
  site: string;
};

const MODELS: Model[] = [
  {
    key: "deepseek",
    name: "DeepSeek",
    lab: "DeepSeek (High-Flyer)",
    city: "Hangzhou",
    flagship: "DeepSeek-V3 / DeepSeek-R1 line",
    licence: "MIT-style permissive weights",
    context: "128K tokens",
    strength:
      "Frontier-grade chain-of-thought reasoning and maths at the lowest cost per token of the three. R1-derived distillations are still the default open reasoning baseline.",
    weakness:
      "Narrower multimodal line-up and fewer small sizes for on-device work; release cadence is spikier.",
    bestFor: "Reasoning, maths, research agents and cheap high-volume inference.",
    site: "https://www.deepseek.com",
  },
  {
    key: "qwen",
    name: "Qwen",
    lab: "Alibaba (Tongyi Qianwen)",
    city: "Hangzhou",
    flagship: "Qwen3 family, Qwen-VL, Qwen-Coder",
    licence: "Apache 2.0 for most sizes",
    context: "Up to 1M tokens on long-context variants",
    strength:
      "The broadest ladder of sizes (sub-1B to flagship MoE), the strongest multilingual coverage, and the deepest community fine-tune ecosystem.",
    weakness:
      "Quality varies a lot between sizes, so benchmark claims for the flagship rarely transfer to the small checkpoints teams actually deploy.",
    bestFor: "Product teams that need one family across edge, server and vision workloads.",
    site: "https://qwen.ai",
  },
  {
    key: "glm",
    name: "GLM-5.2",
    lab: "Zhipu AI / Z.ai",
    city: "Beijing",
    flagship: "GLM-5.2 (744B MoE), GLM-5.1, GLM-4 legacy line, CogVideo",
    licence: "Open weights, permissive on the flagship, custom terms on some tiers",
    context: "128K–1M depending on variant",
    strength:
      "The 744B-parameter MoE flagship closed most of the reasoning gap with DeepSeek while keeping the strongest tool-calling and agent scaffolding of the three, plus the most enterprise-ready deployment story in China.",
    weakness:
      "Serving the flagship is heavier than DeepSeek or mid-size Qwen, API pricing sits above DeepSeek, and licences are not uniformly permissive across checkpoints.",
    bestFor: "Agentic apps, tool use and China-market enterprise deployments.",
    site: "https://z.ai",
  },
];

type Row = { dimension: string; deepseek: string; qwen: string; glm: string };

const ROWS: Row[] = [
  {
    dimension: "Reasoning / maths",
    deepseek: "Best of the three",
    qwen: "Competitive at flagship size",
    glm: "Close behind DeepSeek since 5.2",
  },
  {
    dimension: "Coding",
    deepseek: "Strong",
    qwen: "Strong (dedicated Coder line)",
    glm: "Strong on the 5.x line",
  },
  {
    dimension: "Multimodal",
    deepseek: "Limited",
    qwen: "Broadest (VL, audio, omni)",
    glm: "Good (vision line, CogVideo)",
  },
  {
    dimension: "Model sizes",
    deepseek: "Few, large",
    qwen: "Widest ladder, edge to frontier",
    glm: "Mid-range plus 744B MoE flagship",
  },
  {
    dimension: "Licence clarity",
    deepseek: "Permissive",
    qwen: "Apache 2.0 on most sizes",
    glm: "Permissive flagship, mixed tiers",
  },
  {
    dimension: "Context window",
    deepseek: "128K",
    qwen: "Up to 1M",
    glm: "128K–1M",
  },
  {
    dimension: "API cost profile",
    deepseek: "Cheapest per token",
    qwen: "Low, tiered by size",
    glm: "Mid, enterprise-oriented",
  },
  {
    dimension: "Agent / tool use",
    deepseek: "Improving",
    qwen: "Good",
    glm: "Best of the three",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is DeepSeek better than Qwen?",
    a: "For reasoning, maths and cost-sensitive high-volume inference, DeepSeek is generally the stronger pick. Qwen wins when you need many model sizes, multimodal inputs or the widest multilingual coverage from a single family.",
  },
  {
    q: "How does GLM-5.2 compare with GLM-4?",
    a: "GLM-5.2 is a 744B-parameter mixture-of-experts flagship and a generational jump over the GLM-4 family on reasoning, coding and agentic tool use. GLM-4 checkpoints are still widely deployed because they are far cheaper to serve, but new projects should benchmark against the 5.x line.",
  },
  {
    q: "Which Chinese open model has the most permissive licence?",
    a: "Qwen, because most sizes ship under Apache 2.0. DeepSeek's weights are also permissive, and Zhipu's flagship is open, while several older GLM checkpoints carry custom terms that should be reviewed before commercial use.",
  },
  {
    q: "Which model is best for agents and tool calling?",
    a: "GLM-5.2 has the most mature tool-calling and agent scaffolding of the three, which is why the GLM line shows up most often in Chinese enterprise agent deployments.",
  },
  {
    q: "Can these models be self-hosted?",
    a: "Yes. All three publish open weights that run on standard inference stacks such as vLLM and SGLang, so you can self-host rather than depend on each lab's hosted API. The GLM-5.2 flagship needs the most GPU memory of the three.",
  },
];

export const compareJsonLd = () =>
  graph(
    organization(),
    articleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: URL,
      image: OG_IMAGE,
      datePublished: PUBLISHED,
      dateModified: MODIFIED,
      about: "Comparison of DeepSeek, Alibaba Qwen and Zhipu GLM-5.2 open models",
    }),
    itemListJsonLd(
      "DeepSeek vs Qwen vs GLM-5.2",
      MODELS.map((m) => ({
        "@type": "SoftwareApplication",
        name: m.flagship,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Cloud, self-hosted",
        url: m.site,
        description: m.strength,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: { "@type": "Organization", name: m.lab },
      })),
    ),
    breadcrumbListJsonLd([
      { name: "Home", item: SITE },
      { name: "DeepSeek vs Qwen vs GLM-5.2", item: URL },
    ]),
    faqPageJsonLd(FAQ),
  );

export const Route = createFileRoute("/compare/deepseek-vs-qwen-vs-glm")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      ...ogMetaForPath(PATH),
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [jsonLdScript(compareJsonLd())],
  }),
  component: ComparePage,
});

function ComparePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pt-16 pb-24">
        <article>
          <header className="mb-12">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Comparison</div>
            <h1 className="mt-2 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              DeepSeek vs Qwen vs GLM-5.2
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Three labs dominate China's open-weight model output: DeepSeek, Alibaba's Qwen team and
              Zhipu AI's GLM line, now led by the 744B-parameter GLM-5.2. They are not
              interchangeable. This page compares what each family is actually good at, how their
              licences differ, and which one fits which workload.
            </p>
          </header>

          <section aria-labelledby="at-a-glance" className="mb-14">
            <h2 id="at-a-glance" className="font-serif text-3xl">
              At a glance
            </h2>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Comparison of DeepSeek, Qwen and GLM-5.2 across eight dimensions
                </caption>
                <thead>
                  <tr className="border-b border-border/60 text-left">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Dimension
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      DeepSeek
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Qwen
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      GLM-5.2
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.dimension} className="border-b border-border/40 align-top">
                      <th
                        scope="row"
                        className="py-3 pr-4 text-left font-medium text-foreground/80"
                      >
                        {r.dimension}
                      </th>
                      <td className="py-3 pr-4 text-muted-foreground">{r.deepseek}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{r.qwen}</td>
                      <td className="py-3 text-muted-foreground">{r.glm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="deep-dive" className="mb-14">
            <h2 id="deep-dive" className="font-serif text-3xl">
              The three families in detail
            </h2>
            <ul className="mt-6">
              {MODELS.map((m) => (
                <li key={m.key} className="border-t border-border/60 py-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-serif text-2xl leading-snug">{m.name}</h3>
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                      {m.licence}
                    </span>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                    {m.lab} · {m.city} · {m.context} context
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="font-medium text-foreground/80">Flagship models</dt>
                      <dd className="text-muted-foreground">{m.flagship}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">Where it wins</dt>
                      <dd className="text-muted-foreground">{m.strength}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">Where it falls short</dt>
                      <dd className="text-muted-foreground">{m.weakness}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">Best for</dt>
                      <dd className="text-muted-foreground">{m.bestFor}</dd>
                    </div>
                  </dl>
                  <a
                    href={m.site}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-sm underline decoration-border hover:decoration-foreground"
                  >
                    {m.site.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="how-to-choose" className="mb-14">
            <h2 id="how-to-choose" className="font-serif text-3xl">
              How to choose
            </h2>
            <ul className="mt-6 space-y-3 text-muted-foreground">
              <li>
                <strong className="text-foreground/90">Cost-sensitive reasoning at scale:</strong>{" "}
                DeepSeek. Cheapest tokens, strongest chain-of-thought.
              </li>
              <li>
                <strong className="text-foreground/90">One family across edge and server:</strong>{" "}
                Qwen. The size ladder and Apache 2.0 terms make it the safest default.
              </li>
              <li>
                <strong className="text-foreground/90">Agents and enterprise tool use:</strong>{" "}
                GLM-5.2. Best tool-calling behaviour and deployment support in China.
              </li>
              <li>
                <strong className="text-foreground/90">Multimodal inputs:</strong> Qwen-VL first,
                Zhipu's vision line second. DeepSeek is the weakest here.
              </li>
            </ul>
          </section>

          <section aria-labelledby="faq" className="mb-14">
            <h2 id="faq" className="font-serif text-3xl">
              Frequently asked questions
            </h2>
            <dl className="mt-6">
              {FAQ.map((f) => (
                <div key={f.q} className="border-t border-border/60 py-5">
                  <dt className="font-serif text-xl">{f.q}</dt>
                  <dd className="mt-2 text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="text-sm text-muted-foreground">
            Related:{" "}
            <a
              href="/companies"
              className="underline decoration-border hover:decoration-foreground"
            >
              guide to China's top AI labs
            </a>
            .
          </p>
        </article>

        <div className="mt-16">
          <SubscribeForm />
        </div>
      </main>
    </div>
  );
}
