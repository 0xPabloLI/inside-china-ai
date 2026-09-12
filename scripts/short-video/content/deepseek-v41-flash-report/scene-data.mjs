/**
 * Scene data for DeepSeek V4.1 Flash tech-report video.
 * 8 scenes, ~70s. Based on DeepSeek official tech report (Sep 10, 2026)
 * via WeChat article by 动察Beating / Sleepy.md.
 * Source: https://mp.weixin.qq.com/s/sMJ5fPCTrmev5ME2l7lC5Q
 *
 * Narrative type: Deep Analysis (official report, multi-angle)
 * Hook pattern: P1 Result-First (beats Pro on Agent tasks at Flash price)
 *
 * Entity colors: DeepSeek = blue.
 * Note: "harness" is AI-vocabulary blacklisted; voiceover uses "tool layer".
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    narrativeRole: "S",
    retentionMechanism: null,
    layout: "hero-center",
    mediaStrategy: "asset",
    assetNeed: "DeepSeek logo or AI agent executing code tasks, dark blue tech aesthetic",
    media: {
      type: "image",
      path: "assets/pexels-models-01.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.72,
    },
    subjectLogo: "deepseek",
    voiceover:
      "China's DeepSeek V4.1 Flash beat the old Pro on Agent tasks, at Flash prices. September 14, it takes over Pro's API.",

    texts: {
      badge: "BREAKING",
      subject: "DEEPSEEK",
      bigNumber: "74.2",
      numberLabel: "DEEPSWE v1.1",
      stats: [
        { num: "62.7", unit: "", label: "OLD PRO" },
        { num: "SEP 14", unit: "", label: "PRO API TO FLASH" },
      ],
      source: "SOURCE: DeepSeek official",
    },
  },
  {
    id: 2,
    name: "release-takeover",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "API routing diagram showing Pro traffic redirecting to Flash, dark theme with blue arrows",
    media: {
      type: "image",
      path: "assets/unsplash-traffic-02.jpg",
      source: "Unsplash",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "DeepSeek announced V4.1 Flash on September 10. From September 14, Pro API requests route to Flash at Flash prices, until V4.1 Pro ships.",

    texts: {
      badge: "SEPTEMBER 10, 2026",
      company: "V4.1 FLASH RELEASED",
      action: "PRO API ROUTES TO FLASH SEP 14",
      result: "BILLED AT FLASH PRICE",
      highlight: { field: "result", text: "FLASH PRICE" },
      context: "PENDING V4.1 PRO",
      source: "SOURCE: DeepSeek official",
    },
  },
  {
    id: 3,
    name: "score-gap",
    visualType: "narrative",
    refStyle: "data",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "Bar chart comparing three models across DeepSWE and Terminal-Bench, blue and amber bars, dark background",
    media: {
      type: "image",
      path: "assets/pexels-code-02.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "DeepSeek reported Agent tasks are the win in AI. DeepSWE v1.1: old Pro 62.7, V4.1 Flash 74.2. Terminal-Bench jumped 11.8 to 30.0. GPQA barely moved.",

    texts: {
      badge: "AI AGENT WIN",
      company: "AGENT TASKS VS SCIENCE",
      action: "DEEPSWE: 62.7 TO 74.2",
      result: "T-BENCH 30.0 VS 11.8",
      highlight: { field: "action", text: "74.2" },
      context: "GPQA: 89.9 TO 90.9 (FLAT)",
      source: "SOURCE: DeepSeek tech report",
    },
  },
  {
    id: 4,

    name: "kv-cache-price",
    visualType: "narrative",
    refStyle: "data",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "Cost comparison visualization: cached vs uncached pricing, KV cache compression diagram, blue and green",
    media: {
      type: "image",
      path: "assets/pixabay-across-01.jpg",
      source: "Pixabay",
      animation: "ken-burns",
      overlay: 0.88,
    },
    voiceover:
      "KV cache drops to 890 bytes per token, a quarter of before. Cached input is 0.006 dollars per million, fifty times cheaper than 0.30 uncached.",

    texts: {
      badge: "THE ECONOMICS",
      company: "KV CACHE + PRICING",
      action: "890 BYTES/TOKEN (1/4 OLD)",
      result: "50X CHEAPER",
      highlight: { field: "result", text: "50X" },
      context: "$0.006 VS $0.30 PER M",
      source: "SOURCE: DeepSeek pricing",
    },
  },
  {
    id: 5,
    name: "ced-architecture",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: "loop-closure",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "Neural network architecture diagram showing encoder-decoder split with Engram memory module, dark tech",
    media: {
      type: "image",
      path: "assets/unsplash-code-01.jpg",
      source: "Unsplash",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "CED architecture splits reading from writing. Encoder takes long inputs, decoder writes short answers. Plus 196 billion Engram memory parameters by lookup.",

    texts: {
      badge: "NEW ARCHITECTURE",
      company: "CED: READ NOT EQUAL WRITE",
      action: "ENCODER: LONG INPUTS",
      result: "DECODER: SHORT OUTPUTS",
      highlight: { field: "action", text: "ENCODER" },
      context: "196B ENGRAM MEMORY",
      source: "SOURCE: DeepSeek tech report",
    },
  },
  {
    id: 6,
    name: "cta",
    visualType: "cta",
    narrativeRole: "T",
    retentionMechanism: "loop-closure",
    layout: "hero-center",
    mediaStrategy: "asset",
    voiceover:
      "A Flash-priced model doing Pro's Agent work, starting September 14. Follow China AI News for more.",

    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
