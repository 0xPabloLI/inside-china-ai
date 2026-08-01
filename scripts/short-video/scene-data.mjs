/**
 * Scene definitions for the DeepSeek Short Video — Full Article Edition.
 * 12 scenes, ~2.5 minutes. Based on the full blog post content.
 * Each scene packs real information, not just hooks.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "A leaked four-hour investor meeting just paused DeepSeek's 1.4 billion dollar funding round.",
    texts: {
      line1: "LEAKED MEETING",
      line2: "PAUSED $1.4B",
    },
  },
  {
    id: 2,
    name: "background",
    visualType: "timeline",
    voiceover:
      "In May, DeepSeek founder Liang Wenfeng held a closed-door meeting with investors. No press, no recording. Two months later, the full transcript leaked online, then disappeared within hours.",
    texts: {
      events: [
        { date: "MAY", text: "CLOSED-DOOR MEETING" },
        { date: "JULY 22", text: "TRANSCRIPT LEAKS" },
        { date: "HOURS LATER", text: "ARTICLES REMOVED" },
        { date: "JULY 25", text: "BLOOMBERG: ROUND PAUSED" },
      ],
    },
  },
  {
    id: 3,
    name: "not-for-profit",
    visualType: "contrast",
    voiceover:
      "Liang said DeepSeek was never built to maximize profit. No IPO plan, no exit strategy, no KPIs. The company runs on consensus, not hierarchy. His word for it: strategic restraint.",
    texts: {
      left: ["NO IPO", "NO EXIT", "NO KPIs", "NO HIERARCHY"],
      right: ["CONSENSUS", "RESTRAINT", "VISION", "AGI FIRST"],
      quote: "Vision isn't a slogan on the wall. Vision is how you actually operate.",
    },
  },
  {
    id: 4,
    name: "pricing",
    visualType: "price-comparison",
    voiceover:
      "DeepSeek's API is priced to recover hardware costs in ten months. At fourteen cents per million tokens, it's one-twentieth the price of Claude. They could double the price and not lose users. They chose not to.",
    texts: {
      deepseekPrice: "$0.14",
      claudePrice: "$3.00",
      gptPrice: "$1.00",
      recovery: "10 MONTHS",
      margin: "6x MARGIN",
      ratio: "1/20",
    },
  },
  {
    id: 5,
    name: "open-source",
    visualType: "open-source",
    voiceover:
      "DeepSeek open-sources its strongest models with production weights. No inferior version. The safety isn't generosity. It's a cost advantage. Competitors would pay several times more to deploy the same model.",
    texts: {
      title: "SAME WEIGHTS AS PRODUCTION",
      points: ["No watered-down version", "Actively helps competitors deploy", "Cost barrier is structural"],
      quote: "Like BYD batteries — same tech, but can you match that price?",
    },
  },
  {
    id: 6,
    name: "deployment-cost",
    visualType: "deployment-cost",
    voiceover:
      "Why is DeepSeek's cost so low? They built a compiler called TileLang that rewrites the entire CUDA stack. AI can now generate compatible ecosystem code. And dedicated AI chips no longer need gaming GPU compatibility. Nvidia's moat is eroding.",
    texts: {
      title: "THE COST MOAT",
      tilelang: "TileLang",
      tilelangDesc: "Rewrites full CUDA stack",
      factors: [
        { num: "1", text: "AI generates ecosystem code" },
        { num: "2", text: "TileLang replaces CUDA" },
        { num: "3", text: "No gaming GPU legacy" },
      ],
      verdict: "NVIDIA'S MOAT IS ERODING",
    },
  },
  {
    id: 7,
    name: "agi-staircase",
    visualType: "staircase",
    voiceover:
      "Liang mapped out six steps to AGI. Language models, chain of thought, agents, continuous learning, self-iteration, and embodied AI. The next bottleneck is continuous learning — the model that can finally remember context.",
    texts: {
      steps: [
        { num: "1", text: "LANGUAGE MODELS", status: "done" },
        { num: "2", text: "CHAIN OF THOUGHT", status: "done" },
        { num: "3", text: "AGENTS", status: "current" },
        { num: "4", text: "CONTINUOUS LEARNING", status: "next" },
        { num: "5", text: "SELF-ITERATION", status: "future" },
        { num: "6", text: "EMBODIED AI", status: "future" },
      ],
    },
  },
  {
    id: 8,
    name: "team",
    visualType: "talent-drain",
    voiceover:
      "When asked what DeepSeek can't afford to lose, Liang didn't hesitate: the team. Five core researchers have already left for Tencent, ByteDance, and Xiaomi. If the senior team stays, everyone stays.",
    texts: {
      quote: "As long as I can maintain team stability, we will achieve AGI.",
      departures: [
        { name: "Wang Bingxuan", to: "Tencent" },
        { name: "Guo Daya", to: "ByteDance" },
        { name: "Luo Fuli", to: "Xiaomi" },
      ],
    },
  },
  {
    id: 9,
    name: "compute-gap",
    visualType: "compute-gap",
    voiceover:
      "DeepSeek has twenty thousand GPUs. To match American frontier labs, they'd need two hundred thousand. Even spending all seven point four billion in reserves wouldn't be enough. The gap is compute, not talent.",
    texts: {
      have: "20,000",
      need: "200,000",
      haveLabel: "CURRENT GPUs",
      needLabel: "FRONTIER SCALE",
      reserve: "$7.4B",
      reserveLabel: "RESERVES — STILL NOT ENOUGH",
    },
  },
  {
    id: 10,
    name: "huawei-ecosystem",
    visualType: "huawei-ecosystem",
    voiceover:
      "But China's chip problem is about to be solved. Huawei's 950 supernode matches Nvidia's GB300 in all tasks. The tradeoff: four Huawei chips equal one Nvidia in performance, with a two-year generation gap. Liang predicted the ecosystem problem disappears within one year.",
    texts: {
      title: "CHINA'S CHIP ANSWER",
      huaweiChip: "950",
      huaweiLabel: "SUPERNODE",
      nvidiaChip: "GB300",
      nvidiaLabel: "NVIDIA FLAGSHIP",
      ratio: "4 : 1",
      ratioLabel: "HUAWEI : NVIDIA",
      gap: "2 YEARS",
      gapLabel: "GENERATION GAP",
      prediction: "ECOSYSTEM PROBLEM SOLVED WITHIN 1 YEAR",
    },
  },
  {
    id: 11,
    name: "why-leak-hurt",
    visualType: "three-factors",
    voiceover:
      "Three reasons this leak was devastating. Liang is famously secretive, almost zero public appearances. The transcript names competitors directly. And it reveals GPU stockpiles and pricing logic that rivals would pay to know.",
    texts: {
      factors: [
        { num: "1", title: "SECRECY", text: "Near-zero public presence" },
        { num: "2", title: "NAMED RIVALS", text: "Direct criticism of competitors" },
        { num: "3", title: "TRADE SECRETS", text: "GPU counts & pricing logic" },
      ],
    },
  },
  {
    id: 12,
    name: "cta",
    visualType: "cta",
    voiceover: "That's the full picture. Follow for more China AI deep dives.",
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "China's AI, decoded.",
      line1: "Subscribe for more",
    },
  },
];
