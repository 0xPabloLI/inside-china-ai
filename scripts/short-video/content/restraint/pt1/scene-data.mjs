/**
 * Scene definitions for "The Art of Restraint" — Part 1: Vision Over KPIs
 * Series: deepseek-restraint
 * Focus: Vision-driven organization, open source philosophy
 * Target: TikTok 60-70s (~165 words max at 2.5 wps)
 */

export const seriesMeta = {
  seriesId: "deepseek-restraint",
  partNumber: 1,
  totalParts: 3,
  prevPartSlug: null,
  nextPartSlug: "restraint/pt2",
  hookType: "T6-bold-claim",
  rewatchElement: "quote-reveal",
  compilationSlug: "deepseek-restraint-full",
};

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "DeepSeek has no KPIs. No org chart. Only a vision.",
    texts: {
      hookText: "0 KPIs. 0 ORG CHARTS.",
      revealText: "ONLY A VISION",
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
  {
    id: 2,
    name: "intro",
    visualType: "narrative",
    voiceover:
      "In a rare 3.5-hour meeting, China AI's most secretive CEO revealed why DeepSeek chooses restraint over profit.",
    texts: {
      person: "Liang Wenfeng",
      role: "DeepSeek CEO",
      badge: "EXCLUSIVE INSIGHT",
    },
  },
  {
    id: 3,
    name: "origin-story",
    visualType: "story",
    voiceover:
      "They started as ordinary people. No money, no chips, no fame. Just one thing: build AGI for humanity.",
    texts: {
      group: "ORDINARY PEOPLE",
      mission: "EXTRAORDINARY MISSION",
      arrow: "→",
    },
  },
  {
    id: 4,
    name: "price-cut",
    visualType: "data",
    voiceover:
      "When revenue surged, Liang did something crazy. He cut prices by 75 percent. The team cheered.",
    texts: {
      change: "-75%",
      reaction: "TEAM CHEERED",
      context: "PRICE CUT",
    },
  },
  {
    id: 5,
    name: "quote-kindness",
    visualType: "quote",
    voiceover:
      "We started with great kindness toward the world. Beyond money.",
    texts: {
      quote: "GREAT KINDNESS BEYOND MONEY",
      speaker: "Liang Wenfeng",
      source: "DEEPSEEK CEO",
    },
  },
  {
    id: 6,
    name: "vision-not-slogan",
    visualType: "contrast",
    voiceover:
      "Vision isn't a slogan on the wall. It's how you actually do things. Unwritten, but everyone feels it.",
    texts: {
      left: "SLOGAN ON WALL",
      right: "HOW YOU DO THINGS",
      vs: "VS",
    },
  },
  {
    id: 7,
    name: "jack-welch",
    visualType: "context",
    voiceover:
      "Liang cites GE's Jack Welch. Got most things wrong, but nailed this: vision matters most.",
    texts: {
      person: "Jack Welch",
      role: "GE CEO",
      point: "VISION MATTERS MOST",
    },
  },
  {
    id: 8,
    name: "open-source-paradox",
    visualType: "concept",
    voiceover:
      "That's why DeepSeek open-sources everything. AI will be 10 percent of global GDP. You can't monopolize that.",
    texts: {
      stat: "10%",
      context: "OF GLOBAL GDP",
      action: "OPEN SOURCE ALL",
    },
  },
  {
    id: 9,
    name: "vs-glm",
    visualType: "comparison",
    voiceover:
      "Zhipu also open-sources, but it feels forced. For DeepSeek, it's intentional. The vision requires it.",
    texts: {
      deepseek: "INTENTIONAL",
      glm: "FORCED",
      deepseekLabel: "DeepSeek",
      glmLabel: "Zhipu",
    },
  },
  {
    id: 10,
    name: "summary",
    visualType: "summary",
    voiceover:
      "So China's DeepSeek runs on vision, not KPIs. Kindness over profit, open by design. Part 2: the 10-month pricing rule.",
    texts: {
      points: ["VISION > KPIs", "KINDNESS > PROFIT", "OPEN BY DESIGN"],
      teaser: "PART 2: 10-MONTH RULE",
    },
  },
  {
    id: 11,
    name: "cta",
    visualType: "cta",
    voiceover:
      "Follow for part 2 tomorrow, where we break down DeepSeek's wild 10-month pricing rule.",
    texts: {
      action: "FOLLOW FOR PART 2",
      topic: "PRICING STRATEGY",
      brand: "CHINA AI NEWS",
      tagline: "CHINA AI, DECODED",
    },
  },
];
