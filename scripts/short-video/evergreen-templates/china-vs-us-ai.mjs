/**
 * Evergreen Template: "China AI vs US AI"
 * Type: fermenting | Duration: 80s
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "", // TODO: Insert today's comparison angle
    texts: { line1: "CHINA vs US", line2: "AI RACE" },
  },
  {
    id: 2,
    name: "chips",
    visualType: "contrast",
    voiceover:
      "The US restricts chip exports. China builds its own. Huawei's Ascend chip is closing the gap.",
    texts: { left: ["NVIDIA BAN", "EXPORT CONTROLS"], right: ["HUAWEI ASCEND", "SELF-SUFFICIENT"] },
  },
  {
    id: 3,
    name: "models",
    visualType: "price-comparison",
    voiceover:
      "US models cost more. Chinese models cost less. Same performance, different price tag.",
    texts: { leftLabel: "US (GPT-4)", rightLabel: "China (DeepSeek)", ratio: "1/20" },
  },
  {
    id: 4,
    name: "open-source",
    visualType: "open-source",
    voiceover: "China open-sources everything. The US keeps models closed. Open wins on adoption.",
    texts: {
      title: "OPEN vs CLOSED",
      points: ["DeepSeek: MIT license", "OpenAI: proprietary", "China leads open-source AI"],
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
  title: "China vs US AI Race | China AI News",
  description:
    "China builds cheaper, open-source AI. The US restricts chips.\nBut China's chip industry is catching up.\nFollow for more China AI news.",
  hashtags: ["#chinaai", "#ai", "#deepseek", "#technews", "#chinatech"],
};
