import type { Lang } from "../deepseek/i18n";

export interface StockEvent {
  date: string;
  price: string;
  event: string;
  detail: string;
  source: string;
  url: string;
  highlight?: boolean;
}

export const MINIMAX_EVENTS: StockEvent[] = [
  {
    date: "March 2026",
    price: "HK$1,330",
    event: "Peak Stock Price",
    detail:
      "MiniMax Group Inc (HKEX: 0100.HK) reached its all-time high of HK$1,330, riding the AI boom and investor enthusiasm for Chinese AI companies.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
    highlight: true,
  },
  {
    date: "February 2026",
    price: "—",
    event: "Accused by Anthropic of Largest Distillation Volume",
    detail:
      "Anthropic's February 23 blog post accused MiniMax of 13M+ exchanges with Claude — the largest distillation volume among the three named labs. The accusation targeted agentic coding, tool use, and orchestration capabilities.",
    source: "Anthropic Official Blog",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
  },
  {
    date: "July 9, 2026",
    price: "~HK$1,090",
    event: "Lock-up Expiry Triggers 18% Single-Day Drop",
    detail:
      "Lock-up expiry released ~153 million shares (~48.9% of capital), triggering an 18% single-day drop. This was the beginning of the accelerated decline.",
    source: "Google Finance / HKEX filings",
    url: "https://www.google.com/finance/quote/0100:HKG",
    highlight: true,
  },
  {
    date: "July 2026",
    price: "—",
    event: "M3 Model Price Cut Within One Week",
    detail:
      "MiniMax's M3 model permanently cut its price within a week of launch, signaling weak market positioning and intensifying price competition in the Chinese LLM market.",
    source: "Industry reports",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
  {
    date: "July 2026",
    price: "—",
    event: "Emergency HK$16 Billion Capital Raise",
    detail:
      "MiniMax conducted an emergency HK$16 billion capital raise amid the stock collapse, seeking to shore up its financial position.",
    source: "HKEX filings",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
  {
    date: "Late July 2026",
    price: "~HK$186",
    event: "Stock Hits Low — Over 80% Decline from Peak",
    detail:
      "MiniMax stock fell to approximately HK$186, a decline of over 80% from its March peak. Drivers included: Anthropic's distillation accusations, M3 price cut, low consumer business margins, new AI companion regulations, and significant annual losses.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
    highlight: true,
  },
  {
    date: "August 3, 2026",
    price: "~HK$247",
    event: "Partial Recovery",
    detail:
      "As of August 3, MiniMax stock partially recovered to approximately HK$247, but remained over 81% below its March peak. Moonshot's IPO preparations continued to pressure MiniMax's stock as the market anticipated intensified competition.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
];

export function MinimaxStockView(_props: { lang: Lang }) {
  const prices = MINIMAX_EVENTS.filter((e) => e.price !== "—" && e.price.startsWith("HK$"));
  const maxPrice = Math.max(
    ...prices.map((e) => parseFloat(e.price.replace("HK$", "").replace("~", "").replace(",", ""))),
  );

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-muted-foreground/70">
        MiniMax Group Inc (HKEX: 0100.HK) stock collapse timeline. All data from Google Finance and HKEX filings.
      </div>

      {/* Price bar chart */}
      <div className="flex items-end gap-2 border-b border-border/40 pb-1" style={{ height: 120 }}>
        {prices.map((ev, i) => {
          const val = parseFloat(ev.price.replace("HK$", "").replace("~", "").replace(",", ""));
          const barH = Math.max(4, (val / maxPrice) * 90);
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
              <div className="text-[9px] font-bold text-muted-foreground">{ev.price}</div>
              <div
                className={`w-full max-w-[60px] rounded-t ${
                  ev.highlight
                    ? "bg-gradient-to-t from-red-500 to-red-400"
                    : "bg-gradient-to-t from-primary to-primary/70"
                }`}
                style={{ height: barH }}
              />
              <div className="mt-1 text-[8px] text-muted-foreground">{ev.date}</div>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="relative space-y-0">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/40" />
        {MINIMAX_EVENTS.map((ev, i) => (
          <div key={i} className="relative pl-7 pb-4 last:pb-0">
            <div
              className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 ${
                ev.highlight
                  ? "border-red-500 bg-red-500/20"
                  : "border-border bg-background"
              }`}
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-muted-foreground">{ev.date}</span>
              {ev.price !== "—" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-foreground">
                  {ev.price}
                </span>
              )}
            </div>
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
