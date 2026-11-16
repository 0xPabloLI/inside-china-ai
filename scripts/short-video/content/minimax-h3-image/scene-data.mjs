/**
 * Scene definitions for "MiniMax Open Sources a 4K Image Model"
 * Single video, TikTok, content-driven length (~45s)
 *
 * Narrative type: Breaking / explainer (release -> capability -> price -> business)
 * Hook formula: P1 Result-First (open source plus half price)
 * Hook family: result-first (#1289) — 4K output plus a price comparison against
 * closed rivals; both are measureable, neither is a product nameplate.
 * Sources: QbitAI (2026-11-12, verified), X @WestAIcommerce (nov 12, single source)
 *
 * NOTE: the $116.6M H1 revenue figure rides on one X aggregator and is labelled
 * as such on screen. If it cannot be corroborated, cut scene 7 and ship 7 scenes.
 *
 * MEDIA BINDING (manual, 2026-11-13): the asset pool scored 0 viable candidates —
 * the highest scorer (xhs, 51) is a talking-head selfie clip with no CAD content,
 * and the rest came back "VLM relevance unavailable". Bound by hand after visual
 * review: scene 3 -> unsplash metal part on a dimensioned drawing sheet (reads as
 * "photo in, drawing out"); scene 4 -> generated T2I exploded-view blueprint.
 * Scene 4 uses seed1024 rather than the chain's logged winner seed1025: 1024 is
 * flat line art, so five text fields stay legible over it; 1025 is a glossy render
 * whose midtones fight the overlay. This is a deliberate override, not an oversight.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    hookFamily: "result-first",
    voiceover: "MiniMax open sourced a 4K image model, at half the price of closed rivals.",
    // 2026-11-14: hooks carry imagery (user ruling, PR #1342) — waiver lifted.
    texts: {
      badge: "OPEN SOURCE",
      subject: "H3-IMAGE",
      bigNumber: "4K",
      numberLabel: "NATIVE 4096 X 4096",
      source: "MINIMAX, NOV 12",
      color: "amber",
    },
  },
  {
    id: 2,
    name: "bet",
    visualType: "context",
    layout: "flow",
    voiceover:
      "MiniMax announced H3-Image after its H3 video model. It stayed multimodal while rivals chased text.",
    texts: {
      title: "MULTIMODAL BET",
      context: "H3 VIDEO, NOW H3-IMAGE",
      badge: "MINIMAX",
      detail: "SAME STRATEGY, SECOND RELEASE",
    },
    // #1296: the "multimodal bet" has no photograph — one stack, two outputs.
    assetNeed: "single pipeline splitting into video frames and still images",
    searchHints: ["film strip photo prints", "media pipeline split"],
    aiImage: {
      prompt:
        "A single glowing amber data conduit entering from the left and splitting into two streams, the upper one resolving into a strip of film frames, the lower one into a stack of glossy photo prints, dark studio backdrop, sharp product-render lighting, shallow depth of field, no text.",
    },
  },
  {
    id: 3,
    name: "cad",
    visualType: "narrative",
    layout: "media-split",
    media: {
      type: "image",
      path: "assets/unsplash-cad-drawing-01.jpg",
      source: "Unsplash",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover: "Feed it a product photo and it draws CAD three views. Front, side, top.",
    texts: {
      company: "PHOTO IN",
      context: "CAD OUT",
      action: "THREE VIEWS",
      result: "FRONT, SIDE, TOP",
      source: "SOURCE: QBITAI TESTS",
    },
    assetNeed:
      "CAD three view technical drawing of a handheld consumer product on a drafting sheet",
    searchHints: ["cad three view drawing", "product orthographic blueprint"],
  },
  {
    id: 4,
    name: "exploded",
    visualType: "narrative",
    layout: "media-bottom-bar",
    media: {
      type: "image",
      path: "assets/b-roll/scene-4-seed1024.png",
      source: "Generated (Remotion T2I)",
      animation: "ken-burns",
      overlay: 0.6,
    },
    voiceover:
      "It also explodes assemblies into labeled diagrams, and sets dense text without breaking glyphs.",
    texts: {
      company: "EXPLODED VIEWS",
      action: "WORLD UNDERSTANDING",
      result: "NO GLYPH BREAKS",
      source: "SOURCE: QBITAI TESTS",
    },
    assetNeed:
      "exploded view diagram of a mechanical assembly with labeled parts on a technical sheet",
    searchHints: ["exploded view diagram mechanical", "assembly parts blueprint"],
  },
  {
    id: 5,
    name: "references",
    visualType: "stat-reveal",
    layout: "hero-center",
    voiceover:
      "Up to 16 reference images in one prompt. That is the consistency problem, mostly solved.",
    texts: {
      bigNumber: "16",
      subtext: "REFERENCE IMAGES PER PROMPT",
      source: "SOURCE: QBITAI",
    },
  },
  {
    id: 6,
    name: "price",
    visualType: "stat-reveal",
    layout: "hero-center",
    voiceover: "QbitAI reported the API at 0.2 yuan an image, with half off in week one.",
    texts: {
      bigNumber: "0.2",
      subtext: "YUAN PER IMAGE, 50% OFF WK 1",
      source: "SOURCE: QBITAI, NOV 12",
    },
  },
  {
    id: 7,
    name: "revenue",
    visualType: "data",
    layout: "hero-center",
    voiceover: "The China startup booked 116.6 million dollars in the first half, up 283 percent.",
    texts: {
      stat: "283%",
      subtext: "$116.6M H1 REVENUE",
      source: "SOURCE: X, SINGLE SOURCE",
      circle: true,
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    voiceover: "4K generation just stopped being a premium tier. Follow for more China AI.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "MINIMAX",
    },
  },
];
