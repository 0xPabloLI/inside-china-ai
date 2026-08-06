export type FundingStatus = "completed" | "target" | "denied" | "product";

export interface FundingEvent {
  date: string;
  shortDate: string;
  event: string;
  valuation: number | null; // $B, null = N/A
  status: FundingStatus;
  detail: string;
  source: string;
  url: string;
}

export const FUNDING_EVENTS: FundingEvent[] = [
  {
    date: "Feb 2026",
    shortDate: "Feb",
    event: "Accused by Anthropic",
    valuation: null,
    status: "product",
    detail:
      "Anthropic accused Moonshot of 3.4M+ exchanges with Claude. Moonshot never publicly responded.",
    source: "Anthropic Blog",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
  },
  {
    date: "Jul 16, 2026",
    shortDate: "Jul 16",
    event: "Kimi K3 Released",
    valuation: null,
    status: "product",
    detail:
      "2.8T-parameter sparse MoE with 1M-token context. Full open weights published July 27.",
    source: "Hugging Face",
    url: "https://huggingface.co/blog/ResterChed/kimi-k3-model-overview",
  },
  {
    date: "Jul 20, 2026",
    shortDate: "Jul 20",
    event: "Subscriptions Suspended",
    valuation: null,
    status: "product",
    detail:
      "Overwhelming demand pushed GPU capacity to the limit. New subscriptions suspended within 48 hours.",
    source: "AP News",
    url: "https://apnews.com/article/kimi-k3-china-ai-model",
  },
  {
    date: "Jul 29, 2026",
    shortDate: "Jul 29",
    event: "$3.5B Raised at $35B",
    valuation: 35,
    status: "completed",
    detail:
      "Bloomberg reported Moonshot AI closed a $3.5B funding round at a $35B post-money valuation.",
    source: "Bloomberg",
    url: "https://www.bloomberg.com",
  },
  {
    date: "Late Jul 2026",
    shortDate: "Jul 30",
    event: "IPO Target: $50B",
    valuation: 50,
    status: "target",
    detail:
      "KrASIA reported Moonshot targeting $50B valuation for Hong Kong IPO. Alibaba reportedly backing with ~20K Nvidia chips.",
    source: "KrASIA",
    url: "https://kr-asia.com",
  },
  {
    date: "Aug 3, 2026",
    shortDate: "Aug 3",
    event: "Denied Aug IPO Filing",
    valuation: null,
    status: "denied",
    detail:
      "The Standard (HK) reported Moonshot denied plans to file for IPO in August, pushing back on earlier reporting.",
    source: "The Standard (HK)",
    url: "https://www.thestandard.com.hk",
  },
];

export const SUMMARY_CARDS = [
  { val: "$3.5B", label: "Raised (Jul 29)" },
  { val: "$35B", label: "Post-money Valuation" },
  { val: "$50B", label: "IPO Target (Reported)" },
  { val: "~20K", label: "Nvidia Chips (Alibaba)" },
];

const STATUS_STYLE: Record<
  FundingStatus,
  { bar: string; badge: string; label: string }
> = {
  completed: {
    bar: "bg-gradient-to-t from-success to-success",
    badge: "bg-success-muted text-success-foreground",
    label: "Closed",
  },
  target: {
    bar: "border-2 border-brand bg-brand-muted border-b-0",
    badge: "bg-brand-muted text-brand-foreground",
    label: "Target",
  },
  denied: {
    bar: "border-2 border-danger bg-danger-muted border-b-0",
    badge: "bg-danger-muted text-danger",
    label: "Denied",
  },
  product: {
    bar: "border border-dashed border-border/40 border-b-0",
    badge: "bg-muted text-muted-foreground",
    label: "Milestone",
  },
};

export { STATUS_STYLE };
