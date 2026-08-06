/**
 * Scene definitions for "The Art of Restraint" — Part 1: Vision Over KPIs
 * Series: deepseek-restraint
 * Focus: Vision-driven organization, open source philosophy
 * Target: TikTok 60-70s (~165 words max at 2.5 wps)
 *
 * NOTE: every string that renders on screen lives in `texts`. Scene
 * templates (scenes.mjs) must not contain business copy — the preflight
 * rules in lib/scene-rules.mjs validate this data, not the templates.
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
      subject: "DEEPSEEK",
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
      meetingDuration: "3.5h",
      meetingLabel: "INVESTOR MEETING",
    },
  },
  {
    id: 3,
    name: "origin-story",
    visualType: "story",
    voiceover:
      "They started as ordinary people. No money, no chips, no fame. Just one thing: build AGI for humanity.",
    texts: {
      title: "THE ORIGIN",
      group: "ORDINARY PEOPLE",
      mission: "EXTRAORDINARY MISSION",
      arrow: "→",
      beforeLabel: "STARTED AS",
      afterLabel: "BECAME",
      note: "No money. No chips. No fame. Just one goal.",
      noteHighlight: "one goal",
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
      title: "VISION IS NOT",
      left: "SLOGAN ON WALL",
      right: "HOW YOU DO THINGS",
      vs: "VS",
      note: "Unwritten, but everyone feels it",
      noteHighlight: "Unwritten",
    },
  },
  {
    id: 7,
    name: "jack-welch",
    visualType: "context",
    voiceover:
      "Liang cites GE's Jack Welch. Got most things wrong, but nailed this: vision matters most.",
    texts: {
      refLabel: "LIANG CITES",
      person: "Jack Welch",
      personInitials: "JW",
      role: "GE CEO",
      point: "VISION MATTERS MOST",
      context: "Got most things wrong, but nailed this",
      contextHighlight: "nailed this",
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
      conclusion: "You can't monopolize that",
      conclusionHighlight: "can't monopolize",
    },
  },
  {
    id: 9,
    name: "vs-glm",
    visualType: "comparison",
    voiceover:
      "Zhipu also open-sources, but it feels forced. For DeepSeek, it's intentional. The vision requires it.",
    texts: {
      title: "BOTH",
      titleHighlight: "OPEN SOURCE",
      deepseek: "INTENTIONAL",
      glm: "FORCED",
      deepseekLabel: "DeepSeek",
      glmLabel: "Zhipu",
      insight: "For DeepSeek, it's intentional. The vision requires it.",
      insightHighlight: "intentional",
    },
  },
  {
    id: 10,
    name: "summary",
    visualType: "summary",
    voiceover:
      "So China's DeepSeek runs on vision, not KPIs. Kindness over profit, open by design. Part 2: the 10-month pricing rule.",
    texts: {
      title: "DEEPSEEK'S",
      titleHighlight: "PLAYBOOK",
      points: ["VISION > KPIs", "KINDNESS > PROFIT", "OPEN BY DESIGN"],
      teaser: "PART 2: 10-MONTH RULE",
      teaserWhen: "TOMORROW",
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
