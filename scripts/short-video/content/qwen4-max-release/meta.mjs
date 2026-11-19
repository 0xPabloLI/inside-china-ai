export const meta = {
  subject: "qwen",
  pipelineId: "qwen4-max-release",
  title: "Qwen4-Max: Alibaba's 2.4T Model Cuts Task Cost 62%",
  article: "qwen4-max-release",
  renderer: "remotion",
  createdAt: "2026-11-19",
  storySpine: {
    phenomenon:
      "On 2026-11-16 Alibaba launched Qwen4-Max, a 2.4-trillion-parameter flagship with 71B active parameters per token, native vision, a one-million-token context window, and a claimed 62% lower cost per task than Qwen3.8-Max.",
    caveat:
      "The performance and cost figures are Alibaba's own, Work360 is an in-house benchmark, Qwen4-Max is closed-weight, and the smaller open-source Qwen4 models have been promised but not yet shipped.",
    storyType: "release",
  },
  topics: ["china-ai", "qwen", "alibaba", "qwen4", "qwen4-max", "agent", "benchmark"],
  keyEntities: {
    companies: ["alibaba", "qwen"],
    people: [],
    models: ["qwen4-max", "qwen3.8-max"],
  },
  dataPoints: [
    "Qwen4-Max launched 2026-11-16 on QwenCloud, Token Plan and API",
    "2.4T backbone parameters, 71B activated per token, 328B additional N-gram embedding parameters",
    "Native vision input covering text, images and video; text output",
    "1M-token context window; 991K max input, 131K max output, 262K max output in thinking mode",
    "GDN + QSA hybrid attention: three Gated DeltaNet layers per QSA layer",
    "Gated Residual with four parallel residual branches",
    "Work360 score 52.69, up from 47.74 for Qwen3.8-Max",
    "CodeArena WebDev rank #6",
    "Agents' Last Exam score 46.7, up 18.8 points from Qwen3.8-Max",
    "Official cost per task falls from $4.43 to $1.67, a 62% reduction",
    "Car-parts programming time falls from 475 minutes to 24 minutes, a 95% reduction",
    "Live Delivery ships a usable first version, then iterates with user feedback",
    "Qwen-Live-Delivery-Plugin is open-sourced",
    "Qwen4-Max is closed-weight; smaller Qwen4 models are promised to open source",
  ],
  hashtags: ["#chinaai", "#qwen", "#alibaba", "#ai", "#technews"],
};
