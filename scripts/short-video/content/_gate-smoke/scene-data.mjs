/**
 * _gate-smoke scene-data — one legal-copy scene per gated Remotion template
 * (spec decision 47). Field sets follow REMOTION_SLOT_MAP exactly: any typo
 * here would fail the render-layer field validation, which is part of the
 * smoke. Copy is deliberately future-flavoured but template-agnostic — this
 * pack exists to prove the pipeline, not to tell a story.
 */
export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    voiceover: "A 92% benchmark run just put a small model ahead of the giants.",
    texts: {
      badge: "GATE SMOKE",
      subject: "FRONTIER LAB",
      color: "amber",
      bigNumber: "92%",
      numberLabel: "BENCHMARK SCORE",
      numberHighlight: "SCORE",
      stats: [
        { num: "3×", unit: "FASTER", label: "INFERENCE" },
        { num: "70B", unit: "PARAMS", label: "DENSE MODEL" },
        { num: "6B", unit: "ACTIVE", label: "FOOTPRINT" },
      ],
      source: "CHINA AI NEWS",
    },
  },
  {
    id: 2,
    name: "overlay-narrative",
    visualType: "narrative",
    layout: "media-overlay",
    voiceover: "The frontier lab confirmed a small model matches the cloud on device.",
    texts: {
      badge: "SMOKE CHECK",
      company: "FRONTIER LAB",
      action: "SHIPS SMALL MODEL",
      result: "EDGE MATCHES CLOUD",
      highlight: "CLOUD",
      context: "SIX BILLION PARAMS RUN ON DEVICE",
      source: "GATE SMOKE PACK",
    },
    media: {
      type: "image",
      path: "assets/smoke-data-center.jpg",
      source: "Pexels: Brett Sayles",
      animation: "ken-burns",
      overlay: 0.75,
    },
  },
  {
    id: 3,
    name: "stacked-cards-narrative",
    visualType: "narrative",
    layout: "stacked-cards",
    mediaOptOut: true,
    voiceover:
      "Meanwhile a cloud giant builds its own silicon and cuts the cost per token in half.",
    texts: {
      company: "CLOUD GIANT",
      context: "BUILDS OWN SILICON",
      action: "COST PER TOKEN",
      result: "DROPS BY HALF",
      source: "GATE SMOKE PACK",
    },
  },
  {
    id: 4,
    name: "stat-reveal",
    visualType: "stat-reveal",
    layout: "hero-center",
    voiceover: "Fifty one billion embeddings now sit in regular ram, not v ram.",
    texts: {
      bigNumber: "51B",
      label: "EMBEDDINGS IN RAM",
      subtext: "NOT VRAM",
      source: "HF MODEL CARD",
    },
  },
  {
    id: 5,
    name: "info-card",
    visualType: "info-card",
    layout: "hero-center",
    voiceover: "Three numbers say the whole story of this smoke check.",
    texts: {
      title: "SMOKE CHECK NUMBERS",
      subtitle: "EVERY TEMPLATE GATED",
      points: ["9 TEMPLATES PASS", "10 RENDER TESTS GREEN", "ZERO CLIPPED LINES"],
    },
  },
  {
    id: 6,
    name: "contrast",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "Two roads to scale: small active params against giant dense models.",
    texts: {
      title: "TWO ROADS TO SCALE",
      vs: "VS",
      left: ["6B ACTIVE PARAMS", "HUGE EMBEDDINGS"],
      right: ["GIANT DENSE MODELS", "HUGE COMPUTE"],
      note: "SAME CAPABILITY BET",
      noteHighlight: "BET",
    },
  },
  {
    id: 7,
    name: "quote",
    visualType: "quote",
    layout: "hero-center",
    voiceover: "The small model is the whole point, and the filings prove it.",
    texts: {
      quote: "THE SMALL MODEL IS THE POINT",
      source: "GATE SMOKE",
      verified: "VERIFIED SOURCE",
    },
  },
  {
    id: 8,
    name: "data",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Exchange filings confirmed demand ran fifty eight times over supply.",
    texts: {
      stat: "58×",
      statLabel: "OVERSUBSCRIBED",
      circle: true,
      subtext: "IPO DEMAND VS SUPPLY",
      source: "EXCHANGE FILINGS",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow China AI news for the next drop.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "THE SIGNAL IN THE NOISE",
      action: "FOLLOW FOR THE NEXT DROP",
      topic: "GATE SMOKE",
    },
  },
];
