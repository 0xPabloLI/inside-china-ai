/**
 * Scene data for DeepSeek opening its all-in-one application APIs.
 * 8 scenes, ~48s. Sources: QbitAI (Nov 14, 2026) quoting the DeepSeek
 * announcement of Nov 13 and its tool API price list; 36Kr / Phoenix Tech
 * (Nov 17, 2026) on the limits that appeared Nov 15.
 *
 * Narrative type: breaking news with a two-part turn (open, then throttle).
 * Hook pattern: P1 Result-First, number-led (0.39 yuan an hour).
 * Loop close: scene 8 reframes the hook price as the whole point.
 *
 * Media: one first-party screenshot of the official API docs (dark theme);
 * price, contrast, meaning and CTA templates are text-only by contract.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    narrativeRole: "S",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: "official DeepSeek API documentation page, dark theme",
    media: {
      type: "image",
      path: "assets/api-docs-dark.png",
      source: "DeepSeek official API docs (CDP capture, 2026-11-17)",
      animation: "zoom",
      overlay: 0.72,
      evidence: true,
      provenance: {
        sourceUrl: "https://api-docs.deepseek.com/",
        selector: "body",
        rect: { x: 0, y: 0, w: 1280, h: 900 },
        clip: { x: 0, y: 0, w: 1312, h: 932 },
        scale: 2,
      },
    },
    voiceover:
      "DeepSeek just rented out the parts of its app. Speech costs thirty nine fen an hour.",
    texts: {
      badge: "APP SOLD IN PIECES",
      subject: "DEEPSEEK",
      bigNumber: "0.39",
      numberLabel: "YUAN PER HOUR OF SPEECH",
      source: "SOURCE: DeepSeek price list, Nov 13",
    },
  },
  {
    id: 2,
    name: "what-opened",
    visualType: "narrative",
    layout: "media-overlay",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    assetNeed: null,
    media: {
      type: "image",
      path: "assets/scene2-devdesk.png",
      source: "AI-generated still (Seedream 5.5, 2026-11-17)",
      animation: "zoom",
      overlay: 0.72,
    },
    voiceover:
      "DeepSeek announced it on November 13: search, deep think, files, voice, sold one by one.",
    texts: {
      badge: "NOVEMBER 13, 2026",
      company: "ONE APP, FIVE PARTS",
      context: "SEARCH · DEEP THINK · FILES",
      action: "EACH SOLD SEPARATELY",
      result: "BILLED PER CALL",
      source: "SOURCE: DeepSeek, Nov 13, 2026",
    },
  },
  {
    id: 3,
    name: "price-list",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover:
      "Search costs five yuan per thousand calls. OCR, one point five yuan per thousand pages.",
    texts: {
      stat: "5",
      statLabel: "YUAN PER 1,000 SEARCHES",
      subtext: "OCR 1.5 PER 1,000 PAGES",
      source: "SOURCE: DeepSeek price list, Nov 13",
    },
  },
  {
    id: 4,
    name: "cheaper-than",
    visualType: "contrast",
    layout: "split",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover: "OpenAI charges nearly five times as much. Google, more than sixteen times.",
    texts: {
      title: "SPEECH TO TEXT, PER HOUR",
      left: ["DEEPSEEK", "0.39 YUAN"],
      right: ["OPENAI", "1.81 YUAN"],
      vs: "·",
      note: "GOOGLE CLOUD: 6.43 YUAN",
    },
  },
  {
    id: 5,
    name: "build-your-own",
    visualType: "contrast",
    layout: "split",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover:
      "DeepSeek also gave away the app shell, a chat demo developers can deploy themselves.",
    texts: {
      title: "THE SHELL IS FREE",
      left: ["CHAT DEMO", "OPEN SOURCE"],
      right: ["YOUR OWN", "SERVER"],
      vs: "+",
      note: "IMPORTS YOUR DEEPSEEK HISTORY",
    },
  },
  {
    id: 6,
    name: "two-days-later",
    visualType: "narrative",
    layout: "media-overlay",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    assetNeed: null,
    media: {
      type: "image",
      path: "assets/scene6-warnphone.png",
      source: "AI-generated still (Seedream 5.5, 2026-11-17)",
      animation: "zoom",
      overlay: 0.72,
    },
    voiceover:
      "Two days later, long chats stopped accepting messages. The notice said not enough compute.",
    texts: {
      badge: "NOVEMBER 15, 2026",
      company: "72 HOURS INACTIVE",
      context: "LONG CHATS STOPPED",
      action: "INPUT CAP 40,000 CHARS",
      result: "NOT ENOUGH COMPUTE",
      source: "SOURCE: DeepSeek notice, Nov 15",
    },
  },
  {
    id: 7,
    name: "what-it-means",
    visualType: "contrast",
    layout: "split",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover:
      "China's cheapest model stopped selling a chatbot. It sells the parts now, priced per call.",
    texts: {
      title: "THE MEANING FOR CHINA",
      left: ["THE CHATBOX", "WAS THE AD"],
      right: ["THE PARTS", "ARE THE PRODUCT"],
      vs: "·",
      note: "PRICE PER CALL SETS THE ROUND",
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    assetNeed: null,
    media: null,
    voiceover:
      "The app was the pitch. The API is the product. Follow China AI News for the next move.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
