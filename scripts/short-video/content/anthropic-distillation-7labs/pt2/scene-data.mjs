/**
 * V2: Alibaba ran the largest distillation attack ever measured
 * Series: anthropic-distillation-7labs (Part 2/4)
 * Source: Anthropic threat intelligence report Sep 2026, PDF p.147-148
 * All claims verified against official PDF.
 */
export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    voiceover: "151 million times. That is how often Alibaba hit Claude to steal its reasoning. The largest attack ever measured.",
    texts: {
      subject: "ALIBABA",
      bigNumber: "151M",
      numberLabel: "LARGEST EVER",
      source: "ANTHROPIC",
    },
  },
  {
    id: 2,
    name: "context",
    visualType: "narrative",
    layout: "media-bottom-bar",
    voiceover: "According to Anthropic, China's Alibaba ran the biggest distillation campaign they have ever seen, from May to July 2026.",
    media: { type: "image", path: "assets/baidu_search-alibaba-02.jpg", source: "Baidu", animation: "ken-burns", overlay: 0.72 },
    texts: {
      company: "ALIBABA QWEN LAB",
      action: "GTG-16005 CAMPAIGN",
      result: "90 DAY BLITZ",
      source: "ANTHROPIC PDF P.147",
    },
  },
  {
    id: 3,
    name: "scale",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Anthropic reported peak loads of 3 million requests per day. Over 3,500 fake accounts. All targeting Claude Opus 4.6 and 4.7.",
    texts: {
      stat: "3M",
      label: "PEAK REQUEST RATE",
      subtext: "3,500+ FAKE ACCOUNTS",
      source: "ANTHROPIC",
    },
  },
  {
    id: 4,
    name: "method",
    visualType: "info-card",
    layout: "hero-center",
    voiceover: "Alibaba injected a fixed prompt forcing Claude to write out its reasoning traces before answering. Those traces became training data.",
    texts: {
      title: "CHAIN OF THOUGHT THEFT",
      subtitle: "ALIBABA'S METHOD",
      points: ["INJECT FIXED PROMPT", "FORCE REASONING OUTPUT", "SAVE AS TRAINING DATA"],
    },
  },
  {
    id: 5,
    name: "target",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "The stolen reasoning data was used to train Qwen 3.5, 3.6, and 3.7. Alibaba's own models, built on Claude's brain.",
    texts: {
      title: "STOLEN COT TRAINING",
      left: ["CLAUDE OPUS"],
      right: ["QWEN MODELS"],
      note: "TRAINED ON STOLEN COT",
    },
  },
  {
    id: 6,
    name: "beyond",
    visualType: "narrative",
    layout: "media-bottom-bar",
    voiceover: "Alibaba did not just distill. It used Claude to build its reinforcement learning environments and advance model architecture research.",
    media: { type: "image", path: "assets/baidu_search-alibaba-03.jpg", source: "Baidu", animation: "ken-burns", overlay: 0.72 },
    texts: {
      company: "BEYOND DISTILLATION",
      action: "RL ENVIRONMENTS STOLEN",
      result: "ARCHITECTURE RESEARCH",
      source: "ANTHROPIC PDF P.148",
    },
  },
  {
    id: 7,
    name: "accounts",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Nearly 5,000 fraudulent accounts in the first pool. When banned, Alibaba shifted to a second pool within hours.",
    texts: {
      stat: "5K",
      label: "FAKE ACCOUNTS",
      subtext: "SHIFTED IN HOURS",
      source: "ANTHROPIC",
    },
  },
  {
    id: 8,
    name: "shared",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "Some accounts were also funneling requests from DeepSeek and Xiaomi. The same proxy networks serve multiple labs.",
    texts: {
      title: "SHARED INFRASTRUCTURE",
      left: ["DEEPSEEK"],
      right: ["XIAOMI"],
      note: "SAME PROXY NETWORK",
    },
  },
  {
    id: 9,
    name: "stakes",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "Export controls exist to slow China's AI. Distillation steals the result without the compute. 151 million times.",
    texts: {
      title: "EXPORT CONTROLS BYPASSED",
      left: ["CHIPS RESTRICTED"],
      right: ["REASONING STOLEN"],
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    voiceover: "151 million times. Follow China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      brandHighlight: "AI",
    },
  },
];
