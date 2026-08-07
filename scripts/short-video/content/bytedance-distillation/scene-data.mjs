/**
 * Scene definitions for "ByteDance Founder: No Distillation"
 * Single video, TikTok 60-70s target.
 * Article: bytedance-zhang-yiming-no-distillation
 *
 * Key points from article:
 * - Zhang Yiming broke silence at Seed team meeting (Aug 2026)
 * - Anti-distillation policy dates to 2023, survived 3 internal debates
 * - ByteDance was NOT accused by Anthropic (unlike DeepSeek, Moonshot, MiniMax)
 * - Seed 2.0 Pro: 98.3 AIME, 3020 Codeforces, but trails on SWE-Bench
 * - 155M weekly active Doubao users
 * - Trained on H20 chips (export-compliant, China can buy), not B200 (banned)
 * - Same day: DeepSeek raised API prices
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "ByteDance has 155 million AI users. Its founder just banned the shortcut that could close the gap.",
    texts: {
      subject: "BYTEDANCE",
      hookText: "155M USERS, ONE BAN",
      revealText: "NO DISTILLATION",
      source: "ZHANG YIMING INTERNAL MEETING",
    },
  },
  {
    id: 2,
    name: "context",
    visualType: "narrative",
    voiceover:
      "China's ByteDance founder rarely speaks at Seed AI meetings. But this time, he was absolute: accept being behind, but do not distill.",
    texts: {
      person: "Zhang Yiming",
      role: "ByteDance Founder",
      badge: "RARE DIRECTIVE",
      meetingLabel: "SEED TEAM MEETING",
      source: "THE PAPER / REUTERS",
    },
  },
  {
    id: 3,
    name: "what-is-distillation",
    visualType: "concept",
    voiceover:
      "Distillation: a powerful teacher model generates outputs, and a smaller student learns from them. Cheap, fast, standard practice.",
    texts: {
      title: "DISTILLATION",
      teacher: "TEACHER MODEL",
      student: "STUDENT MODEL",
      arrow: "→",
      label: "LEARNS FROM OUTPUTS",
      note: "Google, OpenAI, Amazon all use it",
    },
  },
  {
    id: 4,
    name: "three-battles",
    visualType: "data",
    voiceover:
      "Since 2023, three internal battles. DeepSeek R1 shocked everyone. The Blackwell chip gap widened. Kimi K3 forced the issue.",
    texts: {
      number: "3",
      label: "INTERNAL BATTLES",
      point1: "DeepSeek R1 shock (Jan 2025)",
      point2: "Blackwell chip gap (Late 2025)",
      point3: "Kimi K3 forcing event (2026)",
      result: "ALL REJECTED",
    },
  },
  {
    id: 5,
    name: "zhang-stance",
    visualType: "quote",
    voiceover:
      "Zhang said: We can accept being temporarily behind, but do not distill. Not from closed models. Not from open ones either.",
    texts: {
      quote: "ACCEPT BEING BEHIND. DO NOT DISTILL.",
      speaker: "Zhang Yiming",
      source: "VIA GUIXINREN REPORT",
    },
  },
  {
    id: 6,
    name: "clean-record",
    visualType: "comparison",
    voiceover:
      "Anthropic accused DeepSeek, Moonshot, and MiniMax of industrial-scale distillation. China's ByteDance was not on that list.",
    texts: {
      title: "NAMED BY ANTHROPIC",
      left: "DeepSeek",
      leftStat: "24K accounts",
      middle: "Moonshot",
      middleStat: "3.4M exchanges",
      right: "MiniMax",
      rightStat: "13M exchanges",
      bytedance: "ByteDance: CLEAN",
    },
  },
  {
    id: 7,
    name: "compute-gap",
    visualType: "data",
    voiceover:
      "ByteDance trained Seedance on H20 chips, the only Nvidia chip China can legally buy. A fraction of B200 power.",
    texts: {
      chip: "H20",
      chipLabel: "CHINA CAN BUY",
      vs: "B200",
      vsLabel: "BANNED FOR CHINA",
      vsText: "VS",
      gap: "STRUCTURAL DISADVANTAGE",
      source: "PEKINGNOLOGY",
    },
  },
  {
    id: 8,
    name: "same-day",
    visualType: "contrast",
    voiceover:
      "Same day Zhang spoke, DeepSeek announced a major API price increase. One company raises prices on strength. The other chooses the harder path.",
    texts: {
      title: "SAME DAY, AUG 6",
      left: "DeepSeek",
      leftAction: "RAISES API PRICES",
      right: "ByteDance",
      rightAction: "BANS THE SHORTCUT",
      vs: "VS",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    voiceover: "Three debates rejected. The shortcut stays banned. Follow China AI News for more.",
    texts: {
      action: "FOLLOW FOR MORE",
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
    },
  },
];
