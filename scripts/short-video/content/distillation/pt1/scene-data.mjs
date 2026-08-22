/**
 * Scene definitions for "The Distillation Storm" — Part 1: The Crack
 * Series: china-llm-distillation-storm
 * Focus: CoT cracking + Anthropic's public accusation
 * Target: TikTok 60-70s (~165 words max at 2.5 wps)
 */

export const seriesMeta = {
  seriesId: "china-llm-distillation-storm",
  partNumber: 1,
  totalParts: 3,
  prevPartSlug: null,
  nextPartSlug: "distillation/pt2",
  hookType: "standalone",
  rewatchElement: "hidden-detail",
  compilationSlug: "china-llm-distillation-full",
};

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "Three China AI labs were caught stealing Claude's brain. 24,000 fake accounts. 16 million conversations.",
    texts: {
      badge: "DISTILLATION ALERT",
      hookText: "3 LABS ACCUSED",
      revealText: "16M CONVERSATIONS",
      color: "red",
    },
  },
  {
    id: 2,
    name: "what-is-distillation",
    visualType: "contrast",
    voiceover:
      "They weren't just copying answers. They were stealing the full reasoning process. The chain of thought. Claude's inner thinking, encrypted but not unbreakable.",
    texts: {
      title: "NOT JUST COPYING ANSWERS",
      vs: "VS",
      leftTitle: "SURFACE LEVEL",
      left: ["ANSWERS", "CODE", "TOOL CALLS"],
      rightTitle: "WHAT THEY STOLE",
      right: ["REASONING", "CHAIN OF THOUGHT", "PERSONA"],
    },
  },
  {
    id: 3,
    name: "how-cracked",
    visualType: "timeline",
    voiceover:
      "Every Claude response included an encrypted Blob containing its raw thinking. Inject a forged Blob, and Claude would recite its own hidden reasoning. The cost? Tens of thousands of dollars.",
    texts: {
      title: "THE",
      titleHighlight: "CRACK",
      titleSuffix: " SEQUENCE",
      cost: "Cost:",
      costHighlight: "tens of thousands of dollars",
      events: [
        { date: "STEP 1", text: "FORGE BLOB" },
        { date: "STEP 2", text: "INJECT" },
        { date: "STEP 3", text: "CLAUDE RECITES CoT" },
        { date: "STEP 4", text: "CAPTURE" },
      ],
    },
  },
  {
    id: 4,
    name: "anthropic-accusation",
    visualType: "data-table",
    voiceover:
      "On February 23, Anthropic reported publicly. DeepSeek: 150,000 exchanges. Moonshot: 3.4 million. MiniMax: 13 million. The largest of all.",
    texts: {
      title: "ANTHROPIC'S ACCUSATION · FEB 2026",
      footer: "SOURCE: ANTHROPIC · FEBRUARY 2026",
      rows: [
        { label: "DeepSeek", value: "150K" },
        { label: "Moonshot (Kimi)", value: "3.4M" },
        { label: "MiniMax", value: "13M" },
        { label: "Fake Accounts", value: "24,000" },
      ],
    },
  },
  {
    id: 5,
    name: "crypto-blog",
    visualType: "quote",
    voiceover:
      "An independent cryptography blog confirmed the mechanism. Providers return hidden reasoning as encrypted blobs. Clients ship them back on the next turn. The blog named Fernet.",
    texts: {
      quote: "Encrypted reasoning blobs can be replayed across sessions.",
      source: "Cryptography Engineering Blog · May 2026",
      verified: "INDEPENDENTLY CONFIRMED",
    },
  },
  {
    id: 6,
    name: "not-named",
    visualType: "contrast",
    voiceover:
      "Qwen and Z-A-I were not named. Anthropic's accusations were selective. Moonshot never responded publicly.",
    texts: {
      title: "SELECTIVE ACCUSATIONS",
      vs: "VS",
      left: ["NAMED", "DeepSeek", "Moonshot", "MiniMax"],
      right: ["NOT NAMED", "Qwen", "Z.ai", "Others?"],
      note: "Moonshot",
      noteHighlight: "never responded publicly",
    },
  },
  {
    id: 7,
    name: "teaser",
    visualType: "teaser",
    voiceover:
      "One lab cracked it first, then gave it away free. Part two: the great distillation wave.",
    texts: {
      label: "COMING NEXT",
      line1: "PART 2 TOMORROW",
      line2: "ONE LAB CRACKED IT, THEN SHARED IT",
      countdown: "SUBSCRIBE TO NOT MISS IT",
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI analysis. This is China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR PART 2",
    },
  },
];
