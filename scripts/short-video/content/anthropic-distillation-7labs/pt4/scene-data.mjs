/**
 * V4: Anthropic caught the theft, then published the victims' secrets
 * Series: anthropic-distillation-7labs (Part 4/4)
 * Source: Anthropic threat intelligence report Sep 2026, PDF p.146-150
 * All claims verified against official PDF.
 */
export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    voiceover: "Anthropic revealed China stealing its AI. Then published the victims' secrets in a 154-page report.",
    texts: {
      subject: "ANTHROPIC",
      bigNumber: "154",
      numberLabel: "VICTIMS SECRETS",
      source: "ANTHROPIC PDF",
    },
  },
  {
    id: 2,
    name: "context",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "To prove the theft, Anthropic stated what was in the stolen requests. But those requests came from real users.",
    texts: {
      title: "EVIDENCE OR EXPOSURE?",
      left: ["PROVE THE THEFT"],
      right: ["PUBLISH USER DATA"],
    },
  },
  {
    id: 3,
    name: "pla",
    visualType: "data",
    layout: "hero-center",
    voiceover: "The report describes a PLA user loading CCTV surveillance from hundreds of cameras in Chengdu. Cameras outside military facilities.",
    texts: {
      stat: "100+",
      label: "PLA CAMERAS, CHENGDU",
      subtext: "PUBLISHED IN REPORT",
      source: "ANTHROPIC PDF P.149",
    },
  },
  {
    id: 4,
    name: "soe",
    visualType: "data",
    layout: "hero-center",
    voiceover: "It reveals an engineer at a state owned enterprise who exposed internal code and live credentials from multiple companies.",
    texts: {
      stat: "SOE",
      label: "CODE + CREDENTIALS",
      subtext: "PUBLISHED IN REPORT",
      source: "ANTHROPIC PDF P.149",
    },
  },
  {
    id: 5,
    name: "russia",
    visualType: "data",
    layout: "hero-center",
    voiceover: "It discloses live credentials for a Russian defense ministry database, relayed through DeepSeek to Claude.",
    texts: {
      stat: "RU",
      label: "DEFENSE MINISTRY DB",
      subtext: "PUBLISHED IN REPORT",
      source: "ANTHROPIC PDF P.150",
    },
  },
  {
    id: 6,
    name: "police",
    visualType: "data",
    layout: "hero-center",
    voiceover: "It details a police case management system that tracks citizens by national ID number. All sent to Claude.",
    texts: {
      stat: "PD",
      label: "ID NUMBER TRACKING",
      subtext: "PUBLISHED IN REPORT",
      source: "ANTHROPIC PDF P.150",
    },
  },
  {
    id: 7,
    name: "pharma",
    visualType: "data",
    layout: "hero-center",
    voiceover: "The report even includes a pharmaceutical company's internal capex forecasts, with dollar amounts redacted.",
    texts: {
      stat: "RX",
      label: "CAPEX FORECASTS",
      subtext: "PUBLISHED IN REPORT",
      source: "ANTHROPIC PDF P.146",
    },
  },
  {
    id: 8,
    name: "question",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "Anthropic caught the thieves. But it also published sensitive data from hundreds of users in a dozen languages.",
    texts: {
      title: "WHO WATCHES THE WATCHER?",
      left: ["CAUGHT THE THIEVES"],
      right: ["PUBLISHED THE VICTIMS"],
    },
  },
  {
    id: 9,
    name: "angle",
    visualType: "narrative",
    layout: "media-bottom-bar",
    voiceover: "The labs stole from their users. Anthropic caught them. Then Anthropic put the victims' data in a public PDF.",
    media: { type: "image", path: "assets/baidu_search-anthropic-01.jpg", source: "Baidu", animation: "ken-burns", overlay: 0.72 },
    texts: {
      company: "THE PRIVACY CHAIN",
      action: "LABS STOLE, ANTHROPIC PUBLISHES",
      result: "VICTIMS DATA EXPOSED",
      source: "ANTHROPIC",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    voiceover: "Who watches the watcher? Follow China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      brandHighlight: "AI",
    },
  },
];
