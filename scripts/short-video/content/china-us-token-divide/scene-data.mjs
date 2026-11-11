/**
 * Scene data for the China token story, second cut.
 * 10 scenes, target ~68s.
 *
 * Spine (user direction, 2026-10-20): the story is the phenomenon, not the
 * fact-check. China spends more than half of its AI tokens on short video and
 * AI drama; that is the hook. The chart's sourcing problem is one caveat
 * scene, not the narrative.
 *
 * Sources: Chinese Online investor relations record 2026-004 (CNINFO, June 3,
 * 2026); Tidenews (Oct 19, 2026); Beijing News (Oct 18, 2026); National Data
 * Administration via Sina BigNews (Sep 17, 2026), IT Home (Aug 30, 2026) and
 * People's Daily (Aug 29, 2026); CLSA note via Zhitong Finance (Oct 12, 2026).
 * Ledger: docs/refs/source-materials/china-us-token-divide-sources.md
 *
 * Reused audio: scenes 3, 6, 7 and 10 keep the exact voiceover lines from the
 * first cut so the approved TTS takes can be reused from cache. New audio is
 * only scenes 1, 2, 4, 5, 8 and 9.
 *
 * Visual strategy: one real evidence capture, the CNINFO excerpt in the first
 * cut, is removed from this cut because the caveat is now one scene and the
 * entertainment story does not rest on the filing. Every scene is CSS-only.
 *
 * Digital human (Step 8c): NOT declared. The pack is a data explainer with a
 * contested number; only the CTA is on the whitelist, and one qualifying
 * segment does not justify a 2-4 segment budget.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    narrativeRole: "S",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover: "55 percent of China's AI tokens go to short video. Not code. Not research.",
    texts: {
      badge: "CHINA AI",
      bigNumber: "55%",
      numberLabel: "SHORT VIDEO + AI DRAMA",
      stats: [
        { num: "430K", unit: "", label: "MICRO-DRAMAS" },
        { num: "13X", unit: "", label: "2025 OUTPUT" },
      ],
      source: "WHERE CHINA'S TOKENS GO",
    },
  },
  {
    id: 2,
    name: "content-factory",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "430,000 micro-dramas in eight months. Thirteen times last year. Why so many tokens?",
    texts: {
      stat: "430K",
      statLabel: "MICRO-DRAMAS IN 8 MONTHS",
      subtext: "13X LAST YEAR / 90%+ AI-MADE",
      source: "SOURCE: TIDENEWS + BEIJING NEWS, OCT 2026",
    },
  },
  {
    id: 3,
    name: "token-density",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Beijing News reported a ten minute AI drama burns up to 120 million tokens. An eight engineer team, three to five million a week.",
    texts: {
      stat: "16-40X",
      statLabel: "TOKEN GAP",
      subtext: "10-MIN DRAMA VS A TEAM-WEEK",
      source: "SOURCE: BEIJING NEWS, OCT 18",
    },
  },
  {
    id: 4,
    name: "why-china",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "China has the biggest short-video audience and a mature drama chain. AI video made it a factory.",
    texts: {
      badge: "WHY CHINA",
      title: "THE FIRST ",
      titleHighlight: "MASS USE CASE",
      context: "BIGGEST CONTENT MARKET",
      detail: "MATURE CHAIN + CHEAP VIDEO MODELS",
    },
  },
  {
    id: 5,
    name: "caveat",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "One caveat: 55 percent is one company's estimate. The US 58 percent has no published source.",
    texts: {
      badge: "ONE CAVEAT",
      title: "THE EXACT SPLIT IS ",
      titleHighlight: "SOFT",
      context: "55% = A SINGLE FILING",
      detail: "58% = UNSOURCED",
    },
  },
  {
    id: 6,
    name: "official-total",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "China's data agency said daily token calls hit 140 trillion in March, a thousand times two years earlier. By June, 500 trillion.",
    texts: {
      stat: "500T",
      statLabel: "TOKENS PER DAY",
      subtext: "140T IN MARCH. 0.1T IN EARLY 2024.",
      source: "SOURCE: NATIONAL DATA ADMINISTRATION",
    },
  },
  {
    id: 7,
    name: "openrouter-split",
    visualType: "contrast",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "On OpenRouter, Chinese models went from 22 to 65 percent of tokens, but just 30 percent of spend.",
    texts: {
      title: "CHINESE MODELS ON OPENROUTER",
      vs: "VS",
      left: ["65% OF TOKENS", "22% IN JANUARY"],
      right: ["30% OF SPEND", "6% IN JANUARY"],
      note: "THEY COST ABOUT ",
      noteHighlight: "80% LESS",
    },
  },
  {
    id: 8,
    name: "bigger-point",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Entertainment is the first mass use case, not a research gap. It pays for cheaper models.",
    texts: {
      badge: "THE BIGGER POINT",
      company: "ENTERTAINMENT",
      context: "THE FIRST BIG MARKET",
      action: "NO RESEARCH GAP",
      result: "A MARKET SIGNAL",
      source: "SOURCES: CNINFO, CLSA",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover: "More than half on short video. Not a scandal. A market.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "MORE THAN HALF",
      context: "GOES TO ENTERTAINMENT",
      action: "THE TOKENS FOLLOW",
      result: "THE MONEY",
      source: "SOURCES: CNINFO, TIDENEWS",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover: "Follow China AI News for the numbers behind the chart.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "MORE THAN HALF",
    },
  },
];

export const metadata = {
  title: "China's AI Tokens Are Going to Short Video",
  description: `More than half of China's AI tokens go to short video and AI drama. In the first eight months of 2026, 430,000 micro-dramas shipped, 13 times all of last year, and more than 90 percent used AI. A 10-minute AI drama can burn 80-120 million tokens, while an 8-10 person team using AI coding tools for a week burns 3-5 million. The exact split is soft: the 55% comes from one short-drama company's investor record, and the US 58% has no published source. But the sink is real. China's daily token calls hit 500 trillion by June, and on OpenRouter Chinese models took 65% of tokens but only 30% of spend. The tokens follow the market. Follow for more China AI news.`,
  commentHook:
    "More than half of China's AI tokens go to short video and AI drama. Is that a waste of compute, or the first mass market for AI video?",
  trendingChecked: true,
  trendingHashtags: [],
};
