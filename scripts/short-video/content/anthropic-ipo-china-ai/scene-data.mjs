// Anthropic IPO: the $107.3B listing, the first-day pop, and the next-day
// selloff in Hong Kong. Facts checked against 36Kr / Times Weekly, 2026-11-21.
// This is chart-led; the causal link between the IPO and the China selloff is
// explicitly marked as an interpretation, not a proven cause.

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    arcRole: "establisher",
    narrativeRole: "S",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/anthropic-ipo-photo.jpg",
      source: "36Kr / Times Weekly Anthropic IPO photo, 2026-11-21",
      fit: "cover",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.45,
    },
    voiceover:
      "36Kr reported Anthropic's 107 billion dollar IPO did not lift AI stocks. MiniMax fell 10.8 percent.",
    texts: {
      badge: "CHINA AI",
      subject: "ANTHROPIC IPO",
      bigNumber: "10.8%",
      numberLabel: "MINIMAX DROP NEXT DAY",
      stats: [
        { num: "$107.3B", unit: "", label: "TOTAL RAISED" },
        { num: "$1.27T", unit: "", label: "FIRST-DAY CAP" },
      ],
      source: "36KR / NASDAQ",
    },
  },
  {
    id: 2,
    name: "ipo",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "initial",
    narrativeRole: "T",
    media: null,
    voiceover:
      "Anthropic raised 107.3 billion dollars, closed its first day up 17 percent, and reached a 1.27 trillion dollar market cap.",
    texts: {
      bigNumber: "$107B",
      label: "IPO + PRIVATE PLACEMENT",
      subtext: "FIRST DAY +17.07% · $1.27T CAP",
      source: "36KR / NASDAQ",
    },
  },
  {
    id: 3,
    name: "selloff",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "initial",
    narrativeRole: "A",
    media: null,
    voiceover:
      "The next day, Hong Kong sold the model trade. MiniMax fell 10.8 percent, Zhipu 7.17, and Hang Seng Tech dropped more than 4 percent intraday.",
    texts: {
      bigNumber: "-10.8%",
      label: "MINIMAX · NOV 20",
      subtext: "ZHIPU -7.17% · HSTECH -4%",
      source: "36KR / HKEX",
    },
  },
  {
    id: 4,
    name: "business",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "initial",
    narrativeRole: "A",
    media: null,
    voiceover:
      "Anthropic reported 4.59 billion dollars of 2025 revenue, up over ten times, against an 8.06 billion dollar operating loss.",
    texts: {
      bigNumber: "$4.59B",
      label: "2025 REVENUE",
      subtext: "+1,088% · OPERATING LOSS $8.06B",
      source: "36KR / PROSPECTUS",
    },
  },
  {
    id: 5,
    name: "repricing",
    visualType: "narrative",
    layout: "media-bottom-bar",
    arcRole: "peak",
    narrativeRole: "R",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/hkex-towers-night.jpg",
      source: "Hong Kong financial district stock photo, Pexels",
      fit: "cover",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.35,
    },
    voiceover:
      "The market now asks about revenue durability, gross margin, cash flow, and customer retention, not just model scores.",
    texts: {
      company: "CHINA AI",
      action: "REVENUE",
      result: "MARGIN",
      source: "36KR",
    },
  },
  {
    id: 6,
    name: "caveat",
    visualType: "narrative",
    layout: "stacked-cards",
    arcRole: "release",
    narrativeRole: "R",
    media: null,
    voiceover:
      "One day is not a trend. The selloff started before Anthropic's debut, and Anthropic still lost 8 billion dollars in 2025.",
    texts: {
      badge: "THE CAVEAT",
      company: "SINGLE DAY SNAPSHOT",
      action: "SELLOFF STARTED FIRST",
      context: "2025 OPERATING LOSS $8.06B",
      result: "CAUSAL LINK UNPROVEN",
      source: "36KR / NASDAQ",
    },
  },
  {
    id: 7,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    arcRole: "release",
    media: null,
    voiceover:
      "If the leader cannot hold the premium, who can?",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "ANTHROPIC IPO · CHINA AI",
    },
  },
];

export const metadata = {
  title: "Anthropic's $107B IPO Helped Reprice China's AI Stocks",
  description:
    "Anthropic raised $107.3B in its Nasdaq IPO and closed its first day at a $1.27T market cap, up 17.07%. The next day Hong Kong sold the model trade: MiniMax fell 10.8%, Zhipu 7.17%, and Hang Seng Tech dropped more than 4% intraday. The selloff began before the IPO, and Anthropic still reported an $8.06B operating loss, so the repricing read is an interpretation rather than a proven cause.",
  commentHook:
    "Anthropic's IPO popped, then China's AI stocks sold off. Is this a repricing or just a bad day?",
  trendingChecked: true,
  sources: [
    "https://36kr.com/p/4079074198705280",
    "https://www.bloomberg.com/news/articles/2026-11-20/anthropic-share-slump-nearly-erases-ipo-pop-as-ai-trade-unravels",
    "https://techcrunch.com/2026/11/19/at-nasdaq-opening-bell-anthropic-ceo-recommits-to-pacing-ai-development/",
  ],
};
