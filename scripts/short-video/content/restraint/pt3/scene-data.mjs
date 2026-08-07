/**
 * Scene definitions for "The Art of Restraint" — Part 3: AGI Roadmap
 * Series: deepseek-restraint
 * Focus: AGI technical path, team stability as core interest
 * Target: TikTok 60-70s (~165 words max at 2.5 wps)
 *
 * Migrated from the legacy root file scripts/short-video/scene-data-pt3.mjs
 * (2026-08-08). Data fixes applied to satisfy current preflight rules
 * (lib/scene-rules.mjs / MRL-2):
 *   - em/en-dashes removed from voiceover (scenes 2, 7)
 *   - "deep dive" replaced (AI vocabulary blacklist, scene 10)
 *   - "china" keyword now in 2+ scenes (9, 10)
 *   - source attribution via "Liang said" added (scenes 2, 7)
 *   - share-worthy data points added to 5 scenes from the source article
 *     (articles/deepseek-art-of-restraint.md): 3.5h meeting, 6-12 months,
 *     May 20 meeting, 2024/2025 roadmap, 10% of global GDP
 *   - total voiceover trimmed to ≤180 words
 *
 * NOTE: every string that renders on screen lives in `texts`. Scene
 * templates (scenes.mjs) must not contain business copy — the preflight
 * rules in lib/scene-rules.mjs validate this data, not the templates.
 */

export const seriesMeta = {
  seriesId: "deepseek-restraint",
  partNumber: 3,
  totalParts: 3,
  prevPartSlug: null,
  nextPartSlug: null,
  hookType: "standalone",
  rewatchElement: "roadmap-detail",
  compilationSlug: "deepseek-restraint-full",
};

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "DeepSeek's only non-negotiable: team stability. Money and resources are easy. Keep the team together.",
    texts: {
      subject: "DEEPSEEK",
      line1: "ONE RULE",
      line2: "TEAM STABILITY",
      line3: "EVERYTHING ELSE FLEXIBLE",
    },
  },
  {
    id: 2,
    name: "core-interest",
    visualType: "concept",
    voiceover:
      "At the 3.5-hour meeting, Liang said: as long as the team stays, we'll build AGI. Everything else is time. At worst, 6 to 12 months late. They won't fail.",
    texts: {
      core: "TEAM STABILITY",
      result: "AGI INEVITABLE",
      consequence: "LATE BUT NOT FAIL",
    },
  },
  {
    id: 3,
    name: "why-people-join",
    visualType: "motivation",
    voiceover:
      "People join to build AGI. That's the draw. At the May 20 meeting, Liang said it's vision, not stock options.",
    texts: {
      motivation: "BUILD AGI",
      effect: "CORE VETERANS STAY",
      outcome: "TEAM STABILITY",
    },
  },
  {
    id: 4,
    name: "agi-roadmap",
    visualType: "roadmap",
    voiceover:
      "DeepSeek's roadmap: language models, 2024 chain-of-thought, 2025 agents, next continuous learning, then the singularity.",
    texts: {
      steps: ["LLM", "CoT", "AGENTS", "CONTINUOUS LEARNING"],
      active: 2,
      current: "AT AGENTS NOW",
      next: "CONTINUOUS LEARNING",
    },
  },
  {
    id: 5,
    name: "self-iteration",
    visualType: "vision",
    voiceover:
      "Beyond that: AI develops its own next versions. Then embodied AI enters the real world.",
    texts: {
      singularity: "AI DEVELOPS AI",
      next: "EMBODIED AI",
      final: "REAL WORLD IMPACT",
    },
  },
  {
    id: 6,
    name: "easiest-path",
    visualType: "insight",
    voiceover:
      "They call this the easiest path. Each step builds on the last. No overtime. Reverse would be brutal.",
    texts: {
      approach: "SEQUENTIAL BUILDING",
      benefit: "NO OVERTIME",
      contrast: "REVERSE = BRUTAL",
    },
  },
  {
    id: 7,
    name: "byproduct-not-destination",
    visualType: "concept",
    voiceover:
      "C-end users and B-end customers are byproducts of the real mission: AGI. Liang said AI could occupy 10% of global GDP. Output is a side effect.",
    texts: {
      mission: "DOING AGI",
      byproduct: "COMMERCIAL OUTPUT",
      not: "NOT THE GOAL",
    },
  },
  {
    id: 8,
    name: "why-they-won",
    visualType: "story",
    voiceover:
      "Last spring people fought for C-end traffic. The one who didn't fight won it anyway.",
    texts: {
      others: "FOUGHT FOR TRAFFIC",
      deepseek: "DIDN'T FIGHT",
      result: "WON ANYWAY",
    },
  },
  {
    id: 9,
    name: "summary",
    visualType: "summary",
    voiceover:
      "So China's DeepSeek: restraint over greed, team stability over resources, AGI over everything. Vision-driven, not KPI-driven.",
    texts: {
      points: ["TEAM STABILITY > MONEY", "AGI > SHORT-TERM", "VISION > KPIs"],
      final: "REMARKABLY DISCIPLINED",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI breakdowns. What's your take on DeepSeek's strategy?",
    texts: {
      action: "FOLLOW FOR MORE",
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
    },
  },
];
