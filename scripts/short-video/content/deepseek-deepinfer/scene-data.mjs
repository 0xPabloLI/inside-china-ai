/**
 * Scene data for DeepSeek DeepInfer open-source announcement.
 * 10 scenes, ~65s. Sources: DeepSeek official WeChat post (Oct 20, 2026 16:54),
 * DeepSeek technical report on Zhihu "DeepSeek V4.1 Flash 大规模推理部署实践"
 * (Oct 20, 2026 19:30), GitHub repos deepseek-ai/DeepInfer and
 * deepseek-ai/deepseek-recipe (API + repo page, Oct 21, 2026).
 *
 * Narrative type: deep analysis (fact shock -> definition -> economics ->
 * engineering -> community response -> meaning -> loop close).
 * Hook pattern: P1 Result-First, number-led (155 trillion tokens a day).
 * Rotation: previous package (deepseek-harness-desktop) opened P2 claim-led,
 * the three before it opened P1 number-led, so P1 is due.
 *
 * Media: two first-party evidence images (official announcement cover, GitHub
 * repo card) plus shared Pexels stock for context scenes. Data / contrast /
 * stat-reveal / CTA templates are text-only by contract (media: null).
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
    assetNeed: "dark data center server rack with status LEDs, moody lighting",
    media: {
      type: "image",
      path: "assets/pexels-dc-dark.jpg",
      source: "Pexels",
      animation: "zoom",
      overlay: 0.72,
    },
    voiceover: "155 trillion tokens a day. One DeepSeek cluster serves them all.",
    texts: {
      badge: "OPEN-SOURCED",
      subject: "DEEPSEEK",
      bigNumber: "155T",
      numberLabel: "TOKENS SERVED EVERY DAY",
      source: "SOURCE: DeepSeek technical report, Oct 20, 2026",
    },
  },
  {
    id: 2,
    name: "announcement",
    visualType: "narrative",
    layout: "media-overlay",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    assetNeed: "official DeepSeek announcement cover image",
    media: null,
    voiceover:
      "On October 20, DeepSeek announced DeepInfer. It is the inference framework behind its own API, now open source.",
    texts: {
      badge: "OCTOBER 20, 2026",
      company: "DEEPINFER",
      action: "THE ENGINE BEHIND DEEPSEEK'S API",
      result: "NOW OPEN SOURCE",
      context: "THE LAYER NOBODY TALKS ABOUT",
      source: "SOURCE: DeepSeek official WeChat post, Oct 20, 2026",
    },
  },
  {
    id: 3,
    name: "what-is-inference-framework",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: "close-up of colorful source code on a dark screen",
    media: {
      type: "image",
      path: "assets/pexels-code-03.jpg",
      source: "Pexels",
      animation: "zoom",
      overlay: 0.7,
    },
    voiceover:
      "Training teaches the model. Serving answers the users. This layer decides the cost of every AI call.",
    texts: {
      badge: "THE MIDDLE LAYER",
      title: "WHAT IS AN INFERENCE ENGINE?",
      context: "The software between model and user.",
      detail: "Its efficiency sets the price of every call.",
    },
  },
  {
    id: 4,
    name: "unit-economics",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover: "DeepSeek reported revenue of 38 dollars for every GPU hour, at off-peak pricing.",
    texts: {
      stat: "$38",
      statLabel: "PER GPU, PER HOUR",
      subtext: "AT DEEPSEEK'S OFF-PEAK RATE",
      source: "SOURCE: DeepSeek technical report, Oct 20, 2026",
    },
  },
  {
    id: 5,
    name: "kvcache",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/pexels-dc-dark2.jpg",
      source: "Pexels",
      animation: "zoom",
      overlay: 0.7,
    },
    voiceover:
      "The trick is memory. DeepInfer caches context on 100 petabytes of SSD. Reads hit 10 terabytes per second.",
    texts: {
      badge: "THE REAL TRICK: MEMORY",
      company: "100 PIB OF SSD CACHE",
      context: "KVCACHE ON 3FS STORAGE",
      action: "10 TB/S PEAK READS",
      result: "CONTEXT KEPT 7 DAYS",
      highlight: { field: "company", text: "100" },
      source: "SOURCE: DeepSeek technical report, Oct 20, 2026",
    },
  },
  {
    id: 6,
    name: "hardware",
    visualType: "contrast",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover:
      "It runs on Nvidia and Huawei Ascend chips. Eight cards handle prefill. Up to 128 handle decode.",
    texts: {
      title: "RUNS ON BOTH",
      left: ["NVIDIA GPUS", "8-CARD PREFILL"],
      right: ["HUAWEI ASCEND", "128-CARD DECODE"],
      vs: "AND",
      note: "ONE FRAMEWORK, TWO CHIP FAMILIES",
    },
  },
  {
    id: 7,
    name: "github-stars",
    visualType: "narrative",
    layout: "media-overlay",
    narrativeRole: "R",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: "GitHub repository page card showing stars and forks",
    media: null,
    voiceover:
      "The repo passed 12,000 stars in one day. A second repo ships the token codec behind DeepSeek's API.",
    texts: {
      badge: "OPEN SOURCE",
      company: "12,000 GITHUB STARS",
      context: "IN JUST ONE DAY",
      action: "DEEPSEEK-RECIPE HANDLES API TOKENS",
      result: "SAME API AS OFFICIAL",
      highlight: { field: "company", text: "12,000" },
      source: "SOURCE: GitHub, Oct 21, 2026",
    },
  },
  {
    id: 8,
    name: "what-it-means",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: "long corridor of data center server racks",
    media: {
      type: "image",
      path: "assets/pexels-dc-server.jpg",
      source: "Pexels",
      animation: "zoom",
      overlay: 0.7,
    },
    voiceover:
      "DeepSeek opened the serving layer, not just the model. That is the part that decides what AI costs.",
    texts: {
      badge: "WHAT IT MEANS FOR CHINA AI",
      title: "WHAT DEEPSEEK JUST GAVE AWAY",
      context: "The framework that serves its own API.",
      detail: "The layer that sets the price of AI.",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "stat-reveal",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover: "The engine behind 155 trillion tokens a day just went open source. Yours to run.",
    texts: {
      bigNumber: "155T",
      label: "PER DAY. NOW OPEN SOURCE.",
      subtext: "APACHE-2.0 LICENSE",
      source: "SOURCE: DeepSeek technical report, Oct 20, 2026",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover: "Follow China AI News for what DeepSeek opens next.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
