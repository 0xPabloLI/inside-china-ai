/**
 * Scene data for SenseTime latest news video.
 * 7 scenes covering: revenue, generative AI, EBITDA, Galaxy Plan, U1 Pro, China AI.
 *
 * Scenes 2-6 use "narrative" visualType with media backgrounds (Pexels images).
 * Scene 1 (hook) and Scene 7 (cta) use shared templates (ignore media).
 *
 * Sources: SenseTime 2025 Annual Report, Yicai, WAIC 2026
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "SenseTime just posted its strongest year ever. According to its 2025 annual report, revenue topped $700M, or 5 billion RMB, up 33%, and EBITDA turned positive for the first time since IPO.",
    texts: {
      badge: "BREAKING",
      subject: "SENSETIME",
      hookText: "$700M / ¥5B",
      revealText: "STRONGEST YEAR EVER",
      stats: [
        { num: "33%", unit: "", label: "REVENUE GROWTH" },
        { num: "58.6%", unit: "", label: "LOSS NARROWED" },
      ],
      source: "SOURCE: SenseTime 2025 Annual Report",
    },
  },
  {
    id: 2,
    name: "financials",
    visualType: "narrative",
    media: {
      type: "image",
      path: "assets/financial-chart.jpg",
      source: "Pexels: Jakub Zerdzicki",
      animation: "ken-burns",
      overlay: 0.75,
    },
    voiceover:
      "According to SenseTime's 2025 results, generative AI revenue hit $500M, or 3.6 billion RMB, up 51%, now over 70% of total revenue.",
    texts: {
      badge: "THE NUMBERS",
      company: "GENERATIVE AI",
      action: "REVENUE SURGED 51%",
      result: "$500M / ¥3.6B",
      context: "NOW 70%+ OF TOTAL REVENUE",
      source: "SOURCE: SenseTime Financial Report, March 2026",
    },
  },
  {
    id: 3,
    name: "ebitda-turn",
    visualType: "narrative",
    media: {
      type: "image",
      path: "assets/revenue-laptop.jpg",
      source: "Pexels: Adventure Studio",
      animation: "fade",
      overlay: 0.72,
    },
    voiceover:
      "Yicai reported the real milestone: second-half EBITDA hit $53M, or 380 million RMB, and operating cash flow turned positive for the first time since listing.",
    texts: {
      badge: "MILESTONE",
      company: "CASH FLOW",
      action: "EBITDA TURNED POSITIVE",
      result: "FIRST TIME SINCE IPO",
      context: "$53M (¥380M) H2 EBITDA + $1.5B (¥10.9B) CASH RESERVES",
      source: "SOURCE: Yicai, March 2026",
    },
  },
  {
    id: 4,
    name: "galaxy-plan",
    visualType: "narrative",
    media: {
      type: "image",
      path: "assets/data-center.jpg",
      source: "Pexels: Brett Sayles",
      animation: "ken-burns",
      overlay: 0.73,
    },
    voiceover:
      "At WAIC 2026, SenseTime co-founder Yang Fan announced the Galaxy Plan with 20 partners to build 5 domestic ten-thousand-card compute clusters.",
    texts: {
      badge: "WAIC 2026",
      company: "GALAXY PLAN",
      action: "5 TEN-THOUSAND-CARD CLUSTERS",
      result: "20 PARTNERS JOINED",
      context: "DAILY TOKEN VOLUME: 2.4T, TARGETING 10T BY YEAR-END",
      source: "SOURCE: SenseTime, July 2026",
    },
  },
  {
    id: 5,
    name: "u1-pro",
    visualType: "narrative",
    media: {
      type: "image",
      path: "assets/ai-robot-hand.jpg",
      source: "Pexels: Tara Winstead",
      animation: "zoom",
      overlay: 0.72,
    },
    voiceover:
      "CEO Xu Li also unveiled SenseNova U1 Pro, a delivery-grade multimodal agent model that moves AI from generating content to completing tasks.",
    texts: {
      badge: "NEW MODEL",
      company: "SENSENOVA U1 PRO",
      action: "FROM GENERATION TO DELIVERY",
      result: "MULTIMODAL AGENT",
      context: "DELIVERY-GRADE FOUNDATION MODEL FOR AGENTS",
      source: "SOURCE: SenseTime, July 2026",
    },
  },
  {
    id: 6,
    name: "bigger-picture",
    visualType: "narrative",
    media: {
      type: "image",
      path: "assets/shanghai-skyline.jpg",
      source: "Pexels: Margo Evardson",
      animation: "ken-burns",
      overlay: 0.75,
    },
    voiceover:
      "For China AI, SenseTime's turnaround signals that domestic AI infrastructure is moving from burning cash to generating real revenue.",
    texts: {
      badge: "BIGGER PICTURE",
      company: "CHINA AI INFRA",
      action: "FROM BURNING CASH",
      result: "TO REAL REVENUE",
      context: "GROSS MARGIN 20%+ AND SERVICE GROWTH 25X",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 7,
    name: "cta",
    visualType: "cta",
    voiceover:
      "The takeaway: from $700M in revenue to positive cash flow, SenseTime proved China AI can be profitable. The next question is who follows.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
