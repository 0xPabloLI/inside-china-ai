// Huawei Cloud CloudRobo-WM1.2, released and open-sourced 2026-11-16.
// Angle: a Chinese world model trained on Chinese chips claims two first places,
// then opens weights and code on November 30. Benchmarks are vendor-run.

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    hookFamily: "result-first",
    narrativeRole: "S",
    arcRole: "establisher",
    retentionMechanism: null,
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/huawei-launch.jpg",
      source: "Huawei Cloud CloudRobo-WM1.2 launch, 2026-11-16",
      fit: "cover",
      upscale: "resample",
      animation: "none",
      overlay: 0.7,
    },
    voiceover:
      "Huawei Cloud says its new embodied world model took first place on two robot benchmarks.",
    texts: {
      badge: "CHINA AI · HUAWEI CLOUD",
      subject: "CLOUDROBO-WM1.2",
      bigNumber: "88.98",
      numberLabel: "ROBOTWIN 2.0 AVG %",
      stats: [
        { num: "81.7%", unit: "", label: "LIBEROPRO 2.0" },
        { num: "#1", unit: "", label: "BOTH BENCHMARKS" },
      ],
      source: "HUAWEI CLOUD · NOV 16, 2026",
    },
  },
  {
    id: 2,
    name: "release",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    arcRole: "initial",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/huawei-stage-tech.jpg",
      source: "Huawei Cloud official launch photo, 2026-11-16",
      fit: "cover",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.35,
    },
    voiceover:
      "Huawei Cloud reported on November 16 that it released and open-sourced CloudRobo-WM1.2, its first Ascend-native robot world model.",
    texts: {
      company: "CLOUDROBO-WM1.2",
      action: "OPEN SOURCE",
      result: "ASCEND NATIVE",
      source: "HUAWEI CLOUD / SINA",
    },
  },
  {
    id: 3,
    name: "scores",
    visualType: "stat-reveal",
    layout: "hero-center",
    narrativeRole: "A",
    arcRole: "initial",
    retentionMechanism: null,
    media: null,
    voiceover:
      "Huawei published both score cards. It ranks first on RoboTwin 2.0 and first on LiberoPro 2.0.",
    texts: {
      bigNumber: "88.98",
      label: "ROBOTWIN 2.0 AVG %",
      subtext: "LIBEROPRO 2.0 81.7% · BOTH #1",
      source: "HUAWEI CLOUD",
    },
  },
  {
    id: 4,
    name: "open",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    arcRole: "peak",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/huawei-platform.jpg",
      source: "Huawei Cloud CloudRobo platform slide, 2026-11-16",
      fit: "cover",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.35,
    },
    voiceover:
      "Caishi News reported that weights, inference and post-training code open on November 30. The platform has more than sixteen thousand developers.",
    texts: {
      company: "NOV 30",
      action: "WEIGHTS + CODE",
      result: "16,500 DEVS",
      source: "HUAWEI CLOUD / CAISHI",
    },
  },
  {
    id: 5,
    name: "caveat",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    arcRole: "initial",
    retentionMechanism: "loop-closure",
    media: null,
    voiceover:
      "Those scores are Huawei's own. The harder test is whether the model survives messy real rooms and different robot bodies.",
    texts: {
      badge: "THE CAVEAT",
      company: "VENDOR-RUN",
      action: "NO THIRD PARTY",
      context: "REAL ROOMS UNPROVEN",
      result: "BENCHMARKS ARE CLAIMS",
      source: "HUAWEI CLOUD / MEDIA",
    },
  },
  {
    id: 6,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    arcRole: "release",
    retentionMechanism: "loop-closure",
    media: null,
    voiceover:
      "A Chinese world model trained on Chinese chips just claimed two first places. Follow China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "HUAWEI CLOUD · CLOUDROBO-WM1.2",
    },
  },
];

export const metadata = {
  title: "Huawei Cloud's Robot World Model Tops Two Benchmarks",
  description:
    "Huawei Cloud released and open-sourced CloudRobo-WM1.2 on November 16, an Ascend-native embodied world model. It claims first place on RoboTwin 2.0 with an 88.98% average and on LiberoPro 2.0 with 81.7%. Weights, inference and post-training code open on November 30. The benchmark scores are vendor-run and have no independent third-party verification.",
  commentHook:
    "Huawei Cloud says its robot world model is #1 on two benchmarks. Would you trust those scores before it opens the weights?",
  trendingChecked: true,
  sources: [
    "https://www.huaweicloud.com/news/2026/20261116171910882.html",
    "https://bbs.huaweicloud.com/blogs/537419",
    "https://finance.sina.com.cn/stock/t/2026-11-16/doc-iniyxpxf2801504.shtml",
  ],
};
