/**
 * Scene definitions for the Unitree IPO debut video — August 19, 2026.
 * 10 scenes, ~65s. Breaking News + Data type.
 *
 * Core narrative: Unitree IPO'd today, opened up 629%, market cap 445B yuan.
 * Founder became a post-90s billionaire. But 219x P/E raises questions.
 *
 * Sources: Caixin, Securities Times, Wall Street_cn, China Business Journal,
 * Global Times, Reuters, Bloomberg, Value Add VC, Investing.com HK, Forbes
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "A robot stock opened up 629 percent today. Market cap: 445 billion yuan.",
    texts: {
      badge: "BREAKING",
      subject: "UNITREE",
      subjectName: "UNITREE ROBOTICS",
      bigNumber: "+629%",
      subtitle: "OPENING POP",
      subtitleHighlight: "FIRST HUMANOID ROBOT IPO",
      stats: [
        { num: "¥445B", unit: "", label: "MARKET CAP" },
        { num: "¥1100", unit: "/share", label: "OPENING PRICE" },
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
      "Caixin reported Yu-shu listed on Shanghai's STAR Market. First humanoid robot stock in China. Price went 150 to 1100.",
    texts: {
      badge: "SHANGHAI STAR MARKET",
      company: "UNITREE ROBOTICS",
      action: "CHINA'S FIRST ROBOT LISTING",
      result: "¥150 → ¥1100",
      context: "CHINA'S FIRST LISTED ROBOT MAKER",
    },
  },
  {
    id: 3,
    name: "demand",
    visualType: "data",
    voiceover:
      "Securities Times said 978 million investors tried to buy. Win rate 0.018 percent. 8288 times oversubscribed. All records.",
    texts: {
      stat: "8,288×",
      statLabel: "OVERSUBSCRIBED",
      subtext: "978M investors chased $904M IPO",
      source: "SECURITIES TIMES · AUG 19 2026",
    },
  },
  {
    id: 4,
    name: "founder",
    visualType: "info-card",
    media: {
      type: "image",
      path: "assets/unitree-building.jpg",
      source: "Wikipedia",
      animation: "ken-burns",
      overlay: 0.75,
    },
    voiceover:
      "Founder Wang Xingxing started the company in 2016. Born after 1990. His stake: 130 billion yuan. China's richest post-90s founder.",
    texts: {
      title: "THE",
      titleHighlight: "FOUNDER",
      subtitle: "Wang Xingxing, age ~33",
      points: [
        "Founded 2016, Hangzhou",
        "Started with robot dogs",
        "Controls 65% voting rights",
        "Net worth: ¥130B+ ($18B)",
      ],
    },
  },
  {
    id: 5,
    name: "superman-reveal",
    visualType: "narrative",
    media: {
      type: "video",
      path: "assets/unitree-superman-demo.mp4",
      source: "Unitree Robotics",
      animation: "zoom",
      overlay: 0.6,
    },
    voiceover:
      "Two days before listing, the company unveiled Superman. Jumps 2 meters. Top speed 12.66 meters per second. Both beat human records.",
    texts: {
      badge: "2 DAYS BEFORE IPO",
      company: "SUPERMAN ROBOT",
      action: "JUMPS 2M, RUNS 12.66 M/S",
      result: "BEATS HUMAN RECORDS",
      context: "BUILT IN 3 MONTHS",
    },
  },
  {
    id: 6,
    name: "deepseek-backing",
    visualType: "context",
    voiceover:
      "DeepSeek backed the IPO. Liang Wenfeng's allocation gained 1.1 billion yuan day one. Tencent and the pension fund joined.",
    texts: {
      title: "STRATEGIC",
      titleHighlight: "BACKERS",
      context: "DEEPSEEK + TENCENT + PENSION FUND",
      detail: "Liang Wenfeng's gain: ¥1.1B on day one",
      badge: "STRATEGIC PLACEMENT",
    },
  },
  {
    id: 7,
    name: "valuation-warning",
    visualType: "quote",
    media: {
      type: "video",
      path: "assets/unitree-demo.mp4",
      source: "Unitree Robotics",
      animation: "fade",
      overlay: 0.8,
    },
    voiceover:
      "Investing.com noted opening P/E is 1600 times. IPO carried 219. A professor said the price is already high.",
    texts: {
      quote: "1,600x P/E ratio at opening. The IPO price was already 219x.",
      source: "INVESTING.COM · AUG 19 2026",
      verified: "PROFESSOR: PRICE ALREADY HIGH",
    },
  },
  {
    id: 8,
    name: "agibot-rivalry",
    visualType: "contrast",
    voiceover:
      "But AgiBot shipped more humanoids in H1. Yu-shu IPO'd first, but lost the shipment crown.",
    texts: {
      title: "FIRST TO IPO, NOT THE LEADER",
      vs: "VS",
      left: ["UNITREE", "First to IPO", "¥445B market cap"],
      right: ["AGIBOT", "#1 in shipments", "8,400 vs 5,900 units"],
      note: "IPO'd first,",
      noteHighlight: "lost the crown",
    },
  },
  {
    id: 9,
    name: "china-dominance",
    visualType: "stat-reveal",
    voiceover:
      "China holds 97 percent of global humanoid shipments. But 73 percent of the company's revenue is still research, not industry.",
    texts: {
      bigNumber: "97%",
      label: "CHINA'S SHARE",
      subtext: "H1 2026 global humanoid deliveries",
      source: "CHINA BUSINESS JOURNAL · AUG 2026",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    voiceover: "First robot stock popped 629 percent. Follow for more China AI intelligence.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
