export type FundingStatus = "self-funded" | "target" | "completed" | "paused";

export interface FundingRound {
  date: string;
  status: FundingStatus;
  event: string;
  amount: number | null;
  amountNote: string;
  valuation: number | null;
  valuationNote: string;
  investors: string[];
  detail: string;
  source: string;
  sourceUrl: string;
  color: string;
}

export interface InvestorData {
  name: string;
  amount: number | null;
  color: string;
  note: string;
}

export const FUNDING_ROUNDS: FundingRound[] = [
  {
    date: "2023.07",
    status: "self-funded",
    event: "DeepSeek Founded",
    amount: null,
    amountNote: "Fully funded by High-Flyer",
    valuation: null,
    valuationNote: "No external valuation",
    investors: ["High-Flyer Quant"],
    detail:
      "Liang Wenfeng founded DeepSeek, fully backed by High-Flyer Quant. No external funding.",
    source: "Wikipedia — DeepSeek",
    sourceUrl: "https://en.wikipedia.org/wiki/DeepSeek",
    color: "#888888",
  },
  {
    date: "2026.04",
    status: "target",
    event: "Fundraising Launched",
    amount: null,
    amountNote: "Pure RMB structure",
    valuation: 10,
    valuationNote: "Target ~$10B",
    investors: ["Whitelist funds"],
    detail:
      "DeepSeek formally launched external fundraising with a pure RMB structure. Initial minimum commitment was 5B RMB per fund, later lowered to 1.5B. A 'fund whitelist' required institutions with real capital capacity and strong brands. The Information reported a target valuation of ~$10B on April 17.",
    source: "elsewhere + The Information",
    sourceUrl: "https://elsewhere.news/en/elsewhere/deepseek",
    color: "#5B8FF9",
  },
  {
    date: "2026.05",
    status: "target",
    event: "Valuation Jump + 4-Hour Investor Meeting",
    amount: null,
    amountNote: "Tencent Meeting·4hrs",
    valuation: 45,
    valuationNote: "Target ~$45B",
    investors: ["Confirmed investors"],
    detail:
      "Valuation target jumped from $10B to $45B in early May (The Silicon Review, May 7). In mid-May, DeepSeek held the legendary 'four-hour investor meeting' via Tencent Meeting. Liang spoke first, then Q&A. The investor lineup was mostly set, with two slots per firm. Liang emphasized: team stability is the core priority, more important than money or resources.",
    source: "elsewhere + The Silicon Review",
    sourceUrl:
      "https://elsewhere.news/en/elsewhere/wenfeng-liangs-four-hour-investor-meeting-full-transcript",
    color: "#A0C4E8",
  },
  {
    date: "2026.06",
    status: "completed",
    event: "First External Round Closed",
    amount: 7.4,
    amountNote: "~$7.4B (~50B RMB, English media)",
    valuation: 50,
    valuationNote: "Post-money ~$50B (English media)",
    investors: [
      "Monolith (3B RMB)",
      "IDG Capital (3B RMB)",
      "CATL ecosystem (Puquan Capital)",
      "Loyal Valley Capital",
      "Guozhi Investment (980M RMB)",
      "~100 institutions/individuals",
    ],
    detail:
      "DeepSeek closed its first external round, pure RMB structure, ~100 institutions/individuals participated (through fund structures). 10 named participants: Monolith 3B, IDG 3B, Guozhi 980M, CATL ecosystem (Puquan Capital), Loyal Valley Capital. Hillhouse/HSG absent. Liang's top requirement: don't poach DeepSeek's people. elsewhere confirmed the round but did not disclose specific totals; $7.4B/$50B from English tech media.",
    source: "elsewhere + TechStartups (2026-06-17)",
    sourceUrl: "https://elsewhere.news/en/elsewhere/deepseek",
    color: "#5AD8A6",
  },
  {
    date: "2026.07",
    status: "target",
    event: "Round 2 Target $71B",
    amount: null,
    amountNote: "—",
    valuation: 71,
    valuationNote: "Pre-money ~$71B (+42%)",
    investors: ["TBD"],
    detail:
      "Financial Times reported on July 14 that DeepSeek is seeking a second round at ~$71B pre-money valuation, a 42% jump from June's $50B. Cryptonomist reported simultaneously. IPO preparations also reported, targeting 2027 listing.",
    source: "Financial Times + Cryptonomist (2026-07-14)",
    sourceUrl: "https://en.cryptonomist.ch/2026/07/14/deepseek-new-funding/",
    color: "#F6BD16",
  },
  {
    date: "2026.07.25",
    status: "paused",
    event: "Round 2 Paused (Leaked Remarks Go Viral)",
    amount: null,
    amountNote: "—",
    valuation: 71,
    valuationNote: "Round 2 pre-money target ~$71B (paused)",
    investors: ["TBD"],
    detail:
      "Bloomberg reported (Haze Fan & Pei Li, July 25) that DeepSeek told prospective investors in its second fundraising round to suspend the deal. Cause: Liang Wenfeng's comments to investors were leaked and went viral on social media, including sensitive remarks about Nvidia. Liang was frustrated by the leaks. Syndicated via Fortune, Tech in Asia, MSN, etc.",
    source: "Bloomberg — Haze Fan & Pei Li (2026-07-25)",
    sourceUrl:
      "https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/",
    color: "#EAB308",
  },
];

export const INVESTOR_DATA: InvestorData[] = [
  {
    name: "Monolith",
    amount: 3,
    color: "#5B8FF9",
    note: "3B RMB · Initially 1.5B, increased to 3B",
  },
  {
    name: "IDG Capital",
    amount: 3,
    color: "#5AD8A6",
    note: "3B RMB · Strong insurance-funded character",
  },
  {
    name: "Guozhi Investment",
    amount: 0.98,
    color: "#F6BD16",
    note: "980M RMB · Intentionally below 1B threshold",
  },
  {
    name: "CATL ecosystem (Puquan Capital)",
    amount: null,
    color: "#E86452",
    note: "Amount undisclosed · Xiamen/Ordos gov capital + CATL + National Green Development Fund",
  },
  {
    name: "Loyal Valley Capital",
    amount: null,
    color: "#6DC8EC",
    note: "Amount undisclosed · Among earliest VCs to talk with DeepSeek",
  },
  {
    name: "iHealth (Andon Health)",
    amount: null,
    color: "#945FB9",
    note: "Participated as LP · Backer behind multiple GPs",
  },
  {
    name: "Other ~90 institutions/individuals",
    amount: 43.02,
    color: "#C2C8D5",
    note: "Through fund structures · ~100 total participants",
  },
];
