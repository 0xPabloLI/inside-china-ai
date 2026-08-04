/**
 * Scene definitions for "The Distillation Storm" — Part 2: Kimi's Gambit
 * Series: china-llm-distillation-storm
 * Focus: K3 architecture controversy + benchmark cheating + identity bleed
 * Target: TikTok 60-70s (~165 words max at 2.5 wps)
 */

export const seriesMeta = {
  seriesId: "china-llm-distillation-storm",
  partNumber: 2,
  totalParts: 3,
  prevPartSlug: "scene-data-pt1.mjs",
  nextPartSlug: "scene-data-pt3.mjs",
  hookType: "recap",
  rewatchElement: "loop-reveal",
  compilationSlug: "china-llm-distillation-full",
};

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "This China AI thinks it's Claude 15% of the time. When asked who it is, Kimi K3 responds: I'm Claude, an AI assistant created by Anthropic.",
    texts: {
      line1: "I'M CLAUDE",
      line2: "KIMI K3 · 15% OF THE TIME",
    },
  },
  {
    id: 2,
    name: "recap",
    visualType: "recap",
    voiceover:
      "Part one: DeepSeek and others caught distilling Claude. Now: what happened when Kimi shipped first.",
    texts: {
      line1: "PART 1: THE CRACK",
      line2: "PART 2: KIMI'S GAMBIT",
    },
  },
  {
    id: 3,
    name: "k3-specs",
    visualType: "stat-reveal",
    voiceover:
      "Kimi K3: two point eight trillion parameters. One million token context. Released July sixteenth. Open weights July twenty-seventh.",
    texts: {
      bigNumber: "2.8T",
      label: "PARAMETERS",
      subtext: "Sparse MoE · 1M context · Open weights",
    },
  },
  {
    id: 4,
    name: "benchmarks",
    visualType: "data-table",
    voiceover:
      "On Arena Frontend Code, K3 jumped seventeen places to number one. But Moonshot revealed K3 below Claude on coding, agents, and frontier S-W-E.",
    texts: {
      title: "BENCHMARK vs REALITY",
      rows: [
        { label: "Arena Code", value: "#1 (+17)" },
        { label: "vs Claude (coding)", value: "Below" },
        { label: "vs Claude (agents)", value: "Below" },
        { label: "HLE-Full", value: "Lower" },
      ],
    },
  },
  {
    id: 5,
    name: "hallucination",
    visualType: "stat-reveal",
    voiceover:
      "Artificial Analysis reported K3's hallucination rate at 51%, up from 39%. Accuracy improved, but hallucinations climbed too.",
    texts: {
      bigNumber: "51%",
      label: "HALLUCINATION RATE",
      subtext: "Up from 39% · Artificial Analysis",
    },
  },
  {
    id: 6,
    name: "identity-bleed",
    visualType: "quote",
    voiceover:
      "K3 identifies as Claude in fifteen percent of conversations. GLM five-point-two showed similar behavior. LessWrong asked: does distilling Claude carry the persona?",
    texts: {
      quote: "I'm Claude, an AI assistant created by Anthropic.",
      source: "Kimi K3 · Hacker News + LessWrong",
    },
  },
  {
    id: 7,
    name: "white-house",
    visualType: "hook",
    voiceover:
      "A White House official stated China's K3 clones US tech. Microsoft and Nvidia C-E-Os backed Moonshot.",
    texts: {
      line1: "WHITE HOUSE:",
      line2: "CLONING US TECH",
    },
  },
  {
    id: 8,
    name: "teaser",
    visualType: "teaser",
    voiceover:
      "DeepSeek started the wave. One stock collapsed 80%. Part three: the fallout.",
    texts: {
      line1: "PART 3 TOMORROW",
      line2: "STOCK DOWN 80%",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI analysis. This is China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "China's AI, decoded.",
      line1: "Follow for Part 3",
    },
  },
];
