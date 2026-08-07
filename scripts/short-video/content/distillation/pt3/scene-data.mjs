/**
 * Scene definitions for "The Distillation Storm" — Part 3: The Fallout
 * Series: china-llm-distillation-storm
 * Focus: MiniMax stock crash + Moonshot funding + industry impact
 * Target: TikTok 60-70s (~165 words max at 2.5 wps)
 */

export const seriesMeta = {
  seriesId: "china-llm-distillation-storm",
  partNumber: 3,
  totalParts: 3,
  prevPartSlug: "scene-data-pt2.mjs",
  nextPartSlug: null,
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
      "This China AI company's stock dropped 80% in five months. Anthropic accused them of the largest distillation volume of any lab.",
    texts: {
      line1: "STOCK DOWN 80%",
      line2: "MINIMAX · HKEX 0100.HK",
    },
  },
  {
    id: 2,
    name: "recap",
    visualType: "recap",
    voiceover:
      "Part one: DeepSeek's crack. Part two: Kimi's benchmarks. Now: who won, who lost, and what it means.",
    texts: {
      line1: "PART 1: THE CRACK",
      line2: "PART 2: KIMI → PART 3: THE FALLOUT",
    },
  },
  {
    id: 3,
    name: "minimax-crash",
    visualType: "timeline",
    voiceover:
      "MiniMax peaked at thirteen hundred in March. July ninth: lock-up expiry, eighteen percent single-day drop. Stock hit one hundred eighty-six. Eighty percent down.",
    texts: {
      events: [
        { date: "MAR", text: "PEAK HK$1,330" },
        { date: "JUL 9", text: "-18% LOCK-UP" },
        { date: "LATE JUL", text: "LOW HK$186" },
        { date: "AUG 3", text: "HK$247" },
      ],
    },
  },
  {
    id: 4,
    name: "moonshot-win",
    visualType: "stat-reveal",
    voiceover:
      "Meanwhile, Moonshot closed $3.5B at a $35B valuation. Bloomberg reported, July 29. Subscriptions suspended within 48 hours of launch.",
    texts: {
      bigNumber: "$3.5B",
      label: "MOONSHOT · $35B VALUATION",
      subtext: "Bloomberg · July 29, 2026",
    },
  },
  {
    id: 5,
    name: "ipo-drama",
    visualType: "contrast",
    voiceover:
      "Moonshot targeted a fifty billion I-P-O, then denied filing plans August third. Alibaba backed them with twenty thousand Nvidia chips.",
    texts: {
      left: ["REPORTED", "$50B IPO", "August filing"],
      right: ["DENIED", "No August filing", "Alibaba chips"],
    },
  },
  {
    id: 6,
    name: "the-playbook",
    visualType: "quote",
    voiceover:
      "DeepSeek started it. China's playbook: wait, improve, distill. Kimi opened this door.",
    texts: {
      quote: "Wait. Improve. Publish. Distill. Repeat.",
      source: "Insider account · Reddit r/LocalLLM",
    },
  },
  {
    id: 7,
    name: "verification",
    visualType: "data-table",
    voiceover:
      "We verified twenty-three claims against public sources. Three directly contradicted public data. Fourteen could not be independently confirmed.",
    texts: {
      title: "VERIFICATION SUMMARY",
      rows: [
        { label: "Verified", value: "23" },
        { label: "Partial", value: "12" },
        { label: "Unverified", value: "14" },
        { label: "Contradicts", value: "3" },
      ],
    },
  },
  {
    id: 8,
    name: "closing",
    visualType: "closing",
    voiceover:
      "The core story is confirmed. The specifics remain contested. But the benchmarks may be lying to you.",
    texts: {
      line1: "THE BENCHMARKS",
      line2: "MAY BE LYING TO YOU",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    voiceover: "That's the full story. Follow for more China AI analysis. This is China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
