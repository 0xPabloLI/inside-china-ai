/**
 * Scene data for Qwen3.8-Flash-Next (Qwen4 architecture preview) video.
 * 10 scenes covering: hook, naming/positioning, open weights, specs,
 * training cost, hybrid attention, benchmarks, 1M context, loop closure.
 *
 * Narrative type: Deep Analysis (developing news, 48h+, multi-angle)
 * Hook pattern: P1 Result-First (number-led; previous video used Curiosity Gap)
 * Sources: Qwen official blog, Hugging Face model card, GitHub README
 * (all numbers verified against the official blog + HF model card, Aug 26, 2026)
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    narrativeRole: "S",
    retentionMechanism: null,
    layout: "hero-center",
    media: {
      type: "image",
      path: "assets/pexels-alibaba-02.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.85,
    },
    voiceover:
      "6 billion active parameters just beat Claude at coding. Alibaba revealed the weights for free.",
    texts: {
      badge: "BREAKING",
      subject: "QWEN4'S ENGINE",
      bigNumber: "6B",
      numberLabel: "ACTIVE PARAMS",
      stats: [
        { num: "1/9", unit: "", label: "TRAINING COST" },
        { num: "1M", unit: "", label: "TOKEN CONTEXT" },
      ],
      source: "SOURCE: Qwen official blog, Aug 26, 2026",
    },
  },
  {
    id: 2,
    name: "tease",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "It's called Qwen3.8-Flash-Next. Not Qwen4. So why is Alibaba publishing its blueprint early?",
    texts: {
      badge: "THE NAME",
      company: "NOT QWEN4. YET.",
      action: "SO WHY SHIP THE BLUEPRINT EARLY?",
      result: "QWEN4 PREVIEWED",
      highlight: "QWEN4",
      context: "SAME PLAY AS QWEN3-NEXT BEFORE QWEN3.5",
      source: "SOURCE: Qwen official blog, Aug 26, 2026",
    },
  },
  {
    id: 3,
    name: "open-weights",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "According to Qwen's blog, it previews the architecture that will underpin Qwen4. Open weights, on Hugging Face.",
    texts: {
      badge: "AUGUST 26, 2026",
      company: "OPEN WEIGHTS, DAY ONE",
      action: "HUGGING FACE + MODELSCOPE",
      result: "FREE TO DOWNLOAD",
      highlight: "FREE",
      context: "FP8 BUILD INCLUDED, GGUF AND MLX FOLLOWED",
      source: "SOURCE: Qwen official blog, Hugging Face model card",
    },
  },
  {
    id: 4,
    name: "specs",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "Qwen stated the spec sheet: 125 billion total parameters, 51 billion in n-gram embeddings, 6 billion active per token.",
    texts: {
      badge: "THE SPEC SHEET",
      company: "125B TOTAL PARAMS",
      action: "51B N-GRAM EMBEDDINGS",
      result: "6B ACTIVE PER TOKEN",
      highlight: "6B",
      context: "MULTIMODAL MoE, 262K NATIVE CONTEXT, YARN TO 1M",
      source: "SOURCE: Hugging Face model card, Aug 26, 2026",
    },
  },
  {
    id: 5,
    name: "cost-interrupt",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    layout: "stacked-cards",
    mediaOptOut: true,
    // EXPERIMENTAL ai-video asset need (FastMetal/MLX B-roll). Not yet consumed
    // by asset-sourcer; this field is the real prompt FastVideo runs for the scene.
    aiVideo: {
      prompt:
        "A glowing 3D bar chart of AI training cost collapsing, nine stacked neon blocks compressing into a single bright block, cinematic data visualization, dark studio background, slow push-in, high detail, no hands.",
    },
    voiceover:
      "Here's the number that stings. Training cost just one ninth of Qwen3.7-Plus.",
    texts: {
      badge: "PATTERN INTERRUPT",
      company: "THE COST",
      action: "TRAINING COMPUTE VS QWEN3.7-PLUS (397B)",
      result: "1/9 THE TRAINING COST",
      highlight: "1/9",
      context: "AND STRONGER ON CODING AND OFFICE TASKS",
      source: "SOURCE: Qwen official blog, Aug 26, 2026",
    },
  },
  {
    id: 6,
    name: "hybrid-attention",
    visualType: "narrative",
    layout: "media-overlay",
    narrativeRole: "R",
    retentionMechanism: null,
    media: {
      type: "image",
      path: "assets/qwen-architecture.png",
      source: "Qwen official blog",
      animation: "ken-burns",
      overlay: 0.78,
    },
    voiceover:
      "Every four layers, three compress history with Gated DeltaNet. One runs sparse attention for precise lookup.",
    texts: {
      badge: "HYBRID ATTENTION",
      company: "GDN + QSA",
      action: "3 LAYERS REMEMBER, 1 LAYER LOOKS UP",
      result: "MICRO-BLOCK PRECISION",
      highlight: "LOOKS UP",
      context: "GATED RESIDUAL + N-GRAM EMBEDDING + MUON",
      source: "SOURCE: Qwen official architecture diagram",
    },
  },
  {
    id: 7,
    name: "benchmarks",
    visualType: "stat-reveal",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "hero-center",
    voiceover:
      "On SWE-bench Pro it scores 62.5. The best Claude? 53.4. On phones, it dominates.",
    texts: {
      bigNumber: "62.5",
      label: "SWE-BENCH PRO",
      subtext: "CLAUDE-OPUS-4.6 MAX: 53.4",
      source: "SOURCE: Qwen official benchmarks, Aug 26, 2026",
    },
  },
  {
    id: 8,
    name: "long-context",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    // EXPERIMENTAL ai-video asset need (FastMetal/MLX B-roll) — motion counterpart
    // to the real assets/qwen-throughput.png diagram in this scene.
    aiVideo: {
      prompt:
        "Streams of text tokens racing through a neural pipeline at high speed, glowing throughput meters climbing and pulsing, dark blue tech aesthetic, cinematic slow orbit, high detail, no hands.",
    },
    layout: "media-overlay",
    media: {
      type: "image",
      path: "assets/qwen-throughput.png",
      source: "Qwen official blog",
      animation: "zoom",
      overlay: 0.78,
    },
    voiceover:
      "And at a million tokens of context, prefill throughput runs 8.6 times faster than the old flagship.",
    texts: {
      badge: "PEAK",
      company: "1M TOKEN CONTEXT",
      action: "PREFILL THROUGHPUT VS QWEN3.7-PLUS",
      result: "8.6X FASTER",
      highlight: "8.6X",
      context: "QSA KERNEL: PREFILL 7.6X, DECODE 4.9X",
      source: "SOURCE: Qwen official blog, 90% cache hit setup",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    // Was media-overlay with no media — which rendered an empty middle band
    // (R2 §3.5). stacked-cards is CSS-only, so the layout matches the data.
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "Remember 6 billion? That tiny active footprint is the whole point. Capacity without the compute bill.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "REMEMBER 6B PARAMS?",
      action: "CAPACITY GROWTH, COMPUTE FLAT",
      result: "THAT'S THE WHOLE POINT",
      highlight: "POINT",
      context: "51B EMBEDDINGS SIT IN REGULAR RAM, NOT VRAM",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    narrativeRole: "T-Tell",
    retentionMechanism: null,
    voiceover:
      "Qwen4 is coming. Those 6 billion parameters are the blueprint. Follow for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "QWEN4 IS COMING",
    },
  },
];

export const metadata = {
  commentHook:
    "Would you run a 6B-active model in production, or wait for the full Qwen4 family? What's your take on the preview-first strategy?",
  articleUrl: "https://chinaainews.com/posts/qwen4-preview",
  trendingChecked: true,
};
