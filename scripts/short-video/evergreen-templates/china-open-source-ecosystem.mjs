/**
 * Evergreen Template: "China's AI Open-Source Ecosystem"
 * Type: explainer | Duration: 75s
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "", // TODO: Insert today's open-source news
    // Standard hook contract (hookScene): hookText = frame-1 claim,
    // revealText = 1.5s payoff — or bigNumber for number-led hooks.
    texts: { hookText: "CHINA'S", revealText: "OPEN AI" },
  },
  {
    id: 2,
    name: "deepseek",
    visualType: "open-source",
    voiceover: "DeepSeek open-sources production weights. MIT license. No watered-down version.",
    texts: { title: "DEEPSEEK", points: ["Production weights", "MIT license", "1/20 the cost"] },
  },
  {
    id: 3,
    name: "qwen",
    visualType: "open-source",
    voiceover:
      "Alibaba's Qwen models are top of open-source leaderboards. Multiple sizes, multiple languages.",
    texts: {
      title: "QWEN (ALIBABA)",
      points: ["Top open-source model", "Multilingual", "Multiple sizes"],
    },
  },
  {
    id: 4,
    name: "kimi",
    visualType: "open-source",
    voiceover: "Moonshot's Kimi handles 2 million tokens of context. Longer than any US model.",
    texts: {
      title: "KIMI (MOONSHOT)",
      points: ["2M token context", "Longest context window", "Chinese company"],
    },
  },
  {
    id: 5,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI intelligence.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];

export const metadata = {
  title: "China's Open AI Ecosystem | China AI News",
  description:
    "DeepSeek, Qwen, Kimi — China's open-source AI models are dominating.\nProduction weights, MIT license, 1/20 the cost.\nFollow for more China AI news.",
  hashtags: ["#chinaai", "#opensource", "#ai", "#deepseek", "#qwen"],
};
