export const meta = {
  article: "huawei-cloudrobo-wm12",
  subject: "huawei",
  pipelineId: "huawei-cloudrobo-wm12",
  title: "Huawei Cloud's Robot World Model Tops Two Benchmarks",
  renderer: "remotion",
  createdAt: "2026-11-23",
  // Measured from content/huawei-cloudrobo-wm12/assets/ on 2026-11-23:
  // 4 usable stills, no motion clip. Benchmark card and launch stage carry it.
  videoFit: 2,
  videoFitFormat: "explainer",
  assetReady: 1,
  videoFitHook:
    "Official benchmark card at frame one: RoboTwin 2.0 TOP 1, 88.98%, with the launch stage behind it.",
  videoFitEvidence:
    "assets/huawei-benchmark.jpg 446x896 (below inventory floor); assets/huawei-launch.jpg 896x595; assets/huawei-platform.jpg 640x480; assets/huawei-stage-tech.jpg 832x554; assets/huawei-stage-caishi.jpg 900x702; no motion clip. Hook uses the benchmark card, not a generic robot render.",
  storySpine: {
    phenomenon:
      "Huawei Cloud released and open-sourced CloudRobo-WM1.2, an Ascend-native embodied world model, on November 16. It claims first place on RoboTwin 2.0 (88.98%) and LiberoPro 2.0 (81.7%). Weights, inference and post-training code open on November 30.",
    caveat:
      "The benchmark scores are vendor-run and have no independent third-party verification. Real-room robustness, cross-robot transfer and long-horizon reliability are the harder tests.",
    storyType: "release",
  },
  topics: [
    "china-ai",
    "huawei-cloud",
    "cloudrobo",
    "embodied-ai",
    "world-model",
    "ascend",
  ],
  keyEntities: {
    companies: ["huawei-cloud", "cloudrobo"],
    people: ["wu-xiaodong"],
    models: ["cloudrobo-wm1-2"],
  },
  dataPoints: [
    "Huawei Cloud official news, 2026-11-16: CloudRobo-WM1.2 is Ascend-native, uses a shared world-model backbone and DualAct architecture, and ranks first on RoboTwin 2.0 and LiberoPro 2.0.",
    "Huawei Cloud official benchmark card: RoboTwin 2.0 average 88.98%, LiberoPro 2.0 average 81.7%, both TOP 1.",
    "Huawei Cloud blog, 2026-11-18: 80% of China's embodied AI companies have chosen Ascend Cloud; key universities are basically covered.",
    "Sina Finance / Caishi News, 2026-11-16: Wu Xiaodong said model weights, inference and post-training code will open to developers on November 30; pre-training best practices go to customers and partners.",
    "Caishi News: CloudRobo platform has more than 16,500 developers.",
    "Huawei Cloud official news: the model has five core technologies: PPA multimodal world representation, native DualAct, multi-granularity supervised pretraining, cross-embodiment motion modeling, and four composable inference modes.",
    "Huawei Cloud official news: the CloudRobo platform covers data, training, simulation, deployment and real-robot testing on Ascend Cloud.",
  ],
  hashtags: ["#chinaai", "#huaweicloud", "#cloudrobo", "#embodiedai", "#worldmodel"],
};
