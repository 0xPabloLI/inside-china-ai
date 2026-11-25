// Agnes agent stack: 9B Sys1 judgment, 14.3x faster steps, 1/27 cost,
// ALE 21.7% / 42.7, and the Mars rescue demo. Facts checked against
// https://github.com/AgnesAI-Labs/agnes-harness and QbitAI, 2026-11-20.
// Product name is "Agnes" in the voiceover; "harness" is an AI-vocabulary
// blacklist word and is kept out of spoken/on-screen copy.

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
      type: "video",
      path: "assets/agnes-mars-demo-01.mp4",
      source: "Agnes official Mars rescue demo, 2026-11-20",
      mode: "card",
      animation: "none",
      overlay: 0.55,
      volume: 0,
      upscale: false,
    },
    voiceover: "China's Agnes now runs a 9B judgment model inside an open agent stack.",
    texts: {
      badge: "CHINA AI",
      subject: "AGNES",
      bigNumber: "9B",
      numberLabel: "SYS1 JUDGMENT MODEL",
      stats: [
        { num: "6/9", unit: "", label: "BENCHMARK FIRSTS" },
        { num: "21.7%", unit: "", label: "ALE PASS RATE" },
      ],
      source: "AGNES / QBITAI",
    },
  },
  {
    id: 2,
    name: "four-roles",
    visualType: "narrative",
    layout: "media-bottom-bar",
    arcRole: "initial",
    narrativeRole: "T",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/agnes-architecture.png",
      source: "Agnes official architecture diagram",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0,
    },
    voiceover:
      "It is not one model. The stack has a language brain, a Sys1 judgment layer, memory, and a hardware body.",
    texts: {
      company: "CHINA AI · AGNES",
      action: "BRAIN · JUDGMENT",
      result: "MEMORY · BODY",
      source: "AGNES README",
    },
  },
  {
    id: 3,
    name: "latency",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "initial",
    narrativeRole: "A",
    media: null,
    voiceover:
      "Agnes reported that in a home-leak test, the big model needed 7.6 seconds per step. Sys1 needed 0.53, 14.3 times faster.",
    texts: {
      bigNumber: "14.3×",
      label: "FASTER PER STEP",
      subtext: "LLM 7.6s · SYS1 0.53s",
      source: "AGNES / QBITAI",
    },
  },
  {
    id: 4,
    name: "cost",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "initial",
    narrativeRole: "A",
    media: null,
    voiceover:
      "In a luggage-room test, one online LLM call cost about $0.00247. Sys1 cost $0.000091. One twenty-seventh.",
    texts: {
      bigNumber: "1/27",
      label: "COST PER DECISION",
      subtext: "$0.000091 VS $0.00247",
      source: "AGNES / QBITAI",
    },
  },
  {
    id: 5,
    name: "ale",
    visualType: "narrative",
    layout: "media-bottom-bar",
    arcRole: "peak",
    narrativeRole: "R",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/agnes-ale.png",
      source: "Agents' Last Exam leaderboard, Agnes official README",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0,
    },
    voiceover:
      "Agnes confirmed 21.7 percent pass rate and 42.7 score on the official ALE leaderboard. Its nine-test sheet has six first places.",
    texts: {
      company: "ALE 21.7%",
      action: "42.7 OVERALL SCORE",
      result: "6 OF 9 FIRST",
      source: "ALE / AGNES",
    },
  },
  {
    id: 6,
    name: "mars",
    visualType: "narrative",
    layout: "media-bottom-bar",
    arcRole: "initial",
    narrativeRole: "A",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "video",
      path: "assets/agnes-mars-demo-02.mp4",
      source: "Agnes official Mars rescue demo, 2026-11-20",
      mode: "card",
      animation: "none",
      overlay: 0.55,
      volume: 0,
      upscale: false,
    },
    voiceover:
      "The Mars rescue demo is the proof: send a hopper, find an astronaut, then coordinate a robot and airlock to bring them back.",
    texts: {
      company: "MARS RESCUE",
      action: "FIND · OPEN · RETURN",
      result: "MULTI-DEVICE",
      source: "AGNES DEMO",
    },
  },
  {
    id: 7,
    name: "caveat",
    visualType: "narrative",
    layout: "stacked-cards",
    arcRole: "release",
    narrativeRole: "R",
    media: null,
    voiceover:
      "Two limits: this is a developer preview, and the MHS device plugin is still in progress. Ordinary plugins are not sandboxed.",
    texts: {
      badge: "THE CAVEAT",
      company: "DEV PREVIEW",
      action: "MHS PLUGIN IN PROGRESS",
      context: "PLUGINS NOT SANDBOXED",
      result: "PRE-ALPHA",
      source: "AGNES README",
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    arcRole: "release",
    media: null,
    voiceover:
      "The stack is open. The question is whether China's agents can turn deployment work into reusable memory.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "AGNES · 9B SYS1",
    },
  },
];

export const metadata = {
  title: "China's Agnes Puts a 9B Brain Inside an Agent Stack",
  description:
    "Agnes open-sourced an Apache-2.0 agent stack with a 9B Sys1 judgment model. In its own tests, Sys1 was 14.3x faster per step and 1/27 the cost; on the public ALE leaderboard, the stack reached 21.7% pass rate and 42.7 score. The Mars rescue demo shows multi-device coordination, but the project is a developer preview and ordinary plugins are not sandboxed.",
  commentHook:
    "Agnes says its 9B Sys1 is 14.3x faster and 27x cheaper per decision. Would you trust a small judgment model to route a real agent?",
  trendingChecked: true,
  sources: [
    "https://github.com/AgnesAI-Labs/agnes-harness",
    "https://www.qbitai.com/2026/11/511582.html",
    "https://youtu.be/absoBkphEHE",
  ],
};
