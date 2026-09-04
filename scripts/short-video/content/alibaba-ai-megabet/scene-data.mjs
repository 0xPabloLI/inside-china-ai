/**
 * Scene data for Alibaba 80B HKD AI investment video.
 * 9 scenes covering: mega-offering announcement, insider buying,
 * Q1 financials, full-stack AI strategy, CEO confidence, market context.
 *
 * Narrative type: Breaking News (fact impact -> context -> impact -> next)
 * Hook formula: Shocking Number
 * Sources: HKEX announcement, Science and Technology Innovation Board Daily,
 * Alibaba investor relations, BofA Securities
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    media: {
      type: "image",
      path: "assets/pexels-alibaba-01.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "10 billion dollars. Alibaba just raised that for one thing: AI. Not for shopping. Not for shipping. Just AI.",
    texts: {
      badge: "BREAKING",
      subject: "ALIBABA",
      bigNumber: "$10B",
      numberLabel: "FOR AI ONLY",
      stats: [
        { num: "80B", unit: "HKD", label: "SHARE PLACEMENT" },
        { num: "100%", unit: "", label: "FOR AI" },
      ],
      source: "SOURCE: HKEX announcement, Aug 23, 2026",
    },
  },
  {
    id: 2,
    name: "tease",
    visualType: "narrative",
    layout: "media-bottom-bar",
    media: {
      type: "image",
      path: "assets/pexels-alibaba-cloud-01.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "First new stock sale since 2019. Jack Ma is buying shares himself. But where is all that money going?",
    texts: {
      badge: "FIRST SINCE 2019",
      company: "INSIDERS BUYING",
      action: "JACK MA + EXEC TEAM",
      result: "WHY NOW?",
      context: "FIRST NEW EQUITY OFFERING SINCE 2019 HK LISTING",
      source: "SOURCE: STC Daily, Aug 25, 2026",
    },
  },
  {
    id: 3,
    name: "the-deal",
    visualType: "narrative",
    layout: "media-bottom-bar",
    media: {
      type: "image",
      path: "assets/pexels-alibaba-02.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.73,
    },
    voiceover:
      "According to BofA, 710 million shares at 3x oversubscription. Net cash jumps to 41 billion. Sovereign funds led demand.",
    texts: {
      badge: "THE DEAL",
      company: "710M SHARES",
      action: "3X OVERSUBSCRIBED",
      result: "NET CASH: $41B+",
      context: "SOVEREIGN WEALTH FUNDS LED DEMAND",
      source: "SOURCE: BofA Securities, STC Daily",
    },
  },
  {
    id: 4,
    name: "q1-results",
    visualType: "narrative",
    layout: "media-split",
    media: {
      type: "image",
      path: "assets/searxng_image-alibaba-cloud-01.jpg",
      source: "SearXNG",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "Alibaba IR reported cloud revenue grew 45 percent. AI revenue hit 12.4 billion RMB. 12 straight quarters of triple-digit growth.",
    texts: {
      badge: "Q1 FY2027 RESULTS",
      company: "CLOUD REVENUE +45%",
      action: "12 QUARTERS OF 3X GROWTH",
      result: "AI REV: 12.4B RMB",
      context: "FASTEST CLOUD GROWTH IN 22 QUARTERS",
      source: "SOURCE: Alibaba IR, Aug 20, 2026",
    },
  },
  {
    id: 5,
    name: "capex-burn",
    visualType: "narrative",
    layout: "media-split",
    media: {
      type: "image",
      path: "assets/searxng_image-alibaba-02.jpg",
      source: "SearXNG",
      animation: "ken-burns",
      overlay: 0.74,
      focus: "center",
    },
    voiceover:
      "But growth costs money. Capex hit 67.7 billion RMB, up 75 percent. Free cash flow went negative 44 billion.",
    texts: {
      badge: "THE BURN",
      company: "CAPEX: 67.7B RMB",
      action: "UP 75% YEAR OVER YEAR",
      result: "FCF: NEG 44.7B RMB",
      context: "AGGRESSIVE INVESTMENT FOR MARKET SHARE PHASE",
      source: "SOURCE: Alibaba Q1 FY2027 report",
    },
  },
  {
    id: 6,
    name: "ceo-confidence",
    visualType: "narrative",
    layout: "media-overlay",
    media: {
      type: "image",
      path: "assets/brave_image-alibaba-01.jpg",
      source: "Brave Search",
      animation: "ken-burns",
      overlay: 0.73,
      focus: "center",
    },
    voiceover:
      "CEO Eddie Wu says AI capex pays back in 3 years, maybe 2. Next quarter AI revenue hits 10 billion. 2030 target: 100 billion cloud.",
    texts: {
      badge: "CEO EDDIE WU",
      company: "3-YEAR PAYBACK",
      action: "AI ARR APPROACHING $10B",
      result: "2030 GOAL: $100B CLOUD",
      context: "PAYBACK COULD SHORTEN TO 2 YEARS",
      source: "SOURCE: Alibaba Q1 earnings call",
    },
  },
  {
    id: 7,
    name: "full-stack",
    visualType: "narrative",
    layout: "media-overlay",
    media: {
      type: "image",
      path: "assets/unsplash-alibaba-cloud-01.jpg",
      source: "Unsplash",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "Alibaba restructured into four divisions. AI Cloud is core. T-Head chips power 650 companies. Qwen ranks first in global downloads.",
    texts: {
      badge: "FULL-STACK AI",
      company: "CHIPS TO APPS",
      action: "T-HEAD: 650+ COMPANIES",
      result: "QWEN: #1 GLOBALLY",
      context: "CLOUD #1 IN APAC, #2 GLOBALLY BY GROWTH",
      source: "SOURCE: Alibaba company data",
    },
  },
  {
    id: 8,
    name: "bigger-picture",
    visualType: "narrative",
    layout: "stacked-cards",
    media: {
      type: "image",
      path: "assets/searxng_image-alibaba-03.jpg",
      source: "SearXNG",
      animation: "ken-burns",
      overlay: 0.75,
      focus: "center",
    },
    voiceover:
      "Remember that 10 billion? It is a bet that owning chips, cloud, models, and apps wins the China AI race.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "THE $10B QUESTION",
      action: "ALL FOUR LAYERS",
      result: "WINNER TAKES ALL?",
      context: "NOT WHO SPENDS MOST. WHO SPENDS BEST.",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    layout: "cta",
    voiceover: "Alibaba just bet 10 billion dollars on AI. Follow for what happens next.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
