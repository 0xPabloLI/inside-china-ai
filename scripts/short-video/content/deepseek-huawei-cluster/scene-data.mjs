/**
 * Scene data for DeepSeek x Huawei Ascend cluster video.
 * 10 scenes, ~61s. Based on Bloomberg report (Sep 4, 2026) + The Decoder +
 * Huawei official roadmap; all numbers dual-source verified Sep 8, 2026.
 *
 * Narrative type: Deep Analysis (developing news, 48h+, multi-angle)
 * Hook pattern: P1 Result-First (number-led; previous video qwen4-preview
 * also used P1 — rotation check: zhipu used P1, qwen4 P1. Considered P5
 * expert framing, but the 160,000 number IS the story, so P1 stays.)
 *
 * Entity colors: DeepSeek = blue, Huawei = red, Beijing/government = amber.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    narrativeRole: "S",
    retentionMechanism: null,
    layout: "hero-center",
    mediaStrategy: "asset",
    assetNeed: "massive data center server racks glowing blue at night, wide aerial view",
    media: {
      type: "image",
      path: "assets/pexels-dc-dark2.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.85,
    },
    voiceover:
      "DeepSeek plans to buy 160,000 Huawei chips for one giant data center in China.",
    texts: {
      badge: "BREAKING",
      subject: "DEEPSEEK",
      bigNumber: "160,000",
      numberLabel: "HUAWEI ASCEND 950DT",
      stats: [
        { num: "1GW", unit: "", label: "POWER" },
        { num: "2027", unit: "", label: "OPENING" },
      ],
      source: "SOURCE: Bloomberg, Sep 4, 2026",
    },
  },
  {
    id: 2,
    name: "the-site",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    voiceover:
      "Bloomberg broke the story September 4. The site is Ulanqab, Inner Mongolia, 350 kilometers from Beijing.",
    texts: {
      badge: "BLOOMBERG, SEP 4",
      company: "ONE GIGAWATT SITE",
      action: "ULANQAB, INNER MONGOLIA",
      result: "350 KM FROM BEIJING",
      highlight: { field: "result", text: "350 KM" },
      context: "SITE FIRST REPORTED JULY 30",
      source: "SOURCE: Bloomberg, Sep 4, 2026",
    },
  },
  {
    id: 3,
    name: "inference-only",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    voiceover:
      "Here's the surprise. These chips only run models. Training stays Nvidia.",
    texts: {
      badge: "INFERENCE ONLY",
      company: "RUNS, DOESN'T TRAIN",
      action: "TRAINING STILL ON NVIDIA",
      result: "THE TWIST",
      highlight: { field: "action", text: "NVIDIA" },
      context: "INFERENCE IS WHERE AI COSTS PILE UP",
    },
  },
  {
    id: 4,
    name: "the-chip",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "close up of an advanced AI processor chip glowing red on a circuit board",
    media: {
      type: "image",
      path: "assets/pexels-ai-chip.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.78,
    },
    voiceover:
      "The Ascend 950DT is Huawei's newest AI chip. One petaflop of FP8, 144 gigabytes of homegrown memory.",
    texts: {
      badge: "ASCEND 950DT",
      company: "1 PFLOPS FP8",
      action: "144GB HUAWEI-BUILT HBM",
      result: "SHIPS Q4 2026",
      highlight: { field: "company", text: "1 PFLOPS" },
      source: "SOURCE: Huawei official roadmap",
    },
  },
  {
    id: 5,
    name: "why-domestic",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    voiceover:
      "Why go domestic? US export controls cut DeepSeek off from Nvidia's best chips.",
    texts: {
      badge: "WHY IT MATTERS",
      company: "US EXPORT CONTROLS",
      context: "TOP AI CHIPS OFF THE TABLE",
      action: "BLOCKED FROM NVIDIA",
      result: "DOMESTIC SILICON ONLY",
      highlight: { field: "company", text: "EXPORT CONTROLS" },
    },
  },
  {
    id: 6,
    name: "bottleneck",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "stacked-cards",
    voiceover:
      "But Bloomberg warns Huawei can't ship that many chips for over a year. Memory is the bottleneck.",
    mediaStrategy: "asset",
    texts: {
      badge: "THE BOTTLENECK",
      company: "12 PLUS MONTHS TO FILL",
      action: "PRODUCTION LIMITS",
      result: "HBM MEMORY SHORTAGE",
      highlight: { field: "result", text: "MEMORY" },
      context: "CXMT RUNS 3 TO 5 YEARS BEHIND RIVALS",
      source: "SOURCE: Bloomberg, Sep 4, 2026",
    },
  },
  {
    id: 7,
    name: "timeline",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "data center construction site with cranes at dusk, industrial scale",
    media: {
      type: "image",
      path: "assets/pexels-dc-construction.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.78,
    },
    voiceover:
      "The site could partially open in late 2027. No Huawei cluster has ever been bigger.",
    texts: {
      badge: "THE TIMELINE",
      company: "LATE 2027 PARTIAL OPEN",
      action: "GIGAWATT SCALE BUILD",
      result: "LARGEST CLUSTER EVER",
      highlight: { field: "result", text: "LARGEST" },
      source: "SOURCE: Bloomberg, Sep 4, 2026",
    },
  },
  {
    id: 8,
    name: "stakes",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: null,
    layout: "stacked-cards",
    mediaStrategy: "asset",
    voiceover:
      "Beijing is backing 295 billion in AI spending. Four of five chips domestic.",
    texts: {
      badge: "THE STAKES",
      company: "295 BILLION DOLLARS",
      context: "BEIJING AI BUILDOUT",
      action: "STATE BACKED SPENDING",
      result: "80% DOMESTIC CHIPS",
      highlight: { field: "company", text: "295" },
      source: "SOURCE: The Decoder, Sep 4, 2026",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    voiceover:
      "Remember the 160,000 chips? If Huawei ships them, China runs AI without Nvidia.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "REMEMBER THE 160,000?",
      context: "ONE ORDER, WHOLE INDUSTRY",
      action: "AI STACK WITHOUT NVIDIA",
      result: "THE REAL STORY",
      highlight: { field: "company", text: "160,000" },
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    narrativeRole: "T-Tell",
    retentionMechanism: null,
    mediaStrategy: "asset",
    voiceover: "DeepSeek bet big on Huawei silicon. Follow China AI News for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "DEEPSEEK'S HUAWEI BET",
    },
  },
];

export const metadata = {
  commentHook:
    "Can Huawei actually deliver 160,000 Ascend 950DT chips on time, or does the HBM bottleneck sink this? What's your call?",
  articleUrl: "https://chinaainews.com/posts/deepseek-huawei-cluster",
  trendingChecked: true,
  trendingHashtags: [],
};
