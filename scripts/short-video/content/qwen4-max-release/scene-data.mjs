/**
 * Scene data for Qwen4-Max official release video.
 *
 * Narrative type: Breaking release + data-led analysis
 * Hook family: result-first (62% lower cost per task, with last model as baseline)
 * Sources: Qwen official blog (2026-11-16), Qianwen model page, CodeArena,
 * Agents' Last Exam. Official USD cost figures: $4.43 -> $1.67, 62% lower.
 *
 * Every rendered string lives in `texts`. No business copy in templates.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    hookFamily: "result-first",
    narrativeRole: "S",
    retentionMechanism: null,
    media: null,
    voiceover:
      "Alibaba's new flagship just cut task cost by nearly two-thirds from its last model.",
    texts: {
      badge: "CHINA AI · NOV 16",
      subject: "QWEN4-MAX",
      bigNumber: "-62%",
      numberLabel: "TASK COST VS QWEN3.8-MAX",
      stats: [
        { num: "2.4T", unit: "", label: "TOTAL PARAMS" },
        { num: "1M", unit: "", label: "TOKEN CONTEXT" },
      ],
      source: "QWEN OFFICIAL BLOG, NOV 16, 2026",
    },
  },
  {
    id: 2,
    name: "spec",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    retentionMechanism: null,
    media: {
      type: "image",
      path: "assets/qwen4max-launch.jpg",
      source: "Qwen official release visual",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.0,
    },
    voiceover:
      "Qwen 4 Max is a 2.4-trillion-parameter model. Each token activates only 71 billion of those parameters.",
    texts: {
      company: "2.4T TOTAL PARAMS",
      action: "71B ACTIVE / TOKEN",
      result: "328B N-GRAM",
      source: "QWEN OFFICIAL BLOG",
    },
  },
  {
    id: 3,
    name: "architecture",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    media: {
      type: "image",
      path: "assets/qwen4max-architecture.jpg",
      source: "Qwen4-Max official architecture diagram",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.0,
    },
    voiceover:
      "The trick is the attention stack: three of every four layers compress history, and the fourth searches it.",
    texts: {
      company: "GDN + QSA",
      action: "3 LAYERS COMPRESS",
      result: "1 LAYER SEARCHES",
      source: "QWEN ARCHITECTURE",
    },
  },
  {
    id: 4,
    name: "context-window",
    visualType: "stat-reveal",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    media: null,
    voiceover:
      "It reads a million tokens and sees images natively. Long documents and screenshots fit in one context.",
    texts: {
      bigNumber: "1M",
      label: "TOKEN CONTEXT",
      subtext: "NATIVE VISION · TEXT / IMAGE",
      source: "QIANWEN MODEL PAGE",
    },
  },
  {
    id: 5,
    name: "work360",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    media: {
      type: "image",
      path: "assets/qwen4max-work360.jpg",
      source: "Qwen official Work360 chart",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.0,
    },
    voiceover:
      "Alibaba reported its own Work360 test covers 721 job types. Qwen 4 Max scores 52.69, up from 47.74. That is 10% higher.",
    texts: {
      company: "WORK360",
      action: "721 JOB TYPES",
      result: "52.69 VS 47.74",
      source: "ALIBABA'S WORK360",
    },
  },
  {
    id: 6,
    name: "agent-bench",
    visualType: "stat-reveal",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: null,
    media: null,
    voiceover:
      "On CodeArena's front-end leaderboard it ranks sixth. On Agents' Last Exam it scores 46.7 on that test.",
    texts: {
      bigNumber: "46.7",
      label: "AGENTS' LAST EXAM",
      subtext: "CODEARENA RANK #6",
      source: "SOURCE: CODEARENA / QWEN",
    },
  },
  {
    id: 7,
    name: "industrial",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "R",
    retentionMechanism: null,
    media: {
      type: "image",
      path: "assets/qwen4max-industrial.jpg",
      source: "Qwen official industrial delivery visual",
      fit: "contain",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.0,
    },
    voiceover:
      "In car-parts manufacturing, programming one workpiece fell from 475 minutes to 24. Alibaba reported a 95% cut.",
    texts: {
      company: "CAR-PART CNC",
      action: "TIME PER WORKPIECE",
      result: "475 MIN → 24 MIN",
      source: "QWEN OFFICIAL BLOG",
    },
  },
  {
    id: 8,
    name: "live-delivery",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    retentionMechanism: "open-loop",
    media: null,
    voiceover:
      "It does not wait for a perfect answer. It ships a usable first version, then keeps improving it.",
    texts: {
      badge: "LIVE DELIVERY",
      company: "SHIP A USABLE V1",
      action: "THEN IMPROVE IT",
      context: "USER STAYS IN CONTROL",
      result: "OPEN-SOURCE PLUGIN",
      source: "QWEN OFFICIAL BLOG",
    },
  },
  {
    id: 9,
    name: "caveat",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    media: null,
    voiceover:
      "Two caveats: these numbers are Alibaba's own, and Qwen 4 Max is closed. Smaller Qwen 4 models promised open.",
    texts: {
      badge: "THE CAVEAT",
      company: "VENDOR-REPORTED",
      action: "WORK360 IS ALIBABA'S OWN",
      context: "MAX IS CLOSED",
      result: "SMALL QWEN4 OPEN",
      source: "QWEN OFFICIAL BLOG",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    media: null,
    voiceover:
      "The price of finishing a task just fell by 62%. The question is who gets the credit.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "QWEN4-MAX · 62% CHEAPER",
    },
  },
];

export const metadata = {
  commentHook:
    "Alibaba says Qwen4-Max cuts task cost by 62%. Would you trust a 2.4T model to finish a real job?",
  trendingChecked: true,
};
