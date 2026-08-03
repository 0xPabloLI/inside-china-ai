import type { Lang } from "../deepseek/i18n";

export interface BenchmarkItem {
  source: string;
  date: string;
  headline: string;
  summary: string;
  url: string;
}

export const BENCHMARK_ITEMS: BenchmarkItem[] = [
  {
    source: "Artificial Analysis",
    date: "July 2026",
    headline: "K3 Hallucination Rate at 51% on AA-Omniscience",
    summary:
      "Independent benchmarking by Artificial Analysis measured Kimi K3's hallucination rate at 51% (up from K2.6's 39%). While accuracy improved from 33% to 46%, the hallucination rate also climbed significantly. K3 scored below Claude on coding, agents, and frontier SWE — leading only in codebase cleaning and long-horizon engineering.",
    url: "https://artificialanalysis.ai",
  },
  {
    source: "SCMP",
    date: "July 24, 2026",
    headline: "Kimi K3 'Significantly Below' US Rivals in Security Testing",
    summary:
      "The South China Morning Post reported that Kimi K3 was 'significantly below' US rivals in security testing, raising concerns about safety guardrails in distilled models.",
    url: "https://www.scmp.com/tech/big-tech/article/kimi-k3-developer-suspends-new-subscriptions",
  },
  {
    source: "PCMag",
    date: "July 22, 2026",
    headline: "White House Official Accuses Kimi K3 of 'Cloning US Tech'",
    summary:
      "A White House official publicly accused Kimi K3 of cloning US technology, elevating the distillation controversy from an industry dispute to a geopolitical issue. Microsoft and Nvidia CEOs subsequently backed Moonshot.",
    url: "https://www.pcmag.com/news/chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech",
  },
  {
    source: "HackerNoon",
    date: "July 2026",
    headline: "K3 Top Benchmark Runs Rely on Maximum Reasoning Effort",
    summary:
      "Independent technical analysis noted that K3's top benchmark results were achieved only when using maximum reasoning/thinking effort modes, raising questions about whether the benchmark scores reflected typical user experience.",
    url: "https://hackernoon.com",
  },
  {
    source: "Zhihu (猫老板 / Cat Boss)",
    date: "Ongoing 2026",
    headline: "LLM Evaluation Blogger Tracks Benchmark Manipulation",
    summary:
      "A well-known Zhihu platform blogger known as '猫老板' (Cat Boss) runs independent LLM evaluations and has publicly analyzed benchmark manipulation patterns, including test set contamination and targeting of private evaluation questions by lab teams.",
    url: "https://www.zhihu.com",
  },
  {
    source: "Arena (LMSYS)",
    date: "July 2026",
    headline: "K3 Jumps 17 Places on Arena Frontend Code",
    summary:
      "On the Arena Frontend Code leaderboard, Kimi K3 jumped 17 places from K2.x to claim the #1 spot. However, Moonshot's own evaluation report showed K3 below Claude on coding, agents, and frontier SWE, leading to questions about score consistency.",
    url: "https://lmarena.ai",
  },
];

export function BenchmarkControversyView(_props: { lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground/70">
        Independent benchmark results and public reporting on Kimi K3 evaluation controversies.
      </div>
      <div className="space-y-2.5">
        {BENCHMARK_ITEMS.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-border/40 bg-background/40 p-4 transition-colors hover:border-border/70 hover:bg-muted/30"
          >
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground/80">{item.source}</span>
              <span>·</span>
              <span>{item.date}</span>
            </div>
            <h4 className="mt-1 text-sm font-bold leading-snug text-foreground">
              {item.headline}
            </h4>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {item.summary}
            </p>
            <span className="mt-2 inline-block text-[10px] text-primary hover:underline">
              Read source ↗
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
