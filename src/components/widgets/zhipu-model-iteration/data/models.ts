// Source: Zhipu AI 2026 H1 earnings call transcript (WeChat, Sep 2, 2026)
// URL: https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q
// All data points verified against source material:
// docs/refs/source-materials/zhipu-glm6-self-training-wechat.md

export interface ModelIteration {
  model: string;
  totalParams: string;
  activeParams: string;
  costPerTask: string;
  intelligenceIndex: number | null;
  keyChange: string;
  status: "shipped" | "next";
}

export const MODELS: ModelIteration[] = [
  {
    model: "GLM-5.2",
    totalParams: "—",
    activeParams: "—",
    costPerTask: "$0.20",
    intelligenceIndex: 32,
    keyChange: "1M context, long-horizon flagship",
    status: "shipped",
  },
  {
    model: "GLM-5.3",
    totalParams: "Same as 5.2",
    activeParams: "Same as 5.2",
    costPerTask: "$0.20",
    intelligenceIndex: 60,
    keyChange: "Post-training only, completion +50%",
    status: "shipped",
  },
  {
    model: "GLM-5.3 Flash",
    totalParams: "320B",
    activeParams: "18B",
    costPerTask: "$0.045",
    intelligenceIndex: null,
    keyChange: "1/10 price of 5.2, sparse + linear attention",
    status: "shipped",
  },
  {
    model: "GLM-6.0",
    totalParams: "TBD",
    activeParams: "TBD",
    costPerTask: "TBD",
    intelligenceIndex: null,
    keyChange: "Fully self-training (RSI)",
    status: "next",
  },
];

export const TIMELINE = {
  iterations: "6 iterations in 11 months",
  indexClimb: "32 → 60 on Artificial Analysis",
  costDrop: "$0.20 → $0.045 per task",
};