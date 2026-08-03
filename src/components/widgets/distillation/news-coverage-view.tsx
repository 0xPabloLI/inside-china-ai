import type { Lang } from "../deepseek/i18n";

export interface NewsItem {
  source: string;
  date: string;
  headline: string;
  summary: string;
  url: string;
}

export const NEWS_ITEMS: NewsItem[] = [
  {
    source: "Anthropic Official Blog",
    date: "February 23, 2026",
    headline: "Detecting and Preventing Distillation Attacks",
    summary:
      "Anthropic published a detailed blog post accusing three Chinese AI labs — DeepSeek, Moonshot AI (Kimi), and MiniMax — of conducting 'industrial-scale distillation attacks' against Claude. The labs allegedly used ~24,000 fraudulent accounts to generate 16M+ exchanges. Attribution established via IP correlation, request metadata, and infrastructure indicators.",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
  },
  {
    source: "The Information",
    date: "April 28, 2026",
    headline: "Tencent's New Model Shows Improvement, Partly Thanks to Anthropic",
    summary:
      "Leaked records showed Tencent employees used Claude to evaluate and fine-tune internal models. This was the first public indication that distillation extended beyond the three named labs to include Tencent/Hunyuan.",
    url: "https://theinformation.com",
  },
  {
    source: "BBC",
    date: "June 24, 2026",
    headline: "Anthropic Accuses Alibaba of Using Fraudulent Accounts",
    summary:
      "BBC reported that Anthropic separately accused Alibaba of using fraudulent accounts to access Claude data — a later, separate accusation from the February charges against DeepSeek, Moonshot, and MiniMax. Alibaba (Qwen) was not named in the original February blog post.",
    url: "https://www.bbc.com",
  },
  {
    source: "PCMag",
    date: "July 22, 2026",
    headline: "China's Kimi K3 AI Model 'Cheated by Cloning US Tech'",
    summary:
      "PCMag reported that a White House official accused Kimi K3 of 'cloning US tech,' bringing the distillation controversy into the political spotlight. Microsoft and Nvidia CEOs subsequently backed Moonshot.",
    url: "https://www.pcmag.com/news/chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech",
  },
  {
    source: "A Few Thoughts on Cryptographic Engineering",
    date: "May 29, 2026",
    headline: "Let's Talk About Encrypted Reasoning",
    summary:
      "An independent cryptography blog confirmed that providers return hidden model thinking steps as base64-encoded blobs, signed with HMAC, and that clients ship the unmodified reasoning blob back on the next API turn. The blog explicitly references Fernet as the encryption scheme — providing technical corroboration for the distillation mechanism.",
    url: "https://blog.cryptographyengineering.com/2026/05/29/lets-talk-about-encrypted-reasoning/",
  },
];

export function NewsCoverageView(_props: { lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground/70">
        Public reporting on the distillation accusations. Click through to read the original sources.
      </div>
      <div className="space-y-2.5">
        {NEWS_ITEMS.map((item, i) => (
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
