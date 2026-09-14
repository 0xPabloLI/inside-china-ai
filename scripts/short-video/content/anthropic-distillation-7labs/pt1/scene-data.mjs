/**
 * V1: Moonshot and DeepSeek secretly routed users to Claude
 * Series: anthropic-distillation-7labs (Part 1/4)
 * Source: Anthropic threat intelligence report Sep 2026, PDF p.148-150
 * All claims verified against official PDF.
 */
export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    aiVideo: { prompt: "futuristic AI data center with glowing server racks, cinematic vertical" },
    voiceover:
      "23 million times. Moonshot secretly swapped Kimi's AI backend to Claude. You never knew.",
    texts: {
      subject: "MOONSHOT",
      bigNumber: "23M",
      numberLabel: "BACKEND SWAPPED",
      source: "ANTHROPIC REPORT",
    },
  },
  {
    id: 2,
    name: "context",
    visualType: "narrative",
    layout: "media-bottom-bar",
    mediaStrategy: "asset-then-broll",
    voiceover:
      "Anthropic reported that China's Moonshot forwarded your requests to Claude, then passed Claude's answers back as Kimi's own work.",
    media: {
      type: "image",
      path: "assets/baidu_search-moonshot-02.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.72,
    },
    texts: {
      company: "MOONSHOT SERVES CLAUDE",
      action: "FORWARDED TO CLAUDE",
      result: "PASSED AS KIMI WORK",
      source: "ANTHROPIC",
    },
  },
  {
    id: 3,
    name: "scale",
    visualType: "data",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    aiVideo: { prompt: "data visualization of API requests, digital counter showing millions" },
    voiceover:
      "300,000 requests relayed in 10 days. 5,380 fake accounts across Singapore and Japan. 23 million exchanges total.",
    texts: {
      stat: "23M",
      label: "EXCHANGES, 300K IN 10 DAYS",
      subtext: "SG + JP PROXY NETWORK",
      source: "ANTHROPIC PDF",
    },
  },
  {
    id: 4,
    name: "deepseek",
    visualType: "narrative",
    layout: "media-bottom-bar",
    mediaStrategy: "asset-then-broll",
    voiceover:
      "Anthropic revealed DeepSeek tagging developers using Claude Code and the Agent SDK, then rerouting only them.",
    media: {
      type: "image",
      path: "assets/baidu_search-deepseek-03.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.72,
    },
    texts: {
      company: "DEEPSEEK",
      action: "TAGGED CLAUDE CODE USERS",
      result: "12.1M EXCHANGES",
      source: "ANTHROPIC",
    },
  },
  {
    id: 5,
    name: "pla-leak",
    visualType: "data",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    voiceover:
      "A PLA user loaded CCTV surveillance from hundreds of cameras in Chengdu. Cameras outside military facilities. All sent to Claude.",
    aiVideo: { prompt: "CCTV surveillance camera grid wall, security monitoring screens" },
    texts: {
      stat: "100+",
      label: "PLA CAMERAS, CHENGDU",
      subtext: "SENT TO CLAUDE",
      source: "ANTHROPIC PDF P.149",
    },
  },
  {
    id: 6,
    name: "soe-leak",
    visualType: "data",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    voiceover:
      "An engineer at a state owned enterprise exposed internal code and live credentials from multiple Chinese tech companies.",
    aiVideo: { prompt: "source code on dark computer screen, programming terminal" },
    texts: {
      stat: "SOE",
      label: "CODE + LIVE CREDENTIALS",
      subtext: "LEAKED TO CLAUDE",
      source: "ANTHROPIC PDF P.149",
    },
  },
  {
    id: 7,
    name: "russia-leak",
    visualType: "data",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    voiceover:
      "DeepSeek relayed requests from a Russian defense ministry IT operator. Live database credentials reached Anthropic.",
    aiVideo: { prompt: "source code on dark computer screen, programming terminal" },
    texts: {
      stat: "RU",
      label: "DEFENSE MINISTRY DB",
      subtext: "LIVE CREDENTIALS",
      source: "ANTHROPIC PDF P.150",
    },
  },
  {
    id: 8,
    name: "police-leak",
    visualType: "data",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    voiceover:
      "Engineers built a police case management system that tracks citizens by national ID. They sent it through DeepSeek to Claude.",
    aiVideo: { prompt: "police surveillance system interface, citizen tracking dashboard" },
    texts: {
      stat: "PD",
      label: "CITIZEN TRACKING BY ID",
      subtext: "SENT TO CLAUDE",
      source: "ANTHROPIC PDF P.150",
    },
  },
  {
    id: 9,
    name: "stakes",
    visualType: "contrast",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    voiceover:
      "Users in China thought they were using a local model. Their sensitive data went to an American company they never chose.",
    aiVideo: { prompt: "split screen comparison, transparency versus surveillance concept" },
    texts: {
      title: "WHO IS WATCHING?",
      left: ["CHINESE MODEL", "EXPECTED"],
      right: ["AMERICAN COMPANY", "ACTUAL"],
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    mediaStrategy: "asset-then-broll",
    voiceover: "The backend was swapped. Follow China AI News.",
    aiVideo: { prompt: "tech brand logo reveal on dark background, abstract digital particles" },
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      brandHighlight: "AI",
    },
  },
];
