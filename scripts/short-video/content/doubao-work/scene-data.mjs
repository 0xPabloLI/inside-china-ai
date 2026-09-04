/**
 * Scene data for Doubao Work launch video.
 * 10 scenes covering: launch, agent capabilities, Feishu integration,
 * organizational context, market position, competitive landscape.
 *
 * Narrative type: Breaking News (fact impact -> context -> impact -> next)
 * Hook formula: Curiosity Gap
 * Sources: WeChat official announcement, pedaily.cn, 36kr, sina finance
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    voiceover:
      "382 million users. That's ByteDance's Doubao. Today it launched Doubao Work, an agent operating your computer. But here's what nobody noticed.",
    texts: {
      badge: "BREAKING",
      subject: "DOUBAO WORK",
      hookText: "AI THAT OPERATES",
      highlight: { field: "hookText", text: "OPERATES" },
      revealText: "YOUR COMPUTER",
      stats: [
        { num: "382M", unit: "", label: "DOUBAO USERS" },
        { num: "$4B", unit: "", label: "BYTE AI ARR" },
      ],
      source: "SOURCE: ByteDance official, Aug 25, 2026",
    },
  },
  {
    id: 2,
    name: "tease",
    visualType: "narrative",
    layout: "media-bottom-bar",
    media: {
      type: "image",
      path: "assets/pexels-bytedance-01.jpg",
      source: "Pexels",
      animation: "ken-burns",
      overlay: 0.75,
    },
    voiceover:
      "26 days earlier, Sina Finance reported ByteDance folded Feishu into Doubao. The question is why.",
    texts: {
      badge: "26 DAYS EARLIER",
      company: "FEISHU MERGED INTO DOUBAO",
      action: "JULY 30, 2026",
      result: "WHY?",
      highlight: { field: "result", text: "WHY" },
      context: "FEISHU CEO XIE XIN NOW REPORTS TO DOUBAO LEAD ZHAO QI",
      source: "SOURCE: Sina Finance, July 30, 2026",
    },
  },
  {
    id: 3,
    name: "what-it-does",
    visualType: "narrative",
    layout: "media-bottom-bar",
    media: {
      type: "image",
      path: "assets/searxng_image-bytedance-01.jpg",
      source: "SearXNG",
      animation: "fade",
      overlay: 0.72,
    },
    voiceover:
      "Doubao Work doesn't just generate content. It writes plans, analyzes data, builds apps.",
    texts: {
      badge: "CAPABILITIES",
      company: "NOT JUST CHAT",
      action: "WRITES, ANALYZES, CREATES",
      result: "EVEN BUILDS APPS",
      highlight: { field: "result", text: "BUILDS" },
      context: "GENERATES AND EDITS IMAGES, VIDEO, WEB, APPLICATIONS",
      source: "SOURCE: pedaily.cn, Aug 25, 2026",
    },
  },
  {
    id: 4,
    name: "computer-control",
    visualType: "narrative",
    layout: "media-split",
    media: {
      type: "image",
      path: "assets/brave_image-bytedance-01.jpg",
      source: "Brave Search",
      animation: "ken-burns",
      overlay: 0.73,
    },
    voiceover:
      "Here's the wild part. It controls your browser, fills forms, runs software. PC off? Cloud takes over. Tasks keep running.",
    texts: {
      badge: "PATTERN INTERRUPT",
      company: "IT CONTROLS YOUR PC",
      action: "BROWSER + SOFTWARE + CLOUD",
      result: "WORKS WHILE YOU SLEEP",
      highlight: { field: "result", text: "SLEEP" },
      context: "CLOUD COMPUTER KEEPS RUNNING EVEN WHEN YOUR PC IS OFF",
      source: "SOURCE: pedaily.cn, Aug 25, 2026",
    },
  },
  {
    id: 5,
    name: "feishu-integration",
    visualType: "narrative",
    layout: "media-split",
    media: {
      type: "image",
      path: "assets/searxng_image-bytedance-02.jpg",
      source: "SearXNG",
      animation: "zoom",
      overlay: 0.72,
    },
    voiceover:
      "The differentiator is Feishu, or Lark overseas. ByteDance's Slack rival. Log in and it inherits your enterprise context: chats, docs, meetings.",
    texts: {
      badge: "THE SECRET WEAPON",
      company: "DEEP FEISHU INTEGRATION",
      action: "INHERITS ENTERPRISE CONTEXT",
      result: "CHATS, DOCS, MEETINGS",
      highlight: { field: "result", text: "MEETINGS" },
      context: "NOT JUST PROMPTS. REAL WORK CONTEXT.",
      source: "SOURCE: ByteDance official announcement",
    },
  },
  {
    id: 6,
    name: "knowledge-loop",
    visualType: "narrative",
    layout: "media-overlay",
    media: {
      type: "image",
      path: "assets/brave_image-bytedance-02.jpg",
      source: "Brave Search",
      animation: "ken-burns",
      overlay: 0.74,
    },
    voiceover:
      "What you create together flows back to Feishu as reusable knowledge. The agent gets smarter every task.",
    texts: {
      badge: "FEEDBACK LOOP",
      company: "KNOWLEDGE ACCUMULATES",
      action: "CONTENT FLOWS BACK",
      result: "AGENT GETS SMARTER",
      highlight: { field: "result", text: "SMARTER" },
      context: "EVERY TASK ENRICHES THE NEXT ONE",
      source: "SOURCE: ByteDance official announcement",
    },
  },
  {
    id: 7,
    name: "market-context",
    visualType: "narrative",
    layout: "media-overlay",
    media: {
      type: "image",
      path: "assets/searxng_image-bytedance-03.jpg",
      source: "SearXNG",
      animation: "ken-burns",
      overlay: 0.75,
    },
    voiceover:
      "According to QuestMobile, Doubao has 382M monthly users. But daily revenue is under $140K. Annual AI spend? $28 billion.",
    texts: {
      badge: "THE STAKES",
      company: "382M USERS, $0 REVOLUTION",
      action: "DAILY REVENUE < $140K",
      result: "AI SPEND: $28B/YEAR",
      highlight: { field: "result", text: "$28B" },
      context: "QUESTMOBILE JUNE 2026: #1 AI CHATBOT IN CHINA",
      source: "SOURCE: QuestMobile, sina finance, 2026",
    },
  },
  {
    id: 8,
    name: "competition",
    visualType: "narrative",
    layout: "stacked-cards",
    media: {
      type: "image",
      path: "assets/brave_image-bytedance-03.jpg",
      source: "Brave Search",
      animation: "fade",
      overlay: 0.73,
    },
    voiceover:
      "36kr reported Tencent's WorkBuddy leads with 21M visits. Alibaba launched Qianwen Office. The AI office war begins.",
    texts: {
      badge: "COMPETITION",
      company: "AI OFFICE WAR",
      action: "TENCENT WORKBUDDY: 21M VISITS",
      result: "ALIBABA QIANWEN OFFICE",
      highlight: { field: "result", text: "ALIBABA" },
      context: "THREE-WAY BATTLE: BYTEDANCE VS TENCENT VS ALIBABA",
      source: "SOURCE: 36kr, huxiu, August 2026",
    },
  },
  {
    id: 9,
    name: "bigger-picture",
    visualType: "narrative",
    layout: "stacked-cards",
    media: {
      type: "image",
      path: "assets/bing_news-bytedance-01.jpg",
      source: "Bing News",
      animation: "ken-burns",
      overlay: 0.75,
    },
    voiceover:
      "Remember the question? Why merge Feishu into Doubao? Now clear. ByteDance built an agent with your company's brain.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "ANSWER TO WHY",
      action: "AGENT + ENTERPRISE BRAIN",
      result: "NOT A PRODUCT. A STRATEGY.",
      highlight: { field: "result", text: "STRATEGY" },
      context: "AND YES, THIS IS THE COMPANY BEHIND TIKTOK",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    voiceover:
      "ByteDance put an AI agent inside every Feishu and Lark. Will your boss notice? Follow for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];

export const metadata = {
  commentHook:
    "Will ByteDance's Feishu integration give it an edge over standalone AI tools like Copilot? What's your experience with enterprise AI platforms?",
  articleUrl: "https://chinaainews.com/posts/doubao-work",
};
