/**
 * Evergreen Template: "China AI Funding Tracker"
 * Type: data | Duration: 65s
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "", // TODO: Insert today's funding news
    texts: { line1: "CHINA AI", line2: "FUNDING" },
  },
  {
    id: 2,
    name: "deepseek",
    visualType: "data",
    voiceover:
      "DeepSeek raised $1.4 billion. Then the meeting leaked. The round paused. But the valuation is already $5 billion.",
    texts: { stat: "$1.4B", label: "DeepSeek (paused)", note: "Valuation: $5B" },
  },
  {
    id: 3,
    name: "moonshot",
    visualType: "data",
    voiceover:
      "Moonshot AI (Kimi) raised $3.5 billion. Founded by Yang Zhilin. Backed by Alibaba and Tencent.",
    texts: { stat: "$3.5B", label: "Moonshot (Kimi)", note: "Backed by Alibaba" },
  },
  {
    id: 4,
    name: "zhipu",
    visualType: "data",
    voiceover:
      "Zhipu AI raised $400 million. Founded by Tsinghua University researchers. Backed by Saudi Arabia's Prosperity7 Ventures.",
    texts: { stat: "$400M", label: "Zhipu AI", note: "Tsinghua origins" },
  },
  {
    id: 5,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI intelligence.",
    texts: { title: "SUBSCRIBE" },
  },
];

export const metadata = {
  title: "China AI Funding Tracker | China AI News",
  description:
    "DeepSeek $1.4B. Moonshot $3.5B. Zhipu $400M.\nChina's AI companies are raising billions.\nFollow for more China AI news.",
  hashtags: ["#chinaai", "#ai", "#funding", "#deepseek", "#technews"],
};
