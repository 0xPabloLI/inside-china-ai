import type { Lang } from "../deepseek/i18n";

export interface TimelineEvent {
  date: string;
  event: string;
  detail: string;
  source: string;
  url: string;
  highlight?: boolean;
}

export const MOONSHOT_EVENTS: TimelineEvent[] = [
  {
    date: "February 2026",
    event: "Accused by Anthropic of Distillation",
    detail:
      "Anthropic's February 23 blog post accused Moonshot AI of using fraudulent accounts to generate 3.4M+ exchanges with Claude for agentic reasoning, tool use, coding, and data analysis. Moonshot never publicly responded.",
    source: "Anthropic Official Blog",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
    highlight: true,
  },
  {
    date: "July 16, 2026",
    event: "Kimi K3 Released",
    detail:
      "Moonshot released Kimi K3, a 2.8T-parameter sparse MoE model with 1M-token context. Full open weights published July 27.",
    source: "Moonshot AI / Hugging Face",
    url: "https://huggingface.co/blog/ResterChed/kimi-k3-model-overview",
  },
  {
    date: "July 20, 2026",
    event: "New Subscriptions Suspended",
    detail:
      "Overwhelming demand pushed GPU capacity to the limit. Moonshot suspended new subscriptions within 48 hours of K3 launch.",
    source: "AP News",
    url: "https://apnews.com/article/kimi-k3-china-ai-model",
  },
  {
    date: "July 29, 2026",
    event: "$3.5B Funding Round at $35B Valuation",
    detail:
      "Bloomberg reported Moonshot AI closed a funding round raising $3.5 billion at a post-money valuation of $35 billion.",
    source: "Bloomberg",
    url: "https://www.bloomberg.com",
    highlight: true,
  },
  {
    date: "July 29, 2026",
    event: "K3 Open-Source Weights Announced",
    detail:
      "Moonshot announced it would open-source K3 model weights, following through on July 27.",
    source: "Multiple sources",
    url: "https://huggingface.co",
  },
  {
    date: "Late July 2026",
    event: "IPO Targeting $50B Valuation (Reported)",
    detail:
      "KrASIA reported that Moonshot was targeting a $50 billion valuation for its Hong Kong IPO. Alibaba was reported to back Moonshot with approximately 20,000 Nvidia chips.",
    source: "KrASIA",
    url: "https://kr-asia.com",
  },
  {
    date: "August 3, 2026",
    event: "Moonshot Denies August IPO Filing",
    detail:
      "The Standard (Hong Kong) reported that Moonshot denied plans to file for IPO in August, pushing back on earlier reporting about imminent IPO preparations.",
    source: "The Standard (HK)",
    url: "https://www.thestandard.com.hk",
  },
];

export function MoonshotFundingView(_props: { lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground/70">
        Moonshot AI (Kimi) funding, product launches, and IPO timeline. All data from public reporting.
      </div>
      <div className="relative space-y-0">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/40" />
        {MOONSHOT_EVENTS.map((ev, i) => (
          <div key={i} className="relative pl-7 pb-4 last:pb-0">
            {/* Dot */}
            <div
              className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 ${
                ev.highlight
                  ? "border-primary bg-primary/20"
                  : "border-border bg-background"
              }`}
            />
            <div className="text-[11px] font-bold text-muted-foreground">{ev.date}</div>
            <div className="mt-0.5 text-sm font-bold text-foreground">{ev.event}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{ev.detail}</p>
            <a
              href={ev.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-[10px] text-primary hover:underline"
            >
              {ev.source} ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
