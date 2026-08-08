// English-only widget copy (EN/中文 toggle removed — content pipeline
// requires widgets in English).

export interface I18NTexts {
  sectionPeople: string;
  sectionCompanies: string;
  departLabel: string;
  salaryLabel: string;
  salaryConfirmed: string;
  salaryRumored: string;
  infoBoxTitle: string;
  infoBoxItems: { highlight: string; text: string }[];
  sourceText: { label: string; url: string }[];
  disclaimer: string;
  companiesSource: string;
  companiesDisclaimer: string;
  tcLabelFlow: string;
  tcLabelRole: string;
  tcLabelSalary: string;
  // Funding
  fundingDetailTitle: string;
  fundingSourceList: { label: string; url: string }[];
  fundingDisclaimer: string;
  // Pricing
  pricingSubtitle: string;
  legendDomestic: string;
  legendOverseas: string;
  // Tab labels
  tabCloud: string;
  tabTalent: string;
  tabCompanies: string;
  tabPricing: string;
  tabFunding: string;
}

export const I18N: I18NTexts = {
  sectionPeople: "Key R&D Personnel Movements (Public Reports)",
  sectionCompanies: "Companies Mentioned & Remarks",
  departLabel: "Left",
  salaryLabel: "Salary",
  salaryConfirmed: "Confirmed",
  salaryRumored: "Rumored",
  infoBoxTitle: "Key Background",
  infoBoxItems: [
    {
      highlight: "Zero External Funding",
      text: ": DeepSeek refused all external investment, solely funded by parent company High-Flyer Quant's profits",
    },
    {
      highlight: "Salary Gap",
      text: ": Competitors offer 2-3x DeepSeek's compensation, some with 8-figure total packages",
    },
    {
      highlight: "Equity Issues",
      text: ": Employee stock options lack valuation support, near-zero liquidity",
    },
    {
      highlight: "Four Tech Lines Hit",
      text: ": Five departures drained base model, reasoning, OCR, and multimodal teams",
    },
    {
      highlight: "First Fundraising",
      text: ": DeepSeek is conducting its first external round (~70B RMB), primarily to retain employees",
    },
    {
      highlight: "Industry Context",
      text: ": China's AI talent gap exceeds 5.8M, core tech roles gap exceeds 800K",
    },
  ],
  sourceText: [
    {
      label: 'NetEase — "DeepSeek V4 Technical Report Reveals Departure List" (2026-04-28)',
      url: "https://www.163.com/dy/article/KRF1LGE505566SCS.html",
    },
    { label: "36kr — AI talent reports (2026-06)", url: "https://36kr.com" },
    {
      label: "AI Industry Talent Development Report (2025-2026)",
      url: "https://www.caict.ac.cn",
    },
  ],
  disclaimer:
    'Disclaimer: Information compiled from public media reports. V4 report marks 10 as "departed"; public reports name only 5 core members. Wei Haoran\'s move to "Baidu (suspected)" is inferred from a 36kr report.',
  companiesSource:
    "Source: Liang Wenfeng Investor Meeting transcript (compiled 2026-07-16) · Total duration ~3h44m",
  companiesDisclaimer:
    "Disclaimer: All quotes are transcribed from audio. Some proper nouns and numbers may have recognition errors. Tone tags are labeled by the compiler for reference only.",
  tcLabelFlow: "Destination",
  tcLabelRole: "DeepSeek Role",
  tcLabelSalary: "Salary",
  fundingDetailTitle: "Funding Details",
  fundingSourceList: [
    {
      label: "elsewhere — The DeepSeek Financing Story (2026-06-17)",
      url: "https://elsewhere.news/en/elsewhere/deepseek",
    },
    {
      label: "elsewhere — Wenfeng Liang Investor Meeting Transcript (2026-07-22)",
      url: "https://elsewhere.news/en/elsewhere/wenfeng-liangs-four-hour-investor-meeting-full-transcript",
    },
    {
      label: "Bloomberg — Funding Pause Report (2026-07-25) · Haze Fan & Pei Li",
      url: "https://www.bloomberg.com/news/articles/2026-07-25/deepseek-said-to-tell-backers-of-funding-pause-after-viral-posts",
    },
    { label: "Financial Times — Round 2 Valuation (2026-07-14)", url: "https://www.ft.com" },
    {
      label: "The Information — First Round Report (2026-04-17)",
      url: "https://www.theinformation.com",
    },
    {
      label: "The Silicon Review — $45B Valuation (2026-05-07)",
      url: "https://www.thesiliconreview.com",
    },
    {
      label: "TechStartups — $7.4B at $50B valuation (2026-06-16)",
      url: "https://techstartups.com",
    },
    { label: "Cryptonomist — Round 2 Report (2026-07-14)", url: "https://en.cryptonomist.ch" },
    { label: "Wikipedia — DeepSeek / High-Flyer", url: "https://en.wikipedia.org/wiki/DeepSeek" },
  ],
  fundingDisclaimer:
    "Disclaimer: Timeline, investor list, and pure RMB structure verified by elsewhere. Total amount ($7.4B) and valuation ($50B) from English tech media TechStartups (not a major outlet; may be derived from 50B RMB conversion), elsewhere did not disclose specific totals. July 25 funding pause reported by Bloomberg (Haze Fan & Pei Li; syndicated via Fortune, etc.), caused by leaked investor meeting remarks going viral. $71B round 2 target from FT/Cryptonomist. ~100 institutions is an elsewhere estimate. Hillhouse/HSG absence confirmed by multiple sources.",
  pricingSubtitle:
    "Unit: USD / Million Tokens (cache miss) · RMB converted at 1 USD = {rate} RMB · July 2026",
  legendDomestic: "Domestic (RMB→USD, 1:{rate})",
  legendOverseas: "Overseas (USD)",
  tabCloud: "Cloud",
  tabTalent: "Talent",
  tabCompanies: "Companies",
  tabPricing: "Pricing",
  tabFunding: "Funding",
};
