// Tencent Hy4: 770B total / 49B active / 1M context, open weights, and the
// Reddit AMA where the team confirmed a much larger next Hy model.
// Facts checked against the official Hy4 README and 36Kr/Zhidongxi, 2026-11-21.

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    arcRole: "establisher",
    narrativeRole: "S",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/yao-x-post.jpg",
      source: "Yao Shunyu's X post announcing the Tencent Hy Reddit AMA, via 36Kr",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.55,
    },
    voiceover:
      "China's Tencent just open-sourced Hy4: 770 billion total parameters, 49 billion active, and a one-million-token context.",
    texts: {
      badge: "CHINA AI · TENCENT",
      subject: "HY4",
      bigNumber: "770B",
      numberLabel: "TOTAL · 49B ACTIVE",
      stats: [
        { num: "1M", unit: "", label: "TOKEN CONTEXT" },
        { num: "OPEN", unit: "", label: "WEIGHTS" },
      ],
      source: "SOURCE: TENCENT HY / GITHUB, NOV 20, 2026",
    },
  },
  {
    id: 2,
    name: "model",
    visualType: "narrative",
    layout: "media-bottom-bar",
    arcRole: "initial",
    narrativeRole: "T",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/hy4-logo.png",
      source: "Tencent Hy4 official logo",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0,
    },
    voiceover:
      "Tencent's README confirmed the backbone has 78 layers, 256 routed experts, and a 3.3 billion parameter drafter. It reads text, images and video.",
    texts: {
      company: "CHINA AI · HY4",
      action: "78 LAYERS · 256 MOE",
      result: "TEXT · IMAGE · VIDEO",
      source: "TENCENT HY4 README",
    },
  },
  {
    id: 3,
    name: "benchmark",
    visualType: "narrative",
    layout: "media-bottom-bar",
    arcRole: "peak",
    narrativeRole: "A",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/hy4-benchmark.jpg",
      source: "Tencent Hy4 official benchmark highlight chart",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0,
    },
    voiceover:
      "Tencent's own chart shows Hy4 ahead of its preview on long context, agents and science. These are vendor numbers.",
    texts: {
      company: "VENDOR CHART",
      action: "AHEAD OF PREVIEW",
      result: "CONTEXT · AGENTS",
      source: "TENCENT OFFICIAL BENCHMARK",
    },
  },
  {
    id: 4,
    name: "ama",
    visualType: "narrative",
    layout: "media-bottom-bar",
    arcRole: "initial",
    narrativeRole: "A",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/ama-answer.jpg",
      source: "Tencent Hy team answer at the Reddit AMA, via 36Kr/Zhidongxi",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0,
    },
    voiceover:
      "At a Reddit AMA, the team said it is using the compute it has to catch the frontier. The next Hy model will be much larger.",
    texts: {
      company: "REDDIT AMA",
      action: "COMPUTE LIMIT",
      result: "NEXT HY: BIGGER",
      source: "36KR / REDDIT AMA, NOV 21",
    },
  },
  {
    id: 5,
    name: "flash",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "initial",
    narrativeRole: "A",
    media: null,
    voiceover:
      "China's Tencent says Hy4 flash has 224 billion total parameters and 12 billion active. Cost per task is one twentieth of Hy4.",
    texts: {
      bigNumber: "1/20",
      label: "COST PER TASK VS HY4",
      subtext: "FLASH · 224B TOTAL · 12B ACTIVE",
      source: "36KR / TENCENT HY",
    },
  },
  {
    id: 6,
    name: "caveat",
    visualType: "narrative",
    layout: "stacked-cards",
    arcRole: "release",
    narrativeRole: "R",
    media: null,
    voiceover:
      "Two caveats: Tencent's benchmark is its own. The license derives from Apache 2.0, but is not Apache. Section 10 adds a separate license for large model services.",
    texts: {
      badge: "THE CAVEAT",
      company: "TENCENT HY LICENSE",
      action: "DERIVED FROM APACHE 2.0",
      context: "NOT APACHE · NO ASF",
      result: "§10: MAAS LICENSE",
      source: "TENCENT HY LICENSE 1.0",
    },
  },
  {
    id: 7,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    arcRole: "release",
    media: null,
    voiceover:
      "Tencent is betting a smaller, well-trained model can beat a bigger one. The next Hy will test that.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "TENCENT HY4 · 770B",
    },
  },
];

export const metadata = {
  title: "Tencent Hy4: 770B Parameters, Open Weights",
  description:
    "Tencent open-sourced Hy4: 770B total parameters, 49B active per token, a 1M-token context, and open weights. The Reddit AMA confirmed a much larger next Hy model and said Hy4 flash costs about 1/20 per task. The benchmark chart is Tencent's own, and Hy4 still trails top closed models on hard tests. Its Tencent Hy License 1.0 is derived from Apache 2.0 but is not Apache: Section 10 adds a separate-license requirement for large MaaS businesses above US$50M revenue or 100M MAU.",
  commentHook:
    "Tencent says Hy4 is 770B total with 49B active. Is a smaller, well-trained MoE the right bet against 1T-plus models?",
  trendingChecked: true,
  sources: [
    "https://hy.tencent.ai/research/hy4",
    "https://github.com/Tencent-Hunyuan/Hy4",
    "https://36kr.com/p/4078768364754050",
  ],
};
