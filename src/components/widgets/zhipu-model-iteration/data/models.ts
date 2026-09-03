// Source: Zhipu AI 2026 H1 earnings call transcript (WeChat, Sep 2, 2026)
// URL: https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q
// All data points verified against source material:
// docs/refs/source-materials/zhipu-glm6-self-training-wechat.md
//
// Note: the intelligence index 32 → 60 is a SERIES-level statement
// ("GLM family, 11 months" — source L44/L135), not per-model scores.
// Per-model index attribution is NOT in the source and is therefore
// not listed here; see TIMELINE.indexClimb for the series-level claim.

export interface ModelIteration {
  model: string;
  /** "same" = same base/params as predecessor (source-stated); "tbd" = not disclosed; "value" = use totalParams/activeParams */
  paramsMode: "same" | "tbd" | "value";
  totalParams: string | null;
  activeParams: string | null;
  costPerTask: string | null;
  keyChange: string;
  status: "shipped" | "next";
}

export const MODELS: ModelIteration[] = [
  {
    model: "GLM-5.2",
    paramsMode: "tbd",
    totalParams: null,
    activeParams: null,
    costPerTask: "$0.20",
    keyChange: "1M context, long-horizon flagship",
    status: "shipped",
  },
  {
    model: "GLM-5.3",
    paramsMode: "same",
    totalParams: null,
    activeParams: null,
    costPerTask: "$0.20",
    keyChange: "Post-training only, completion +50%",
    status: "shipped",
  },
  {
    model: "GLM-5.3 Flash",
    paramsMode: "value",
    totalParams: "320B",
    activeParams: "18B",
    costPerTask: "$0.045",
    keyChange: "1/10 price of 5.2, sparse + linear attention",
    status: "shipped",
  },
  {
    model: "GLM-6.0",
    paramsMode: "tbd",
    totalParams: null,
    activeParams: null,
    costPerTask: null,
    keyChange: "Fully self-training (RSI)",
    status: "next",
  },
];

export const TIMELINE = {
  iterations: "6 iterations in 11 months",
  indexClimb: "Intelligence index 32 → 60 (GLM family, Artificial Analysis)",
  costDrop: "Cost per task $0.20 → $0.045",
};
