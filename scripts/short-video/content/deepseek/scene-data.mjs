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
      badge: "BREAKING",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek",
      bigNumber: "$1.4B",
      subtitle: "FUNDING ROUND",
      subtitleHighlight: "PAUSED",
      stats: [
        { num: "4", unit: "HR", label: "LEAKED MEETING" },
        { num: "JULY 25", unit: "", label: "BLOOMBERG CONFIRMED" },
      ],
    },
  },
  {
    id: 2,
    name: "background",
    visualType: "timeline",
    voiceover:
      "In May, DeepSeek founder Liang Wenfeng held a closed-door meeting with investors. No press, no recording. Two months later, the full transcript leaked online, then disappeared within hours.",
    texts: {
      title: "WHAT HAPPENED",
      events: [
        { date: "MAY", text: "Closed-door investor meeting" },
        { date: "JULY 22", text: "Full transcript leaks on WeChat" },
        { date: "HOURS LATER", text: "Articles removed, screenshots spread" },
        { date: "JULY 25", text: "Bloomberg: funding round paused" },
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
      title: "NOT BUILT FOR PROFIT",
      leftTitle: "✕ WHAT THEY DON'T DO",
      left: ["IPO", "Exit strategy", "KPIs", "Hierarchy"],
      rightTitle: "✓ WHAT THEY DO",
      right: ["Consensus", "Strategic restraint", "Vision-first", "AGI above all"],
      quote: "Vision isn't a slogan on the wall. Vision is how you actually operate.",
      quoteKeyword: "how you actually operate",
    },
  },
  {
    id: 4,
    name: "pricing",
    visualType: "price-comparison",
    voiceover:
      "DeepSeek's API is priced to recover hardware costs in ten months. At fourteen cents per million tokens, it's one-twentieth the price of Claude. They could double the price and not lose users. They chose not to.",
    texts: {
      title: "API PRICING: 1/20 OF CLAUDE",
      bars: [
        { label: "Claude", value: "$3.00", color: "red", target: "100%" },
        { label: "GPT-5.6", value: "$1.00", color: "amber", target: "33%" },
        { label: "DeepSeek", value: "$0.14", color: "blue", target: "5%" },
      ],
      stats: [
        { num: "10 MO", label: "HARDWARE RECOVERY" },
        { num: "6x", label: "MARGIN" },
        { num: "1/20", label: "VS CLAUDE" },
      ],
      note: "Could charge 2x.",
      noteHighlight: "Chose not to.",
    },
  },
  {
    id: 5,
    name: "open-source",
    visualType: "open-source",
    voiceover:
      "DeepSeek open-sources its strongest models with production weights. No inferior version. The safety isn't generosity. It's a cost advantage. Competitors would pay several times more to deploy the same model.",
    texts: {
      title: "OPEN SOURCE =",
      titleHighlight: "STRONGEST MODEL",
      cards: [
        {
          icon: "🔓",
          name: "DeepSeek",
          desc: "Production weights.<br>No watered-down version.",
          color: "blue",
        },
        {
          icon: "🔒",
          name: "Competitors",
          desc: '"Forced" open source.<br>Inferior public versions.',
          color: "red",
        },
      ],
      points: [
        "Same weights as production",
        "Actively helps rivals deploy",
        "Cost barrier is structural",
      ],
      quote: "Like BYD batteries: same tech, but can you match that price?",
      quoteHighlight: "BYD batteries",
    },
  },
  {
    id: 6,
    name: "deployment-cost",
    visualType: "deployment-cost",
    voiceover:
      "Why is DeepSeek's cost so low? They built a compiler called TileLang that rewrites the entire CUDA stack. AI can now generate compatible software code. And dedicated AI chips no longer need gaming GPU compatibility. Nvidia's moat is eroding.",
    texts: {
      title: "THE",
      titleHighlight: "COST MOAT",
      tilelang: "TileLang",
      tilelangDesc: "DeepSeek's compiler: rewrites the full CUDA stack",
      factors: [
        { num: "1", text: "AI writes<br>compatible software code" },
        { num: "2", text: "TileLang replaces<br>the CUDA software layer" },
        { num: "3", text: "Dedicated AI chips don't need<br>gaming GPU compatibility" },
      ],
      verdict: "NVIDIA'S MOAT IS ERODING",
    },
  },
  {
    id: 7,
    name: "agi-staircase",
    visualType: "staircase",
    voiceover:
      "Liang mapped out six steps to AGI. Language models, chain of thought, agents, continuous learning, self-iteration, and embodied AI. The next bottleneck is continuous learning. The model that can finally remember context.",
    texts: {
      title: "THE",
      titleHighlight: "6-STEP",
      titleSuffix: "PATH TO AGI",
      steps: [
        { num: "1", text: "Language Models", status: "done" },
        { num: "2", text: "Chain of Thought", status: "done" },
        { num: "3", text: "Agents", status: "current" },
        { num: "4", text: "Continuous Learning", status: "next" },
        { num: "5", text: "Self-Iteration", status: "future" },
        { num: "6", text: "Embodied AI", status: "future" },
      ],
      arrow: "↑ NEXT BOTTLENECK: CONTINUOUS LEARNING",
    },
  },
  {
    id: 8,
    name: "team",
    visualType: "talent-drain",
    voiceover:
      "When asked what DeepSeek can't afford to lose, Liang didn't hesitate: the team. Five core researchers have already left for Tencent, ByteDance, and Xiaomi. If the senior team stays, everyone stays.",
    texts: {
      title: "THE ONE THING THEY",
      titleHighlight: "CAN'T LOSE",
      quote: "As long as I can maintain team stability, we will achieve AGI.",
      quoteHighlight: "team stability",
      departuresTitle: "CORE RESEARCHERS ALREADY GONE:",
      departures: [
        { name: "Wang Bingxuan", to: "Tencent", color: "blue" },
        { name: "Guo Daya", to: "ByteDance", color: "amber" },
        { name: "Luo Fuli", to: "Xiaomi", color: "purple" },
      ],
      conclusion: "If seniors stay → everyone stays",
    },
  },
  {
    id: 9,
    name: "compute-gap",
    visualType: "compute-gap",
    voiceover:
      "DeepSeek has twenty thousand GPUs. To match American frontier labs, they'd need two hundred thousand. Even spending all seven point four billion in reserves wouldn't be enough. The gap is compute, not talent.",
    texts: {
      title: "THE GAP IS",
      titleHighlight: "COMPUTE",
      titleSuffix: ", NOT TALENT",
      have: "20K",
      haveFill: "GPUs",
      haveLabel: "CURRENT",
      need: "200K",
      needFill: "GPUs",
      needLabel: "FRONTIER SCALE",
      vsText: "vs",
      reserve: "$7.4B",
      reserveLabel: "ALL RESERVES, STILL NOT ENOUGH",
      verdict: "10x gap.",
      verdictHighlight: "Money alone can't close it.",
    },
  },
  {
    id: 10,
    name: "huawei-ecosystem",
    visualType: "huawei-ecosystem",
    voiceover:
      "But China's chip problem is about to be solved. Huawei's 950 supernode matches Nvidia's GB300 in all tasks. The tradeoff: four Huawei chips equal one Nvidia in performance, with a two-year generation gap. Liang predicted that compatibility gap disappears within one year.",
    texts: {
      title: "CHINA'S",
      titleHighlight: "CHIP ANSWER",
      huaweiChip: "950",
      huaweiLabel: "HUAWEI SUPERNODE",
      huaweiMatch: "Matches GB300<br>in all tasks",
      nvidiaChip: "GB300",
      nvidiaLabel: "NVIDIA FLAGSHIP",
      nvidiaMatch: "Industry benchmark",
      vsText: "VS",
      stats: [
        { num: "4 : 1", label: "HUAWEI : NVIDIA" },
        { num: "2 YEARS", label: "GENERATION GAP" },
      ],
      prediction: "COMPATIBILITY GAP SOLVED",
      predictionSub: "Liang's prediction: within 1 year",
    },
  },
  {
    id: 11,
    name: "why-leak-hurt",
    visualType: "three-factors",
    voiceover:
      "Three reasons this leak was devastating. Liang is famously secretive, almost zero public appearances. The transcript names competitors directly. And it reveals GPU stockpiles and pricing logic that rivals would pay to know.",
    texts: {
      title: "WHY THIS LEAK WAS",
      titleHighlight: "DEVASTATING",
      factors: [
        {
          num: "1",
          title: "SECRECY",
          text: "Near-zero public presence. Declined all media for 3 years.",
          color: "red",
        },
        {
          num: "2",
          title: "NAMED RIVALS",
          text: "Direct criticism of Zhipu, ByteDance, Alibaba, Tencent, in his own words.",
          color: "amber",
        },
        {
          num: "3",
          title: "TRADE SECRETS",
          text: "GPU stockpile numbers & pricing logic, closely guarded.",
          color: "purple",
        },
      ],
    },
  },
  {
    id: 12,
    name: "cta",
    visualType: "cta",
    voiceover: "One leaked meeting. One paused round. Follow for more China AI breakdowns.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "China's AI, decoded.",
      line1: "Subscribe for more",
    },
  },
];
