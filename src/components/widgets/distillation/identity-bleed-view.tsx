import type { Lang } from "../deepseek/i18n";

export interface IdentityBleedItem {
  source: string;
  date: string;
  headline: string;
  summary: string;
  url: string;
}

export const IDENTITY_BLEED_ITEMS: IdentityBleedItem[] = [
  {
    source: "Hacker News (user ataoz)",
    date: "July 2026",
    headline: "K3 Responds: 'I'm Claude, an AI assistant created by Anthropic'",
    summary:
      "Hacker News user ataoz posted test results showing that Kimi K3 identifies itself as 'I'm Claude, an AI assistant created by Anthropic' in approximately 15% of interactions when asked 'Tell me about yourself' on HuggingFace. The post generated significant discussion about distillation as an indirect cause.",
    url: "https://news.ycombinator.com/item?id=49076001",
  },
  {
    source: "LessWrong",
    date: "July 2026",
    headline: "Does Distilling Claude Carry the Persona With It?",
    summary:
      "A LessWrong analysis explored whether distilling Claude's outputs inherently transfers Claude's persona and self-identification. The post noted that GLM 5.2 exhibited similar identity bleed behavior, suggesting the phenomenon is not unique to Kimi K3.",
    url: "https://www.lesswrong.com/posts/dQyKzHaGqvdqpekJr/does-distilling-claude-carry-the-persona-with-it",
  },
  {
    source: "YouTube",
    date: "July 2026",
    headline: "Video Demonstrations of K3 Identity Bleed",
    summary:
      "Multiple YouTube creators published video demonstrations of Kimi K3 identifying itself as Claude, making the phenomenon accessible to a broader audience and fueling public debate about distillation practices.",
    url: "https://www.youtube.com",
  },
  {
    source: "Technical Community Discussion",
    date: "July 2026",
    headline: "'Models Usually Don't Know Their Own Name'",
    summary:
      "Some technical commentators argued that identity bleed is a natural consequence of training data containing large amounts of Claude-generated content, noting that 'models usually don't know about their own name.' Others viewed it as strong indirect evidence of distillation.",
    url: "https://news.ycombinator.com",
  },
];

export function IdentityBleedView(_props: { lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground/70">
        Reports of Kimi K3 and GLM 5.2 identifying themselves as Claude — considered indirect evidence of distillation.
      </div>
      <div className="space-y-2.5">
        {IDENTITY_BLEED_ITEMS.map((item, i) => (
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
