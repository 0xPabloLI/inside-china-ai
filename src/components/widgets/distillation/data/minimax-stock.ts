export interface StockPoint {
  date: string;
  shortDate: string;
  price: number | null; // HK$, null = no price data
  event: string;
  detail: string;
  source: string;
  url: string;
  highlight?: boolean;
}

export const STOCK_POINTS: StockPoint[] = [
  {
    date: "Feb 2026",
    shortDate: "Feb",
    price: null,
    event: "Accused by Anthropic",
    detail:
      "MiniMax accused of 13M+ exchanges with Claude — the largest distillation volume among the three named labs.",
    source: "Anthropic Blog",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
  },
  {
    date: "Mar 2026",
    shortDate: "Mar",
    price: 1330,
    event: "Peak Stock Price",
    detail:
      "MiniMax Group Inc (HKEX: 0100.HK) reached its all-time high of HK$1,330, riding the AI boom.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
    highlight: true,
  },
  {
    date: "Jul 9, 2026",
    shortDate: "Jul 9",
    price: 1090,
    event: "Lock-up Expiry → 18% Drop",
    detail:
      "Lock-up expiry released ~153M shares (~48.9% of capital), triggering an 18% single-day drop. Beginning of accelerated decline.",
    source: "HKEX filings",
    url: "https://www.google.com/finance/quote/0100:HKG",
    highlight: true,
  },
  {
    date: "Jul 2026",
    shortDate: "Jul",
    price: 600,
    event: "M3 Price Cut + Capital Raise",
    detail:
      "M3 model permanently cut price within a week of launch. Emergency HK$16B capital raise conducted amid the stock collapse.",
    source: "Industry reports",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
  {
    date: "Late Jul 2026",
    shortDate: "Jul 28",
    price: 186,
    event: "Stock Hits Low — 86% Decline",
    detail:
      "MiniMax stock fell to ~HK$186, a decline of over 80% from peak. Drivers: distillation accusations, M3 price cut, low margins, new AI companion regulations, annual losses.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
    highlight: true,
  },
  {
    date: "Aug 3, 2026",
    shortDate: "Aug 3",
    price: 247,
    event: "Partial Recovery",
    detail:
      "Stock partially recovered to ~HK$247, but remained 81% below peak. Moonshot IPO preparations continued to pressure the stock.",
    source: "Google Finance",
    url: "https://www.google.com/finance/quote/0100:HKG",
  },
];

export const SUMMARY_CARDS = [
  { val: "HK$1,330", label: "Peak (Mar)", color: "text-green-600" },
  { val: "HK$186", label: "Low (Jul)", color: "text-red-500" },
  { val: "-86%", label: "Peak Decline", color: "text-red-500" },
  { val: "HK$16B", label: "Emergency Raise", color: "text-amber-600" },
];
