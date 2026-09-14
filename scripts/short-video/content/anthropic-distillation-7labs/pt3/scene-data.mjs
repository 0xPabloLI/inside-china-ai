/**
 * V3: Seven Chinese AI labs, seven ways to steal Claude
 * Series: anthropic-distillation-7labs (Part 3/4)
 * Source: Anthropic threat intelligence report Sep 2026, PDF p.147-153
 * All claims verified against official PDF.
 */
export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    voiceover: "7 labs in China, 7 different ways to steal Claude. Anthropic named them all.",
    texts: {
      subject: "ANTHROPIC",
      bigNumber: "7",
      numberLabel: "LABS, 7 METHODS",
      source: "ANTHROPIC REPORT",
    },
  },
  {
    id: 2,
    name: "alibaba",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Anthropic reported Alibaba ran 151 million exchanges to grab Claude's reasoning traces. The biggest operation of the bunch.",
    texts: {
      stat: "151M",
      label: "EXCHANGES, COT THEFT",
      subtext: "GTG-16005",
      source: "ANTHROPIC",
    },
  },
  {
    id: 3,
    name: "moonshot",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Anthropic revealed Moonshot secretly routing your Kimi requests to Claude and passing the answers back. You never knew.",
    texts: {
      stat: "23M",
      label: "EXCHANGES, BACKEND SWAP",
      subtext: "GTG-16002",
      source: "ANTHROPIC",
    },
  },
  {
    id: 4,
    name: "deepseek",
    visualType: "data",
    layout: "hero-center",
    voiceover: "DeepSeek tagged developers using Claude Code and the Agent SDK, then rerouted their requests to Claude Opus.",
    texts: {
      stat: "12M",
      label: "EXCHANGES, DEV TARGETING",
      subtext: "GTG-16001",
      source: "ANTHROPIC",
    },
  },
  {
    id: 5,
    name: "zhipu",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Zhipu tried to steal Fable's cyber skills, failed, then used Opus 4.6 to grade other stolen models.",
    texts: {
      stat: "3.4M",
      label: "EXCHANGES, FABLE FAILED",
      subtext: "GTG-16006",
      source: "ANTHROPIC",
    },
  },
  {
    id: 6,
    name: "xiaomi",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Xiaomi launched a free trial to attract overseas developers, then replayed their coding sessions to Claude.",
    texts: {
      stat: "400K",
      label: "EXCHANGES, FREE TRIAL",
      subtext: "GTG-16008",
      source: "ANTHROPIC",
    },
  },
  {
    id: 7,
    name: "sensetime",
    visualType: "data",
    layout: "hero-center",
    voiceover: "SenseTime skipped the hacking. It just bought stolen user transcripts from third-party data vendors.",
    texts: {
      stat: "BUY",
      label: "STOLEN DATA VENDOR",
      subtext: "GTG-16012",
      source: "ANTHROPIC",
    },
  },
  {
    id: 8,
    name: "minimax",
    visualType: "data",
    layout: "hero-center",
    voiceover: "MiniMax built a shell company proxy that only sells access to Anthropic and OpenAI. No Chinese models offered.",
    texts: {
      stat: "PXY",
      label: "SELLS US MODELS ONLY",
      subtext: "GTG-16003",
      source: "ANTHROPIC",
    },
  },
  {
    id: 9,
    name: "pattern",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "Fake accounts, proxy networks, cross-session replay. Each lab in China picked a different path to the same goal.",
    texts: {
      title: "SAME GOAL, 7 PATHS",
      left: ["STEAL CLAUDE"],
      right: ["TRAIN OWN MODELS"],
      note: "DEEPSEEK TO MINIMAX",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    voiceover: "Seven labs, seven methods. Follow China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      brandHighlight: "AI",
    },
  },
];
