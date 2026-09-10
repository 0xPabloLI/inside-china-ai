/**
 * Scene definitions for the LingBot-World 2.0 1.3B video.
 * 10 scenes, ~65s. Ant Group open-sources a 1.3B world model
 * that runs real-time on a single consumer GPU.
 *
 * Source: QbitAI (Quantum Bit) Sep 10 2026
 *   https://mp.weixin.qq.com/s/fOoXddwWjKixTbrMQiyd8Q
 * arXiv: 2607.07534
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    narrativeRole: "S",
    mediaStrategy: "asset-then-broll",
    aiVideo: {
      prompt:
        "SUBJECT: first-person shooter in a sci-fi snow world, explosions and energy shields. VISUAL METAPHOR: real-time world generation on consumer hardware. BRAND: dark cyber briefing, amber accent. REFERENCE: game engine B-roll. CAMERA: first-person forward motion. MOTION: continuous world unfolding. LIGHTING: dark sci-fi, amber explosions. NEGATIVE: no text, no UI, no logos.",
    },
    voiceover:
      "China's 1.3 billion world model runs real-time on one GPU.",
    texts: {
      badge: "OPEN SOURCE",
      subject: "LINGBOT-WORLD 2.0",
      bigNumber: "1.3B",
      numberLabel: "PARAMS, SINGLE GPU, REAL-TIME",
      source: "SOURCE: QbitAI, Sep 10 2026",
      stats: [
        { num: "60", unit: "FPS", label: "REAL-TIME" },
        { num: "720", unit: "P", label: "RESOLUTION" },
      ],
    },
  },
  {
    id: 2,
    name: "ifa-moment",
    visualType: "narrative",
    layout: "media-overlay",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset-then-broll",
    aiVideo: {
      prompt:
        "SUBJECT: large conference stage at IFA Berlin, executive presenting, screen showing AI world demo. VISUAL METAPHOR: industry validation moment. BRAND: dark cyber briefing. REFERENCE: tech keynote B-roll. CAMERA: wide stage shot. MOTION: slow zoom to screen. LIGHTING: stage spotlights, dark audience. NEGATIVE: no text overlay, no faces close-up.",
    },
    voiceover:
      "AMD SVP Jack Huynh said this is the future of personal AI. Here is how China pulled it off.",
    texts: {
      badge: "IFA BERLIN KEYNOTE",
      company: "AMD EXECUTIVE ON STAGE",
      action: "SEP 2026 LIVE DEMO",
      result: "PERSONAL AI VERDICT",
      context: "JACK HUYNH, AMD SVP",
      source: "SOURCE: IFA Berlin, Sep 2026",
    },
  },
  {
    id: 3,
    name: "july-release",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    mediaStrategy: "asset-then-broll",
    aiVideo: {
      prompt:
        "SUBJECT: AI-generated fantasy world with continuous landscape, character walking through varied terrain. VISUAL METAPHOR: hour-scale world generation. BRAND: dark cyber briefing, blue accent. REFERENCE: world model demo footage. CAMERA: third-person follow. MOTION: continuous forward exploration. LIGHTING: naturalistic world lighting. NEGATIVE: no text, no UI.",
    },
    voiceover:
      "QbitAI reported that Lingbo open-sourced LingBot-World 2.0 in July at 14 billion parameters. It hit 720p at 60 frames per second.",
    texts: {
      badge: "JULY 2026 OPEN SOURCE",
      company: "14B PARAMETERS",
      context: "720P / 60FPS REAL-TIME",
      action: "HOUR-SCALE GENERATION",
      result: "FULL MODEL RELEASED",
      source: "SOURCE: QbitAI, Sep 10 2026",
    },
  },
  {
    id: 4,
    name: "the-problem",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    mediaStrategy: "asset-then-broll",
    aiVideo: {
      prompt:
        "SUBJECT: dense server racks in a data center, GPU lights blinking, heavy compute infrastructure. VISUAL METAPHOR: deployment barrier, infrastructure cost. BRAND: dark cyber briefing, red accent. REFERENCE: data center B-roll. CAMERA: slow dolly through racks. MOTION: blinking lights, airflow. LIGHTING: dark, LED glow. NEGATIVE: no text, no people.",
    },
    voiceover:
      "But 14B needed heavy infrastructure. Kernel optimization, dynamic KV cache, async streaming. Most people could only watch demos online.",
    texts: {
      badge: "THE BARRIER",
      company: "TOO HEAVY TO RUN LOCALLY",
      context: "COMPILER-LEVEL TUNING",
      action: "ASYNC STREAMING PIPELINE",
      result: "DEMO-ONLY FOR MOST USERS",
      source: "SOURCE: arXiv 2607.07534",
    },
  },
  {
    id: 5,
    name: "not-shrink",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "b-roll",
    aiVideo: {
      prompt:
        "SUBJECT: abstract neural network nodes transforming from large dense cluster to small sparse graph. VISUAL METAPHOR: distillation, route change. BRAND: dark cyber briefing, amber accent. REFERENCE: tech explainer B-roll. CAMERA: slow push-in. MOTION: particles flowing large to small. LIGHTING: dark, amber glow. NEGATIVE: no text, no faces, no logos.",
    },
    voiceover:
      "They did not shrink the big model. They walked a different route.",
    texts: {
      badge: "PATTERN INTERRUPT",
      company: "NOT JUST SMALLER",
      context: "DIFFERENT TRAINING ROUTE",
      action: "NOT SHRUNK FROM 14B",
      result: "WALKED A NEW PATH",
    },
  },
  {
    id: 6,
    name: "causal-moba",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    mediaStrategy: "b-roll",
    aiVideo: {
      prompt:
        "SUBJECT: causal timeline flowing left to right, attention masks mixing bidirectional and autoregressive patterns. VISUAL METAPHOR: causality, information flow. BRAND: dark cyber briefing, blue accent. REFERENCE: ML paper figure style. CAMERA: horizontal pan. MOTION: timeline advancing, masks shifting. LIGHTING: dark, blue glow. NEGATIVE: no text, no faces, no charts.",
    },
    voiceover:
      "First, causal pretraining. The model only sees the past, never the future. Then MoBA mixes bidirectional and autoregressive attention to stop quality decay.",
    texts: {
      badge: "CAUSAL WORLD",
      company: "MoBA ATTENTION MASK",
      context: "FUTURE FRAMES CANNOT LEAK",
      action: "BIDIRECTIONAL PLUS AUTOREGRESSIVE",
      result: "BEATS MAGI AND HY-1.5",
      source: "SOURCE: arXiv 2607.07534",
    },
  },
  {
    id: 7,
    name: "distillation",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    mediaStrategy: "b-roll",
    aiVideo: {
      prompt:
        "SUBJECT: teacher-student distillation, multi-step denoising compressing to few-step, trajectory matching. VISUAL METAPHOR: compression, trajectory alignment. BRAND: dark cyber briefing, amber accent. REFERENCE: diffusion model explainer. CAMERA: static with zoom. MOTION: steps collapsing, trajectories aligning. LIGHTING: dark, amber and blue glow. NEGATIVE: no text, no faces, no labeled diagrams.",
    },
    voiceover:
      "Then two-stage distillation. Consistency distillation compresses denoising steps. DMD trains the student on its own rollout to kill drift.",
    texts: {
      badge: "TWO-STAGE DISTILLATION",
      company: "CONSISTENCY: FEW STEP",
      context: "DMD: SELF-ROLLOUT TRAINING",
      action: "REDUCES CUMULATIVE DRIFT",
      result: "STUDENT MATCHES TEACHER",
      source: "SOURCE: arXiv 2607.07534",
    },
  },
  {
    id: 8,
    name: "three-releases",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "R",
    mediaStrategy: "asset-then-broll",
    aiVideo: {
      prompt:
        "SUBJECT: timeline of three milestone markers advancing, each smaller and more accessible than the last. VISUAL METAPHOR: progressive democratization. BRAND: dark cyber briefing, amber accent. REFERENCE: timeline explainer B-roll. CAMERA: slow rightward pan. MOTION: markers lighting up sequentially. LIGHTING: dark, amber markers. NEGATIVE: no text, no faces.",
    },
    voiceover:
      "Three releases in nine months. Build it, make it real, make it run on your card.",
    texts: {
      company: "THREE RELEASES IN 9 MONTHS",
      action: "BUILD, MAKE REAL, RUN LOCAL",
      result: "1.0 THEN 14B THEN 1.3B",
      source: "SOURCE: QbitAI",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset-then-broll",
    aiVideo: {
      prompt:
        "SUBJECT: single consumer GPU card on a desk, screen showing real-time world generation running locally. VISUAL METAPHOR: democratized world model. BRAND: dark cyber briefing, amber accent. REFERENCE: desktop PC B-roll. CAMERA: slow push-in to screen. MOTION: world generating on screen. LIGHTING: dark room, screen glow. NEGATIVE: no text, no faces, no branding.",
    },
    voiceover:
      "That 1.3 billion model on one GPU? It is not a demo anymore. It is open source today.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "1.3B ON YOUR GPU",
      context: "SHIPPED, NOT TEASER",
      action: "OPEN SOURCE TODAY",
      result: "RUNS REAL-TIME",
      source: "SOURCE: GitHub robbyant",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    mediaStrategy: "asset",
    voiceover:
      "That 1.3 billion model is open source. Follow for what China builds next.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "WORLD MODELS",
    },
  },
];
