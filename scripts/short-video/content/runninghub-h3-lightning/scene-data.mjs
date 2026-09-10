/**
 * Scene data for RunningHub H3 Lightning video.
 * 10 scenes, ~61s. Based on QbitAI report (Sep 10, 2026) — RunningHub
 * open-sourced a 12x inference acceleration stack for MiniMax H3 video
 * generation, targeting PCIe multi-GPU rigs without NVLink.
 *
 * Narrative type: Data Reveal (acceleration benchmark + open source)
 * Hook pattern: P1 Result-First (12x number-led; previous deepseek-huawei
 * also P1 — rotation check: this is a different content type (data reveal
 * vs breaking news), P1 still fits because 12x IS the story.)
 *
 * Entity colors: RunningHub = blue, MiniMax = amber, hardware = cyan.
 * All numbers from QbitAI Sep 10 2026 report + RunningHub GitHub.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    narrativeRole: "S",
    retentionMechanism: null,
    layout: "hero-center",
    mediaStrategy: "asset",
    assetNeed: "futuristic GPU server rack glowing blue lights in a dark data center, wide cinematic view",
    subjectLogo: "runninghub",
    voiceover:
      "RunningHub made MiniMax H3 twelve times faster. 348 seconds down to 28.",
    texts: {
      badge: "BREAKING",
      subject: "RUNNINGHUB",
      bigNumber: "12×",
      numberLabel: "MINIMAX H3 SPEEDUP",
      stats: [
        { num: "348s", unit: "", label: "BEFORE" },
        { num: "28.7s", unit: "", label: "AFTER" },
      ],
      source: "SOURCE: QbitAI, Sep 10, 2026",
    },
  },
  {
    id: 2,
    name: "the-problem",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "multiple RTX graphics cards stacked inside a server chassis, high end hardware",
    voiceover:
      "Same 5 second video on 4 RTX 6000D cards. The open source model was just too slow.",
    texts: {
      badge: "THE PROBLEM",
      company: "5s CLIP, QUAD RTX 6000D",
      action: "OPEN SOURCE H3",
      result: "6 MINUTES TO RENDER",
      highlight: { field: "result", text: "6 MINUTES" },
      context: "OPEN SOURCE VIDEO MODEL",
      source: "SOURCE: QbitAI, Sep 10, 2026",
    },
  },
  {
    id: 3,
    name: "no-compromise",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "high quality cinematic AI generated video frame, desert landscape with motorcycle",
    voiceover:
      "And they kept full BF16 precision. No quality shortcut, no degraded output.",
    texts: {
      badge: "NO COMPROMISE",
      company: "BF16 FULL PRECISION",
      action: "NO QUALITY LOSS",
      result: "SPEED WITHOUT TRADEOFF",
      highlight: { field: "company", text: "BF16" },
      context: "FULL PRECISION RETAINED",
    },
  },
  {
    id: 4,
    name: "cut-one",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "neural network training visualization with nodes and connections, abstract tech",
    voiceover:
      "First cut: a custom post-training model. 50 steps down to 9. Eight times faster.",
    texts: {
      badge: "CUT ONE",
      company: "STEP COUNT: 50 TO 9",
      action: "RH POST-TRAINING MODEL",
      result: "8× SPEEDUP",
      highlight: { field: "result", text: "8×" },
      context: "MODEL-LEVEL OPTIMIZATION",
    },
  },
  {
    id: 5,
    name: "cut-two",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "GPU computation optimization abstract visualization, data flowing through processors",
    voiceover:
      "Second cut: faster attention, cached compute, compiled code. 43 seconds down to 28.",
    texts: {
      badge: "CUT TWO",
      company: "SageAttention2 + Cache-DiT",
      action: "PLUS torch.compile",
      result: "PUSHED TO 28.7s",
      highlight: { field: "result", text: "28.7s" },
      context: "EXECUTION LAYER OPTIMIZATION",
    },
  },
  {
    id: 6,
    name: "cut-three",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "multiple GPUs connected in parallel inside a workstation, circuit boards",
    voiceover:
      "Third cut: a smarter multi-GPU split. 12 percent faster, 14 gigs less memory.",
    texts: {
      badge: "CUT THREE",
      company: "TP2 + ULYSSES4",
      action: "PCIe WITHOUT NVLINK",
      result: "12% QUICKER, 14GiB FREED",
      highlight: { field: "result", text: "12%" },
      context: "MULTI-GPU PARALLELISM",
    },
  },
  {
    id: 7,
    name: "local-deploy",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "desktop workstation with multiple GPUs installed, developer hardware setup",
    voiceover:
      "It targets PCIe rigs without NVLink. RTX 6000D, a card anyone can buy.",
    texts: {
      badge: "LOCAL DEPLOY",
      company: "PCIe MULTI-GPU",
      action: "NO NVLINK REQUIRED",
      result: "COMMODITY GPU",
      highlight: { field: "action", text: "NO NVLINK" },
      context: "RTX 6000D BUYABLE",
    },
  },
  {
    id: 8,
    name: "open-source",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "GitHub repository code on a computer screen, developer coding setup",
    voiceover:
      "The whole stack is open source on GitHub. Deploy it on your own machines.",
    texts: {
      badge: "OPEN SOURCE",
      company: "FULL STACK ON GITHUB",
      action: "DEPLOY IT YOURSELF",
      result: "CHINA'S OPEN AI",
      highlight: { field: "result", text: "CHINA'S" },
      context: "RUNNINGHUB OPEN SOURCED ALL",
      source: "SOURCE: github.com/RH-RunningHub",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "creative professional editing video on a computer, content creator workspace",
    voiceover:
      "Remember 12 times faster? Now local creators get datacenter speed at home.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "REMEMBER 12×?",
      action: "DATACENTER SPEED",
      result: "AT HOME",
      highlight: { field: "company", text: "12×" },
      context: "CHINA'S CREATORS BENEFIT",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    narrativeRole: "T-Tell",
    retentionMechanism: null,
    mediaStrategy: "asset",
    voiceover: "Open source AI just got faster. Follow China AI News for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "H3 LIGHTNING",
    },
  },
];

export const metadata = {
  commentHook:
    "Would you deploy H3 Lightning on your local GPUs, or is cloud still easier? What's your rig?",
  articleUrl: "https://mp.weixin.qq.com/s/bygc8puWmTmN2KSt7otkwA",
  trendingChecked: true,
  trendingHashtags: [],
};
