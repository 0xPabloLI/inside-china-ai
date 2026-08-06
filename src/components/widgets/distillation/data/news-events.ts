export type EventType =
  | "accusation"
  | "product"
  | "funding"
  | "political"
  | "technical";

export interface NewsEvent {
  company: string;
  companyShort: string;
  month: string; // "Feb", "Mar", ...
  monthIdx: number; // 0=Feb ... 6=Aug
  type: EventType;
  headline: string;
  detail: string;
  source: string;
  url: string;
}

export const COMPANIES = [
  "DeepSeek",
  "Moonshot AI (Kimi)",
  "MiniMax",
  "Alibaba (Qwen)",
  "Tencent (Hunyuan)",
] as const;

export const MONTHS = ["Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"] as const;

export const EVENT_TYPE_META: Record<
  EventType,
  { label: string; color: string; dot: string }
> = {
  accusation: { label: "Accusation", color: "var(--color-danger)", dot: "bg-danger" },
  product: { label: "Product Launch", color: "var(--color-brand)", dot: "bg-brand" },
  funding: { label: "Funding / IPO", color: "var(--color-success)", dot: "bg-success" },
  political: { label: "Political", color: "#a855f7", dot: "bg-purple-500" },
  technical: { label: "Technical", color: "var(--color-warning)", dot: "bg-warning" },
};

export const NEWS_EVENTS: NewsEvent[] = [
  {
    company: "DeepSeek",
    companyShort: "DeepSeek",
    month: "Feb",
    monthIdx: 0,
    type: "accusation",
    headline: "Named in Anthropic's distillation blog post",
    detail:
      "Anthropic accused DeepSeek of using fraudulent accounts to distill Claude. ~24,000 accounts, 16M+ exchanges across coding, reasoning, and tool use.",
    source: "Anthropic Blog",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
  },
  {
    company: "Moonshot AI (Kimi)",
    companyShort: "Moonshot",
    month: "Feb",
    monthIdx: 0,
    type: "accusation",
    headline: "Accused of 3.4M+ exchanges with Claude",
    detail:
      "Anthropic named Moonshot AI as one of three labs conducting industrial-scale distillation. Targeted: agentic reasoning, tool use, coding, data analysis.",
    source: "Anthropic Blog",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
  },
  {
    company: "MiniMax",
    companyShort: "MiniMax",
    month: "Feb",
    monthIdx: 0,
    type: "accusation",
    headline: "Largest distillation volume: 13M+ exchanges",
    detail:
      "MiniMax was accused of the largest distillation volume among the three named labs — 13M+ exchanges targeting agentic coding, tool use, and orchestration.",
    source: "Anthropic Blog",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
  },
  {
    company: "MiniMax",
    companyShort: "MiniMax",
    month: "Mar",
    monthIdx: 1,
    type: "funding",
    headline: "Stock peaks at HK$1,330",
    detail:
      "MiniMax Group Inc (HKEX: 0100.HK) reached its all-time high, riding the AI boom and investor enthusiasm for Chinese AI companies.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
  {
    company: "Tencent (Hunyuan)",
    companyShort: "Tencent",
    month: "Apr",
    monthIdx: 2,
    type: "accusation",
    headline: "Leaked records show Claude usage for fine-tuning",
    detail:
      "The Information reported that Tencent employees used Claude to evaluate and fine-tune internal models — extending distillation beyond the three named labs.",
    source: "The Information",
    url: "https://theinformation.com",
  },
  {
    company: "Alibaba (Qwen)",
    companyShort: "Alibaba",
    month: "Jun",
    monthIdx: 4,
    type: "accusation",
    headline: "Accused of using fraudulent accounts",
    detail:
      "BBC reported Anthropic separately accused Alibaba of using fraudulent accounts to access Claude data — a later, separate accusation from the February charges.",
    source: "BBC",
    url: "https://www.bbc.com",
  },
  {
    company: "Moonshot AI (Kimi)",
    companyShort: "Moonshot",
    month: "Jul",
    monthIdx: 5,
    type: "product",
    headline: "Kimi K3 released — 2.8T MoE, 1M context",
    detail:
      "Moonshot released Kimi K3, a 2.8T-parameter sparse MoE model with 1M-token context. Full open weights published July 27.",
    source: "Hugging Face",
    url: "https://huggingface.co/blog/ResterChed/kimi-k3-model-overview",
  },
  {
    company: "Moonshot AI (Kimi)",
    companyShort: "Moonshot",
    month: "Jul",
    monthIdx: 5,
    type: "product",
    headline: "Subscriptions suspended within 48 hours",
    detail:
      "Overwhelming demand pushed GPU capacity to the limit. Moonshot suspended new subscriptions within 48 hours of K3 launch.",
    source: "AP News",
    url: "https://apnews.com/article/kimi-k3-china-ai-model",
  },
  {
    company: "Moonshot AI (Kimi)",
    companyShort: "Moonshot",
    month: "Jul",
    monthIdx: 5,
    type: "funding",
    headline: "$3.5B raise at $35B valuation",
    detail:
      "Bloomberg reported Moonshot AI closed a $3.5B funding round at a $35B post-money valuation.",
    source: "Bloomberg",
    url: "https://www.bloomberg.com",
  },
  {
    company: "Moonshot AI (Kimi)",
    companyShort: "Moonshot",
    month: "Jul",
    monthIdx: 5,
    type: "political",
    headline: "White House: 'cloning US tech'",
    detail:
      "A White House official publicly accused Kimi K3 of 'cloning US tech,' elevating the distillation controversy from industry dispute to geopolitical issue. Microsoft and Nvidia CEOs subsequently backed Moonshot.",
    source: "PCMag",
    url: "https://www.pcmag.com/news/chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech",
  },
  {
    company: "Moonshot AI (Kimi)",
    companyShort: "Moonshot",
    month: "Jul",
    monthIdx: 5,
    type: "technical",
    headline: "K3 identifies as Claude in ~15% of tests",
    detail:
      "Hacker News user ataoz posted results showing K3 responds 'I'm Claude, an AI assistant created by Anthropic' in approximately 15% of interactions.",
    source: "Hacker News",
    url: "https://news.ycombinator.com/item?id=49076001",
  },
  {
    company: "MiniMax",
    companyShort: "MiniMax",
    month: "Jul",
    monthIdx: 5,
    type: "funding",
    headline: "Stock crashes 80%+ from peak",
    detail:
      "MiniMax stock fell to ~HK$186, a decline of over 80% from its March peak. Emergency HK$16B capital raise conducted amid the collapse.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
  {
    company: "Moonshot AI (Kimi)",
    companyShort: "Moonshot",
    month: "Aug",
    monthIdx: 6,
    type: "funding",
    headline: "Denies August IPO filing; targets $50B",
    detail:
      "The Standard (HK) reported Moonshot denied plans to file for IPO in August. Earlier reports suggested a $50B valuation target with Alibaba backing ~20K Nvidia chips.",
    source: "The Standard (HK)",
    url: "https://www.thestandard.com.hk",
  },
  {
    company: "MiniMax",
    companyShort: "MiniMax",
    month: "Aug",
    monthIdx: 6,
    type: "funding",
    headline: "Partial recovery to ~HK$247",
    detail:
      "MiniMax stock partially recovered to approximately HK$247, but remained over 81% below its March peak. Moonshot IPO preparations continued to pressure the stock.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
];
