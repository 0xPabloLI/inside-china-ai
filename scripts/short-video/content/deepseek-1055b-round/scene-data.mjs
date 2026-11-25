// DeepSeek's second round is now registered. The angle: the cap table, the control structure, and the caveat.
// Facts checked against Guancha / Qichacha, 2026-11-19.

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    hookFamily: "result-first",
    narrativeRole: "S",
    arcRole: "establisher",
    retentionMechanism: null,
    media: null,
    voiceover:
      "DeepSeek's second round is official. About 15.8 billion dollars raised, at a valuation of 92 billion.",
    voiceoverTts:
      "DeepSeek's second round is official. About 15.8 billion dollars raised, at a valuation of 92 billion.",
    texts: {
      badge: "CHINA AI · NOV 19",
      subject: "DEEPSEEK",
      bigNumber: "$15.8B",
      numberLabel: "$15.8B · ¥105.5B SECOND ROUND",
      stats: [
        { num: "$92.0B", unit: "", label: "≈ ¥615.5B POST-MONEY" },
        { num: "31", unit: "", label: "NEW INVESTORS" },
      ],
      source: "QICHACHA REGISTRATION · NOV 19",
    },
  },
  {
    id: 2,
    name: "round",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    retentionMechanism: null,
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/deepseek-cap-table.jpg",
      source: "Guancha cap-table screenshot",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.0,
    },
    voiceover:
      "The registration change landed on November 19: about 15.8 billion dollars raised, at a post-money valuation of about 92 billion dollars.",
    texts: {
      company: "SECOND ROUND",
      action: "$15.8B / ¥105.5B",
      result: "$92.0B / ¥615.5B",
    },
  },
  {
    id: 3,
    name: "investors",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    retentionMechanism: "open-loop",
    media: null,
    voiceover:
      "Tencent and CATL each took a little over nine percent. China Mobile and CITIC Securities each took a little over seven percent. Those are the four biggest outside holders.",
    voiceoverTts:
      "Tencent and CATL each took a little over nine percent. China Mobile and CITIC Securities each took a little over seven percent. Those are the four biggest outside holders.",
    texts: {
      badge: "WHO PAID",
      company: "TENCENT + CATL",
      action: "9.5653% EACH",
      context: "CHINA MOBILE + CITIC",
      result: "7.6522% EACH",
      source: "GUANCHA / QICHACHA",
    },
  },
  {
    id: 4,
    name: "structure",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    retentionMechanism: null,
    media: null,
    voiceover:
      "The cash sits in a holding partnership. Investors get cash flow, not votes. Liang keeps control.",
    texts: {
      badge: "THE STRUCTURE",
      company: "HOLDING VEHICLE",
      action: "CASH, NOT VOTES",
      context: "LIANG KEEPS CONTROL",
      result: "SAME AS ROUND ONE",
      source: "GUANCHA, NOV 19",
    },
  },
  {
    id: 5,
    name: "prior-round",
    visualType: "stat-reveal",
    layout: "hero-center",
    narrativeRole: "A",
    arcRole: "peak",
    retentionMechanism: "pattern-interrupt",
    media: null,
    voiceover:
      "In June, the first round raised about $7.6 billion, or 51 billion yuan. The second round is roughly double.",
    texts: {
      bigNumber: "2X",
      label: "SECOND ROUND VS FIRST",
      subtext: "$7.6B→$15.8B · ¥51B→¥105.5B",
      source: "GUANCHA / QICHACHA",
    },
  },
  {
    id: 6,
    name: "ipo",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    retentionMechanism: "open-loop",
    media: null,
    voiceover:
      "Reuters reported DeepSeek hired CITIC Securities for a possible STAR IPO. No timing or price is set.",
    texts: {
      badge: "THE NEXT STEP",
      company: "STAR MARKET",
      action: "CITIC SECURITIES REPORTED",
      context: "TIMING, SIZE, PRICE",
      result: "NOT SET",
      source: "REUTERS VIA GUANCHA",
    },
  },
  {
    id: 7,
    name: "state-capital",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaRole: "card",
    media: {
      type: "image",
      path: "assets/deepseek-whale.png",
      source: "DeepSeek official mark",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.0,
    },
    voiceover:
      "State investors put in more than one fifth. That is a different kind of money.",
    texts: {
      company: "STATE CAPITAL",
      action: "MORE THAN 1/5",
      result: "OF THIS ROUND",
    },
  },
  {
    id: 8,
    name: "caveat",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    media: null,
    voiceover:
      "One caveat: this is registration data, not a company announcement. DeepSeek has not confirmed it.",
    texts: {
      badge: "THE CAVEAT",
      company: "REGISTRATION DATA",
      action: "NO OFFICIAL WORD",
      context: "NO COMPANY RELEASE",
      result: "TREAT AS REPORTED",
      source: "GUANCHA / QICHACHA",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    arcRole: "release",
    retentionMechanism: "loop-closure",
    media: null,
    voiceover:
      "About $15.8 billion, or 105.5 billion yuan. The question is whether money can still buy frontier compute. Follow China AI News for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "DEEPSEEK · $15.8B ROUND",
    },
  },
];

export const metadata = {
  title: "DeepSeek's ¥105.5B Round Is Now Official",
  description:
    "DeepSeek's second round is registered at 105.5 billion yuan raised and a 615.5 billion yuan post-money valuation. Tencent and CATL each hold 9.5653%. The money sits in a holding partnership; Liang Wenfeng keeps control. The figures come from registration data, not a company announcement.",
  commentHook:
    "DeepSeek raised 105.5 billion yuan at a 615.5 billion valuation. Is this the price of frontier AI now?",
  trendingChecked: true,
  sources: [
    "https://www.guancha.cn/CaiJing/2026_11_19_909123.shtml",
    "https://36kr.com/p/4076585941063552",
  ],
};
