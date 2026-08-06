import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SubscribeForm } from "@/components/subscribe-form";

const TITLE = "Chinese AI Companies: The 2026 Guide to China's Top AI Labs";
const DESCRIPTION =
  "A curated directory of the top Chinese AI companies and open model labs — DeepSeek, Moonshot AI, Zhipu AI, Alibaba Qwen, ByteDance Seed, MiniMax, 01.AI, StepFun, Baidu and more.";
const URL = "https://chinaai.lovable.app/companies";

type Company = {
  name: string;
  chinese?: string;
  city: string;
  founded: string;
  models: string;
  openness: "Open weights" | "Mostly open" | "Mixed" | "Closed";
  summary: string;
  site: string;
};

const TIER1: Company[] = [
  {
    name: "DeepSeek",
    chinese: "深度求索",
    city: "Hangzhou",
    founded: "2023",
    models: "DeepSeek-V3, DeepSeek-R1",
    openness: "Open weights",
    summary:
      "Spun out of quant fund High-Flyer. Became the reference point for frontier-grade reasoning models released under permissive licences at a fraction of Western training budgets.",
    site: "https://www.deepseek.com",
  },
  {
    name: "Alibaba (Qwen / Tongyi)",
    chinese: "通义千问",
    city: "Hangzhou",
    founded: "2023",
    models: "Qwen3 family, Qwen-VL, Qwen-Coder",
    openness: "Mostly open",
    summary:
      "The most prolific open-weight publisher in China. Qwen derivatives dominate community fine-tune leaderboards and ship inside Alibaba Cloud's enterprise stack.",
    site: "https://qwen.ai",
  },
  {
    name: "Moonshot AI",
    chinese: "月之暗面",
    city: "Beijing",
    founded: "2023",
    models: "Kimi K-series, Kimi chat assistant",
    openness: "Mixed",
    summary:
      "Built its reputation on ultra-long-context assistants for Chinese knowledge workers, then moved into open agentic and reasoning releases.",
    site: "https://www.moonshot.ai",
  },
  {
    name: "Zhipu AI / Z.ai",
    chinese: "智谱",
    city: "Beijing",
    founded: "2019",
    models: "GLM-4 family, CogVLM, CogVideo",
    openness: "Mostly open",
    summary:
      "Tsinghua University spin-off with the deepest research lineage of the new cohort, and the strongest state and enterprise procurement footprint.",
    site: "https://z.ai",
  },
  {
    name: "ByteDance Seed",
    chinese: "豆包大模型",
    city: "Beijing",
    founded: "2023",
    models: "Doubao, Seed / Seedream, Seedance",
    openness: "Mixed",
    summary:
      "Consumer distribution at a scale nobody else in China has. Doubao is the country's most-used assistant; Seed handles the frontier research and media generation work.",
    site: "https://seed.bytedance.com",
  },
];

const TIER2: Company[] = [
  {
    name: "MiniMax",
    chinese: "稀宇科技",
    city: "Shanghai",
    founded: "2021",
    models: "MiniMax-M / Text-01, Hailuo video",
    openness: "Mixed",
    summary:
      "Strong on long-context architectures and consumer media apps; Hailuo made it a serious name in video generation.",
    site: "https://www.minimax.io",
  },
  {
    name: "StepFun",
    chinese: "阶跃星辰",
    city: "Shanghai",
    founded: "2023",
    models: "Step series, Step-Audio, Step-Video",
    openness: "Mostly open",
    summary:
      "Multimodal-first lab with a habit of open-sourcing audio and video models that few labs anywhere release.",
    site: "https://www.stepfun.com",
  },
  {
    name: "01.AI",
    chinese: "零一万物",
    city: "Beijing",
    founded: "2023",
    models: "Yi series",
    openness: "Mostly open",
    summary:
      "Founded by Kai-Fu Lee. Yi models put Chinese open weights on Western leaderboards early; the company has since tilted toward enterprise applications.",
    site: "https://www.01.ai",
  },
  {
    name: "Baidu",
    chinese: "文心一言",
    city: "Beijing",
    founded: "2019",
    models: "ERNIE 4.x / ERNIE-VL",
    openness: "Mixed",
    summary:
      "First mover among the big platforms, with Kunlun AI chips and Apollo autonomous driving giving it a full-stack story.",
    site: "https://yiyan.baidu.com",
  },
  {
    name: "Tencent Hunyuan",
    chinese: "混元",
    city: "Shenzhen",
    founded: "2023",
    models: "Hunyuan LLM, Hunyuan3D, HunyuanVideo",
    openness: "Mixed",
    summary:
      "Quietly one of the biggest open-weight contributors in 3D and video, with WeChat as a distribution channel nobody can match.",
    site: "https://hunyuan.tencent.com",
  },
  {
    name: "Baichuan AI",
    chinese: "百川智能",
    city: "Beijing",
    founded: "2023",
    models: "Baichuan series",
    openness: "Mostly open",
    summary:
      "Founded by Sogou's Wang Xiaochuan; has narrowed its focus toward medical and healthcare applications of foundation models.",
    site: "https://www.baichuan-ai.com",
  },
  {
    name: "iFlytek",
    chinese: "科大讯飞",
    city: "Hefei",
    founded: "1999",
    models: "Spark (Xinghuo)",
    openness: "Closed",
    summary:
      "The incumbent in Chinese speech and education tech, training on domestic Huawei Ascend silicon rather than Nvidia.",
    site: "https://www.iflytek.com",
  },
  {
    name: "SenseTime",
    chinese: "商汤",
    city: "Shanghai / Hong Kong",
    founded: "2014",
    models: "SenseNova",
    openness: "Closed",
    summary:
      "Computer-vision era giant that repositioned around foundation models and its own large compute clusters.",
    site: "https://www.sensetime.com",
  },
];

const INFRA: Company[] = [
  {
    name: "Huawei (Ascend / Pangu)",
    city: "Shenzhen",
    founded: "1987",
    models: "Ascend 910 accelerators, Pangu models",
    openness: "Closed",
    summary:
      "The centre of China's domestic compute answer to export controls: chips, CANN software stack, and its own enterprise model family.",
    site: "https://www.huawei.com",
  },
  {
    name: "Cambricon",
    chinese: "寒武纪",
    city: "Beijing",
    founded: "2016",
    models: "Siyuan / MLU accelerators",
    openness: "Closed",
    summary: "Listed pure-play AI chip designer, the main domestic alternative to Huawei silicon.",
    site: "https://www.cambricon.com",
  },
  {
    name: "Moore Threads",
    chinese: "摩尔线程",
    city: "Beijing",
    founded: "2020",
    models: "MTT GPU series",
    openness: "Closed",
    summary:
      "Building general-purpose GPUs with a CUDA-adjacent software story aimed at domestic training clusters.",
    site: "https://www.mthreads.com",
  },
  {
    name: "Unitree",
    chinese: "宇树科技",
    city: "Hangzhou",
    founded: "2016",
    models: "G1 / H1 humanoids, Go quadrupeds",
    openness: "Mixed",
    summary:
      "The most visible name in Chinese embodied AI, pairing cheap humanoid hardware with learned locomotion policies.",
    site: "https://www.unitree.com",
  },
];

const GROUPS: { id: string; heading: string; blurb: string; items: Company[] }[] = [
  {
    id: "frontier-labs",
    heading: "Frontier model labs",
    blurb:
      "The five names that set the pace for Chinese frontier training runs and account for most of the open weights coming out of the country.",
    items: TIER1,
  },
  {
    id: "challengers",
    heading: "Challengers and platform incumbents",
    blurb:
      "Well-funded labs and big-tech divisions shipping competitive models, often specialised by modality or vertical.",
    items: TIER2,
  },
  {
    id: "infrastructure",
    heading: "Compute, chips and embodied AI",
    blurb:
      "The hardware layer that decides how fast the model layer can move under export controls.",
    items: INFRA,
  },
];

const ALL = [...TIER1, ...TIER2, ...INFRA];

export const Route = createFileRoute("/companies")({
  head: () => ({
    meta: [
      { title: "Chinese AI Companies — Top AI Labs in China (2026 Guide)" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://chinaai.lovable.app/china-ai-news-logo-gpt.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: "https://chinaai.lovable.app/china-ai-news-logo-gpt.png" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: TITLE,
              description: DESCRIPTION,
              mainEntityOfPage: URL,
              about: "Chinese artificial intelligence companies and open model labs",
              publisher: { "@id": "https://chinaai.lovable.app/#organization" },
            },
            {
              "@type": "ItemList",
              name: "Top Chinese AI companies",
              itemListOrder: "https://schema.org/ItemListUnordered",
              numberOfItems: ALL.length,
              itemListElement: ALL.map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                item: {
                  "@type": "Organization",
                  name: c.name,
                  url: c.site,
                  description: c.summary,
                },
              })),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item: "https://chinaai.lovable.app/",
                },
                { "@type": "ListItem", position: 2, name: "Chinese AI companies", item: URL },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Which Chinese AI companies release open-weight models?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "DeepSeek, Alibaba's Qwen team, Zhipu AI, StepFun, 01.AI and Baichuan publish open weights regularly. Tencent Hunyuan and MiniMax open-source selected multimodal models while keeping their strongest systems proprietary.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Who are China's top open model labs?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "By release cadence and downstream adoption, the leading Chinese open model labs are DeepSeek, Alibaba Qwen, Zhipu AI (GLM), Moonshot AI (Kimi) and StepFun.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How do Chinese AI companies get compute under export controls?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Through pre-control Nvidia stockpiles, export-compliant variants, offshore cloud capacity, and increasingly domestic accelerators from Huawei Ascend, Cambricon and Moore Threads.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: CompaniesPage,
});

function OpennessBadge({ value }: { value: Company["openness"] }) {
  return (
    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
      {value}
    </span>
  );
}

function CompanyCard({ c }: { c: Company }) {
  return (
    <li className="border-t border-border/60 py-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-2xl leading-snug">{c.name}</h3>
        {c.chinese ? <span className="text-sm text-muted-foreground">{c.chinese}</span> : null}
        <OpennessBadge value={c.openness} />
      </div>
      <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
        {c.city} · Founded {c.founded}
      </div>
      <p className="mt-3 text-muted-foreground">{c.summary}</p>
      <dl className="mt-3 text-sm text-muted-foreground">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-foreground/80">Key models:</dt>
          <dd>{c.models}</dd>
        </div>
      </dl>
      <a
        href={c.site}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm underline decoration-border hover:decoration-foreground"
      >
        {c.site.replace(/^https?:\/\//, "")}
      </a>
    </li>
  );
}

function CompaniesPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pt-16 pb-24">
        <article>
          <header className="mb-12">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Guide</div>
            <h1 className="mt-2 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              Chinese AI companies: a guide to China's top AI labs
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              A working map of the organisations that matter in China's AI industry — the frontier
              labs publishing open weights, the platform incumbents with distribution, and the chip
              and robotics firms that decide how much compute any of it can use. Updated as the
              landscape moves.
            </p>
          </header>

          <nav aria-label="Sections" className="mb-12 rounded-lg bg-muted/40 p-5">
            <h2 className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
              On this page
            </h2>
            <ul className="space-y-1 text-sm">
              {GROUPS.map((g) => (
                <li key={g.id}>
                  <a
                    href={`#${g.id}`}
                    className="underline decoration-border hover:decoration-foreground"
                  >
                    {g.heading}
                  </a>{" "}
                  <span className="text-muted-foreground">({g.items.length})</span>
                </li>
              ))}
              <li>
                <a
                  href="#how-to-read"
                  className="underline decoration-border hover:decoration-foreground"
                >
                  How to read this landscape
                </a>
              </li>
            </ul>
          </nav>

          {GROUPS.map((g) => (
            <section key={g.id} id={g.id} className="mb-14 scroll-mt-8">
              <h2 className="font-serif text-3xl">{g.heading}</h2>
              <p className="mt-3 text-muted-foreground">{g.blurb}</p>
              <ul className="mt-6">
                {g.items.map((c) => (
                  <CompanyCard key={c.name} c={c} />
                ))}
              </ul>
            </section>
          ))}

          <section id="how-to-read" className="mb-14 scroll-mt-8">
            <h2 className="font-serif text-3xl">How to read this landscape</h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                Three forces explain almost every move on this list. The first is compute: export
                controls push every lab toward efficiency work and toward domestic silicon, which is
                why Chinese labs so often lead on training-cost-per-capability rather than raw
                scale.
              </p>
              <p>
                The second is openness as strategy. Publishing weights buys global mindshare that
                closed Chinese APIs cannot, so open releases have become the default distribution
                channel abroad — and the reason Qwen and DeepSeek derivatives are everywhere.
              </p>
              <p>
                The third is distribution at home. ByteDance, Tencent, Alibaba and Baidu can put a
                model in front of hundreds of millions of users on day one; the newer labs have to
                win on model quality or on a specific vertical.
              </p>
            </div>
          </section>

          <section className="mb-14">
            <h2 className="font-serif text-3xl">Frequently asked questions</h2>
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="font-serif text-xl">
                  Which Chinese AI companies release open-weight models?
                </h3>
                <p className="mt-2 text-muted-foreground">
                  DeepSeek, Alibaba's Qwen team, Zhipu AI, StepFun, 01.AI and Baichuan publish open
                  weights regularly. Tencent Hunyuan and MiniMax open-source selected multimodal
                  models while keeping their strongest systems proprietary.
                </p>
              </div>
              <div>
                <h3 className="font-serif text-xl">Who are China's top open model labs?</h3>
                <p className="mt-2 text-muted-foreground">
                  By release cadence and downstream adoption: DeepSeek, Alibaba Qwen, Zhipu AI
                  (GLM), Moonshot AI (Kimi) and StepFun.
                </p>
              </div>
              <div>
                <h3 className="font-serif text-xl">
                  How do Chinese AI companies get compute under export controls?
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Pre-control Nvidia stockpiles, export-compliant variants, offshore cloud capacity,
                  and increasingly domestic accelerators from Huawei Ascend, Cambricon and Moore
                  Threads.
                </p>
              </div>
            </div>
          </section>
        </article>

        <section className="border-t border-border/60 pt-10">
          <h2 className="mb-4 font-serif text-2xl">Track these labs weekly</h2>
          <p className="mb-6 text-muted-foreground">
            I write one piece a week on the companies above — releases, funding, policy, and what it
            means. Leave your email.
          </p>
          <SubscribeForm />
        </section>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · China AI News
      </footer>
    </div>
  );
}
