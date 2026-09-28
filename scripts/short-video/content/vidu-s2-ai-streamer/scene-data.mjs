/**
 * Scene data for Vidu S2 real-time interaction model + AI host Ziying livestream.
 * 8 scenes covering: 20K viewer rush, KPI stakes, earnings result, Vidu S2 tech,
 * three breakthroughs, benchmarks, bigger picture, CTA.
 *
 * Narrative type: Breaking News (result-first -> stakes -> result -> tech -> impact)
 * Hook formula: P1 Result-First (20,000 viewers + AI earned money)
 * Sources: 新智元 (New Zhiyuan) report via WeChat, Shengshu Technology, StreamAV-Bench
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/duckduckgo_images-shengshu-technology-02.jpg",
      source: "DuckDuckGo Images",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "20,000 people rushed a livestream. The host was not human. She was an AI who had to earn money or get shut off.",
    texts: {
      badge: "BREAKING",
      subject: "VIDU S2",
      bigNumber: "20,000",
      numberLabel: "VIEWERS IN 5 MIN",
      revealText: "AI HOST EARNED REAL MONEY",
      stats: [
        { num: "24,184", unit: "", label: "REVENUE DAY 1" },
        { num: "80,000", unit: "", label: "KPI OR RESET" },
      ],
      source: "SOURCE: New Zhiyuan report, Sept 2026",
    },
  },
  {
    id: 2,
    name: "stakes",
    visualType: "narrative",
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/brave_image-zaomeng-ciyuan-02.jpg",
      source: "Brave Image Search",
      animation: "ken-burns",
      overlay: 0.73,
    },
    voiceover:
      "Her name is Ziying. Two hours to hit 80,000 revenue value, about 8,000 yuan, or get cut off and memory wiped.",
    texts: {
      badge: "THE STAKES",
      company: "AI HOST ZIYING",
      action: "HIT KPI OR GET RESET",
      result: "80,000 REVENUE TARGET",
      context: "2-HOUR WINDOW, MEMORY WIPE ON FAIL",
      source: "SOURCE: New Zhiyuan report via WeChat",
    },
  },
  {
    id: 3,
    name: "result",
    visualType: "narrative",
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/tavily_images-zaomeng-ciyuan-02.jpg",
      source: "Tavily Images",
      animation: "zoom",
      overlay: 0.72,
    },
    voiceover:
      "New Zhiyuan reported she missed round one. After resets she kept earning. Day one, 5 hours in, revenue hit 24,184.",
    texts: {
      badge: "THE RESULT",
      company: "DAY 1 EARNINGS",
      action: "MISSED THEN RECOVERED",
      result: "24,184 FINAL REVENUE",
      context: "ROUND 2 NEARLY DOUBLED, ROUND 3 BEAT ROUND 2",
      source: "SOURCE: New Zhiyuan report via WeChat",
    },
  },
  {
    id: 4,
    name: "tech",
    visualType: "narrative",
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/tavily_images-zaomeng-ciyuan-03.jpg",
      source: "Tavily Images",
      animation: "ken-burns",
      overlay: 0.73,
    },
    voiceover:
      "Shengshu Technology built Vidu S2, the model behind her. Tsinghua professor Zhu Jun's student Zhang Jintao leads it.",
    texts: {
      badge: "THE TECH",
      company: "VIDU S2 BY SHENGSHU",
      action: "BUILT BY TSINGHUA TEAM",
      result: "SHENGSHU TECHNOLOGY",
      context: "LED BY ZHANG JINTAO UNDER PROFESSOR ZHU JUN",
      source: "SOURCE: Shengshu Technology, Sept 2026",
    },
  },
  {
    id: 5,
    name: "breakthroughs",
    visualType: "narrative",
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/duckduckgo_images-zaomeng-ciyuan-02.jpg",
      source: "DuckDuckGo Images",
      animation: "fade",
      overlay: 0.72,
    },
    voiceover:
      "Three breakthroughs. First, consistency stops face warping. Second, real-time generation in hundreds of milliseconds. Third, context understanding.",
    texts: {
      badge: "THREE BREAKTHROUGHS",
      company: "VIDU S2 CAPABILITIES",
      action: "CONSISTENCY PLUS SPEED PLUS CONTEXT",
      result: "HUNDREDS OF MS LATENCY",
      context: "SRF TRAINING: SELF-CORRECTING MEMORY ENDS DRIFT",
      source: "SOURCE: Shengshu Vidu S2 tech report",
    },
  },
  {
    id: 6,
    name: "benchmarks",
    visualType: "narrative",
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/tavily_images-zaomeng-ciyuan-01.jpg",
      source: "Tavily Images",
      animation: "ken-burns",
      overlay: 0.73,
    },
    voiceover:
      "StreamAV-Bench reported audio score 2.985, highest in field. Semantic preference over three commercial systems: 71 to 100 percent.",
    texts: {
      badge: "BENCHMARKS",
      company: "STREAMAV-BENCH RESULTS",
      action: "AIF BEATS ALL BASELINES",
      result: "71 TO 100% PREFERRED",
      context: "SPARKLE-BENCH 4.00 GLOBAL, 3.98 FOREGROUND",
      source: "SOURCE: StreamAV-Bench, Sparkle-Bench",
    },
  },
  {
    id: 7,
    name: "bigger-picture",
    visualType: "narrative",
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/brave_image-zaomeng-ciyuan-01.jpg",
      source: "Brave Image Search",
      animation: "zoom",
      overlay: 0.72,
    },
    voiceover:
      "NPCs that react in real time. AI companions that remember. For China AI, Vidu S2 turns video into an interactive interface.",
    texts: {
      badge: "BIGGER PICTURE",
      company: "CHINA AI INTERACTION",
      action: "VIDEO BECOMES INTERFACE",
      result: "3 INTERACTION MODES",
      context: "REAL-TIME INTERACTION AI ERA IS HERE",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    mediaStrategy: "asset",
    voiceover:
      "Those 20,000 viewers watched an AI host earn real money on day one. The real-time interaction era is here. Follow for more China AI.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
