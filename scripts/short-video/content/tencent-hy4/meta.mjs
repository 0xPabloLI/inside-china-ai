export const meta = {
  article: "tencent-hy4",
  subject: "tencent",
  pipelineId: "tencent-hy4",
  title: "Tencent Hy4: 770B Parameters, Open Weights",
  renderer: "remotion",
  createdAt: "2026-11-21",
  // Measured from content/tencent-hy4/assets/ on 2026-11-21:
  // 0 motion clips, 4 usable stills (logo, benchmark, Yao X post, AMA answer).
  // This is an explainer pack, not demo-led.
  videoFit: 2,
  videoFitFormat: "explainer",
  videoFitHook:
    "Yao Shunyu's X post announcing the Reddit AMA + 770B / 49B / 1M overlays (assets/yao-x-post.jpg).",
  videoFitEvidence:
    "assets/yao-x-post.jpg 1080x810; assets/hy4-benchmark.jpg 5200x3829; assets/hy4-logo.png 2180x418; assets/ama-answer.jpg 1080x360; no motion clip. Hook uses yao-x-post.jpg and mediaRole:evidence.",
  assetReady: 1,
  storySpine: {
    phenomenon:
      "Tencent open-sourced Hy4, a 770B-parameter MoE flagship with 49B active parameters per token and a 1M-token context. Its Reddit AMA confirmed the next Hy model will be much larger and that Hy4 flash costs about 1/20 per task.",
    caveat:
      "The benchmark chart is Tencent's own, the model still trails top closed models on hard research and coding tests, and the license is Tencent Hy License 1.0, derived from Apache 2.0 but not Apache: Section 10 requires a separate written license for large MaaS businesses above the revenue or MAU thresholds, and internal use is exempt. The AMA answers were relayed by 36Kr.",
    storyType: "release",
  },
  topics: [
    "china-ai",
    "tencent",
    "hy4",
    "open-weights",
    "mixture-of-experts",
    "reddit-ama",
  ],
  keyEntities: {
    companies: ["tencent"],
    people: ["yao_shunyu"],
    models: ["hy4", "hy4-flash"],
  },
  dataPoints: [
    "Tencent Hy4 official README, 2026-11-20: 770B total parameters, 49B text parameters activated per token, 1,048,576-token context.",
    "Official README: 78 backbone layers, 256 routed experts plus one shared expert per MoE layer; a 3.3B DFly2 speculative drafter.",
    "Official README: Hy4 supports text, image and video understanding; weights are open on Hugging Face, ModelScope and GitCode under the Tencent Hy License.",
    "Official LICENSE, Tencent Hy License 1.0: derived from Apache License 2.0 with additional Section 10 commercial terms for large MaaS businesses; it is not Apache 2.0 and is not endorsed by or affiliated with the Apache Software Foundation. Section 10.2 requires a separate written license above US$50M trailing-12-month revenue or 100M monthly active users; Section 10.3 exempts internal use.",
    "Official README: Hy4 still trails top proprietary models on research-level math, long-horizon coding, self-improvement and advanced visual QA.",
    "36Kr / Zhidongxi, 2026-11-21: at the Reddit AMA, the Tencent Hy team said it is using the compute it has to catch the frontier; the next Hy model will be much larger.",
    "36Kr: Hy4 flash has 224B total parameters, including 64B Engram parameters, and activates 12B per token; Tencent says its cost per task is 1/20 of Hy4.",
    "36Kr: the AMA link is reddit.com/r/LocalLLaMA/comments/1y15w4a/tencent_hy_team_shunyu_yao_here_ask_us_anything/.",
  ],
  hashtags: ["#chinaai", "#tencent", "#hy4", "#openweights", "#ainews"],
};
