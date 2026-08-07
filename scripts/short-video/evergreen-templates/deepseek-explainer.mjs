/**
 * Evergreen Template: "What is DeepSeek?"
 * Type: explainer | Duration: 75s
 *
 * When DeepSeek makes news, copy this file to scene-data.mjs,
 * update the hook with the specific news event, and run the pipeline.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "", // TODO: Insert today's DeepSeek news as hook
    texts: { line1: "DEEPSEEK", line2: "EXPLAINED" },
  },
  {
    id: 2,
    name: "origin",
    visualType: "timeline",
    voiceover:
      "DeepSeek was founded by Liang Wenfeng in 2023. Backed by High-Flyer, a quantitative hedge fund.",
    texts: {
      events: [
        { date: "2023", text: "FOUNDED" },
        { date: "2024", text: "V3 LAUNCH" },
        { date: "2025", text: "R1 BREAKTHROUGH" },
      ],
    },
  },
  {
    id: 3,
    name: "pricing",
    visualType: "price-comparison",
    voiceover:
      "DeepSeek's API costs one-twentieth the price of Claude or GPT. Fourteen cents per million tokens.",
    texts: { deepseekPrice: "$0.14", claudePrice: "$3.00", ratio: "1/20" },
  },
  {
    id: 4,
    name: "open-source",
    visualType: "open-source",
    voiceover:
      "DeepSeek open-sources its strongest models. Same weights as production. Not a watered-down version.",
    texts: {
      title: "OPEN-SOURCE FIRST",
      points: ["Production weights", "MIT license", "Actively helps competitors"],
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
  title: "What is DeepSeek? | China AI Explained",
  description:
    "DeepSeek is China's most talked-about AI company.\nFounded by a hedge fund manager. Open-source first. One-twentieth the price of Claude.\nFollow for more China AI news.",
  hashtags: ["#deepseek", "#chinaai", "#ai", "#opensource", "#technews"],
};
