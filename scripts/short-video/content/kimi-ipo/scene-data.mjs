/**
 * Scene definitions for "Kimi's $50B IPO"
 * Single video, TikTok 60-70s
 *
 * Narrative type: Breaking News (fact impact -> context -> analysis -> CTA)
 * Hook formula: P1 Result-First ($50B number lead)
 * Sources: Reuters, 36Kr, Pengpai, Jiemian, Artificial Analysis, Guancha
 *
 * NOTE: every string that renders on screen lives in `texts`. Scene
 * templates (scenes.mjs) must not contain business copy — the preflight
 * rules in lib/scene-rules.mjs validate this data, not the templates.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    mediaOptOut: true,
    voiceover: "50 billion dollars. Kimi's parent company is pushing for IPO at that valuation.",
    texts: {
      badge: "BREAKING",
      subject: "KIMI IPO",
      bigNumber: "$50B",
      numberLabel: "TARGET VALUATION",
      source: "REUTERS · 36KR · AUG 2026",
      color: "amber",
    },
  },
  {
    id: 2,
    name: "funding",
    visualType: "stat-reveal",
    layout: "hero-center",
    mediaOptOut: true,
    voiceover:
      "Moonshot AI raised 3.5 billion in its F round. Valuation jumped from 35 to 50 billion in six months.",
    texts: {
      bigNumber: "$3.5B",
      label: "RAISED · 7X IN 6 MONTHS",
      subtext: "$35B TO $50B VALUATION",
      source: "SOURCE: PENGPAI, JULY 29",
    },
  },
  {
    id: 3,
    name: "speed",
    visualType: "narrative",
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "Founded in April 2023. Just three years to reach IPO. That is faster than most US AI startups.",
    texts: {
      badge: "FOUNDED 2023",
      company: "3 YEARS TO IPO",
      context: "MOONSHOT AI",
      action: "HKEX BOUND",
      result: "FASTER THAN US STARTUPS",
      source: "SOURCE: JIEMIAN, BAIKE",
    },
  },
  {
    id: 4,
    name: "model",
    visualType: "stat-reveal",
    layout: "hero-center",
    mediaOptOut: true,
    voiceover:
      "Their weapon is Kimi K3. 2.8 trillion parameters. Artificial Analysis says it matches GPT 5.5 and Claude Opus 4.8.",
    texts: {
      bigNumber: "2.8T",
      label: "PARAMETERS · KIMI K3",
      subtext: "MATCHES GPT-5.5 · CLAUDE OPUS 4.8",
      source: "SOURCE: ARTIFICIAL ANALYSIS",
    },
  },
  {
    id: 5,
    name: "revenue",
    visualType: "narrative",
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "Reuters says Moonshot is negotiating with Microsoft, Amazon, and Google. It wants 30 percent of cloud revenue from K3.",
    texts: {
      badge: "REVENUE PLAY",
      company: "30% CLOUD SHARE",
      context: "K3 REVENUE",
      action: "MICROSOFT · AMAZON · GOOGLE",
      result: "FIRST CHINA AI DEAL",
      source: "SOURCE: REUTERS, AUG 26",
    },
  },
  {
    id: 6,
    name: "license",
    visualType: "narrative",
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "K3 is open weight. But the license has a catch. Make over 20 million from it, and you need a separate deal.",
    texts: {
      badge: "OPEN WEIGHT",
      company: "CUSTOM LICENSE",
      context: "KIMI K3",
      action: "$20M TRIGGER",
      result: "THEN RENEGOTIATE",
      source: "SOURCE: KIMI K3 LICENSE",
    },
  },
  {
    id: 7,
    name: "us-threat",
    visualType: "narrative",
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "The same week, US Treasury Secretary Scott Bessent said they may add Moonshot to a trade blacklist.",
    texts: {
      badge: "US THREAT",
      company: "TRADE BLACKLIST",
      context: "US TREASURY",
      action: "SCOTT BESSENT",
      result: "TREASURY SECRETARY",
      source: "SOURCE: REUTERS, JULY 22",
    },
  },
  {
    id: 8,
    name: "contrast",
    visualType: "contrast",
    layout: "hero-center",
    mediaOptOut: true,
    voiceover:
      "So China's AI unicorn faces US sanctions on one side, and negotiates with US tech giants on the other. All while filing for IPO.",
    texts: {
      title: "SANCTIONS vs DEALS",
      left: ["US SANCTIONS", "TRADE BLACKLIST"],
      right: ["MS · AMAZON · GOOGLE", "30% CLOUD SHARE"],
      note: "$50B IPO IN BETWEEN",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    mediaOptOut: true,
    voiceover: "That 50 billion dollar IPO bet starts now. Follow China AI News for more.",
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "KIMI'S $50B IPO",
      action: "FOLLOW FOR MORE",
      topic: "AI",
    },
  },
];
