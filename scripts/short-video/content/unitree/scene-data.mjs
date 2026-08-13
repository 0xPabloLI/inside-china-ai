/**
 * Scene definitions for the Unitree IPO video.
 * 10 scenes, ~60-65s. Breaking + Data type.
 *
 * Core narrative: $9B valuation, 8,288x oversubscribed,
 * but the company's own filing admits robots can't do real work.
 *
 * Sources: Reuters, Bloomberg, SCMP, Tech Times, Nikkei Asia, Caixin
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "Investors poured 118 billion dollars into a robot company that admits its robots can't do real work.",
    texts: {
      badge: "BREAKING",
      subject: "UNITREE",
      bigNumber: "$9B",
      subtitle: "VALUATION",
      subtitleHighlight: "8,288× OVERSUBSCRIBED",
      stats: [
        { num: "$118B", unit: "", label: "RETAIL DEMAND" },
        { num: "0.018%", unit: "", label: "WIN RATE" },
      ],
    },
  },
  {
    id: 2,
    name: "ipo-details",
    visualType: "narrative",
    media: {
      type: "video",
      path: "assets/unitree-demo.mp4",
      source: "Unitree Robotics",
      animation: "fade",
      overlay: 0.7,
    },
    voiceover:
      "Unitree Robotics IPO'd on Shanghai's STAR Market. First humanoid robot stock in China. Nine billion valuation overnight.",
    texts: {
      badge: "SHANGHAI STAR MARKET",
      company: "UNITREE ROBOTICS",
      action: "FIRST HUMANOID ROBOT IPO",
      result: "$9B VALUATION",
      context: "CHINA'S FIRST LISTED ROBOT MAKER",
    },
  },
  {
    id: 3,
    name: "oversubscription",
    visualType: "data",
    voiceover:
      "Global Times reported 8,288 times oversubscribed. Win rate: 0.018 percent. 118 billion in demand for 900 million in shares.",
    texts: {
      stat: "8,288×",
      statLabel: "OVERSUBSCRIBED",
      subtext: "$118B chased $900M IPO",
      source: "GLOBAL TIMES · AUG 10 2026",
    },
  },
  {
    id: 4,
    name: "company-background",
    visualType: "info-card",
    media: {
      type: "image",
      path: "assets/unitree-building.jpg",
      source: "Wikipedia",
      animation: "ken-burns",
      overlay: 0.75,
    },
    voiceover:
      "Founded in 2016 by Wang Xingxing in Hangzhou. Started with robot dogs. Now builds humanoids priced at sixteen thousand dollars.",
    texts: {
      title: "THE",
      titleHighlight: "COMPANY",
      subtitle: "Hangzhou Yushu Technology",
      points: [
        "Est. 2016, Hangzhou",
        "Began with robot dogs",
        "Humanoid H1: $16,000",
        "Based in Hangzhou, China",
      ],
    },
  },
  {
    id: 5,
    name: "products",
    visualType: "narrative",
    media: {
      type: "video",
      path: "assets/unitree-demo.mp4",
      source: "Unitree Robotics",
      animation: "zoom",
      overlay: 0.6,
    },
    voiceover:
      "Their H1 humanoid went viral. It walks, dances, and does backflips. But their own IPO filing tells a different story.",
    texts: {
      badge: "VIRAL DEMOS",
      company: "H1 HUMANOID",
      action: "WALKS, DANCES, BACKFLIPS",
      result: "BUT THE FILING SAYS...",
      context: "HOUSTON, WE HAVE A PROBLEM",
    },
  },
  {
    id: 6,
    name: "the-catch",
    visualType: "quote",
    media: {
      type: "video",
      path: "assets/unitree-demo.mp4",
      source: "Unitree Robotics",
      animation: "fade",
      overlay: 0.8,
    },
    voiceover:
      "Tech Times reported investors bet 118 billion despite the company's own admission of limitations in its filing.",
    texts: {
      quote: "The company's own filing admits robots cannot do real work.",
      source: "TECH TIMES · AUG 10 2026",
      verified: "$118B BET ANYWAY",
    },
  },
  {
    id: 7,
    name: "deepseek-backing",
    visualType: "context",
    voiceover:
      "DeepSeek and Tencent backed the IPO as strategic investors. The same DeepSeek that shook the AI world with V4 Flash.",
    texts: {
      title: "STRATEGIC",
      titleHighlight: "BACKERS",
      context: "DEEPSEEK + TENCENT",
      detail: "Same lab that topped global token usage",
      badge: "STRATEGIC PLACEMENT",
    },
  },
  {
    id: 8,
    name: "agibot-rivalry",
    visualType: "contrast",
    voiceover:
      "But AgiBot actually shipped more robots in the first half. Unitree IPO'd first, but they're not the market leader.",
    texts: {
      title: "FIRST TO IPO",
      vs: "VS",
      left: ["UNITREE", "First to IPO", "$9B valuation"],
      right: ["AGIBOT", "#1 in shipments", "Dethroned Unitree"],
      note: "IPO'd first,",
      noteHighlight: "not the leader",
    },
  },
  {
    id: 9,
    name: "china-dominance",
    visualType: "stat-reveal",
    voiceover:
      "Taipei Times reported China holds 97 percent of global humanoid shipments. The industry is Chinese.",
    texts: {
      bigNumber: "97%",
      label: "CHINA'S SHARE",
      subtext: "H1 2026 worldwide deliveries",
      source: "TAIPEI TIMES · AUG 10 2026",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI intelligence. Robots that can't work, but investors don't care.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
